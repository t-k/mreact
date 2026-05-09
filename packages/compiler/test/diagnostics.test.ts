import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";

describe("compiler diagnostics", () => {
  test("reports server target as unsupported in this phase", () => {
    const output = transform({
      code: "export function App() { return <div />; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.code).toBe("");
    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_TARGET",
        level: "error",
      }),
    );
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
