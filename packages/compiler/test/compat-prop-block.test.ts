// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runCompatComponent } from "./helpers.js";

describe("react-compat prop reactive DOM block lowering", () => {
  test("resolves static prop block component names without a fixed-point loop", () => {
    const source = readFileSync(join(process.cwd(), "packages/compiler/src/emit-compat.ts"), "utf8");
    const start = source.indexOf("function collectStaticPropBlockComponentNames");
    const end = source.indexOf("interface StaticPropBlockComponentCandidate", start);
    const implementation = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(implementation).not.toContain("let changed");
    expect(implementation).not.toContain("while (changed)");
  });

  test("lowers a single-props host-only component to a prop-bridged reactive block", () => {
    const output = transform({
      code: `export function Row(props) {
        return (
          <tr className={props.selected ? "danger" : ""}>
            <td className="col-md-1">{props.row.id}</td>
            <td className="col-md-4">
              <a onClick={() => selectRow(props.row.id)}>{props.row.label}</a>
            </td>
            <td className="col-md-6"></td>
          </tr>
        );
      }`,
      filename: "Row.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    // Imports: createReactiveDomBlock (compat) + reactive DOM helpers.
    expect(output.code).toContain("createReactiveDomBlock");
    expect(output.code).toContain("effect");
    expect(output.code).toContain("bindEvent");
    // The block closure parameter shadows `props` (the reactive proxy)...
    expect(output.code).toMatch(/createReactiveDomBlock\(\(props\) => \{/);
    // ...and the incoming props object is passed as the block props.
    expect(output.code).toMatch(/\}, props\);/);
    // Imperative DOM build.
    expect(output.code).toContain('document.createElement("tr")');
    expect(output.code).toContain('document.createElement("td")');
    expect(output.code).toContain('document.createElement("a")');
    // One effect drives all bindings, reading the proxy verbatim.
    expect(output.code).toMatch(/= _effect\(\(\) => \{/);
    expect(output.code).toContain('(props.selected ? "danger" : "")');
    expect(output.code).toContain("(props.row.id)");
    expect(output.code).toContain("(props.row.label)");
    expect(output.code).toMatch(/\.className !== /);
    // Event handlers are bound once and evaluate the reactive props proxy when
    // the event fires.
    expect(output.code).toContain("bindEvent");
    expect(output.code).toContain('"click"');
    expect(output.code).toMatch(/const _disposeEvent = _bindEvent\(_a, "click", \(event\) => \{/);
    expect(output.code).toContain("return (selectRow(props.row.id));");
    expect(output.code).not.toContain("const _h = (() => selectRow(props.row.id));");
    expect(output.code).not.toContain("addEventListener");
    expect(output.code).not.toContain(
      'const _disposeEvent = typeof _h === "function" ? _bindEvent',
    );
  });

  test("does not lower components with hooks (non-empty body)", () => {
    const withHook = transform({
      code: `import { useState } from "@reckona/mreact-compat";
        export function Row(props) {
          const [n] = useState(0);
          return <div>{props.label}{n}</div>;
        }`,
      filename: "Row.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    expect(withHook.diagnostics).toEqual([]);
    // Falls back to the normal jsx path, not a reactive block.
    expect(withHook.code).not.toContain("document.createElement");
  });

  test("lowers plain destructured props to prop reactive blocks", () => {
    const output = transform({
      code: `export function Row({ row, selected }) {
          return <tr className={selected ? "danger" : ""}>{row.label}</tr>;
        }`,
      filename: "Row.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("createReactiveDomBlock");
    expect(output.code).toMatch(/const _props = \{ row, selected \};/);
    expect(output.code).toContain('(props.selected ? "danger" : "")');
    expect(output.code).toContain("(props.row.label)");
  });

  test("does not lower destructured props with defaults, rest, or computed keys", () => {
    const withDefault = transform({
      code: `export function Row({ row = { label: "" } }) {
          return <tr>{row.label}</tr>;
        }`,
      filename: "Row.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    expect(withDefault.diagnostics).toEqual([]);
    expect(withDefault.code).not.toContain("createReactiveDomBlock");

    const withRest = transform({
      code: `export function Row({ row, ...rest }) {
          return <tr>{row.label}{rest.kind}</tr>;
        }`,
      filename: "Row.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    expect(withRest.diagnostics).toEqual([]);
    expect(withRest.code).not.toContain("createReactiveDomBlock");

    const withComputed = transform({
      code: `const key = "row";
        export function Row({ [key]: row }) {
          return <tr>{row.label}</tr>;
        }`,
      filename: "Row.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    expect(withComputed.diagnostics).toEqual([]);
    expect(withComputed.code).not.toContain("createReactiveDomBlock");
  });

  test("compiled prop block renders correctly end to end", async () => {
    const output = transform({
      code: `export function Row(props) {
          return (
            <tr className={props.selected ? "danger" : ""}>
              <td className="col-md-1">{props.row.id}</td>
              <td className="col-md-4">{props.row.label}</td>
            </tr>
          );
        }
        export function App() {
          return <Row row={{ id: 7, label: "hi" }} selected={true} />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    expect(output.diagnostics).toEqual([]);

    const container = await runCompatComponent(output.code);
    const tr = container.querySelector("tr");
    expect(tr?.className).toBe("danger");
    expect(container.querySelector("td.col-md-1")?.textContent).toBe("7");
    expect(container.querySelector("td.col-md-4")?.textContent).toBe("hi");
  });

  test("lowers non-class dynamic host attributes through bindProp", () => {
    const output = transform({
      code: `export function Row(props) {
          return (
            <a
              aria-label={props.label}
              data-state={props.state}
              href={props.href}
              style={{ color: props.color }}
            >
              <svg viewBox={props.viewBox}>
                <rect width={props.width} />
              </svg>
            </a>
          );
        }`,
      filename: "Row.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("createReactiveDomBlock");
    expect(output.code).toContain("bindProp");
    expect(output.code).toContain('document.createElement("a")');
    expect(output.code).toMatch(/_bindProp\(\s+_a,\s+"aria-label",\s+\(\) => \(props\.label\),/);
    expect(output.code).toMatch(/_bindProp\(\s+_a,\s+"data-state",\s+\(\) => \(props\.state\),/);
    expect(output.code).toMatch(/_bindProp\(\s+_a,\s+"href",\s+\(\) => \(props\.href\),/);
    expect(output.code).toMatch(
      /_bindProp\(\s+_a,\s+"style",\s+\(\) => \(\{ color: props\.color \}\),/,
    );
    expect(output.code).toMatch(/_bindProp\(\s+_svg,\s+"viewBox",\s+\(\) => \(props\.viewBox\),/);
    expect(output.code).toMatch(/_bindProp\(\s+_rect,\s+"width",\s+\(\) => \(props\.width\),/);
  });

  test("compiled bindProp attributes update with DOM prop safety semantics", async () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

        export function Row(props) {
          return (
            <section>
              <button
                id="target"
                aria-label={props.label}
                data-state={props.state}
                disabled={props.disabled}
                style={{ color: props.color, backgroundColor: props.backgroundColor }}
              >{props.label}</button>
              <a id="link" href={props.href}>link</a>
              <svg viewBox={props.viewBox}>
                <rect width={props.width} />
              </svg>
            </section>
          );
        }

        function Controller() {
          const [on, setOn] = useState(false);
          return (
            <div>
              <button id="switch" onClick={() => setOn(true)}>switch</button>
              <Row
                label={on ? null : "Save"}
                state={on ? "done" : "idle"}
                disabled={on}
                color={on ? "blue" : "red"}
                backgroundColor={on ? null : "yellow"}
                href={on ? "javascript:alert(1)" : "https://example.test/"}
                viewBox={on ? "0 0 48 48" : "0 0 24 24"}
                width={on ? 48 : 24}
              />
            </div>
          );
        }

        export function App() {
          return <Controller />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("bindProp");

    const container = await runCompatComponent(output.code);
    const target = container.querySelector<HTMLButtonElement>("#target");
    const link = container.querySelector<HTMLAnchorElement>("#link");
    const svg = container.querySelector("svg");
    const rect = container.querySelector("rect");

    expect(target?.getAttribute("aria-label")).toBe("Save");
    expect(target?.getAttribute("data-state")).toBe("idle");
    expect(target?.disabled).toBe(false);
    expect(target?.style.color).toBe("red");
    expect(target?.style.backgroundColor).toBe("yellow");
    expect(link?.getAttribute("href")).toBe("https://example.test/");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(rect?.getAttribute("width")).toBe("24");

    container.querySelector<HTMLButtonElement>("#switch")?.click();

    expect(target?.hasAttribute("aria-label")).toBe(false);
    expect(target?.getAttribute("data-state")).toBe("done");
    expect(target?.disabled).toBe(true);
    expect(target?.style.color).toBe("blue");
    expect(target?.style.backgroundColor).toBe("");
    expect(link?.hasAttribute("href")).toBe(false);
    expect(svg?.getAttribute("viewBox")).toBe("0 0 48 48");
    expect(rect?.getAttribute("width")).toBe("48");
  });

  test("lowers structural conditional and keyed list children inside prop blocks", async () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

        export function Rows(props) {
          return (
            <ul id="rows">
              {props.showHeader ? <li id="header">{props.header}</li> : null}
              {props.rows.map((row) => <li key={row.id} data-id={row.id}>{row.label}</li>)}
            </ul>
          );
        }

        function Controller() {
          const [mode, setMode] = useState("a");
          const rows = mode === "a"
            ? [{ id: "a", label: "Ada" }, { id: "b", label: "Babbage" }]
            : [{ id: "b", label: "Byron" }, { id: "c", label: "Curie" }];
          return (
            <div>
              <button id="switch" onClick={() => setMode("b")}>switch</button>
              <Rows showHeader={mode === "a"} header={mode} rows={rows} />
            </div>
          );
        }

        export function App() {
          return <Controller />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("createReactiveDomBlock");
    expect(output.code).toContain("insertDynamic");
    expect(output.code).toContain("bindList");

    const container = await runCompatComponent(output.code);
    expect(Array.from(container.querySelectorAll("#rows li")).map((node) => node.textContent)).toEqual([
      "a",
      "Ada",
      "Babbage",
    ]);

    container.querySelector<HTMLButtonElement>("#switch")?.click();

    expect(container.querySelector("#header")).toBeNull();
    expect(Array.from(container.querySelectorAll("#rows li")).map((node) => node.textContent)).toEqual([
      "Byron",
      "Curie",
    ]);
  });

  test("lowers node-valued children props through dynamic insertion", async () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

        export function Panel(props) {
          return <section id="panel" className={props.kind}>{props.children}</section>;
        }

        function Controller() {
          const [kind, setKind] = useState("a");
          return (
            <div>
              <button id="switch" onClick={() => setKind("b")}>switch</button>
              <Panel kind={kind}>
                {kind === "a" ? <strong>Ada</strong> : <em>Byron</em>}
              </Panel>
            </div>
          );
        }

        export function App() {
          return <Controller />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("createReactiveDomBlock");
    expect(output.code).toContain("insertDynamic");
    expect(output.code).toContain("(props.children)");

    const container = await runCompatComponent(output.code);
    expect(container.querySelector("#panel")?.className).toBe("a");
    expect(container.querySelector("#panel")?.innerHTML).toBe("<strong>Ada</strong>");

    container.querySelector<HTMLButtonElement>("#switch")?.click();

    expect(container.querySelector("#panel")?.className).toBe("b");
    expect(container.querySelector("#panel")?.innerHTML).toBe("<em>Byron</em>");
  });

  test("lowers same-module static prop block children through dynamic insertion", async () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

        function Label(props) {
          return <strong>{props.text}</strong>;
        }

        export function Panel(props) {
          return <section id="panel"><Label text={props.label} /></section>;
        }

        function Controller() {
          const [label, setLabel] = useState("Ada");
          return (
            <div>
              <button id="switch" onClick={() => setLabel("Byron")}>switch</button>
              <Panel label={label} />
            </div>
          );
        }

        export function App() {
          return <Controller />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("createReactiveDomBlock");
    expect(output.code).toContain("insertDynamic");
    expect(output.code).toContain("Label({ text: (props.label) })");

    const container = await runCompatComponent(output.code);
    expect(container.querySelector("#panel")?.innerHTML).toBe("<strong>Ada</strong>");

    container.querySelector<HTMLButtonElement>("#switch")?.click();

    expect(container.querySelector("#panel")?.innerHTML).toBe("<strong>Byron</strong>");
  });

  test("imports helpers required by lowered component children render values", async () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

        export function Wrapper(props) {
          return <section id="wrapper">{props.children}</section>;
        }

        export function EventCard(props) {
          return (
            <article>
              <Wrapper>
                <button id="add" onClick={props.onAdd}>add</button>
              </Wrapper>
            </article>
          );
        }

        export function ListCard(props) {
          return (
            <article>
              <Wrapper>
                {props.items.map((item) => <span key={item}>{item}</span>)}
              </Wrapper>
            </article>
          );
        }

        function Controller() {
          const [items, setItems] = useState(["Ada"]);
          return (
            <div>
              <EventCard onAdd={() => setItems(["Ada", "Byron"])} />
              <ListCard items={items} />
            </div>
          );
        }

        export function App() {
          return <Controller />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("createReactiveDomBlock");
    expect(output.code).toContain("bindEvent");
    expect(output.code).toContain("createList");

    const container = await runCompatComponent(output.code);
    expect(Array.from(container.querySelectorAll("span")).map((node) => node.textContent)).toEqual([
      "Ada",
    ]);

    container.querySelector<HTMLButtonElement>("#add")?.click();

    expect(Array.from(container.querySelectorAll("span")).map((node) => node.textContent)).toEqual([
      "Ada",
      "Byron",
    ]);
  });

  test("updates destructured prop lists through the reactive prop proxy", async () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

        export function Rows({ items, prefix }) {
          return <ul>{items.map((item) => <li key={item.id}>{prefix}:{item.label}</li>)}</ul>;
        }

        function Controller() {
          const [mode, setMode] = useState("a");
          const items = mode === "a"
            ? [{ id: "a", label: "Ada" }]
            : [{ id: "b", label: "Byron" }];
          return (
            <div>
              <button id="switch" onClick={() => setMode("b")}>switch</button>
              <Rows items={items} prefix={mode} />
            </div>
          );
        }

        export function App() {
          return <Controller />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("createReactiveDomBlock");

    const container = await runCompatComponent(output.code);
    expect(container.querySelector("li")?.textContent).toBe("a:Ada");

    container.querySelector<HTMLButtonElement>("#switch")?.click();

    expect(container.querySelector("li")?.textContent).toBe("b:Byron");
  });

  test("updates destructured ternary branches through the reactive prop proxy", async () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

        export function Status({ active, on, off }) {
          return <span id="status">{active ? on : off}</span>;
        }

        function Controller() {
          const [active, setActive] = useState(false);
          return (
            <div>
              <button id="switch" onClick={() => setActive(true)}>switch</button>
              <Status active={active} on={active ? "enabled" : "stale"} off="disabled" />
            </div>
          );
        }

        export function App() {
          return <Controller />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("createReactiveDomBlock");

    const container = await runCompatComponent(output.code);
    expect(container.querySelector("#status")?.textContent).toBe("disabled");

    container.querySelector<HTMLButtonElement>("#switch")?.click();

    expect(container.querySelector("#status")?.textContent).toBe("enabled");
  });

  test("does not rewrite shadowed list renderer parameters to destructured props", async () => {
    const output = transform({
      code: `export function Rows({ items, label }) {
          return <ul>{items.map((label) => <li key={label}>{label}</li>)}</ul>;
        }

        export function App() {
          return <Rows items={["Ada", "Byron"]} label="wrong" />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("createReactiveDomBlock");

    const container = await runCompatComponent(output.code);
    expect(Array.from(container.querySelectorAll("li")).map((node) => node.textContent)).toEqual([
      "Ada",
      "Byron",
    ]);
  });

  test("disposes nested render value effects when list items are removed", async () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

        export function Rows(props) {
          return (
            <ul>
              {props.items.map((item) => (
                <li key={item.id} className={globalThis.__recordNestedEffect(item.id, props.suffix)}>
                  {item.label}
                </li>
              ))}
            </ul>
          );
        }

        function Controller() {
          const [mode, setMode] = useState("a");
          const items = mode === "a"
            ? [{ id: "a", label: "Ada" }, { id: "b", label: "Byron" }]
            : [{ id: "b", label: "Byron" }];
          return (
            <div>
              <button id="remove" onClick={() => setMode("b")}>remove</button>
              <button id="tick" onClick={() => setMode("c")}>tick</button>
              <Rows items={items} suffix={mode} />
            </div>
          );
        }

        export function App() {
          return <Controller />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    expect(output.diagnostics).toEqual([]);

    const calls: string[] = [];
    const previous = (globalThis as unknown as {
      __recordNestedEffect?: (id: string, suffix: string) => string;
    }).__recordNestedEffect;
    (globalThis as unknown as {
      __recordNestedEffect?: (id: string, suffix: string) => string;
    }).__recordNestedEffect = (id, suffix) => {
      calls.push(`${id}:${suffix}`);
      return `${id}-${suffix}`;
    };

    try {
      const container = await runCompatComponent(output.code);
      calls.length = 0;

      container.querySelector<HTMLButtonElement>("#remove")?.click();
      calls.length = 0;

      container.querySelector<HTMLButtonElement>("#tick")?.click();

      expect(calls).not.toContain("a:c");
      expect(calls).toContain("b:c");
    } finally {
      (globalThis as unknown as {
        __recordNestedEffect?: (id: string, suffix: string) => string;
      }).__recordNestedEffect = previous;
    }
  });

  test("lowers safe spread attributes through bindSpreadProps", async () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

        export function Action(props) {
          return <button id="target" {...props.buttonProps}>{props.label}</button>;
        }

        function Controller() {
          const [on, setOn] = useState(false);
          return (
            <div>
              <button id="switch" onClick={() => setOn(true)}>switch</button>
              <Action
                label={on ? "Saved" : "Save"}
                buttonProps={{
                  "aria-label": on ? "Saved" : "Save",
                  disabled: on,
                  "data-state": on ? "done" : "idle",
                }}
              />
            </div>
          );
        }

        export function App() {
          return <Controller />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("createReactiveDomBlock");
    expect(output.code).toContain("bindSpreadProps");

    const container = await runCompatComponent(output.code);
    const target = container.querySelector<HTMLButtonElement>("#target");
    expect(target?.getAttribute("aria-label")).toBe("Save");
    expect(target?.getAttribute("data-state")).toBe("idle");
    expect(target?.disabled).toBe(false);
    expect(target?.textContent).toBe("Save");

    container.querySelector<HTMLButtonElement>("#switch")?.click();

    expect(target?.getAttribute("aria-label")).toBe("Saved");
    expect(target?.getAttribute("data-state")).toBe("done");
    expect(target?.disabled).toBe(true);
    expect(target?.textContent).toBe("Saved");
  });

  test("lowered spread attributes keep bindSpreadProps safety policy", async () => {
    const output = transform({
      code: `export function Box(props) {
          return <a id="target" {...props.linkProps}>safe</a>;
        }

        export function App() {
          return (
            <Box
              linkProps={{
                href: "javascript:alert(1)",
                onClick: "alert(2)",
                onclick: "alert(3)",
                dangerouslySetInnerHTML: { __html: "<span>bad</span>" },
                title: "safe",
              }}
            />
          );
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("createReactiveDomBlock");
    expect(output.code).toContain("bindSpreadProps");

    const container = await runCompatComponent(output.code);
    const link = container.querySelector("#target");

    expect(link?.getAttribute("href")).toBeNull();
    expect(link?.hasAttribute("onClick")).toBe(false);
    expect(link?.hasAttribute("onclick")).toBe(false);
    expect(link?.innerHTML).toBe("safe");
    expect(link?.getAttribute("title")).toBe("safe");
  });

  test("lowered spread attributes bind function event handlers and skip form value props", async () => {
    const output = transform({
      code: `export function Action(props) {
          return <input id="target" type="checkbox" {...props.inputProps} />;
        }

        export function App() {
          return (
            <Action
              inputProps={{
                onClick: () => globalThis.__spreadCalls.push("click"),
                onclick: "alert(1)",
                value: "Ada",
                checked: true,
                title: "safe",
              }}
            />
          );
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("createReactiveDomBlock");
    expect(output.code).toContain("bindSpreadProps");

    const calls: string[] = [];
    const previous = (globalThis as unknown as { __spreadCalls?: string[] }).__spreadCalls;
    (globalThis as unknown as { __spreadCalls?: string[] }).__spreadCalls = calls;

    try {
      const container = await runCompatComponent(output.code);
      const input = container.querySelector<HTMLInputElement>("#target");

      expect(input?.checked).toBe(false);
      input?.click();

      expect(calls).toEqual(["click"]);
      expect(input?.hasAttribute("onclick")).toBe(false);
      expect(input?.value).toBe("on");
      expect(input?.getAttribute("title")).toBe("safe");
    } finally {
      (globalThis as unknown as { __spreadCalls?: string[] }).__spreadCalls = previous;
    }
  });

  test("does not lower ref-bearing host trees to prop reactive blocks", () => {
    const rootRef = transform({
      code: `export function Icon(props) {
          return <span ref={props.r} className={props.c}>x</span>;
        }`,
      filename: "Icon.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    expect(rootRef.diagnostics).toEqual([]);
    expect(rootRef.code).not.toContain("createReactiveDomBlock");
    expect(rootRef.code).not.toMatch(/bindProp\([^,]+,\s+"ref"/);

    const nestedRef = transform({
      code: `export function Icon(props) {
          return <span className={props.c}><i ref={props.r}>x</i></span>;
        }`,
      filename: "Icon.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    expect(nestedRef.diagnostics).toEqual([]);
    expect(nestedRef.code).not.toContain("createReactiveDomBlock");
    expect(nestedRef.code).not.toMatch(/bindProp\([^,]+,\s+"ref"/);
  });

  test("does not lower form value sensitive props through bindProp", () => {
    const output = transform({
      code: `export function FormFields(props) {
          return (
            <form className={props.className}>
              <input value={props.value} checked={props.checked} />
              <input defaultValue={props.defaultValue} defaultChecked={props.defaultChecked} />
              <textarea defaultValue={props.bio} />
              <select defaultValue={props.role}>
                <option value="admin">admin</option>
              </select>
            </form>
          );
        }`,
      filename: "FormFields.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("createReactiveDomBlock");
    expect(output.code).not.toMatch(
      /bindProp\([^,]+,\s+"(?:value|checked|defaultValue|defaultChecked)"/,
    );
  });

  test("does not lower dangerous hydration-sensitive props through bindProp", () => {
    const output = transform({
      code: `export function HtmlSlot(props) {
          return (
            <section
              className={props.className}
              dangerouslySetInnerHTML={{ __html: props.html }}
              suppressHydrationWarning={props.suppress}
            />
          );
        }`,
      filename: "HtmlSlot.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("createReactiveDomBlock");
    expect(output.code).not.toMatch(
      /bindProp\([^,]+,\s+"(?:dangerouslySetInnerHTML|suppressHydrationWarning)"/,
    );
  });

  test("annotates pure strict-equality memo comparators for prop reactive blocks", () => {
    const output = transform({
      code: `import { memo } from "@reckona/mreact-compat";

        export function Row(props) {
          return (
            <tr className={props.selected ? "danger" : ""}>
              <td>{props.row.label}</td>
            </tr>
          );
        }

        export const RowMemo = memo(
          Row,
          (previous, next) => previous.selected === next.selected && previous.row === next.row,
        );

        export function App(props) {
          return <RowMemo row={props.row} selected={props.selected} />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain('RowMemo.__mreactMemoCompareProps = ["selected", "row"];');
  });

  test("does not annotate non-strict or non-prop-block memo comparators", () => {
    const nonStrict = transform({
      code: `import { memo } from "@reckona/mreact-compat";

        export function Row(props) {
          return <tr>{props.row.label}</tr>;
        }

        export const RowMemo = memo(
          Row,
          (previous, next) => previous.row.id === next.row.id,
        );`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(nonStrict.diagnostics).toEqual([]);
    expect(nonStrict.code).not.toContain("__mreactMemoCompareProps");

    const nonPropBlock = transform({
      code: `import { memo, useState } from "@reckona/mreact-compat";

        export function Row(props) {
          const [value] = useState(props.row.label);
          return <tr>{value}</tr>;
        }

        export const RowMemo = memo(
          Row,
          (previous, next) => previous.row === next.row,
        );`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(nonPropBlock.diagnostics).toEqual([]);
    expect(nonPropBlock.code).not.toContain("__mreactMemoCompareProps");
  });

  test("compiled prop block event handlers use latest parent props after updates", async () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

        export function Row(props) {
          return <button id="target" onClick={props.onClick}>{props.label}</button>;
        }

        function Controller() {
          const [mode, setMode] = useState("a");
          const handler = mode === "a"
            ? () => globalThis.__calls.push("a")
            : () => globalThis.__calls.push("b");
          return (
            <div>
              <button id="switch" onClick={() => setMode("b")}>switch</button>
              <Row label={mode} onClick={handler} />
            </div>
          );
        }

        export function App() {
          return <Controller />;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    expect(output.diagnostics).toEqual([]);

    const calls: string[] = [];
    const previousCalls = (globalThis as unknown as { __calls?: string[] }).__calls;
    (globalThis as unknown as { __calls?: string[] }).__calls = calls;

    try {
      const container = await runCompatComponent(output.code);
      container.querySelector<HTMLButtonElement>("#target")?.click();
      container.querySelector<HTMLButtonElement>("#switch")?.click();

      expect(container.querySelector("#target")?.textContent).toBe("b");

      container.querySelector<HTMLButtonElement>("#target")?.click();

      expect(calls).toEqual(["a", "b"]);
    } finally {
      (globalThis as unknown as { __calls?: string[] }).__calls = previousCalls;
    }
  });
});
