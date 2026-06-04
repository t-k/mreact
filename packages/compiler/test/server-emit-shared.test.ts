import { describe, expect, test } from "vitest";
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
  test("string and stream emitters normalize aliases and static style literals the same way", async () => {
    const source = `export function App() {
  return (
    <label className="field" htmlFor="name" style={{ backgroundColor: "red", "--gap": 4 }}>
      Name
    </label>
  );
}`;
    const compiled = compileServerPair(source);
    const expected = '<label class="field" for="name" style="background-color:red;--gap:4">Name</label>';

    expect(runServerComponent(compiled.string)).toBe(expected);
    await expect(runServerStreamComponent(compiled.stream)).resolves.toBe(expected);
  });

  test("string and stream emitters drop unsafe static URL attributes the same way", async () => {
    const source = `export function App() {
  return (
    <main>
      <a href="javascript:alert(1)">link</a>
      <img src="data:image/svg+xml,<svg><script>alert(1)</script></svg>" alt="bad" />
      <img src="data:image/png;base64,abc" alt="ok" />
    </main>
  );
}`;
    const compiled = compileServerPair(source);
    const expected = '<main><a>link</a><img alt="bad"><img src="data:image/png;base64,abc" alt="ok"></main>';

    expect(runServerComponent(compiled.string)).toBe(expected);
    await expect(runServerStreamComponent(compiled.stream)).resolves.toBe(expected);
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
    const expected = '<svg viewBox="0 0 24 24" class="sun" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2"></path></svg>';

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

    expect(runServerComponent(staticThenSpread.string)).toBe('<div class="override" id="x">x</div>');
    await expect(runServerStreamComponent(staticThenSpread.stream)).resolves.toBe(
      '<div class="override" id="x">x</div>',
    );
    expect(runServerComponent(spreadThenStatic.string)).toBe('<div class="base" id="x">x</div>');
    await expect(runServerStreamComponent(spreadThenStatic.stream)).resolves.toBe(
      '<div class="base" id="x">x</div>',
    );
  });

  test("string and stream emitters render numeric edge children the same way", async () => {
    await expectServerPairHtml(
      `export function App() {
  const negativeZero = -0;
  const large = 1e21;
  return <p>{0}:{NaN}:{negativeZero}:{large}</p>;
}`,
      "<p>0:NaN:0:1e+21</p>",
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
      <div aria-hidden={false} data-ready={false} contentEditable={true} draggable={false} />
    </main>
  );
}`,
      '<main><button>off</button><button disabled="">on</button><a download="">download</a><div aria-hidden="false" data-ready="false" contenteditable="true" draggable="false"></div></main>',
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
        title: "\"<&>\n\t",
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
