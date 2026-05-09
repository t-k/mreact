// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { bindText, createTemplate } from "@modular-react/reactive-dom";
import { flushEffects } from "@modular-react/reactive-core/testing";
import { transform } from "../src/index.js";

describe("compiler client runtime dynamic output", () => {
  test("preserves component body statements used by dynamic text", async () => {
    const output = transform({
      code: 'export function App() { const name = "Ada"; return <div>Hello {name}</div>; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const runnableCode = output.code
      .replace(/^import[^\n]+\n\n?/, "")
      .replace("export function App()", "function App()");
    const App = new Function(
      "createTemplate",
      "bindText",
      `${runnableCode}\nreturn App;`,
    )(createTemplate, bindText) as () => Node;

    const node = App();
    await flushEffects();

    expect(node.textContent).toBe("Hello Ada");
  });
});
