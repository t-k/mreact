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
      source: "@modular-react/reactive-dom",
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
});
