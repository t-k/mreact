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

  test("emits server HTML for anonymous default arrow component exports", () => {
    const output = transform({
      code: 'export default () => <main id="app">Hello SSR</main>;',
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.components).toEqual([{ name: "DefaultExport", exportName: "default" }]);
    expect(output.code).toContain("export default function DefaultExport()");
    expect(runServerComponent(output.code, "default")).toBe('<main id="app">Hello SSR</main>');
  });

  test("emitted dynamic server component preserves body statements and escapes HTML", () => {
    const output = transform({
      code: 'export function App() { const name = "&\\"<Ada>"; return <p>Hello {name}</p>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    expect(runServerComponent(output.code)).toBe("<p>Hello &amp;&quot;&lt;Ada&gt;</p>");
  });

  test("passes JSX children through server components without stringifying or escaping the rendered HTML", () => {
    const output = transform({
      code: `export function Frame(props) {
  return <main><h1>{props.title}</h1>{props.children}</main>;
}

export function App() {
  return <Frame title="Home"><p>Body</p></Frame>;
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe("<main><h1>Home</h1><p>Body</p></main>");
  });

  test("renders optional-chained method calls in JSX child expressions", () => {
    const output = transform({
      code: `export function App() {
  const state = { errors: { name: ["bad"] } };
  return <main>{state.errors.name?.map((error) => <span>{error}</span>)}</main>;
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe("<main><span>bad</span></main>");
  });

  test("does not emit _escapeHtmlBatch import when no batch site exists in the module", () => {
    const output = transform({
      code: `export function App({ bg, label }) {
        return <div style={{ backgroundColor: bg, color: "red" }} aria-label={label}>x</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverEscape: {
        batchImportName: "escapeHtmlBatch",
        batchImportSource: "@reckona/mreact-router/native-escape",
      },
    });

    expect(output.diagnostics).toEqual([]);
    // Static-key style + single dynamic attribute don't need batch escape
    expect(output.code).not.toContain("escapeHtmlBatch");
    expect(output.code).not.toContain("native-escape");
  });

  test("emits imported batch escape helper for adjacent dynamic server values", () => {
    const output = transform({
      code: `export function App() {
        const first = "<Ada>";
        const second = "& Grace";
        return <p>{first}{second}</p>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverEscape: {
        batchImportName: "escapeHtmlBatch",
        batchImportSource: "@reckona/mreact-router/native-escape",
      },
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain(`from "@reckona/mreact-router/native-escape"`);
    expect(output.code).toContain("escapeHtmlBatch");
    expect(output.code).toContain("[first, second]");
  });

  test("does not batch adjacent dynamic attributes through escapeHtmlBatch", () => {
    const output = transform({
      code: `export function App() {
        const id = "<row>";
        const label = "& label";
        return <div id={id} data-label={label} title={id}>ok</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverEscape: {
        batchImportName: "escapeHtmlBatch",
        batchImportSource: "@reckona/mreact-router/native-escape",
      },
    });

    expect(output.diagnostics).toEqual([]);
    // No batch site for this fixture (no adjacent dynamic children) — under
    // issue 048's dead-import elimination, the helper import is dropped.
    expect(output.code).not.toContain("escapeHtmlBatch");
    expect(output.code).toContain('_escapeHtml(id === true ? "" : id)');
    expect(output.code).toContain('_escapeHtml(label === true ? "" : label)');
  });

  test("static-key style object expands without _styleParts array allocation", () => {
    const output = transform({
      code: `export function App({ bg, fg }) {
        return <div style={{ backgroundColor: bg, color: fg }}>x</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    // No intermediate array allocation per entry
    expect(output.code).not.toMatch(/_styleParts\s*=\s*\[\]/);
    expect(output.code).not.toMatch(/_styleParts\.push\(/);
    expect(output.code).not.toMatch(/\.join\(";"\)/);
    // Output semantics preserved
    expect(runServerComponent(output.code, "App", { bg: "red", fg: "white" })).toBe(
      '<div style="background-color:red;color:white">x</div>',
    );
    expect(runServerComponent(output.code, "App", { bg: null, fg: "white" })).toBe(
      '<div style="color:white">x</div>',
    );
    expect(runServerComponent(output.code, "App", { bg: false, fg: false })).toBe("<div>x</div>");
    expect(runServerComponent(output.code, "App", { bg: "red", fg: null })).toBe(
      '<div style="background-color:red">x</div>',
    );
  });

  test("static-key style with literal-only values collapses to constant string", () => {
    const output = transform({
      code: `export function App() {
        return <div style={{ display: "flex", padding: 10, color: "red" }}>x</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    // All literal values → static concat, no _style accumulator needed
    expect(output.code).not.toMatch(/_styleParts/);
    expect(output.code).not.toMatch(/let\s+_style\s*=\s*""/);
    expect(runServerComponent(output.code)).toBe(
      '<div style="display:flex;padding:10;color:red">x</div>',
    );
  });

  test("expands static-key style object literals at build time", () => {
    const output = transform({
      code: `export function App() {
        const color = 'red&"';
        const gap = "1rem";
        return <div style={{ backgroundColor: color, "--gap": gap, opacity: 0.5 }}>Styled</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverEscape: {
        batchImportName: "escapeHtmlBatch",
        batchImportSource: "@reckona/mreact-router/native-escape",
      },
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("Object.entries(_value)");
    expect(output.code).toContain("background-color:");
    expect(output.code).toContain("--gap:");
  });

  test("falls back to runtime style object serialization for dynamic style keys", () => {
    const output = transform({
      code: `export function App() {
        const name = "backgroundColor";
        const value = "red";
        return <div style={{ [name]: value }}>Styled</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("Object.entries(_value)");
    expect(runServerComponent(output.code)).toBe('<div style="background-color:red">Styled</div>');
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
    expect(runServerComponent(output.code)).toBe("<main><h1>&lt;Ada&gt;</h1></main>");
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
    expect(runServerComponent(output.code)).toBe("<main><h1>&lt;Ada&gt;</h1></main>");
  });

  test("lowers Suspense component references to React completed SSR markers", () => {
    const output = transform({
      code: `import { Suspense } from "@reckona/mreact-compat";

      export function App() {
        return <Suspense fallback={<em>loading</em>}><strong>ready</strong></Suspense>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("Suspense({");
    expect(runServerComponent(output.code)).toBe("<!--$--><strong>ready</strong><!--/$-->");
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
    expect(runServerComponent(output.code)).toBe("<ul><li>A</li><li>B</li></ul>");
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
    expect(runServerComponent(output.code)).toBe("<ul><li>A</li><li>B</li></ul>");
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

  test("emitted server component renders dynamic HTML attributes", () => {
    const output = transform({
      code: `export function App() {
        const id = 'A&B"';
        const active = true;
        return <div id={\`row-\${id}\`} class={active ? "on" : "off"} data-row={id}>Item</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      '<div id="row-A&amp;B&quot;" class="on" data-row="A&amp;B&quot;">Item</div>',
    );
  });

  test("emitted server component maps input default props to HTML initial state attributes", () => {
    const output = transform({
      code: `export function App() {
        const fallback = "Ada & Grace";
        return <form><input name="user" defaultValue={fallback} /><input type="checkbox" defaultChecked={true} /></form>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      '<form><input name="user" value="Ada &amp; Grace"></input><input type="checkbox" checked=""></input></form>',
    );
  });

  test("emitted server component lets explicit input value props override defaults", () => {
    const output = transform({
      code: `export function App() {
        return <input defaultValue="fallback" value="controlled" defaultChecked={true} checked={false} />;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe('<input value="controlled"></input>');
  });

  test("emitted server component maps textarea defaultValue to text content", () => {
    const output = transform({
      code: `export function App() {
        const fallback = "Ada & Grace";
        return <textarea name="bio" defaultValue={fallback}>ignored</textarea>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe('<textarea name="bio">Ada &amp; Grace</textarea>');
  });

  test("emitted server component maps select defaultValue to selected option", () => {
    const output = transform({
      code: `export function App({ theme }) {
        return <select name="theme" defaultValue={theme}><option value="system">system</option><option value="dark">dark</option></select>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code, "App", { theme: "dark" })).toBe(
      '<select name="theme"><option value="system">system</option><option value="dark" selected="">dark</option></select>',
    );
  });

  test("emitted server component normalizes non-form JSX HTML attribute aliases", () => {
    const output = transform({
      code: `export function App() {
        return <>
          <meta httpEquiv="refresh" content="0;url=/next" charSet="utf-8" />
          <iframe srcDoc="<script>1</script>"></iframe>
          <a crossOrigin="anonymous" tabIndex={1}>link</a>
        </>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      '<meta http-equiv="refresh" content="0;url=/next" charset="utf-8"></meta><iframe></iframe><a crossorigin="anonymous" tabindex="1">link</a>',
    );
  });

  test("inlines escape call for simple identifier / member dynamic attributes", () => {
    const output = transform({
      code: `export function App({ cell }) {
        return <div data-row={cell.row} class={cell.kind}>x</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    // No IIFE wrapping the simple property access
    expect(output.code).not.toMatch(/\(\(\)\s*=>\s*\{[\s\S]*?cell\.row/);
    expect(output.code).not.toMatch(/\(\(\)\s*=>\s*\{[\s\S]*?cell\.kind/);
    // Direct escape call against the source expression
    expect(output.code).toContain("_escapeHtml(cell.row");
    expect(output.code).toContain("_escapeHtml(cell.kind");
    // Semantics unchanged
    expect(runServerComponent(output.code, "App", { cell: { row: "A&B", kind: "hot" } })).toBe(
      '<div data-row="A&amp;B" class="hot">x</div>',
    );
  });

  test("keeps IIFE for call-expression dynamic attribute (avoid double-eval)", () => {
    const output = transform({
      code: `export function App({ fetchValue }) {
        return <div data-x={fetchValue()}>x</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toMatch(/\(\(\)\s*=>\s*\{[^}]*fetchValue\(\)/);
  });

  test("preserves null/false attribute semantics for inlined simple expressions", () => {
    const output = transform({
      code: `export function App({ a, b }) {
        return <div data-a={a} data-b={b}>x</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    // Inline path must still suppress null/false
    expect(output.code).not.toMatch(/\(\(\)\s*=>\s*\{[\s\S]*?\(a\)/);
    expect(runServerComponent(output.code, "App", { a: null, b: false })).toBe("<div>x</div>");
    expect(runServerComponent(output.code, "App", { a: "1", b: true })).toBe(
      '<div data-a="1" data-b="">x</div>',
    );
  });

  test("emitted server component serializes dynamic style objects", () => {
    const output = transform({
      code: `export function App() {
        const color = 'red&"';
        return <div style={{ backgroundColor: color, "--gap": "1rem", opacity: 0.5 }}>Styled</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      '<div style="background-color:red&amp;&quot;;--gap:1rem;opacity:0.5">Styled</div>',
    );
  });

  test("emitted server component ignores JSX key attributes", () => {
    const output = transform({
      code: `export function App() {
        const items = [1, 2];
        return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe("<ul><li>1</li><li>2</li></ul>");
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

  test("emitted server component lowers top-level JSX initializers as raw HTML values", () => {
    const output = transform({
      code: `const name = "<Ada>";
      const headline = <h1>{name}</h1>;

      export function App() {
        return <section>{headline}</section>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("const headline = <h1>");
    expect(runServerComponent(output.code)).toBe("<section><h1>&lt;Ada&gt;</h1></section>");
  });

  test("emits for-loop instead of map().join() for synchronous list rendering", () => {
    const output = transform({
      code: `export function App({ items }) {
        return <ul>{items.map((item) => <li class={item.kind}>{item.text}</li>)}</ul>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    // Imperative loop, not Array#map + join chain
    expect(output.code).not.toMatch(/\.map\([\s\S]+?\)\.join\(""\)/);
    expect(output.code).toMatch(/for\s*\(/);
    // Semantics preserved
    expect(
      runServerComponent(output.code, "App", {
        items: [
          { kind: "hot", text: "A&" },
          { kind: "off", text: "B" },
        ],
      }),
    ).toBe('<ul><li class="hot">A&amp;</li><li class="off">B</li></ul>');
  });

  test("preserves index parameter and body statements in for-loop list rendering", () => {
    const output = transform({
      code: `export function App({ items }) {
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
    expect(output.code).toMatch(/for\s*\(/);
    expect(runServerComponent(output.code, "App", { items: ["A", "B"] })).toBe(
      "<ul><li>0:A</li><li>1:B</li></ul>",
    );
  });

  test("emits statement-list IR for component bodies (let _out accumulator)", () => {
    const output = transform({
      code: `export function App({ name }) {
        return <main><p>Hello {name}</p></main>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    // No expression-mode single-return concat
    expect(output.code).not.toMatch(/return\s+"<main>"\s*\+\s*"<p>"/);
    // Statement-list form
    expect(output.code).toMatch(/let\s+_out\b/);
    expect(output.code).toMatch(/_out\s*\+=\s*"<main"/);
    expect(output.code).toMatch(/return\s+_out\s*;/);
    // Semantics preserved
    expect(runServerComponent(output.code, "App", { name: "Ada" })).toBe(
      "<main><p>Hello Ada</p></main>",
    );
  });

  test("lowers conditional rendering to if/else statements", () => {
    const output = transform({
      code: `export function App({ active }) {
        return <div>{active ? <span>on</span> : <span>off</span>}</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    // Statement-mode conditional should use if/else, not ternary in expression
    expect(output.code).toMatch(/if\s*\(active\)/);
    expect(runServerComponent(output.code, "App", { active: true })).toBe(
      "<div><span>on</span></div>",
    );
    expect(runServerComponent(output.code, "App", { active: false })).toBe(
      "<div><span>off</span></div>",
    );
  });

  test("keeps Promise.all().join() form for lists containing async server operations", async () => {
    const output = transform({
      code: `export async function Child({ name }) {
        await Promise.resolve();
        return <span>{name}</span>;
      }
      export function App({ items }) {
        return <ul>{items.map((item) => <Child name={item} />)}</ul>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    // Async list keeps Promise.all() + .join("") pattern for parallelism
    expect(output.code).toMatch(/Promise\.all\(/);
    expect(output.code).toMatch(/\.join\(""\)/);
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
    expect(runServerComponent(output.code)).toBe("<ul><li>0:A</li><li>1:B</li></ul>");
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
    expect(runServerComponent(output.code)).toBe('<ul><li>A</li><li class="off">B</li></ul>');
  });

  test("emitted server component renders conditional root returns", () => {
    const output = transform({
      code: `function SuccessView() {
  return <section>Sent</section>;
}

function ResetForm() {
  return <form>Reset</form>;
}

export function App() {
  const sent = true;
  return sent ? <SuccessView /> : <ResetForm />;
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe("<section>Sent</section>");
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
    expect(runServerComponent(output.code)).toBe("<section><span>Hello Ada</span></section>");
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
    expect(runServerComponent(output.code)).toBe("<section><span>Hello Ada</span></section>");
  });

  test("emitted server component renders router Link imports as React compat nodes", () => {
    const cases = [
      {
        code: `import { Link } from "@reckona/mreact-router/link";

      export function App() {
        return <nav><Link href="/newest" prefetch="viewport">New</Link></nav>;
      }`,
        call: "_renderReactNodeToString(Link,",
      },
      {
        code: `import { Link } from "@reckona/mreact-router";

      export function App() {
        return <nav><Link href="/newest">New</Link></nav>;
      }`,
        call: "_renderReactNodeToString(Link,",
      },
      {
        code: `import * as Router from "@reckona/mreact-router";

      export function App() {
        return <nav><Router.Link href="/newest">New</Router.Link></nav>;
      }`,
        call: "_renderReactNodeToString(Router.Link,",
      },
    ];

    for (const item of cases) {
      const output = transform({
        code: item.code,
        filename: "App.tsx",
        target: "server",
        dev: true,
      });

      expect(output.diagnostics).toEqual([]);
      expect(output.metadata.clientReferences).toBeUndefined();
      expect(output.code).toContain("renderToString as _renderReactNodeToString");
      expect(output.code).toContain(item.call);
    }
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

  test("server transform reports inferred client boundary imports as client references", () => {
    const output = transform({
      code: `import { Counter } from "./Counter";

      export function App() {
        return <Counter initial={1} />;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      clientBoundaryImports: ["./Counter"],
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.clientReferences).toEqual(["Counter"]);
    expect(output.metadata.clientReferenceManifest).toEqual([
      {
        name: "Counter",
        moduleId: "./Counter",
        exportName: "Counter",
      },
    ]);
  });

  test("server transform reports inferred client boundary aliases as client references", () => {
    const output = transform({
      code: `import { Counter } from "./Counter";

      const Alias = Counter;

      export function App() {
        return <Alias initial={1} />;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      clientBoundaryImports: ["./Counter"],
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.clientReferences).toEqual(["Alias"]);
    expect(output.metadata.clientReferenceManifest).toEqual([
      {
        name: "Alias",
        moduleId: "./Counter",
        exportName: "Counter",
      },
    ]);
  });

  test("server transform reports single-candidate computed client boundary aliases", () => {
    const output = transform({
      code: `import { Counter } from "./Counter";

      const registry = { Counter };
      const selected = Math.random() > 0.5 ? "Counter" : "Counter";
      const Selected = registry[selected];

      export function App() {
        return <Selected initial={1} />;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      clientBoundaryImports: ["./Counter"],
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.clientReferences).toEqual(["Selected"]);
    expect(output.metadata.clientReferenceManifest).toEqual([
      {
        name: "Selected",
        moduleId: "./Counter",
        exportName: "Counter",
      },
    ]);
  });

  test("server transform reports namespace client component references with member export names", () => {
    const output = transform({
      code: `import * as Client from "./Client.client.tsx";

      export function App() {
        return <Client.Button label="Save" />;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.clientReferences).toEqual(["Client.Button"]);
    expect(output.metadata.clientReferenceManifest).toEqual([
      {
        name: "Client.Button",
        moduleId: "./Client.client.tsx",
        exportName: "Button",
      },
    ]);
  });

  test("emitted server component lowers memo and forwardRef arrow component declarations", () => {
    const output = transform({
      code: `import { memo, forwardRef } from "@reckona/mreact-compat";

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

  test("emitted server component lowers nested memo and forwardRef component declarations", () => {
    const output = transform({
      code: `import { memo, forwardRef } from "@reckona/mreact-compat";

      export const Card = memo(forwardRef((props, ref) => <article>{props.name}</article>));

      export function App() {
        return <Card name="Ada" />;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("export function Card(");
    expect(runServerComponent(output.code)).toBe("<article>Ada</article>");
  });
});
