import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";

describe("compiler dynamic JSX transform", () => {
  test("emits text, prop, and event bindings", () => {
    const output = transform({
      code: `
        export function App() {
          const count = cell(0);
          return <button disabled={count.get() > 1} onClick={() => count.set((n) => n + 1)}>count: {count.get()}</button>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toContainEqual({
      source: "@reckona/mreact-reactive-dom",
      specifiers: ["bindEvent", "bindProp", "bindText", "createTemplate"],
    });
    expect(output.code).toContain("bindText(");
    expect(output.code).toContain("bindProp(");
    expect(output.code).toContain("bindEvent(");
    expect(output.code).toContain("count.get()");
  });

  test("treats parenthesized JSX expression children as JSX", () => {
    const output = transform({
      code: "export function App() { return <div>{(<span>Hello</span>)}</div>; }",
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("<div><span>Hello</span></div>");
    expect(output.code).not.toContain("bindText");
  });

  // Issue 057 Phase A regression gate: the client emit must import only the
  // binding helpers actually used by the component. Helpers like `bindList`
  // (only needed for `{items.map(...)}`) or `bindSpreadProps` (only needed
  // for `<X {...props} />`) must not leak into the import line when unused.
  test("emits only the runtime helpers the component actually uses", () => {
    const output = transform({
      code: `
        export function App() {
          const n = cell(0);
          return <div onClick={() => n.set(n.get() + 1)}>{n.get()}</div>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    // bindEvent / bindText / createTemplate are required by the JSX above.
    expect(output.metadata.imports).toContainEqual({
      source: "@reckona/mreact-reactive-dom",
      specifiers: ["bindEvent", "bindText", "createTemplate"],
    });
    // bindList / bindProp / bindSpreadProps / insertDynamic are not used and
    // must not appear in the import specifiers nor in the emitted code.
    expect(output.code).not.toContain("bindList");
    expect(output.code).not.toContain("bindSpreadProps");
    expect(output.code).not.toContain("insertDynamic");
    // bindProp is reserved for `attr={expr}` (other than event handlers).
    expect(output.code).not.toContain("bindProp");
  });

  test("emits bindList only when a list child is present", () => {
    const output = transform({
      code: `
        export function App() {
          const items = cell([1, 2, 3]);
          return <ul>{items.get().map((n) => <li>{n}</li>)}</ul>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toContainEqual(
      expect.objectContaining({
        source: "@reckona/mreact-reactive-dom",
        specifiers: expect.arrayContaining(["bindList"]),
      }),
    );
    expect(output.code).toContain("bindList");
  });
});
