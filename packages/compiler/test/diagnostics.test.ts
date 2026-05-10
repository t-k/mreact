import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";

describe("compiler diagnostics", () => {
  test("supports the server target for the Phase 5 subset", () => {
    const output = transform({
      code: "export function App() { return <div>Hello SSR</div>; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.target).toBe("server");
    expect(output.code).toContain("export function App()");
  });

  test("reports unsupported dynamic component composition", () => {
    const output = transform({
      code: `
        export function App() { return <Missing />; }
      `,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_COMPONENT_REFERENCE",
        level: "error",
      }),
    );
  });

  test("accepts same-module exported component composition", () => {
    const output = transform({
      code: `
        export function Child() { return <span />; }
        export function App() { return <Child />; }
      `,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
  });

  test("reports unsupported server spread attributes", () => {
    const code = [
      "export function App(props) {",
      "  return <div {...props} />;",
      "}",
    ].join("\n");
    const output = transform({
      code,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_SPREAD_ATTRIBUTE",
        level: "error",
        loc: { line: 2, column: 15 },
      }),
    );
  });

  test("reports unsupported top-level JSX initializer", () => {
    const output = transform({
      code: `
        const headline = <h1>title</h1>;
        export function App() { return <div>{headline}</div>; }
      `,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_TOP_LEVEL_JSX_INITIALIZER",
        level: "error",
      }),
    );
  });
});
