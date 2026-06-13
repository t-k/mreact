import { describe, expect, test } from "vitest";
import { createElement, renderChildToString, renderToString } from "@reckona/mreact-compat";
import { transform } from "../src/index.js";
import { runServerComponent, runServerStreamComponent } from "./helpers.js";

// Runs compiled output whose emitted imports include the compat child
// helper; plain runServerComponent strips imports, so the helper binding is
// provided explicitly under its emitted alias.
function runCompiledWithCompatHelpers(code: string, exportName = "App"): string {
  const aliasMatch = /renderChildToString as (\w+)/.exec(code);
  const aliasName = aliasMatch?.[1] ?? "_renderCompatChild";
  const runnable = code
    .replace(/^import[^\n]*$/gm, "")
    .replace(/^export default function /gm, "function ")
    .replace(/^export function /gm, "function ")
    .replace(/^export /gm, "");
  const exportsMatch = [...runnable.matchAll(/function (\w+)\(/g)].map((match) => match[1]);
  const moduleFactory = new Function(
    aliasName,
    "createElement",
    `${runnable}\nreturn { ${exportsMatch.map((name) => `${name}: ${name}`).join(", ")} };`,
  ) as (
    helper: typeof renderChildToString,
    create: typeof createElement,
  ) => Record<string, (props?: unknown) => string>;
  const moduleExports = moduleFactory(renderChildToString, createElement);
  const component = moduleExports[exportName];

  if (component === undefined) {
    throw new Error(`Compiled export '${exportName}' was not found.`);
  }

  return component();
}

// Static createElement() trees from the compat family must compile through
// the server string pipeline instead of being interpreted per request, with
// byte parity against the interpreter for the lowered shapes.

function compile(
  code: string,
  serverOutput: "string" | "stream" = "string",
): { code: string; diagnostics: unknown[] } {
  const output = transform({
    code,
    filename: "page.tsx",
    target: "server",
    dev: false,
    serverOutput,
  });
  return { code: output.code, diagnostics: output.diagnostics };
}

describe("compat createElement server lowering", () => {
  test("compiles a host-only createElement tree to string appends", () => {
    const source = `import { createElement } from "@reckona/mreact-compat";
export function App() {
  return createElement("main", { id: "app" }, "Hello & <world>");
}`;
    const output = compile(source);

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("_out +=");
    expect(output.code).not.toContain("createElement(");

    const interpreted = renderToString(() =>
      createElement("main", { id: "app" }, "Hello & <world>"),
    );
    expect(runServerComponent(output.code)).toBe(interpreted);
  });

  test("compiles keyed map children with dynamic text to a loop", () => {
    const source = `import { createElement } from "@reckona/mreact-compat";
const items = [0, 1, 2];
export function App() {
  return createElement("main", null, items.map((index) => createElement("span", { key: index }, index)));
}`;
    const output = compile(source);

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("createElement(");

    const items = [0, 1, 2];
    const interpreted = renderToString(() =>
      createElement(
        "main",
        null,
        items.map((index) => createElement("span", { key: index }, index)),
      ),
    );
    expect(runCompiledWithCompatHelpers(output.code)).toBe(interpreted);
  });

  test("matches interpreter bytes for the dynamic attribute grid shape", () => {
    const source = `import { createElement } from "@reckona/mreact-compat";
const cells = [
  { row: 1, col: 2, kind: "a", title: 'He said "hi"', label: "L&L", bg: "red", fg: "blue", text: "Item <0>" },
  { row: 3, col: 4, kind: "b", title: "plain", label: "aria", bg: "green", fg: "black", text: "Item & 1" },
];
export function App() {
  return createElement("main", null, cells.map((cell, i) => createElement(
    "div",
    {
      key: i,
      className: "cell row-" + cell.row + " col-" + cell.col + " kind-" + cell.kind,
      "data-row": cell.row,
      "data-col": cell.col,
      title: cell.title,
      "aria-label": cell.label,
      style: { backgroundColor: cell.bg, color: cell.fg },
    },
    cell.text,
  )));
}`;
    const output = compile(source);

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("createElement(");

    const cells = [
      { row: 1, col: 2, kind: "a", title: 'He said "hi"', label: "L&L", bg: "red", fg: "blue", text: "Item <0>" },
      { row: 3, col: 4, kind: "b", title: "plain", label: "aria", bg: "green", fg: "black", text: "Item & 1" },
    ];
    const interpreted = renderToString(() =>
      createElement(
        "main",
        null,
        cells.map((cell, i) =>
          createElement(
            "div",
            {
              key: i,
              className: `cell row-${cell.row} col-${cell.col} kind-${cell.kind}`,
              "data-row": cell.row,
              "data-col": cell.col,
              title: cell.title,
              "aria-label": cell.label,
              style: { backgroundColor: cell.bg, color: cell.fg },
            },
            cell.text,
          ),
        ),
      ),
    );
    expect(runCompiledWithCompatHelpers(output.code)).toBe(interpreted);
  });

  test("applies react px semantics to numeric style values", () => {
    const source = `import { createElement } from "@reckona/mreact-compat";
export function App() {
  return createElement("div", { style: { marginTop: 10, opacity: 0.5, zIndex: 3, width: "4em" } });
}`;
    const output = compile(source);

    expect(output.diagnostics).toEqual([]);

    const interpreted = renderToString(() =>
      createElement("div", { style: { marginTop: 10, opacity: 0.5, zIndex: 3, width: "4em" } }),
    );
    expect(interpreted).toContain("margin-top:10px");
    expect(runServerComponent(output.code)).toBe(interpreted);
  });

  test("serializes static boolean and special props with interpreter bytes", () => {
    const source = `import { createElement } from "@reckona/mreact-compat";
export function App() {
  return createElement("section", {
    className: "panel",
    htmlFor: "x",
    disabled: true,
    hidden: false,
    "aria-expanded": true,
    "data-open": true,
    tabIndex: 0,
    onClick: () => undefined,
    ref: () => undefined,
  }, "body");
}`;
    const output = compile(source);

    expect(output.diagnostics).toEqual([]);

    const interpreted = renderToString(() =>
      createElement(
        "section",
        {
          className: "panel",
          htmlFor: "x",
          disabled: true,
          hidden: false,
          "aria-expanded": true,
          "data-open": true,
          tabIndex: 0,
          onClick: () => undefined,
          ref: () => undefined,
        },
        "body",
      ),
    );
    expect(runServerComponent(output.code)).toBe(interpreted);
  });

  test("renders element-valued expression children through the interpreter helper", () => {
    const source = `import { createElement } from "@reckona/mreact-compat";
const inner = createElement("em", null, "deep & deep");
export function App() {
  return createElement("p", null, inner);
}`;
    const output = compile(source);

    expect(output.diagnostics).toEqual([]);

    const inner = createElement("em", null, "deep & deep");
    const interpreted = renderToString(() => createElement("p", null, inner));
    expect(interpreted).toBe("<p><em>deep &amp; deep</em></p>");
    expect(runCompiledWithCompatHelpers(output.code)).toBe(interpreted);
  });

  test("supports aliased createElement imports", () => {
    const source = `import { createElement as h } from "react";
export function App() {
  return h("ul", null, h("li", null, "one"));
}`;
    const output = compile(source);

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain('h("ul"');
    expect(runServerComponent(output.code)).toBe("<ul><li>one</li></ul>");
  });

  test("bails out whole trees containing component references", () => {
    // Named capital exports with non-lowerable returns keep today's
    // diagnostics; default exports and local helpers stay verbatim.
    const source = `import { createElement } from "@reckona/mreact-compat";
function Row(props) {
  return createElement("li", null, props.label);
}
export default function Page() {
  return createElement("ul", null, createElement(Row, { label: "x" }));
}`;
    const output = compile(source);

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("createElement(Row");
    expect(output.code).toContain('createElement("ul"');
  });

  test("bails out on spread props and non-literal tags", () => {
    const source = `import { createElement } from "@reckona/mreact-compat";
const extra = { id: "x" };
const tag = "div";
function spreadView() {
  return createElement("div", { ...extra }, "a");
}
function dynamicTagView() {
  return createElement(tag, null, "b");
}
export default function Page() {
  return [spreadView(), dynamicTagView()];
}`;
    const output = compile(source);

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("...extra");
    expect(output.code).toContain("createElement(tag");
  });

  test("does not lower shadowed createElement bindings", () => {
    const source = `import { createElement } from "@reckona/mreact-compat";
export default function App() {
  const createElement = (tag) => "shadowed:" + tag;
  return createElement("main");
}`;
    const output = compile(source);

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code, "default")).toBe("shadowed:main");
  });

  test("compiles compat createElement trees through stream output", async () => {
    const source = `import { createElement } from "@reckona/mreact-compat";
const cells = [
  { label: "A&B", title: { nested: true }, bg: "red", width: 10 },
  { label: "<C>", title: "plain", bg: "blue", width: 0 },
];
export function App() {
  return createElement("main", null, cells.map((cell, i) => createElement(
    "div",
    {
      key: i,
      title: cell.title,
      "data-live": i === 0,
      style: { backgroundColor: cell.bg, width: cell.width, opacity: 0.5 },
    },
    cell.label,
  )));
}`;
    const output = compile(source, "stream");

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("createElement(");

    const cells = [
      { label: "A&B", title: { nested: true }, bg: "red", width: 10 },
      { label: "<C>", title: "plain", bg: "blue", width: 0 },
    ];
    const interpreted = renderToString(() =>
      createElement(
        "main",
        null,
        cells.map((cell, i) =>
          createElement(
            "div",
            {
              key: i,
              title: cell.title,
              "data-live": i === 0,
              style: { backgroundColor: cell.bg, width: cell.width, opacity: 0.5 },
            },
            cell.label,
          ),
        ),
      ),
    );
    await expect(runServerStreamComponent(output.code)).resolves.toBe(interpreted);
  });

  test("compiles element-bearing conditional createElement children", () => {
    const source = `import { createElement } from "@reckona/mreact-compat";
const rows = [
  { label: "hot & ready", active: true, count: 1 },
  { label: "cold <idle>", active: false, count: 0 },
];
export function App() {
  return createElement("ul", null, rows.map((row, i) => createElement(
    "li",
    { key: i },
    row.active ? createElement("strong", null, String(row.label)) : createElement("span", null, String(row.label)),
    row.count && createElement("em", null, "count:" + row.count),
  )));
}`;
    const output = compile(source);

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("renderChildToString");
    expect(output.code).not.toContain("createElement(");

    const rows = [
      { label: "hot & ready", active: true, count: 1 },
      { label: "cold <idle>", active: false, count: 0 },
    ];
    const interpreted = renderToString(() =>
      createElement(
        "ul",
        null,
        rows.map((row, i) =>
          createElement(
            "li",
            { key: i },
            row.active
              ? createElement("strong", null, String(row.label))
              : createElement("span", null, String(row.label)),
            row.count && createElement("em", null, "count:" + row.count),
          ),
        ),
      ),
    );
    expect(runCompiledWithCompatHelpers(output.code)).toBe(interpreted);
  });
});
