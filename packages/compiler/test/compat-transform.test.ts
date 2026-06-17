// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { createElement, createRoot } from "@reckona/mreact-compat";
import { transform } from "../src/index.js";
import {
  compileCompatModule,
  runCompatComponent,
  runCompatHydration,
  runCompatServerComponent,
  runServerStreamComponent,
} from "./helpers.js";

const reactJsxTransformParityFamilies = [
  "production-jsx",
  "development-jsxdev",
  "fragment",
  "spread-props",
  "key-prop",
  "member-expression-tags",
  "imported-component-tags",
  "same-module-components",
  "const-bound-components",
  "class-render-methods",
  "default-exports",
  "call-argument-jsx",
  "prop-value-jsx",
  "conditional-jsx",
  "list-jsx",
  "block-body-list-renderers",
  "for-loop-jsx-push",
  "early-return-jsx",
  "switch-return-jsx",
  "context-consumer-render-prop",
  "server-compat-output",
  "server-stream-compat-output",
] as const;

describe("compiler compat mode", () => {
  test("keeps React JSX transform parity families explicit", () => {
    expect([...reactJsxTransformParityFamilies].sort()).toEqual([
      "block-body-list-renderers",
      "call-argument-jsx",
      "class-render-methods",
      "conditional-jsx",
      "const-bound-components",
      "context-consumer-render-prop",
      "default-exports",
      "development-jsxdev",
      "early-return-jsx",
      "for-loop-jsx-push",
      "fragment",
      "imported-component-tags",
      "key-prop",
      "list-jsx",
      "member-expression-tags",
      "production-jsx",
      "prop-value-jsx",
      "same-module-components",
      "server-compat-output",
      "server-stream-compat-output",
      "spread-props",
      "switch-return-jsx",
    ]);
  });

  test("uses jsxDEV from jsx-dev-runtime for dev compat output", async () => {
    const output = transform({
      code: 'export function App() { return <button className="primary">Save</button>; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([
      {
        source: "@reckona/mreact-compat/jsx-dev-runtime",
        specifiers: ["jsxDEV"],
      },
    ]);
    expect(output.code).toContain(
      'import { jsxDEV as _jsxDEV } from "@reckona/mreact-compat/jsx-dev-runtime";',
    );
    expect(output.code).toContain('return _jsxDEV("button"');

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe('<button class="primary">Save</button>');
  });

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
        source: "@reckona/mreact-compat/jsx-runtime",
        specifiers: ["jsx"],
      },
    ]);
    expect(output.code).toContain(
      'import { jsx as _jsx } from "@reckona/mreact-compat/jsx-runtime";',
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
        source: "@reckona/mreact-compat/jsx-runtime",
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
        source: "@reckona/mreact-compat/jsx-runtime",
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

  test("accepts React-compatible non-JSX component returns in compat mode", async () => {
    const output = transform({
      code: `
        export function Empty() {
          return null;
        }
        export function Text() {
          return "Ada";
        }
        export function Count() {
          return 2;
        }
        export function App() {
          const show = true;
          return <section><Empty />{show ? <Text /> : <Count />}</section>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<section>Ada</section>");
  });

  test("accepts array and createElement component returns in compat mode", async () => {
    const output = transform({
      code: `
        import { createElement, cloneElement } from "@reckona/mreact-compat";
        export function Items() {
          return [<li key="a">A</li>, <li key="b">B</li>];
        }
        export function Cloned() {
          const child = createElement("strong", null, "C");
          return cloneElement(child, { id: "cloned" });
        }
        export function App() {
          return <section><ul><Items /></ul><Cloned /></section>;
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
      '<section><ul><li>A</li><li>B</li></ul><strong id="cloned">C</strong></section>',
    );
  });

  test("preserves class components and lowers JSX inside render methods", async () => {
    const output = transform({
      code: `
        import { Component } from "@reckona/mreact-compat";

        export class Counter extends Component {
          state = { count: 2 };

          render() {
            return <p>count: {this.state.count}</p>;
          }
        }
      `,
      filename: "Counter.compat.tsx",
      target: "client",
      dev: true,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("export class Counter extends Component");
    expect(output.code).not.toContain("<p>");

    const container = await runCompatComponent(
      `${output.code}\nexport function App() { return _jsxs(Counter, {}); }`,
    );
    expect(container.innerHTML).toBe("<p>count: 2</p>");
  });

  test("preserves PureComponent class components and lowers JSX inside render methods", async () => {
    const output = transform({
      code: `
        import { PureComponent } from "@reckona/mreact-compat";

        export class Item extends PureComponent {
          render() {
            return <li>{this.props.label}</li>;
          }
        }
      `,
      filename: "Item.compat.tsx",
      target: "client",
      dev: true,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("export class Item extends PureComponent");
    expect(output.code).not.toContain("<li>");

    const container = await runCompatComponent(
      `${output.code}\nexport function App() { return _jsx("ul", { children: _jsx(Item, { label: "A" }) }); }`,
    );
    expect(container.innerHTML).toBe("<ul><li>A</li></ul>");
  });

  test("deduplicates jsx-runtime imports for multiple class component render methods", async () => {
    const output = transform({
      code: `
        import { Component, PureComponent } from "@reckona/mreact-compat";

        export class A extends Component {
          render() {
            return <p>a</p>;
          }
        }

        export class B extends PureComponent {
          render() {
            return <li>b</li>;
          }
        }
      `,
      filename: "Classes.compat.tsx",
      target: "client",
      dev: true,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code.match(/@reckona\/mreact-compat\/jsx-runtime/g)).toHaveLength(1);
    expect(output.code).not.toContain("import {  }");
    expect(output.code).toContain("export class A extends Component");
    expect(output.code).toContain("export class B extends PureComponent");
    expect(output.code).not.toContain("<p>");
    expect(output.code).not.toContain("<li>");

    const container = await runCompatComponent(
      `${output.code}\nexport function App() { return _jsx("section", { children: [_jsx(A, {}), _jsx("ul", { children: _jsx(B, {}) })] }); }`,
    );
    expect(container.innerHTML).toBe("<section><p>a</p><ul><li>b</li></ul></section>");
  });

  test("lowers JSX inside compat call expression arguments", async () => {
    const output = transform({
      code: `
        import { createElement } from "@reckona/mreact-compat";
        export function App() {
          return createElement("section", null, <strong>Ada</strong>);
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("<strong>");

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<section><strong>Ada</strong></section>");
  });

  test("preserves lowercase exported helper functions in compat mode", async () => {
    const output = transform({
      code: `
        export function formatName(name) {
          return name.toUpperCase();
        }
        export function App() {
          return <p>{formatName("Ada") + "!"}</p>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);

    const container = await runCompatComponent(output.code);
    expect(container.innerHTML).toBe("<p>ADA!</p>");
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
        source: "@reckona/mreact-compat/jsx-runtime",
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
        source: "@reckona/mreact-compat/jsx-runtime",
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
        source: "@reckona/mreact-compat/jsx-runtime",
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
        source: "@reckona/mreact-compat/jsx-runtime",
        specifiers: ["Fragment", "jsx"],
      },
    ]);
    expect(output.code).toContain("Fragment as _Fragment$1");
    expect(output.code).not.toMatch(/Fragment as _Fragment(?:[, }])/);
    expect(output.code).toContain("return _jsx(_Fragment$1");

    const container = await runCompatComponent(output.code, "_Fragment");
    expect(container.innerHTML).toBe("Hi");
  });

  test("preserves modules without supported components", () => {
    const output = transform({
      code: "export const value = 1;",
      filename: "values.ts",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([]);
    expect(output.code).toContain("export const value = 1;");
  });

  test("preserves default function component exports for dynamic import lazy modules", () => {
    const output = transform({
      code: `export default function LazyAbout() { return <div>About</div>; }`,
      filename: "LazyAbout.compat.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.components).toEqual([
      { name: "LazyAbout", exportName: "default" },
    ]);
    expect(output.code).toContain("export default function LazyAbout()");
    expect(output.code).not.toContain("export function LazyAbout()");
  });

  test("lowers anonymous default arrow component exports for dynamic import lazy modules", async () => {
    const output = transform({
      code: `export default () => <div>About</div>;`,
      filename: "LazyAbout.compat.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.components).toEqual([
      { name: "DefaultExport", exportName: "default" },
    ]);
    expect(output.code).toContain("export default function DefaultExport()");
    expect(output.code).not.toContain("=> <div>");

    const container = await runCompatComponent(output.code, "default");
    expect(container.innerHTML).toBe("<div>About</div>");
  });

  test("preserves default value exports in modules without components", () => {
    const output = transform({
      code: "const value = 42;\nexport default value;",
      filename: "config.ts",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([]);
    expect(output.code).toContain("const value = 42;");
    expect(output.code).toContain("export default value;");
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
        source: "@reckona/mreact-compat/jsx-runtime",
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
      code: `import { useState } from "@reckona/mreact-compat";

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
      'import { useState } from "@reckona/mreact-compat";',
    );
  });

  test("emits compiler reactive DOM blocks for compiler-proven useState text children", () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

      let update;

      export function App() {
        const [count, setCount] = useState(0);
        update = setCount;
        return <p>{count}</p>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([
      {
        source: "@reckona/mreact-reactive-dom",
        specifiers: ["bindText", "createTemplate"],
      },
      {
      source: "@reckona/mreact-compat/jsx-runtime",
        specifiers: ["REACTIVE_STATE_BINDING_META", "createReactiveDomBlock"],
      },
    ]);
    expect(output.code).toContain(
      'import { bindText as _bindText, createTemplate as _createTemplate } from "@reckona/mreact-reactive-dom";',
    );
    expect(output.code).toContain(
      'import { REACTIVE_STATE_BINDING_META as _REACTIVE_STATE_BINDING_META, createReactiveDomBlock as _createReactiveDomBlock } from "@reckona/mreact-compat/jsx-runtime";',
    );
    expect(output.code).toContain('const _tmpl_App = _createTemplate("<p><!----></p>");');
    expect(output.code).toContain("const _countStateTuple = useState(0);");
    expect(output.code).toContain("const [count, setCount] = _countStateTuple;");
    expect(output.code).toContain(
      "const _countStateBinding = _countStateTuple[_REACTIVE_STATE_BINDING_META];",
    );
    expect(output.code).toContain("return _createReactiveDomBlock(() => {");
    expect(output.code).toContain(
      "const _countTextDispose = _bindText(_countTextNode, () => _countStateBinding.get(), { preserveInitial: true });",
    );
  });

  test("emits direct text binding metadata from jsx-dev-runtime for compiler-proven dev output", () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

      export function App() {
        const [count, setCount] = useState(0);
        return <p>{count}</p>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toContainEqual({
      source: "@reckona/mreact-compat/jsx-dev-runtime",
      specifiers: ["REACTIVE_TEXT_BINDING_META", "jsxDEV"],
    });
    expect(output.code).toContain(
      'import { REACTIVE_TEXT_BINDING_META as _REACTIVE_TEXT_BINDING_META, jsxDEV as _jsxDEV } from "@reckona/mreact-compat/jsx-dev-runtime";',
    );
  });

  test("does not emit direct text binding metadata when state is also used outside the text child", () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

      export function App() {
        const [count, setCount] = useState(0);
        return <p data-count={count}>{count}</p>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([
      {
        source: "@reckona/mreact-compat/jsx-runtime",
        specifiers: ["jsx"],
      },
    ]);
    expect(output.code).toContain("const [count, setCount] = useState(0);");
    expect(output.code).not.toContain("_countTextBinding");
    expect(output.code).not.toContain("_REACTIVE_TEXT_BINDING_META");
  });

  test("does not emit direct text binding metadata when state controls a conditional", () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

      export function App() {
        const [count, setCount] = useState(1);
        return count > 0 ? <p>{count}</p> : null;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("const [count, setCount] = useState(1);");
    expect(output.code).not.toContain("_countTextBinding");
    expect(output.code).not.toContain("_REACTIVE_TEXT_BINDING_META");
  });

  test("does not emit direct text binding metadata when state controls list inputs or keys", () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

      export function App() {
        const [count, setCount] = useState(1);
        return Array.from({ length: count }).map((item) => <p key={count}>{count}</p>);
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("const [count, setCount] = useState(1);");
    expect(output.code).not.toContain("_countTextBinding");
    expect(output.code).not.toContain("_REACTIVE_TEXT_BINDING_META");
  });

  test("does not emit direct text binding metadata when state crosses a component prop boundary", () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

      function Child(props) {
        return <span>{props.value}</span>;
      }

      export function App() {
        const [count, setCount] = useState(1);
        return <><p>{count}</p><Child value={count} /></>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("const [count, setCount] = useState(1);");
    expect(output.code).not.toContain("_countTextBinding");
    expect(output.code).not.toContain("_REACTIVE_TEXT_BINDING_META");
  });

  test("allocates compiler reactive DOM block helper names without colliding with user locals", () => {
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

      export function App() {
        const _countStateTuple = "user tuple";
        const _countStateBinding = "user binding";
        const _REACTIVE_STATE_BINDING_META = "user meta";
        const _createReactiveDomBlock = "user block";
        const _bindText = "user bind";
        const _createTemplate = "user template";
        const [count, setCount] = useState(0);
        return <p>{count}</p>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain('const _countStateTuple = "user tuple";');
    expect(output.code).toContain('const _countStateBinding = "user binding";');
    expect(output.code).toContain('const _REACTIVE_STATE_BINDING_META = "user meta";');
    expect(output.code).toContain('const _createReactiveDomBlock = "user block";');
    expect(output.code).toContain('const _bindText = "user bind";');
    expect(output.code).toContain('const _createTemplate = "user template";');
    expect(output.code).toContain("createReactiveDomBlock as _createReactiveDomBlock$1");
    expect(output.code).toContain("bindText as _bindText$1");
    expect(output.code).toContain("createTemplate as _createTemplate$1");
    expect(output.code).toContain("const _countStateTuple$1 = useState(0);");
    expect(output.code).toContain("const [count, setCount] = _countStateTuple$1;");
    expect(output.code).toContain(
      "const _countStateBinding$1 = _countStateTuple$1[_REACTIVE_STATE_BINDING_META$1];",
    );
    expect(output.code).toContain("return _createReactiveDomBlock$1(() => {");
  });

  test("runs compiler-proven direct text bindings without a compat component rerender", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const output = transform({
      code: `import { useState } from "@reckona/mreact-compat";

      export function App(props) {
        let renders = props.renders();
        props.setRenders(renders + 1);
        const [count, setCount] = useState(0);
        props.capture(() => setCount(1));
        return <p>{count}</p>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    let update = () => {};
    let renders = 0;

    try {
      const module = compileCompatModule(output.code);
      const App = module.App as (props: Record<string, unknown>) => unknown;
      const container = document.createElement("div");
      createRoot(container).render(createElement(App, {
        capture(nextUpdate: () => void) {
          update = nextUpdate;
        },
        renders() {
          return renders;
        },
        setRenders(next: number) {
          renders = next;
        },
      }));

      expect(container.innerHTML).toBe("<p>0</p>");
      expect(renders).toBe(1);

      update();

      expect(container.innerHTML).toBe("<p>1</p>");
      expect(renders).toBe(1);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
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
      code: `import { Suspense } from "@reckona/mreact-compat";

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

  test("lowers early return JSX inside function component bodies", async () => {
    const output = transform({
      code: `export function App(props) {
        if (props.loading) {
          return <em>loading</em>;
        }
        return <strong>done</strong>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("MR_UNSUPPORTED_BODY_STATEMENT_JSX");
    expect(output.code).not.toContain("return <em>");

    const loading = await runCompatComponent(output.code, "App", { loading: true });
    expect(loading.innerHTML).toBe("<em>loading</em>");

    const done = await runCompatComponent(output.code, "App", { loading: false });
    expect(done.innerHTML).toBe("<strong>done</strong>");
  });

  test("lowers switch case return JSX inside function component bodies", async () => {
    const output = transform({
      code: `function A() { return <span>A</span>; }
      function B() { return <span>B</span>; }

      export function App(props) {
        switch (props.kind) {
          case "a":
            return <A />;
          case "b":
            return <B />;
          default:
            return <em>?</em>;
        }
        return <></>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("return <A");
    await expect(runCompatComponent(output.code, "App", { kind: "a" })).resolves
      .toHaveProperty("innerHTML", "<span>A</span>");
    await expect(runCompatComponent(output.code, "App", { kind: "b" })).resolves
      .toHaveProperty("innerHTML", "<span>B</span>");
    await expect(runCompatComponent(output.code, "App", { kind: "x" })).resolves
      .toHaveProperty("innerHTML", "<em>?</em>");
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

  test("emits server html for compat ReactNode component returns", () => {
    const output = transform({
      code: `
        export function Empty() {
          return null;
        }
        export function Text() {
          return "Ada";
        }
        export function Count() {
          return 2;
        }
        export function Items() {
          return [<li key="a">A</li>, <li key="b">B</li>];
        }
        export function App() {
          return <section><Empty /> <Text /> <Count /><ul><Items /></ul></section>;
        }
      `,
      filename: "App.tsx",
      target: "server",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(runCompatServerComponent(output.code)).toBe(
      "<section> Ada 2<ul><li>A</li><li>B</li></ul></section>",
    );
  });

  test("emits server html for compat createElement component returns", () => {
    const output = transform({
      code: `
        import { createElement, cloneElement } from "@reckona/mreact-compat";
        export function Cloned() {
          const child = createElement("strong", null, "Ada");
          return cloneElement(child, { id: "cloned" });
        }
        export function App() {
          return <section><Cloned /></section>;
        }
      `,
      filename: "App.tsx",
      target: "server",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toEqual([
      {
        source: "@reckona/mreact-compat",
        specifiers: ["renderToString"],
      },
    ]);
    expect(runCompatServerComponent(output.code)).toBe(
      '<section><strong id="cloned">Ada</strong></section>',
    );
  });

  test("emits server html for compat class component references", () => {
    const output = transform({
      code: `
        import { Component, createElement } from "@reckona/mreact-compat";
        class ChartSurface extends Component {
          render() {
            return createElement("svg", { "data-chart": "surface" }, createElement("text", null, this.props.label));
          }
        }
        export function App() {
          return <section><ChartSurface label="Revenue" /></section>;
        }
      `,
      filename: "App.tsx",
      target: "server",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(runCompatServerComponent(output.code)).toBe(
      '<section><svg data-chart="surface"><text>Revenue</text></svg></section>',
    );
  });

  test("hydrates compat class component references without calling them as functions", async () => {
    const code = `
      import { Component, createElement } from "@reckona/mreact-compat";
      class ChartSurface extends Component {
        render() {
          return createElement("svg", { "data-chart": "surface" }, createElement("text", null, this.props.label));
        }
      }
      export function App() {
        return <section><ChartSurface label="Revenue" /></section>;
      }
    `;
    const serverOutput = transform({
      code,
      filename: "Dashboard.compat.tsx",
      target: "server",
      dev: false,
      mode: "compat",
    });
    const clientOutput = transform({
      code,
      filename: "Dashboard.compat.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(serverOutput.diagnostics).toEqual([]);
    expect(clientOutput.diagnostics).toEqual([]);
    expect(clientOutput.code).toContain("_jsx(ChartSurface");
    expect(clientOutput.code).not.toContain("ChartSurface({");

    const container = await runCompatHydration(serverOutput.code, clientOutput.code);

    expect(container.innerHTML).toBe(
      '<section><svg data-chart="surface"><text>Revenue</text></svg></section>',
    );
  });

  test("emits external compat library component references through React node rendering", () => {
    const output = transform({
      code: `
        import { ChartSurface } from "recharts";
        export function App() {
          return <section><ChartSurface label="Revenue" /></section>;
        }
      `,
      filename: "App.tsx",
      target: "server",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.imports).toContainEqual({
      source: "@reckona/mreact-compat",
      specifiers: ["renderToString"],
    });
    expect(output.code).toContain("_renderReactNodeToString(ChartSurface");
    expect(output.code).not.toContain("ChartSurface({");
  });

  test("emits server html for compat JSX inside call expression arguments", () => {
    const output = transform({
      code: `
        import { createElement } from "@reckona/mreact-compat";
        export function App() {
          return createElement("section", null, <strong>Ada</strong>);
        }
      `,
      filename: "App.tsx",
      target: "server",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("<strong>");
    expect(runCompatServerComponent(output.code)).toBe(
      "<section><strong>Ada</strong></section>",
    );
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
      code: `import { useEffect, useState } from "@reckona/mreact-compat";

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
      code: `import { createContext, useContext } from "@reckona/mreact-compat";

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
      code: `import { createContext } from "@reckona/mreact-compat";

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

  test("emits server stream html for compat createElement component returns", async () => {
    const output = transform({
      code: `
        import { createElement } from "@reckona/mreact-compat";
        export function Badge() {
          return createElement("strong", { id: "badge" }, "Ada");
        }
        export function App() {
          return <section><Badge /></section>;
        }
      `,
      filename: "App.tsx",
      target: "server",
      dev: false,
      mode: "compat",
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<section><strong id="badge">Ada</strong></section>',
    );
  });

  test("keeps Context.Consumer render prop arrows in compat client output", async () => {
    const output = transform({
      code: `import { createContext } from "@reckona/mreact-compat";

      const Theme = createContext({ message: "light" });

      export function App() {
        return <Theme.Provider value={{ message: "dark" }}><Theme.Consumer>{value => <p>{value.message}</p>}</Theme.Consumer></Theme.Provider>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain(
      'children: (value) => _jsx("p", { children: (value.message) })',
    );
    const container = await runCompatComponent(output.code);
    expect(container.textContent).toBe("dark");
  });
});
