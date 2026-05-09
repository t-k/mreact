import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";

describe("compiler server diagnostics", () => {
  test("reports event handlers as unsupported for server target", () => {
    const output = transform({
      code: "export function App() { return <button onClick={() => 1}>Click</button>; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
        level: "error",
      }),
    );
  });

  test("reports dynamic attributes as unsupported for server target", () => {
    const output = transform({
      code: "export function App() { const id = 'x'; return <div id={id}>Hello</div>; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_SERVER_DYNAMIC_ATTRIBUTE",
        level: "error",
      }),
    );
  });
});
