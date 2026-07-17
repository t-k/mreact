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
      dev: false,
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

  test("lowers early JSX returns in server helper components", () => {
    const output = transform({
      code: `function Icon(props) {
  if (props.kind === "mail") {
    return <svg><path d="M4 6h16v12H4z" /></svg>;
  }

  return <svg><path d="M8 7h8" /></svg>;
}

export function App() {
  return <main><Icon kind="mail" /></main>;
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      '<main><svg><path d="M4 6h16v12H4z"></path></svg></main>',
    );
  });

  test("preserves aliases declared before early JSX branch returns", () => {
    const output = transform({
      code: `export function App(props) {
  if (props.data.kind === "post" && props.data.post) {
    const p = props.data.post;
    return <article><h1>{p.title}</h1><time>{p.date}</time></article>;
  }

  return <p>Not found</p>;
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("const p = props.data.post;");
    expect(
      runServerComponent(output.code, "App", {
        data: {
          kind: "post",
          post: { date: "2026-05-23", title: "Hello" },
        },
      }),
    ).toBe("<article><h1>Hello</h1><time>2026-05-23</time></article>");
  });

  test("emits JSX spread attributes in server output", () => {
    const output = transform({
      code: `export function App() {
  const svgProps = {
    className: "h-5 w-5",
    fill: "none",
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    "data-label": "<icon>",
    title: null,
    onClick: () => "ignored",
    onclick: "ignored",
    ref: "ignored",
    href: "javascript:alert(1)",
  };
  return <svg {...svgProps}><path d="M4 6h16v12H4z" /></svg>;
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      '<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" aria-hidden="true" data-label="&lt;icon&gt;"><path d="M4 6h16v12H4z"></path></svg>',
    );
  });

  test("does not emit static lowercase event attributes in server output", () => {
    const output = transform({
      code: 'export function App() { return <button onclick="alert(1)">Open</button>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
      }),
    );
    expect(runServerComponent(output.code)).toBe("<button>Open</button>");
  });

  test("does not emit dynamic lowercase event attributes in server output", () => {
    const output = transform({
      code: 'export function App() { const handler = "alert(1)"; return <img src="x" onerror={handler} />; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
      }),
    );
    expect(runServerComponent(output.code)).toBe('<img src="x">');
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
    expect(output.code).not.toContain("_renderSpreadAttributes");
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
    expect(output.code).toContain("_escapeHtml(label)");
  });

  test("static-key style object expands without _styleParts array allocation", () => {
    const output = transform({
      code: `export function App({ bg, fg }) {
        return <div style={{ backgroundColor: bg, color: fg }}>x</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: false,
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
      '<form><input name="user" value="Ada &amp; Grace"><input type="checkbox" checked=""></form>',
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
    expect(runServerComponent(output.code)).toBe('<input value="controlled">');
  });

  test("emitted server component serializes br without closing tags", () => {
    const output = transform({
      code: `export function App() {
        return <p><strong>Company</strong><br />Address<br />Email</p>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      "<p><strong>Company</strong><br>Address<br>Email</p>",
    );
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
      '<meta http-equiv="refresh" content="0;url=/next" charset="utf-8"><iframe></iframe><a crossorigin="anonymous" tabindex="1">link</a>',
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
    // Inline path must still suppress null, while data-* boolean values
    // serialize as booleanish strings.
    expect(output.code).not.toMatch(/\(\(\)\s*=>\s*\{[\s\S]*?\(a\)/);
    expect(runServerComponent(output.code, "App", { a: null, b: false })).toBe(
      '<div data-b="false">x</div>',
    );
    expect(runServerComponent(output.code, "App", { a: "1", b: true })).toBe(
      '<div data-a="1" data-b="true">x</div>',
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

  test("emitted server component omits null returned by child components", () => {
    const output = transform({
      code: `function ActivityUnreadBadge() {
  return null;
}

export function App() {
  return <nav><a href="/activity">Activity</a><ActivityUnreadBadge /></nav>;
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe('<nav><a href="/activity">Activity</a></nav>');
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

  test("emitted server component lowers top-level JSX helper function switch returns", () => {
    const output = transform({
      code: `function LegalBlockView(props) {
  switch (props.block.kind) {
    case "paragraph":
      return <p>{props.block.text}</p>;
    case "orderedList":
      return <ol>{props.block.items.map((item) => <li key={item}>{item}</li>)}</ol>;
    default:
      return null;
  }
}

export function App() {
  return <article>{LegalBlockView({ block: { kind: "orderedList", items: ["A", "B"] } })}</article>;
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      "<article><ol><li>A</li><li>B</li></ol></article>",
    );
  });

  test("emitted server component lowers lowercase JSX helper function calls as HTML", () => {
    const output = transform({
      code: `function renderItems(items) {
  if (items.length === 0) {
    return <p>Empty</p>;
  }

  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

export function App() {
  return <section>{renderItems(["A", "B"])}</section>;
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      "<section><ul><li>A</li><li>B</li></ul></section>",
    );
  });

  test("emits trusted server inner HTML from dangerouslySetInnerHTML", () => {
    const output = transform({
      code: `const SERVICE_WORKER_BOOTSTRAP = "(function(){navigator.serviceWorker.register('/sw.js')})();";

export function App() {
  return <script dangerouslySetInnerHTML={{ __html: SERVICE_WORKER_BOOTSTRAP }} />;
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      "<script>(function(){navigator.serviceWorker.register('/sw.js')})();</script>",
    );
  });

  test("omits dangerouslySetInnerHTML body for void elements", () => {
    const output = transform({
      code: `export function App() {
  return <img alt="avatar" dangerouslySetInnerHTML={{ __html: "<span>bad</span>" }} />;
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe('<img alt="avatar">');
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

  test("emitted server component renders body-local runtime component aliases", () => {
    const output = transform({
      code: `export function App(props) {
        const Body = props.data.post.Content;
        return <article><Body title={props.data.post.title} /></article>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(
      runServerComponent(output.code, "App", {
        data: {
          post: {
            title: "Hello",
            Content: (props: { title: string }) => `<h1>${props.title}</h1>`,
          },
        },
      }),
    ).toBe("<article><h1>Hello</h1></article>");
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

  test("emitted server component renders router Link imports as native server components", () => {
    const cases = [
      {
        code: `import { Link } from "@reckona/mreact-router/link";

      export function App() {
        return <nav><Link href="/newest" prefetch="viewport">New</Link></nav>;
      }`,
        call: 'Link({ href: ("/newest"), prefetch: ("viewport"), children: Link.trustedHtml("New") })',
      },
      {
        code: `import { Link } from "@reckona/mreact-router";

      export function App() {
        return <nav><Link href="/newest">New</Link></nav>;
      }`,
        call: 'Link({ href: ("/newest"), children: Link.trustedHtml("New") })',
      },
      {
        code: `import * as Router from "@reckona/mreact-router";

      export function App() {
        return <nav><Router.Link href="/newest">New</Router.Link></nav>;
      }`,
        call: 'Router.Link({ href: ("/newest"), children: Router.Link.trustedHtml("New") })',
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
      expect(output.code).not.toContain("renderToString as _renderReactNodeToString");
      expect(output.code).toContain(item.call);
    }
  });

  test("emitted server component passes router Link children as native HTML strings", () => {
    const output = transform({
      code: `import { Link } from "@reckona/mreact-router/link";

      export function App() {
        const label = "Status & Limitations";
        return <nav><Link href="/next"><span class="dir">Next</span><span>{label}</span></Link></nav>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain('Link({ href: ("/next"), children:');
    expect(output.code).toContain('"<span" + " class=\\"dir\\""');
    expect(output.code).toContain("_escapeHtml(label)");
    expect(output.code).not.toContain("_renderReactNodeToString(Link,");
  });

  test("emitted server component renders dynamic MDX registry components as React compat nodes", () => {
    const output = transform({
      code: `import Post from "./posts/hello.mdx";

      export function App() {
        const pages = { hello: { Component: Post } };
        const Content = pages.hello.Component;
        return <article><Content /></article>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderToString as _renderReactNodeToString");
    expect(output.code).toContain("_renderReactNodeToString(Content,");
    expect(output.code).not.toContain("Content({");
  });

  test("emitted server component renders computed MDX registry components as React compat nodes", () => {
    const output = transform({
      code: `import Hello from "./posts/hello.mdx";
      import Why from "./posts/why.mdx";

      export function App(props) {
        const pages = {
          hello: { Component: Hello },
          why: { Component: Why },
        };
        const Content = pages[props.slug].Component;
        return <article><Content /></article>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderToString as _renderReactNodeToString");
    expect(output.code).toContain("_renderReactNodeToString(Content,");
    expect(output.code).not.toContain("Content({");
  });

  test("emitted server component renders loop-built MDX component maps as React compat nodes", () => {
    const output = transform({
      code: `import Hello from "./posts/hello.mdx";
      import Why from "./posts/why.mdx";

      export function App(props) {
        const modules = {
          "./posts/hello.mdx": { default: Hello },
          "./posts/why.mdx": { default: Why },
        };
        const components = {};
        for (const [path, mod] of Object.entries(modules)) {
          components[path] = mod.default;
        }
        const Content = components[props.slug];
        return <article><Content /></article>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderToString as _renderReactNodeToString");
    expect(output.code).toContain("_renderReactNodeToString(Content,");
    expect(output.code).not.toContain("Content({");
  });

  test("emitted server component renders imported MDX components as React compat nodes", () => {
    const output = transform({
      code: `import Post from "./posts/hello.mdx";

      export function App() {
        return <article><h1>Hello</h1><Post /></article>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.clientReferences).toBeUndefined();
    expect(output.code).toContain("renderToString as _renderReactNodeToString");
    expect(output.code).toContain("_renderReactNodeToString(Post,");
  });

  test("emitted server component renders logical MDX helper returns as React compat nodes", () => {
    const output = transform({
      code: `import Post from "./posts/hello.mdx";

      function PostBody(props: { slug: string }) {
        return props.slug === "hello" && <Post />;
      }

      export function App() {
        return <article><h1>Hello</h1><PostBody slug="hello" /></article>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.clientReferences).toBeUndefined();
    expect(output.code).toContain("renderToString as _renderReactNodeToString");
    expect(output.code).toContain("_renderReactNodeToString(Post,");
    expect(output.code).not.toContain("return props.slug ===");
  });

  test("emitted server component preserves list children around client boundaries inside map", () => {
    const output = transform({
      code: `import { UploadNavigationItem } from "./UploadNavigationItem.client.tsx";

      const navItems = [
        { href: "/", label: "Home" },
        { href: "/upload", label: "Upload" },
        { href: "/albums", label: "Albums" },
      ];

      export function App() {
        return (
          <ul>
            {navItems.map((item) =>
              item.href === "/upload" ? (
                <UploadNavigationItem key={item.href} />
              ) : (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ),
            )}
          </ul>
        );
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      '<ul><li><a href="/">Home</a></li><template data-mreact-client-boundary="UploadNavigationItem"></template><script type="application/json" data-mreact-client-boundary-props="UploadNavigationItem">{}</script><li><a href="/albums">Albums</a></li></ul>',
    );
  });

  test("emitted server component renders inline conditional MDX imports through compat SSR", () => {
    const output = transform({
      code: `import HelloMreactPost from "./hello.mdx";
import StreamingSsrPost from "./streaming.mdx";

export function App(props: { readonly slug: string }) {
  return (
    <article>
      {props.slug === "hello-mreact" && <HelloMreactPost />}
      {props.slug === "streaming-ssr" && <StreamingSsrPost />}
    </article>
  );
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderToString as _renderReactNodeToString");
    expect(output.code).toContain("_renderReactNodeToString(HelloMreactPost,");
    expect(output.code).toContain("_renderReactNodeToString(StreamingSsrPost,");
    expect(output.code).not.toContain("HelloMreactPost({");
    expect(output.code).not.toContain("StreamingSsrPost({");
  });

  test("emitted server component renders inline conditional MDX siblings through compat SSR", () => {
    const output = transform({
      code: `import HelloMreactPost from "./hello.mdx";
import StreamingSsrPost from "./streaming.mdx";
import CloudflareAdapterPost from "./cf.mdx";

export function App(props: { readonly slug: string; readonly title: string; readonly date: string }) {
  if (props.slug) {
    return (
      <article>
        <h1>{props.title}</h1>
        <time>{props.date}</time>
        {props.slug === "hello-mreact" && <HelloMreactPost />}
        {props.slug === "streaming-ssr" && <StreamingSsrPost />}
        {props.slug === "cloudflare-adapter" && <CloudflareAdapterPost />}
      </article>
    );
  }
  return null;
}`,
      filename: "App.tsx",
      target: "server",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderToString as _renderReactNodeToString");
    expect(output.code).toContain("_renderReactNodeToString(HelloMreactPost,");
    expect(output.code).toContain("_renderReactNodeToString(StreamingSsrPost,");
    expect(output.code).toContain("_renderReactNodeToString(CloudflareAdapterPost,");
    expect(output.code).not.toContain("HelloMreactPost({");
    expect(output.code).not.toContain("StreamingSsrPost({");
    expect(output.code).not.toContain("CloudflareAdapterPost({");
  });

  test("emitted server component renders inline conditional MDX siblings through compat SSR when the condition reads a local alias", () => {
    const output = transform({
      code: `import HelloMreactPost from "./hello.mdx";

export function App(props: { readonly data: { readonly kind: string; readonly post?: { readonly slug: string; readonly title: string; readonly date: string } } }) {
  if (props.data.kind === "post" && props.data.post) {
    const p = props.data.post;
    return (
      <article>
        <h1>{p.title}</h1>
        <time>{p.date}</time>
        {p.slug === "hello-mreact" && <HelloMreactPost />}
      </article>
    );
  }
  return null;
}`,
      filename: "App.tsx",
      target: "server",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderToString as _renderReactNodeToString");
    expect(output.code).toContain("_renderReactNodeToString(HelloMreactPost,");
    expect(output.code).not.toContain("HelloMreactPost({");
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

  test("server hydration marker ids percent-encode non-ASCII component names", () => {
    const output = transform({
      code: "export function 設定画面() { return <main>Hello</main>; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverHydration: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.serverHydration).toBe(true);
    expect(output.code).toContain("mreact-h:start:%E8%A8%AD%E5%AE%9A%E7%94%BB%E9%9D%A2");
    expect(output.code).toContain("mreact-h:end:%E8%A8%AD%E5%AE%9A%E7%94%BB%E9%9D%A2");
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

  test("emitted server component renders SSR fallback for inferred client boundary imports", () => {
    const output = transform({
      code: `import { Navigation } from "./Navigation";

      export function App() {
        return <section><Navigation label="Albums" /></section>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      clientBoundaryImports: ["./Navigation"],
      clientBoundaryFallbackImports: ["./Navigation"],
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain(
      '_renderClientBoundary("Navigation", { label: ("Albums") }, (_childrenHtml) => ((_value) => _value == null || typeof _value === "boolean" ? "" : _value)(Navigation({ label: ("Albums") })), true, "", false)',
    );
  });

  test("emitted server component renders SSR fallback for inferred client boundaries inside component children", () => {
    const output = transform({
      code: `import { AppShell } from "./AppShell";
      import { Navigation } from "./Navigation";

      export function App() {
        return (
          <AppShell>
            <section><Navigation label="Albums" /></section>
          </AppShell>
        );
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      clientBoundaryImports: ["./Navigation"],
      clientBoundaryFallbackImports: ["./Navigation"],
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain(
      '_renderClientBoundary("Navigation", { label: ("Albums") }, (_childrenHtml) => ((_value) => _value == null || typeof _value === "boolean" ? "" : _value)(Navigation({ label: ("Albums") })), true, "", false)',
    );
  });

  test("emitted server component passes JSX children to inferred client boundary SSR fallback", () => {
    const output = transform({
      code: `import { AppShell } from "./AppShell";

      export function App() {
        return (
          <AppShell currentPath="/settings/email">
            <div data-testid="settings-email-ready-state">Body</div>
          </AppShell>
        );
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      clientBoundaryImports: ["./AppShell"],
      clientBoundaryFallbackImports: ["./AppShell"],
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain(
      '_renderClientBoundary("AppShell", { currentPath: ("/settings/email") }, (_childrenHtml) => ((_value) => _value == null || typeof _value === "boolean" ? "" : _value)(AppShell({ currentPath: ("/settings/email"), children: _childrenHtml',
    );
    expect(output.code).toContain("<!--mreact-client-boundary-children-start-->");
    expect(output.code).toContain("<!--mreact-client-boundary-children-end-->");
    expect(output.code).toContain("data-mreact-client-boundary-fallback");
    expect(output.code).toContain("data-mreact-client-boundary-children");
    expect(output.code).toContain("), true,");
    expect(output.code).toContain('data-testid=\\"settings-email-ready-state\\"');
    expect(output.code).toContain('"Body"');
  });

  test("does not change fallback children semantics to optimize the children archive", () => {
    const output = transform({
      code: `import { AppShell } from "./AppShell";

      export function App(props) {
        return <AppShell>{props.children}</AppShell>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      clientBoundaryImports: ["./AppShell"],
      clientBoundaryFallbackImports: ["./AppShell"],
    });
    const globalWithShell = globalThis as typeof globalThis & {
      AppShell?: (props: { children?: string }) => string;
    };
    const previousShell = globalWithShell.AppShell;

    try {
      globalWithShell.AppShell = (props) => props.children ? "<p>has children</p>" : "<p>empty</p>";
      const emptyHtml = runServerComponent(output.code, "App", { children: "" });

      expect(emptyHtml).toContain("<p>empty</p>");
      expect(emptyHtml).not.toContain("<p>has children</p>");
      expect(emptyHtml).toContain('data-mreact-client-boundary-children="AppShell"');

      globalWithShell.AppShell = (props) => `<textarea>${props.children ?? ""}</textarea>`;
      const rawTextHtml = runServerComponent(output.code, "App", { children: "Body" });

      expect(rawTextHtml).toContain("<textarea>Body</textarea>");
      expect(rawTextHtml).toContain('data-mreact-client-boundary-children="AppShell"');
      expect(rawTextHtml).not.toContain("<textarea><!--mreact-client-boundary-children-start-->");
    } finally {
      if (previousShell === undefined) {
        delete globalWithShell.AppShell;
      } else {
        globalWithShell.AppShell = previousShell;
      }
    }
  });

  test("emitted server component leaves compat client references as client boundaries", () => {
    const output = transform({
      code: `import Chart from "./Chart.compat.tsx";

      export function App() {
        return <section><h1>Dashboard</h1><Chart data={[1, 2, 3]} /></section>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      clientBoundaryImports: ["./Chart.compat.tsx"],
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.clientReferences).toEqual(["Chart"]);
    expect(output.code).not.toContain("_renderReactNodeToString(Chart");
    expect(runServerComponent(output.code)).toBe(
      '<section><h1>Dashboard</h1><template data-mreact-client-boundary="Chart"></template><script type="application/json" data-mreact-client-boundary-props="Chart">{"data":[1,2,3]}</script></section>',
    );
  });

  test("emitted server component escapes hostile client boundary props JSON", () => {
    const payload = "</script><script>globalThis.__mreactPwned=1</script><!--&>" + "\u2028" + "\u2029" + "\ud800";
    const output = transform({
      code: `import Chart from "./Chart.compat.tsx";

      export function App() {
        return <section><Chart marker=${JSON.stringify(payload)} /></section>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      clientBoundaryImports: ["./Chart.compat.tsx"],
    });

    expect(output.diagnostics).toEqual([]);
    const html = runServerComponent(output.code);
    const propsJson = /<script type="application\/json" data-mreact-client-boundary-props="Chart">([\s\S]*?)<\/script>/.exec(
      html,
    )?.[1];
    expect(propsJson).toBeDefined();
    expect(propsJson).not.toMatch(/[<>&]/);
    expect(propsJson).not.toContain("\u2028");
    expect(propsJson).not.toContain("\u2029");
    expect(JSON.parse(propsJson ?? "{}")).toMatchObject({
      marker: expect.stringContaining("</script><script>"),
    });
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
