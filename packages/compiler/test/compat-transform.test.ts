// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runCompatComponent, runCompatServerComponent } from "./helpers.js";

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

  test("lowers top-level JSX initializers for compat components", async () => {
    const output = transform({
      code: `
        const headline = <h1 className="title">Hello</h1>;
        export function App() {
          return <section>{headline}</section>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("const headline =");
    expect(output.code).toContain('type: "h1"');

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe(
      '<section><h1 class="title">Hello</h1></section>',
    );
  });

  test("lowers top-level JSX initializers with spread props and JSX expression children", async () => {
    const output = transform({
      code: `
        const props = { id: "list" };
        const visible = true;
        const items = ["A", "B"];
        const list = <ul {...props}>{visible ? items.map((item) => <li key={item}>{item}</li>) : null}</ul>;
        export function App() {
          return <section>{list}</section>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe(
      '<section><ul id="list"><li>A</li><li>B</li></ul></section>',
    );
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

  test("renders non-exported internal component references in compat output", async () => {
    const output = transform({
      code: `function Child(props) {
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
    expect(output.code).toContain("function Child(props)");
    expect(output.code).not.toContain("export function Child");

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

  test("lowers imported component identifiers to value references in compat output", () => {
    const output = transform({
      code: `import { Suspense } from "@modular-react/react-compat";

      export function App() {
        return <Suspense fallback="loading"><span>x</span></Suspense>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("_jsx(Suspense");
    expect(output.code).not.toContain('_jsx("Suspense"');
  });

  test("lowers JSX prop values in compat output", async () => {
    const output = transform({
      code: `export function MyShow(props) {
        return <div>{props.fallback}{props.children}</div>;
      }

      export function App() {
        return <MyShow fallback={<em>loading</em>}><p>main</p></MyShow>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain('fallback: _jsx("em"');
    expect(output.code).not.toContain("fallback: (<em>");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<div><em>loading</em><p>main</p></div>");
  });

  test("lowers const-bound component references as value references in compat output", async () => {
    const output = transform({
      code: `const memo = (component) => component;

      function Heavy(props) {
        return <p>{props.value}</p>;
      }

      const MemoHeavy = memo(Heavy);

      export function App() {
        return <MemoHeavy value="x" />;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("_jsx(MemoHeavy");
    expect(output.code).not.toContain('_jsx("MemoHeavy"');

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<p>x</p>");
  });

  test("lowers JSX inside component body statements in compat mode", async () => {
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

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("const head = <h1>");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<div><h1>title</h1></div>");
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

  test("emits block-body list JSX renderers in compat mode", async () => {
    const output = transform({
      code: `export function App() {
        const items = ["A", "B"];
        return <ul>{items.map((item, index) => {
          const label: string = index + ":" + item;
          return <li>{label}</li>;
        })}</ul>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain(": string");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe(
      "<ul><li>0:A</li><li>1:B</li></ul>",
    );
  });

  test("lowers JSX inside block-body list statements in compat mode", async () => {
    const output = transform({
      code: `export function App() {
        const items = ["A", "B"];
        return <ul>{items.map((item) => {
          const icon = <strong>{item}</strong>;
          return <li>{icon}</li>;
        })}</ul>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("const icon = <strong>");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe(
      "<ul><li><strong>A</strong></li><li><strong>B</strong></li></ul>",
    );
  });

  test("lowers JSX pushed inside for-of statements in compat mode", async () => {
    const output = transform({
      code: `export function App() {
        const rows = [];
        const items = ["A", "B"];
        for (const item of items) {
          rows.push(<li>{item}</li>);
        }
        return <ul>{rows}</ul>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("rows.push(<li>");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<ul><li>A</li><li>B</li></ul>");
  });

  test("lowers JSX pushed inside nested loops in compat mode", async () => {
    const output = transform({
      code: `export function App() {
        const rows = [];
        const groups = [["A"], ["B"]];
        for (const group of groups) {
          for (const item of group) {
            rows.push(<li>{item}</li>);
          }
        }
        return <ul>{rows}</ul>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("rows.push(<li>");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<ul><li>A</li><li>B</li></ul>");
  });

  test("emits conditional returns in list renderers in compat mode", async () => {
    const output = transform({
      code: `export function App() {
        const items = [{ label: "A", active: true }, { label: "B", active: false }];
        return <ul>{items.map((item) => {
          if (item.active) {
            return <li>{item.label}</li>;
          }
          return <li class="off">{item.label}</li>;
        })}</ul>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe(
      '<ul><li>A</li><li class="off">B</li></ul>',
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

  test("emits server html for compat mode server target", () => {
    const output = transform({
      code: "export function App() { return <div className=\"box\">Hello</div>; }",
      filename: "App.tsx",
      target: "server",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([]);
    expect(output.metadata.serverOutput).toBe("string");
    expect(output.code).toContain("export function App()");
    expect(output.code).toContain("<div");
    expect(output.code).toContain("Hello");
  });

  test("drops event handlers and dynamic intrinsic attributes for compat server output", () => {
    const output = transform({
      code: `export function App(props) {
        return <button onClick={() => props.onClick()} style={{ color: props.color }}>Save</button>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(runCompatServerComponent(output.code, "App", {
      color: "red",
      onClick: () => undefined,
    })).toBe("<button>Save</button>");
  });

  test("runs hooks inside compat server render context", () => {
    const output = transform({
      code: `import { useEffect, useState } from "@modular-react/react-compat";

      export function App() {
        const [count] = useState(0);
        useEffect(() => {
          throw new Error("server effects must not run");
        }, []);
        return <p>{count}</p>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(runCompatServerComponent(output.code)).toBe("<p>0</p>");
  });

  test("renders context providers in compat server output", () => {
    const output = transform({
      code: `import { createContext, useContext } from "@modular-react/react-compat";

      const Theme = createContext("light");

      function Label() {
        return <p>{useContext(Theme)}</p>;
      }

      export function App() {
        return <Theme.Provider value="dark"><Label /></Theme.Provider>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(runCompatServerComponent(output.code)).toBe("<p>dark</p>");
  });

  test("renders context consumers in compat server output", () => {
    const output = transform({
      code: `import { createContext } from "@modular-react/react-compat";

      const Theme = createContext("light");

      export function App() {
        return <Theme.Provider value="dark"><Theme.Consumer>{value => <p>{value}</p>}</Theme.Consumer></Theme.Provider>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(runCompatServerComponent(output.code)).toBe("<p>dark</p>");
  });
});
