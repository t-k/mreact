import { describe, expect, test } from "vitest";
import { cell, computed } from "@reckona/mreact-reactive-core";
import { parseStaticStyleObjectLiteral } from "../src/emit-server-shared.js";
import { transform } from "../src/index.js";
import { runServerComponent, runServerStreamComponent } from "./helpers.js";

function compileServerPair(source: string): { stream: string; string: string } {
  const base = {
    code: source,
    dev: true,
    filename: "App.tsx",
    target: "server" as const,
  };
  const stringOutput = transform(base);
  const streamOutput = transform({ ...base, serverOutput: "stream" });

  expect(stringOutput.diagnostics).toEqual([]);
  expect(streamOutput.diagnostics).toEqual([]);

  return {
    stream: streamOutput.code,
    string: stringOutput.code,
  };
}

async function expectServerPairHtml(
  source: string,
  expected: string,
  props?: Record<string, unknown>,
): Promise<void> {
  const compiled = compileServerPair(source);

  expect(runServerComponent(compiled.string, "App", props)).toBe(expected);
  await expect(runServerStreamComponent(compiled.stream, "App", props)).resolves.toBe(expected);
}

describe("server emit shared behavior", () => {
  test("string and stream keep lowercase SVG intrinsics when a helper has the same name", async () => {
    await expectServerPairHtml(
      `function path(vendor) {
  return vendor === "anthropic" ? "M3 20" : "M1 1";
}
export function App(props) {
  return <svg>{props.label ? <title>{props.label}</title> : null}<path d={path(props.vendor)} /></svg>;
}`,
      '<svg><title>Anthropic</title><path d="M3 20"></path></svg>',
      { label: "Anthropic", vendor: "anthropic" },
    );
  });

  test("string and stream preserve arbitrary element-valued props without trusting ordinary strings", async () => {
    await expectServerPairHtml(
      `const _registerServerRenderValue = "user register";
const _isServerRenderValue = "user check";
const _renderServerValue = "user render";
function Detail(props) {
  const $sink = props.filters;
  return <section><header>{props.actions}</header><div>{$sink}</div><aside>{props.untrusted}</aside></section>;
}
function WatchToggle() {
  return <button type="button">Watch</button>;
}
export function App(props) {
  return <main><Detail actions={<WatchToggle />} filters={<strong>Open</strong>} untrusted={props.untrusted} /></main>;
}`,
      '<main><section><header><button type="button">Watch</button></header><div><strong>Open</strong></div><aside>&lt;script&gt;alert(1)&lt;/script&gt;</aside></section></main>',
      { untrusted: "<script>alert(1)</script>" },
    );
  });

  test("element-valued props are omitted when reused as direct or spread attributes", async () => {
    const compiled = compileServerPair(`function Detail(props) {
  return <header data-actions={props.actions} {...{ "data-spread-actions": props.actions }}>{props.actions}</header>;
}
function WatchToggle() {
  return <button type="button">Watch</button>;
}
export function App() {
  return <Detail actions={<WatchToggle />} />;
}`);
    const stringHtml = runServerComponent(compiled.string);
    const streamHtml = await runServerStreamComponent(compiled.stream);

    expect(stringHtml).not.toContain("data-actions=");
    expect(streamHtml).not.toContain("data-actions=");
    expect(stringHtml).not.toContain("data-spread-actions=");
    expect(streamHtml).not.toContain("data-spread-actions=");
    expect(stringHtml).toContain('<button type="button">Watch</button>');
    expect(streamHtml).toContain('<button type="button">Watch</button>');
  });

  test("arrays containing element-valued props are omitted from direct and spread attributes", async () => {
    const compiled = compileServerPair(`function Detail(props) {
  return <header data-actions={props.actions} {...{ "data-spread-actions": props.actions }}>{props.actions}</header>;
}
export function App() {
  return <Detail actions={[1].map(() => <b>Watch</b>)} />;
}`);
    const stringHtml = runServerComponent(compiled.string);
    const streamHtml = await runServerStreamComponent(compiled.stream);

    expect(stringHtml).toBe("<header><b>Watch</b></header>");
    expect(streamHtml).toBe("<header><b>Watch</b></header>");
  });

  test("component spreads lower direct JSX values", async () => {
    await expectServerPairHtml(
      `function Detail(props) {
  return <section>{props.value}</section>;
}
export function App() {
  return <Detail {...{ value: <b>ok</b> }} />;
}`,
      "<section><b>ok</b></section>",
    );
  });

  test("string and stream preserve destructured, conditional, array, and fallback element props", async () => {
    const source = `function Detail({ actions, collection, maybe }) {
  return <section><header>{actions}</header><div>{collection}</div><aside>{maybe ?? <em>Fallback</em>}</aside></section>;
}
function BodyAlias(props) {
  const { actions } = props;
  return <nav>{actions}</nav>;
}
export function App(props) {
  return <main><Detail actions={props.show ? <b>Watch</b> : null} collection={[<span>A</span>, <i>B</i>]} maybe={props.maybe} /><BodyAlias actions={<u>Alias</u>} /></main>;
}`;

    await expectServerPairHtml(
      source,
      "<main><section><header><b>Watch</b></header><div><span>A</span><i>B</i></div><aside><em>Fallback</em></aside></section><nav><u>Alias</u></nav></main>",
      { show: true },
    );
    await expectServerPairHtml(
      source,
      "<main><section><header></header><div><span>A</span><i>B</i></div><aside>&lt;script&gt;alert(1)&lt;/script&gt;</aside></section><nav><u>Alias</u></nav></main>",
      { maybe: "<script>alert(1)</script>", show: false },
    );
  });

  test("forged server render-value brands remain escaped", async () => {
    const marker = Symbol.for("@reckona/mreact.server-render-value");
    const payload = "<script>globalThis.__injected = true</script>";
    const forgedFunction = (sink?: { append(value: string): void }) => sink?.append(payload);
    forgedFunction.toString = () => payload;
    Object.defineProperty(forgedFunction, marker, { value: true });
    const inheritedBrand = Object.create({ [marker]: true }) as { toString(): string };
    inheritedBrand.toString = () => payload;
    const forgedValues = [
      { [marker]: true, toString: () => payload },
      inheritedBrand,
      forgedFunction,
    ];

    for (const value of forgedValues) {
      await expectServerPairHtml(
        `export function App(props) {
  return <div>{props.value}</div>;
}`,
        "<div>&lt;script&gt;globalThis.__injected = true&lt;/script&gt;</div>",
        { value },
      );
    }
  });

  test("hostile array methods cannot bypass server render-value escaping", async () => {
    const value: unknown[] = [];
    Object.defineProperty(value, "map", {
      value: () => ({ join: () => '<img src=x onerror="globalThis.pwned=true">' }),
    });

    await expectServerPairHtml(
      `export function App(props) {
  return <div>{props.value}</div>;
}`,
      "<div></div>",
      { value },
    );
  });

  test("component prop children omit booleans while retaining zero", async () => {
    const source = `function Detail(props) {
  return <section>{props.fallback ? (props.value ?? <b>Fallback</b>) : props.value}</section>;
}
export function App(props) {
  return <Detail fallback={props.fallback} value={props.value} />;
}`;

    await expectServerPairHtml(source, "<section></section>", { value: false });
    await expectServerPairHtml(source, "<section></section>", { value: true });
    await expectServerPairHtml(source, "<section>0</section>", { value: 0 });
    await expectServerPairHtml(source, "<section></section>", { fallback: true, value: false });
    await expectServerPairHtml(source, "<section>0</section>", { fallback: true, value: 0 });
    await expectServerPairHtml(source, "<section><b>Fallback</b></section>", { fallback: true });
  });

  test("component prop arrays preserve JSX scalar child semantics", async () => {
    await expectServerPairHtml(
      `function Detail(props) {
  return <section>{props.value}</section>;
}
export function App() {
  return <Detail value={[false, true, null, undefined, 0, "x", <b>ok</b>]} />;
}`,
      "<section>0x<b>ok</b></section>",
    );
    await expectServerPairHtml(
      `function Detail(props) {
  return <section>{props.value}</section>;
}
export function App() {
  return <Detail value={true || <b>fallback</b>} />;
}`,
      "<section></section>",
    );
  });

  test("server render values preserve prop container and leaf shapes", async () => {
    await expectServerPairHtml(
      `function Detail(props) {
  return <section>{Array.isArray(props.items) ? "array" : typeof props.items}:{typeof props.item}</section>;
}
export function App() {
  return <Detail items={[<b>A</b>, <i>B</i>]} item={<u>C</u>} />;
}`,
      "<section>array:object</section>",
    );
  });

  test("server render values preserve const binding control-flow and array shapes", async () => {
    const source = `function Detail(props) {
  return <section>{props.value == null ? "missing" : Array.isArray(props.value) ? "array" : props.value === false ? "false" : typeof props.value}</section>;
}
export function App(props) {
  const value = props.mode === "array" ? [<b>A</b>] : props.mode === "false" ? false && <b>B</b> : props.mode === "missing" ? null : <i>C</i>;
  return <Detail value={value} />;
}`;

    await expectServerPairHtml(source, "<section>array</section>", { mode: "array" });
    await expectServerPairHtml(source, "<section>false</section>", { mode: "false" });
    await expectServerPairHtml(source, "<section>missing</section>", { mode: "missing" });
    await expectServerPairHtml(source, "<section>object</section>", { mode: "element" });
  });

  test("cyclic component prop children reject consistently", async () => {
    const compiled = compileServerPair(`export function App(props) {
  return <section>{props.value}</section>;
}`);
    const cyclic: unknown[] = ["<x>", false, 0];
    cyclic.push(cyclic);

    expect(() => runServerComponent(compiled.string, "App", { value: cyclic })).toThrow(
      "mreact render value is too deep: exceeded 256 levels",
    );
    await expect(
      runServerStreamComponent(compiled.stream, "App", { value: cyclic }),
    ).rejects.toThrow("mreact render value is too deep: exceeded 256 levels");
  });

  test("server render-value capability follows JSX leaves through expressions and bindings", async () => {
    const source = `function Detail({ first, second, third }) {
  return <section><div>{first}</div><aside>{second}</aside><footer>{third}</footer></section>;
}
export function App(props) {
  const third = <u>Bound</u>;
  return <Detail first={(() => props.safe ? <b>Safe</b> : props.untrusted)()} second={(0, <i>Sequence</i>)} third={third} />;
}`;

    await expectServerPairHtml(
      source,
      "<section><div><b>Safe</b></div><aside><i>Sequence</i></aside><footer><u>Bound</u></footer></section>",
      { safe: true, untrusted: "<script>alert(1)</script>" },
    );
    await expectServerPairHtml(
      source,
      "<section><div>&lt;script&gt;alert(1)&lt;/script&gt;</div><aside><i>Sequence</i></aside><footer><u>Bound</u></footer></section>",
      { safe: false, untrusted: "<script>alert(1)</script>" },
    );
  });

  test("compiler render-value placeholders cannot collide with user code", async () => {
    await expectServerPairHtml(
      `function Detail(props) {
  return <div data-label={props.label}>{props.action}</div>;
}
function __mreactServerRenderValue$compiler(value, fallback) {
  return fallback;
}
export function App(props) {
  const record = { __mreactServerRenderValue$compiler: "property" };
  return <Detail label={record.__mreactServerRenderValue$compiler + ":__mreactServerRenderValue$compiler"} action={__mreactServerRenderValue$compiler(props.untrusted, <b>safe</b>)} />;
}`,
      '<div data-label="property:__mreactServerRenderValue$compiler"><b>safe</b></div>',
      { untrusted: '<img src=x onerror="globalThis.pwned=true">' },
    );
  });

  test("prop-derived calls and deep members retain registered render values", async () => {
    await expectServerPairHtml(
      `function identity(value) {
  return value;
}
function Detail(props) {
  return <section><div>{identity(props.value)}</div><aside>{(() => props.slots.value)()}</aside></section>;
}
export function App() {
  return <Detail value={<b>A</b>} slots={{ value: <i>B</i> }} />;
}`,
      "<section><div><b>A</b></div><aside><i>B</i></aside></section>",
    );
  });

  test("local JSX helper results remain render values when passed as named props", async () => {
    await expectServerPairHtml(
      `function make() {
  return <b>A</b>;
}
function Detail(props) {
  return <div>{props.value}</div>;
}
export function App() {
  return <Detail value={make()} />;
}`,
      "<div><b>A</b></div>",
    );
  });

  test("explicit string coercion of JSX values preserves ordinary JavaScript semantics", async () => {
    await expectServerPairHtml(
      `function Detail(props) {
  return <p>{props.value}</p>;
}
export function App() {
  const direct = String(<b>A</b>);
  const interpolated = "" + (<i>B</i>);
  return <Detail value={direct + interpolated} />;
}`,
      "<p>&lt;b&gt;A&lt;/b&gt;&lt;i&gt;B&lt;/i&gt;</p>",
    );
  });

  test("module-scope JSX bindings remain render values when passed as named props", async () => {
    await expectServerPairHtml(
      `const icon = <b>A</b>;
function Detail(props) {
  return <div>{props.value}</div>;
}
export function App() {
  return <Detail value={icon} />;
}`,
      "<div><b>A</b></div>",
    );
  });

  test("module-scope composite JSX bindings preserve arrays and component spreads", async () => {
    await expectServerPairHtml(
      `const icons = [<b>A</b>, <i>B</i>];
const detailProps = { value: <u>C</u> };
function Detail(props) {
  return <div>{props.value}</div>;
}
export function App() {
  return <main><Detail value={icons} /><Detail {...detailProps} /></main>;
}`,
      "<main><div><b>A</b><i>B</i></div><div><u>C</u></div></main>",
    );
  });

  test("nested render values omit object-valued DOM attributes", async () => {
    await expectServerPairHtml(
      `function Detail(props) {
  return <div style={props.style}>x</div>;
}
export function App() {
  return <Detail style={{ color: <b>A</b> }} />;
}`,
      "<div>x</div>",
    );
  });

  test("inline object attributes containing forwarded render values are omitted", async () => {
    await expectServerPairHtml(
      `function Detail(props) {
  return <div style={{ color: props.value }} data-value={{ nested: props.value }}>x</div>;
}
export function App() {
  return <Detail value={<b>A</b>} />;
}`,
      "<div>x</div>",
    );
  });

  test("ordinary accessor-backed style values remain serializable", async () => {
    await expectServerPairHtml(
      `function Detail(props) {
  return <div style={props.style}>x</div>;
}
export function App() {
  const style = {};
  Object.defineProperty(style, "color", { enumerable: true, get: () => "red" });
  return <Detail style={style} />;
}`,
      '<div style="color:red">x</div>',
    );
  });

  test("adjacent element-valued and ordinary props preserve text separation", async () => {
    await expectServerPairHtml(
      `function Detail(props) {
  return <section>{props.value}{props.label}</section>;
}
export function App() {
  return <Detail value={<b>ok</b>} label="end" />;
}`,
      "<section><b>ok</b><!-- -->end</section>",
    );
  });

  test("string and stream emitters normalize aliases and static style literals the same way", async () => {
    const source = `export function App() {
  return (
    <label className="field" htmlFor="name" style={{ backgroundColor: "red", "--gap": 4 }}>
      Name
    </label>
  );
}`;
    const compiled = compileServerPair(source);
    const expected =
      '<label class="field" for="name" style="background-color:red;--gap:4">Name</label>';

    expect(runServerComponent(compiled.string)).toBe(expected);
    await expect(runServerStreamComponent(compiled.stream)).resolves.toBe(expected);
  });

  test("string and stream emitters drop unsafe static URL attributes the same way", async () => {
    const source = `export function App() {
  return (
    <main>
      <a href="javascript:alert(1)">link</a>
      <img src="data:image/SVG+XML ,<svg><script>alert(1)</script></svg>" alt="bad" />
      <img src="data:image/png;base64,abc" alt="ok" />
    </main>
  );
}`;
    const compiled = compileServerPair(source);
    const expected =
      '<main><a>link</a><img alt="bad"><img src="data:image/png;base64,abc" alt="ok"></main>';

    expect(runServerComponent(compiled.string)).toBe(expected);
    await expect(runServerStreamComponent(compiled.stream)).resolves.toBe(expected);
  });

  test("string and stream emitters drop mixed-case unsafe attributes", async () => {
    await expectServerPairHtml(
      `export function App() {
  const props = { HREF: "javascript:alert(1)", SRCDOC: "<script>1</script>" };
  return <iframe {...props} HREF="javascript:alert(2)" SRCDOC="<script>2</script>" />;
}`,
      "<iframe></iframe>",
    );
  });

  test("string and stream emitters serialize dynamic style objects the same way", async () => {
    const source = `export function App(props) {
  return <div style={{ backgroundColor: props.color, opacity: props.opacity, "--gap": props.gap }}>x</div>;
}`;
    const compiled = compileServerPair(source);
    const props = { color: "red&", gap: "2rem", opacity: false };
    const expected = '<div style="background-color:red&amp;;--gap:2rem">x</div>';

    expect(runServerComponent(compiled.string, "App", props)).toBe(expected);
    await expect(runServerStreamComponent(compiled.stream, "App", props)).resolves.toBe(expected);
  });

  test("string and stream emitters serialize unitless and custom style entries the same way", async () => {
    await expectServerPairHtml(
      `export function App() {
  return <div style={{ zIndex: 10, opacity: 0.25, lineHeight: 1.5, "--accent": "red", marginTop: null, color: false }}>x</div>;
}`,
      '<div style="z-index:10;opacity:0.25;line-height:1.5;--accent:red">x</div>',
    );
  });

  test("string and stream emitters evaluate logical-or left JSX children once", async () => {
    const source = `let calls = 0;
export function App() {
  function next() {
    calls += 1;
    return "value";
  }
  return <p>{next() || <em>fallback</em>}:{calls}</p>;
}`;
    const compiled = compileServerPair(source);
    const expected = "<p>value:1</p>";

    expect(runServerComponent(compiled.string)).toBe(expected);
    await expect(runServerStreamComponent(compiled.stream)).resolves.toBe(expected);
  });

  test("string and stream emitters render falsy numeric logical-and left operands", async () => {
    const source = `export function App() {
  const count = 0;
  return <p>{count && <em>shown</em>}</p>;
}`;
    const compiled = compileServerPair(source);

    expect(runServerComponent(compiled.string)).toBe("<p>0</p>");
    await expect(runServerStreamComponent(compiled.stream)).resolves.toBe("<p>0</p>");
  });

  test("string emitter renders local JSX helper call returns", () => {
    const source = `function svg(props: { class?: string }, children: unknown) {
  return (
    <svg viewBox="0 0 24 24" class={props.class} aria-hidden="true">
      {children}
    </svg>
  );
}

export function SunIcon(props: { class?: string }) {
  return svg(props, (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2" />
    </>
  ));
}`;
    const output = transform({
      code: source,
      dev: true,
      filename: "App.tsx",
      target: "server",
    });
    const expected =
      '<svg viewBox="0 0 24 24" class="sun" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2"></path></svg>';

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code, "SunIcon", { class: "sun" })).toBe(expected);
  });

  test("string and stream emitters keep only the last attribute value across spreads", async () => {
    const staticThenSpread = compileServerPair(`export function App() {
  return <div className="base" {...{ className: "override" }} id="x">x</div>;
}`);
    const spreadThenStatic = compileServerPair(`export function App() {
  return <div {...{ className: "override", id: "x" }} className="base">x</div>;
}`);

    expect(runServerComponent(staticThenSpread.string)).toBe(
      '<div class="override" id="x">x</div>',
    );
    await expect(runServerStreamComponent(staticThenSpread.stream)).resolves.toBe(
      '<div class="override" id="x">x</div>',
    );
    expect(runServerComponent(spreadThenStatic.string)).toBe('<div class="base" id="x">x</div>');
    await expect(runServerStreamComponent(spreadThenStatic.stream)).resolves.toBe(
      '<div class="base" id="x">x</div>',
    );
  });

  test("string and stream emitters drop case-insensitive event attributes from spreads", async () => {
    await expectServerPairHtml(
      `export function App() {
  return <div {...{ ONCLICK: "globalThis.pwned = true", OnError: "globalThis.pwned = true", id: "safe" }}>x</div>;
}`,
      '<div id="safe">x</div>',
    );
  });

  test("string and stream emitters omit reserved spread props before reading getters", async () => {
    await expectServerPairHtml(
      `export function App() {
  const props = {
    get domRef() {
      throw new Error("domRef getter evaluated");
    },
    id: "safe",
  };
  return <div {...props}>x</div>;
}`,
      '<div id="safe">x</div>',
    );
  });

  test("string and stream emitters render numeric edge children the same way", async () => {
    await expectServerPairHtml(
      `export function App() {
  const negativeZero = -0;
  const large = 1e21;
  return <p>{0}:{NaN}:{negativeZero}:{large}</p>;
}`,
      "<p>0<!-- -->:<!-- -->NaN<!-- -->:<!-- -->0<!-- -->:<!-- -->1e+21</p>",
    );
  });

  test("string and stream emitters render bigint and whitespace text children the same way", async () => {
    await expectServerPairHtml(
      `export function App() {
  const id = 9007199254740993n;
  return <p><span>a</span>{" "}<span>{id}</span>{"\\n\\t"}<span>z</span></p>;
}`,
      "<p><span>a</span> <span>9007199254740993</span>\n\t<span>z</span></p>",
    );
  });

  test("string and stream emitters keep siblings after mapped null children", async () => {
    await expectServerPairHtml(
      `export function App() {
  const items = [
    { id: "a", show: true },
    { id: "b", show: false },
    { id: "c", show: true },
  ];
  return (
    <ul>
      {items.map((item) => item.show ? <li key={item.id}>{item.id}</li> : null)}
      <li>tail</li>
    </ul>
  );
}`,
      "<ul><li>a</li><li>c</li><li>tail</li></ul>",
    );
  });

  test("string and stream emitters preserve empty and astral-plane text children", async () => {
    await expectServerPairHtml(
      `export function App() {
  const empty = "";
  const label = "route 🚀 & <next>";
  return <p>{empty}<span>{label}</span></p>;
}`,
      "<p><span>route 🚀 &amp; &lt;next&gt;</span></p>",
    );
  });

  test("string and stream emitters serialize boolean and booleanish attributes like React", async () => {
    await expectServerPairHtml(
      `export function App() {
  return (
    <main>
      <button disabled={false}>off</button>
      <button disabled={true}>on</button>
      <a download={true}>download</a>
      <div aria-hidden={false} data-ready={false} autoCapitalize={false} contentEditable={true} draggable={false} spellCheck={true} translate={false} />
    </main>
  );
}`,
      '<main><button>off</button><button disabled="">on</button><a download="">download</a><div aria-hidden="false" data-ready="false" autocapitalize="false" contenteditable="true" draggable="false" spellcheck="true" translate="false"></div></main>',
    );
  });

  test("string and stream emitters select a mapped option matching the select value", async () => {
    await expectServerPairHtml(
      `const STATUSES = ["open", "in_progress", "done"];
export function App(props) {
  return (
    <select name="status" value={props.status}>
      {STATUSES.map((status) => (
        <option key={status} value={status}>{status}</option>
      ))}
    </select>
  );
}`,
      '<select name="status"><option value="open">open</option><option value="in_progress" selected="">in_progress</option><option value="done">done</option></select>',
      { status: "in_progress" },
    );
  });

  test("string and stream emitters keep the select value across fragment, optgroup and nested lists", async () => {
    await expectServerPairHtml(
      `const GROUPS = [
  { label: "active", items: ["open", "in_progress"] },
  { label: "closed", items: ["done"] },
];
export function App(props) {
  return (
    <select value={props.status}>
      <>
        <option value="">none</option>
      </>
      {GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.items.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}`,
      '<select><option value="">none</option><optgroup label="active"><option value="open">open</option><option value="in_progress">in_progress</option></optgroup><optgroup label="closed"><option value="done" selected="">done</option></optgroup></select>',
      { status: "done" },
    );
  });

  test("string and stream emitters resolve the select value from a reactive computed", async () => {
    const status = cell("done");
    const selected = computed(() => status.get());

    await expectServerPairHtml(
      `const STATUSES = ["open", "done"];
export function App(props) {
  return (
    <select value={props.selected.get()}>
      {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
  );
}`,
      '<select><option value="open">open</option><option value="done" selected="">done</option></select>',
      { selected },
    );

    status.set("open");
    await expectServerPairHtml(
      `const STATUSES = ["open", "done"];
export function App(props) {
  return (
    <select value={props.selected.get()}>
      {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
    </select>
  );
}`,
      '<select><option value="open" selected="">open</option><option value="done">done</option></select>',
      { selected },
    );
  });

  test("string and stream emitters apply select value precedence over a stale option selected", async () => {
    await expectServerPairHtml(
      `export function App(props) {
  return (
    <select value={props.status} defaultValue="open">
      <option value="open" selected>open</option>
      <option value="done">done</option>
    </select>
  );
}`,
      '<select><option value="open">open</option><option value="done" selected="">done</option></select>',
      { status: "done" },
    );
  });

  test("string and stream emitters fall back to defaultValue and then to the option's own selected", async () => {
    const source = `export function App(props) {
  return (
    <select value={props.status} defaultValue={props.fallback}>
      <option value="open">open</option>
      <option value="done" selected={props.markDone}>done</option>
    </select>
  );
}`;

    await expectServerPairHtml(
      source,
      '<select><option value="open">open</option><option value="done" selected="">done</option></select>',
      { fallback: "done", markDone: false, status: undefined },
    );
    await expectServerPairHtml(
      source,
      '<select><option value="open">open</option><option value="done" selected="">done</option></select>',
      { fallback: undefined, markDone: true, status: undefined },
    );
    await expectServerPairHtml(
      source,
      '<select><option value="open">open</option><option value="done">done</option></select>',
      { fallback: undefined, markDone: false, status: undefined },
    );
  });

  test("string and stream emitters compare option values by string, empty string included", async () => {
    const source = `const NUMBERS = [1, 2, 3];
export function App(props) {
  return (
    <select value={props.value}>
      <option value="">none</option>
      {NUMBERS.map((item) => <option key={item} value={item}>{"n" + item}</option>)}
      <option>text</option>
    </select>
  );
}`;

    await expectServerPairHtml(
      source,
      '<select><option value="">none</option><option value="1">n1</option><option value="2" selected="">n2</option><option value="3">n3</option><option>text</option></select>',
      { value: 2 },
    );
    await expectServerPairHtml(
      source,
      '<select><option value="" selected="">none</option><option value="1">n1</option><option value="2">n2</option><option value="3">n3</option><option>text</option></select>',
      { value: "" },
    );
    await expectServerPairHtml(
      source,
      '<select><option value="">none</option><option value="1">n1</option><option value="2">n2</option><option value="3">n3</option><option selected="">text</option></select>',
      { value: "text" },
    );
    await expectServerPairHtml(
      source,
      '<select><option value="">none</option><option value="1">n1</option><option value="2">n2</option><option value="3">n3</option><option>text</option></select>',
      { value: null },
    );
    await expectServerPairHtml(
      source,
      '<select><option value="">none</option><option value="1">n1</option><option value="2">n2</option><option value="3">n3</option><option>text</option></select>',
      { value: "missing" },
    );
  });

  test("string and stream emitters select every match for a multiple select array value", async () => {
    const source = `const STATUSES = ["open", "in_progress", "done"];
export function App(props) {
  return (
    <select multiple value={props.statuses}>
      {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
    </select>
  );
}`;

    await expectServerPairHtml(
      source,
      '<select multiple=""><option value="open" selected="">open</option><option value="in_progress">in_progress</option><option value="done" selected="">done</option></select>',
      { statuses: ["done", "open"] },
    );
    await expectServerPairHtml(
      source,
      '<select multiple=""><option value="open">open</option><option value="in_progress">in_progress</option><option value="done">done</option></select>',
      { statuses: [] },
    );
    // A single-element array must not be string-joined into "open,done".
    await expectServerPairHtml(
      source,
      '<select multiple=""><option value="open">open</option><option value="in_progress" selected="">in_progress</option><option value="done">done</option></select>',
      { statuses: ["in_progress"] },
    );
  });

  test("string and stream emitters keep sibling selects and duplicate option values independent", async () => {
    await expectServerPairHtml(
      `const STATUSES = ["open", "done"];
export function App(props) {
  return (
    <form>
      <select name="left" value={props.left}>
        {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
      <select name="right" value={props.right}>
        {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
      <select name="plain">
        {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
      </select>
      <option value="open">outside</option>
    </form>
  );
}`,
      '<form>' +
        '<select name="left"><option value="open" selected="">open</option><option value="done">done</option></select>' +
        '<select name="right"><option value="open">open</option><option value="done" selected="">done</option></select>' +
        '<select name="plain"><option value="open">open</option><option value="done">done</option></select>' +
        '<option value="open">outside</option>' +
        "</form>",
      { left: "open", right: "done" },
    );
  });

  test("string and stream emitters escape mapped option values and labels while selecting", async () => {
    await expectServerPairHtml(
      `const STATUSES = ['<script>"&\\'', "safe"];
export function App(props) {
  return (
    <select value={props.status}>
      {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
    </select>
  );
}`,
      '<select><option value="&lt;script&gt;&quot;&amp;\'" selected="">&lt;script&gt;&quot;&amp;\'</option>' +
        '<option value="safe">safe</option></select>',
      { status: '<script>"&\'' },
    );
  });

  test("string and stream emitters serialize attribute escaping and form values the same way", async () => {
    await expectServerPairHtml(
      `export function App(props) {
  return (
    <form>
      <textarea name="bio" value={props.bio}>ignored</textarea>
      <select name="theme" value={props.theme}>
        <option value="system">system</option>
        <option value="dark">dark</option>
      </select>
      <input title={props.title} data-note={props.note} />
    </form>
  );
}`,
      '<form><textarea name="bio">Ada &amp; Grace</textarea><select name="theme"><option value="system">system</option><option value="dark" selected="">dark</option></select><input title="&quot;&lt;&amp;&gt;\n\t" data-note="line\rnext"></form>',
      {
        bio: "Ada & Grace",
        note: "line\rnext",
        theme: "dark",
        title: '"<&>\n\t',
      },
    );
  });

  test("static style object parsing handles comments and string literal keys", () => {
    expect(
      parseStaticStyleObjectLiteral(`{
        // keep this statically expandable
        backgroundColor: props.color,
        /* custom property */
        "--gap": props.gap,
        'fontSize': 14,
      }`),
    ).toEqual([
      { cssName: "background-color", valueCode: "props.color" },
      { cssName: "--gap", valueCode: "props.gap" },
      { cssName: "font-size", valueCode: "14" },
    ]);
  });

  test("static style object parsing rejects invalid bare hyphenated keys", () => {
    expect(parseStaticStyleObjectLiteral(`{ font-size: 14 }`)).toBeUndefined();
    expect(parseStaticStyleObjectLiteral(`{ fontSize: 14 }`)).toEqual([
      { cssName: "font-size", valueCode: "14" },
    ]);
    expect(parseStaticStyleObjectLiteral(`{ "font-size": 14 }`)).toEqual([
      { cssName: "font-size", valueCode: "14" },
    ]);
    expect(parseStaticStyleObjectLiteral(`{ "--custom-prop": 4 }`)).toEqual([
      { cssName: "--custom-prop", valueCode: "4" },
    ]);
  });

  test("static style object parsing keeps computed keys on the dynamic path", () => {
    expect(parseStaticStyleObjectLiteral(`{ [name]: value }`)).toBeUndefined();
  });

  test("string and stream emitters statically expand commented style objects", async () => {
    const source = `export function App(props) {
  return <div style={{
    // line comments should not force Object.entries
    backgroundColor: props.color,
    /* block comments should not force Object.entries */
    "--gap": props.gap,
    'fontSize': 14,
  }}>x</div>;
}`;
    const compiled = compileServerPair(source);
    const props = { color: "red&", gap: "2rem" };
    const expected = '<div style="background-color:red&amp;;--gap:2rem;font-size:14">x</div>';

    expect(compiled.string).not.toContain("Object.entries(_value)");
    expect(compiled.stream).not.toContain("Object.entries(_value)");
    expect(runServerComponent(compiled.string, "App", props)).toBe(expected);
    await expect(runServerStreamComponent(compiled.stream, "App", props)).resolves.toBe(expected);
  });
});
