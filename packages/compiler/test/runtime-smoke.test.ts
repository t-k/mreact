// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { compileClientComponent } from "./helpers.js";

describe("compiler runtime smoke", () => {
  test("emitted static component can be imported and returns a DOM node", () => {
    const output = transform({
      code: 'export function App() { return <div id="app">Hello</div>; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    const App = compileClientComponent(output.code);
    const node = App();

    expect(node).toBeInstanceOf(HTMLDivElement);
    expect((node as HTMLElement).id).toBe("app");
    expect(node.textContent).toBe("Hello");
  });

  test("client helper handles multiple leading generated imports", () => {
    const App = compileClientComponent(`
import { createTemplate } from "@modular-react/reactive-dom";
import { bindText } from "@modular-react/reactive-dom";

const _tmpl_App = createTemplate("<div>Hello</div>");
export function App() {
  const _fragment = _tmpl_App();
  return _fragment.firstChild;
}
`);

    const node = App();

    expect(node).toBeInstanceOf(HTMLDivElement);
    expect(node.textContent).toBe("Hello");
  });

  test("client transform preserves user imports used by component body", () => {
    const output = transform({
      code: `import { cell } from "@modular-react/reactive-core";

      export function App() {
        const count = cell(0);
        return <p>{count.get()}</p>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain(
      'import { cell } from "@modular-react/reactive-core";',
    );
  });
});
