// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { compileClientComponent, runClientComponent } from "./helpers.js";

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

  test("client transform preserves top-level const used by component body", async () => {
    const output = transform({
      code: `const greeting = "Hello";

      export function App() {
        return <p>{greeting}</p>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect(node.textContent).toBe("Hello");
  });

  test("client transform preserves top-level helper function used by component body", async () => {
    const output = transform({
      code: `function formatName(name) {
        return "Hello " + name;
      }

      export function App() {
        return <p>{formatName("Ada")}</p>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect(node.textContent).toBe("Hello Ada");
  });

  test("client runtime helper import is aliased away from top-level bindings", async () => {
    const output = transform({
      code: `const createTemplate = "user";

      export function App() {
        return <p>{createTemplate}</p>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("createTemplate as _createTemplate");

    const node = await runClientComponent(output.code);
    expect(node.textContent).toBe("user");
  });

  test("client runtime binding helper import is aliased away from user imports", () => {
    const output = transform({
      code: `import { bindText } from "user-runtime";

      export function App() {
        return <p>{bindText}</p>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("bindText as _bindText");
    expect(output.code).toContain("_bindText(");
    expect(output.code).toContain('import { bindText } from "user-runtime";');
  });

  test("client transform renders same-module component references", async () => {
    const output = transform({
      code: `export function Child(props) {
        return <span>Hello {props.name}</span>;
      }

      export function App() {
        return <section><Child name="Ada" /></section>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      "<section><span>Hello Ada</span></section>",
    );
  });

  test("client transform renders non-exported internal component references", async () => {
    const output = transform({
      code: `function Child(props) {
        return <span>Hello {props.name}</span>;
      }

      export function App() {
        return <section><Child name="Ada" /></section>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("function Child(props)");
    expect(output.code).not.toContain("export function Child");

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      "<section><span>Hello Ada</span></section>",
    );
  });

  test("client transform passes spread props to same-module component references", async () => {
    const output = transform({
      code: `export function Item(props) {
        return <span>{props.label}:{props.count}</span>;
      }

      export function App() {
        const props = { label: "A", count: 1 };
        return <section><Item {...props} count={2} /></section>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      "<section><span>A:2</span></section>",
    );
  });

  test("client transform passes JSX children to same-module component references", async () => {
    const output = transform({
      code: `export function Wrapper(props) {
        return <section>{props.children}</section>;
      }

      export function App() {
        return <Wrapper><p>inside</p></Wrapper>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      "<section><p>inside</p><!----></section>",
    );
  });

  test("client transform applies JSX spread attributes", async () => {
    const output = transform({
      code: 'export function App() { const props = { id: "app", className: "primary" }; return <div {...props}>Hello</div>; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      '<div id="app" class="primary">Hello</div>',
    );
  });

  test("client transform lowers conditional JSX children", async () => {
    const output = transform({
      code: "export function App() { const show = true; return <div>{show ? <span>A</span> : <em>B</em>}</div>; }",
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      "<div><span>A</span><!----></div>",
    );
  });

  test("client transform lowers logical-and JSX children", async () => {
    const output = transform({
      code: "export function App() { const flag = true; return <p>{flag && <em>shown</em>}</p>; }",
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      "<p><em>shown</em><!----></p>",
    );
  });

  test("client transform lowers logical-or JSX fallback children", async () => {
    const output = transform({
      code: "export function App() { const value = null; return <p>{value || <em>fallback</em>}</p>; }",
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      "<p><em>fallback</em><!----></p>",
    );
  });

  test("client transform lowers list JSX children", async () => {
    const output = transform({
      code: "export function App() { const items = [\"A\", \"B\"]; return <ul>{items.map((item, index) => <li>{index}:{item}</li>)}</ul>; }",
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      "<ul><li>0:A</li><li>1:B</li><!----></ul>",
    );
  });

  test("client transform lowers keyed list children without key DOM attributes", async () => {
    const output = transform({
      code: 'export function App() { const items = [{ id: "a", label: "A" }]; return <ul>{items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("{ key: (item) => (item.id) }");

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe("<ul><li>A</li><!----></ul>");
  });
});
