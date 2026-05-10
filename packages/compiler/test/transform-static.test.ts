import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";

describe("compiler static JSX transform", () => {
  test("lowers a function component returning a static element", () => {
    const output = transform({
      code: 'export function App() { return <div id="app">Hello</div>; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.components).toEqual([
      { name: "App", exportName: "App" },
    ]);
    expect(output.metadata.imports).toContainEqual({
      source: "@modular-react/reactive-dom",
      specifiers: ["createTemplate"],
    });
    expect(output.code).toContain(
      'import { createTemplate } from "@modular-react/reactive-dom";',
    );
    expect(output.code).toContain("const _tmpl_App = createTemplate");
    expect(output.code).toContain("export function App()");
    expect(output.code).toContain("const _root = _fragment.firstChild");
    expect(output.code).toContain("return _root");
  });

  test("lowers a function component returning a parenthesized static element", () => {
    const output = transform({
      code: "export function App() { return (<div id=\"app\">Hello</div>); }",
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain(
      'const _tmpl_App = createTemplate("<div id=\\"app\\">Hello</div>");',
    );
  });

  test("lowers a function component returning multiline parenthesized JSX", () => {
    const output = transform({
      code: `export function App() {
        return (
          <main>
            <h1>Hello</h1>
          </main>
        );
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("<main><h1>Hello</h1></main>");
  });
});
