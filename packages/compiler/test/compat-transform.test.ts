// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runCompatComponent } from "./helpers.js";

describe("compiler compat mode", () => {
  test("emits jsx-runtime imports for a single-child element", async () => {
    const output = transform({
      code: 'export function App() { return <button className="primary">Save</button>; }',
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([
      {
        source: "@modular-react/react-compat/jsx-runtime",
        specifiers: ["jsx"],
      },
    ]);
    expect(output.code).toContain(
      'import { jsx as _jsx } from "@modular-react/react-compat/jsx-runtime";',
    );
    expect(output.code).toContain("return _jsx(\"button\"");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe('<button class="primary">Save</button>');
  });

  test("uses jsxs when an element has multiple children", async () => {
    const output = transform({
      code: "export function App() { return <div><span>A</span><span>B</span></div>; }",
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([
      {
        source: "@modular-react/react-compat/jsx-runtime",
        specifiers: ["jsx", "jsxs"],
      },
    ]);
    expect(output.code).toContain("return _jsxs(\"div\"");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<div><span>A</span><span>B</span></div>");
  });

  test("emits Fragment for fragments", async () => {
    const output = transform({
      code: "export function App() { return <>Hello <span>compat</span></>; }",
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([
      {
        source: "@modular-react/react-compat/jsx-runtime",
        specifiers: ["Fragment", "jsx", "jsxs"],
      },
    ]);
    expect(output.code).toContain("_Fragment");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("Hello <span>compat</span>");
  });

  test("avoids helper alias collisions with component bindings", async () => {
    const output = transform({
      code: `export function App() {
        const _jsx = () => "shadowed";
        return <div>Hi</div>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([
      {
        source: "@modular-react/react-compat/jsx-runtime",
        specifiers: ["jsx"],
      },
    ]);
    expect(output.code).toContain("jsx as _jsx$1");
    expect(output.code).not.toMatch(/jsx as _jsx(?:[, }])/);
    expect(output.code).toContain('return _jsx$1("div"');

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<div>Hi</div>");
  });

  test("avoids jsx helper alias collisions with exported component names", async () => {
    const output = transform({
      code: `export function _jsx() {
        return <div>Hi</div>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([
      {
        source: "@modular-react/react-compat/jsx-runtime",
        specifiers: ["jsx"],
      },
    ]);
    expect(output.code).toContain("jsx as _jsx$1");
    expect(output.code).not.toContain("import { jsx as _jsx }");
    expect(output.code).toContain('return _jsx$1("div"');

    const container = await runCompatComponent(output.code, "_jsx");
    expect(container.innerHTML).toBe("<div>Hi</div>");
  });

  test("avoids jsxs helper alias collisions with exported component names", async () => {
    const output = transform({
      code: `export function _jsxs() {
        return <div><span>A</span><span>B</span></div>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([
      {
        source: "@modular-react/react-compat/jsx-runtime",
        specifiers: ["jsx", "jsxs"],
      },
    ]);
    expect(output.code).toContain("jsxs as _jsxs$1");
    expect(output.code).not.toMatch(/jsxs as _jsxs(?:[, }])/);
    expect(output.code).toContain('return _jsxs$1("div"');

    const container = await runCompatComponent(output.code, "_jsxs");
    expect(container.innerHTML).toBe("<div><span>A</span><span>B</span></div>");
  });

  test("avoids Fragment helper alias collisions with exported component names", async () => {
    const output = transform({
      code: `export function _Fragment() {
        return <>Hi</>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([
      {
        source: "@modular-react/react-compat/jsx-runtime",
        specifiers: ["Fragment", "jsx"],
      },
    ]);
    expect(output.code).toContain("Fragment as _Fragment$1");
    expect(output.code).not.toMatch(/Fragment as _Fragment(?:[, }])/);
    expect(output.code).toContain("return _jsx(_Fragment$1");

    const container = await runCompatComponent(output.code, "_Fragment");
    expect(container.innerHTML).toBe("Hi");
  });

  test("emits empty output for modules without supported components", () => {
    const output = transform({
      code: "export const value = 1;",
      filename: "values.ts",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([]);
    expect(output.code).toBe("");
  });

  test("emits dynamic attributes and event handler props", async () => {
    const output = transform({
      code: `export function App() {
        const id = "save";
        const onClick = (event) => {
          event.currentTarget.setAttribute("data-clicked", "yes");
        };
        return <button id={id} onClick={onClick}>Save</button>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([
      {
        source: "@modular-react/react-compat/jsx-runtime",
        specifiers: ["jsx"],
      },
    ]);
    expect(output.code).toContain("id: (id)");
    expect(output.code).toContain("onClick: onClick");

    const container = await runCompatComponent(output.code);
    const button = container.querySelector("button");
    expect(button?.id).toBe("save");
    expect(button?.textContent).toBe("Save");

    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(button?.dataset.clicked).toBe("yes");
  });

  test("preserves component parameters in compat output", async () => {
    const output = transform({
      code: "export function App(props) { return <p>Hello {props.name}</p>; }",
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("export function App(props)");

    const container = await runCompatComponent(output.code, "App", {
      name: "Ada",
    });
    expect(container.innerHTML).toBe("<p>Hello Ada</p>");
  });

  test("preserves user imports used by compat component body", () => {
    const output = transform({
      code: `import { useState } from "@modular-react/react-compat";

      export function App() {
        const [count] = useState(0);
        return <p>{count}</p>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain(
      'import { useState } from "@modular-react/react-compat";',
    );
  });

  test("preserves top-level helper function used by compat component body", async () => {
    const output = transform({
      code: `function formatName(name) {
        return "Hello " + name;
      }

      export function App() {
        return <p>{formatName("Ada")}</p>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<p>Hello Ada</p>");
  });

  test("aliases jsx runtime helper away from top-level bindings", async () => {
    const output = transform({
      code: `const _jsx = "user";

      export function App() {
        return <p>{_jsx}</p>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("jsx as _jsx$1");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<p>user</p>");
  });

  test("renders same-module component references in compat output", async () => {
    const output = transform({
      code: `export function Child(props) {
        return <span>Hello {props.name}</span>;
      }

      export function App() {
        return <section><Child name="Ada" /></section>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe(
      "<section><span>Hello Ada</span></section>",
    );
  });

  test("lowers member-access JSX tags to value references in compat output", async () => {
    const output = transform({
      code: `const Box = {
        Provider(props) {
          return props.children;
        },
      };

      export function Message() {
        return <span>dark</span>;
      }

      export function App() {
        return <Box.Provider><Message /></Box.Provider>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("_jsx(Box.Provider");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<span>dark</span>");
  });

  test("reports JSX inside component body statements instead of emitting raw JSX", () => {
    const output = transform({
      code: `export function App() {
        const head = <h1>title</h1>;
        return <div>{head}</div>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "MR_UNSUPPORTED_BODY_STATEMENT_JSX",
    );
    expect(output.code).not.toContain("const head = <h1>");
  });

  test("emits spread props in compat mode", async () => {
    const output = transform({
      code: 'export function App() { const props = { id: "app", className: "primary" }; return <div {...props}>Hello</div>; }',
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe(
      '<div id="app" class="primary">Hello</div>',
    );
  });

  test("passes spread props to same-module components in compat mode", async () => {
    const output = transform({
      code: `export function Item(props) {
        return <li>{props.label}:{props.count}</li>;
      }

      export function App() {
        const props = { label: "A", count: 1 };
        return <ul><Item {...props} count={2} /></ul>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("_jsx(Item, { ...");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<ul><li>A:2</li></ul>");
  });

  test("passes JSX children to same-module components in compat mode", async () => {
    const output = transform({
      code: `export function Wrapper(props) {
        return <section>{props.children}</section>;
      }

      export function App() {
        return <Wrapper><p>inside</p></Wrapper>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("children:");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<section><p>inside</p></section>");
  });

  test("emits conditional JSX children in compat mode", async () => {
    const output = transform({
      code: "export function App() { const show = false; return <div>{show ? <span>A</span> : <em>B</em>}</div>; }",
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<div><em>B</em></div>");
  });

  test("emits list JSX children in compat mode", async () => {
    const output = transform({
      code: "export function App() { const items = [\"A\", \"B\"]; return <ul>{items.map((item, index) => <li>{index}:{item}</li>)}</ul>; }",
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe(
      "<ul><li>0:A</li><li>1:B</li></ul>",
    );
  });

  test("emits JSX key as runtime key instead of a DOM prop in compat mode", async () => {
    const output = transform({
      code: 'export function App() { const items = [{ id: "a", label: "A" }]; return <ul>{items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>; }',
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("item.id");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<ul><li>A</li></ul>");
  });

  test("reports server compat mode as unsupported", () => {
    const output = transform({
      code: "export function App() { return <div>Hello</div>; }",
      filename: "App.tsx",
      target: "server",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "MR_UNSUPPORTED_COMPAT_SERVER_TARGET",
    ]);
    expect(output.metadata.imports).toEqual([]);
  });
});
