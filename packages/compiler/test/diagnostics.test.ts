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
});
