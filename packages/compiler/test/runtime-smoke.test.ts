// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { createTemplate } from "@modular-react/reactive-dom";
import { transform } from "../src/index.js";

describe("compiler runtime smoke", () => {
  test("emitted static component can be imported and returns a DOM node", () => {
    const output = transform({
      code: 'export function App() { return <div id="app">Hello</div>; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    const runnableCode = output.code
      .replace(/^import[^\n]+\n\n?/, "")
      .replace("export function App()", "function App()");
    const App = new Function(
      "createTemplate",
      `${runnableCode}\nreturn App;`,
    )(createTemplate) as () => Node;

    const node = App();

    expect(node).toBeInstanceOf(HTMLDivElement);
    expect((node as HTMLElement).id).toBe("app");
    expect(node.textContent).toBe("Hello");
  });
});
