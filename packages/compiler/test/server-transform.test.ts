import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runAsyncServerComponent, runServerComponent } from "./helpers.js";

describe("compiler server JSX transform", () => {
  test("emitted static server component returns an HTML string", () => {
    const output = transform({
      code: 'export function App() { return <div id="app">Hello SSR</div>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);

    expect(runServerComponent(output.code)).toBe('<div id="app">Hello SSR</div>');
  });

  test("emitted dynamic server component preserves body statements and escapes HTML", () => {
    const output = transform({
      code: 'export function App() { const name = "&\\"<Ada>"; return <p>Hello {name}</p>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    expect(runServerComponent(output.code)).toBe(
      "<p>Hello &amp;&quot;&lt;Ada&gt;</p>",
    );
  });

  test("emits server HTML for JSX stored in body variables", () => {
    const output = transform({
      code: `export function App() {
        const title = "<Ada>";
        const head = <h1>{title}</h1>;
        return <main>{head}</main>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("const head = <h1>");
    expect(runServerComponent(output.code)).toBe(
      "<main><h1>&lt;Ada&gt;</h1></main>",
    );
  });

  test("emits server HTML for JSX stored in body variables with Oxc parser", () => {
    const code = `export function App() {
      const title = "<Ada>";
      const head = <h1>{title}</h1>;
      return <main>{head}</main>;
    }`;
    const output = transform({
      code,
      filename: "App.tsx",
      target: "server",
      dev: true,
      parser: "oxc",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("const head = <h1>");
    expect(runServerComponent(output.code)).toBe(
      "<main><h1>&lt;Ada&gt;</h1></main>",
    );
  });

  test("lowers Suspense component references to React completed SSR markers", () => {
    const output = transform({
      code: `import { Suspense } from "@modular-react/react-compat";

      export function App() {
        return <Suspense fallback={<em>loading</em>}><strong>ready</strong></Suspense>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("Suspense({");
    expect(runServerComponent(output.code)).toBe(
      "<!--$--><strong>ready</strong><!--/$-->",
    );
  });

  test("emits server HTML for JSX pushed inside for-of statements", () => {
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
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("rows.push(<li>");
    expect(runServerComponent(output.code)).toBe(
      "<ul><li>A</li><li>B</li></ul>",
    );
  });

  test("emits server HTML for JSX pushed inside nested loops", () => {
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
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("rows.push(<li>");
    expect(runServerComponent(output.code)).toBe(
      "<ul><li>A</li><li>B</li></ul>",
    );
  });

  test("emitted static server component escapes static text and attributes", () => {
    const output = transform({
      code: 'export function App() { return <p title="A&B">A&B "quote"</p>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    expect(runServerComponent(output.code)).toBe(
      '<p title="A&amp;B">A&amp;B &quot;quote&quot;</p>',
    );
  });

  test("emitted server component handles fragments and nullish dynamic text", () => {
    const output = transform({
      code: "export function App() { const value = null; return <>Before{value}<span>After</span></>; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    expect(runServerComponent(output.code)).toBe("Before<span>After</span>");
  });

  test("emitted server component preserves top-level const", () => {
    const output = transform({
      code: `const greeting = "Hello";

      export function App() {
        return <p>{greeting}</p>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe("<p>Hello</p>");
  });

  test("emitted server component renders block-body list JSX renderers", () => {
    const output = transform({
      code: `export function App() {
        const items = ["A", "B"];
        return <ul>{items.map((item, index) => {
          const label: string = index + ":" + item;
          return <li>{label}</li>;
        })}</ul>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain(": string");
    expect(runServerComponent(output.code)).toBe(
      "<ul><li>0:A</li><li>1:B</li></ul>",
    );
  });

  test("emitted server component renders conditional returns in list renderers", () => {
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
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      '<ul><li>A</li><li class="off">B</li></ul>',
    );
  });

  test("aliases server escape helper away from top-level bindings", () => {
    const output = transform({
      code: `const _escapeHtml = "user";

      export function App() {
        return <p>{_escapeHtml}</p>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("function _escapeHtml$1");
    expect(runServerComponent(output.code)).toBe("<p>user</p>");
  });

  test("emitted server component renders same-module component references", () => {
    const output = transform({
      code: `export function Child(props) {
        return <span>Hello {props.name}</span>;
      }

      export function App() {
        return <section><Child name="Ada" /></section>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      "<section><span>Hello Ada</span></section>",
    );
  });

  test("emitted server component preserves async same-module component references", async () => {
    const output = transform({
      code: `export async function Child(props) {
        await Promise.resolve();
        return <span>Hello {props.name}</span>;
      }

      export function App() {
        return <section><Child name="Ada" /></section>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("export async function Child(");
    expect(output.code).toContain("await Promise.resolve();");
    expect(output.code).toContain("await Child(");
    await expect(runAsyncServerComponent(output.code)).resolves.toBe(
      "<section><span>Hello Ada</span></section>",
    );
  });

  test("emitted server component lowers same-module arrow function component references", () => {
    const output = transform({
      code: `export const Child = (props) => <span>Hello {props.name}</span>;

      export function App() {
        return <section><Child name="Ada" /></section>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("export function Child(");
    expect(output.code).not.toContain("const Child =");
    expect(runServerComponent(output.code)).toBe(
      "<section><span>Hello Ada</span></section>",
    );
  });

  test("emitted server component can wrap output in hydration markers", () => {
    const output = transform({
      code: "export function App() { return <main>Hello</main>; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverHydration: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.serverHydration).toBe(true);
    expect(runServerComponent(output.code)).toBe(
      "<!--mreact-h:start:App--><main>Hello</main><!--mreact-h:end:App-->",
    );
  });

  test("server transform reports client module imports as Flight client references", () => {
    const output = transform({
      code: `import { Button } from "./Button.client.tsx";

      export function App() {
        return <Button label="Save" />;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.clientReferences).toEqual(["Button"]);
    expect(output.metadata.clientReferenceManifest).toEqual([
      {
        name: "Button",
        moduleId: "./Button.client.tsx",
        exportName: "Button",
      },
    ]);
  });

  test("emitted server component lowers memo and forwardRef arrow component declarations", () => {
    const output = transform({
      code: `import { memo, forwardRef } from "@modular-react/react-compat";

      export const MemoCard = memo((props) => <article>{props.name}</article>);
      export const ForwardCard = forwardRef((props, ref) => <span>{props.name}</span>);

      export function App() {
        return <section><MemoCard name="Ada" /><ForwardCard name="Grace" /></section>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("export function MemoCard(");
    expect(output.code).toContain("export function ForwardCard(");
    expect(runServerComponent(output.code)).toBe(
      "<section><article>Ada</article><span>Grace</span></section>",
    );
  });
});
