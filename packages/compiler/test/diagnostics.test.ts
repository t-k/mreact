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

  test("reports unsupported component composition", () => {
    const output = transform({
      code: `
        function Child() { return <span />; }
        export function App() { return <Child />; }
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

  test("reports unsupported spread attributes", () => {
    const output = transform({
      code: "export function App(props) { return <div {...props} />; }",
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_SPREAD_ATTRIBUTE",
        level: "error",
      }),
    );
  });
});
