import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runServerStreamComponent } from "./helpers.js";

describe("compiler server stream JSX transform", () => {
  test("emitted static server stream component appends HTML chunks", async () => {
    const output = transform({
      code: 'export function App() { return <div id="app">Hello stream</div>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
      mode: "compat",
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("export function App(");
    expect(output.code).toContain(".append(");

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<div id="app">Hello stream</div>',
    );
  });

  test("emitted server stream component renders dynamic attributes and ignores keys", async () => {
    const output = transform({
      code: `export function App() {
        const items = [{ id: "a&", tone: "hot" }];
        return <ul>{items.map((item) => <li key={item.id} data-id={item.id} class={item.tone}>{item.id}</li>)}</ul>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<ul><li data-id="a&amp;" class="hot">a&amp;</li></ul>',
    );
  });

  test("emitted server stream component renders JSX spread attributes", async () => {
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
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" aria-hidden="" data-label="&lt;icon&gt;"><path d="M4 6h16v12H4z"></path></svg>',
    );
  });

  test("emitted server stream component renders router Link imports as React compat nodes", () => {
    const output = transform({
      code: `import { Link } from "@reckona/mreact-router/link";

      export function App() {
        return <nav><Link href="/newest" prefetch="viewport">New</Link></nav>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.clientReferences).toBeUndefined();
    expect(output.code).toContain("renderToString as _renderCompatToString");
    expect(output.code).toContain("_renderCompatToString(Link,");
  });

  test("emitted server stream component passes router Link children as React nodes", () => {
    const output = transform({
      code: `import { Link } from "@reckona/mreact-router/link";

      export function App() {
        const label = "Status & Limitations";
        return <nav><Link href="/next"><span class="dir">Next</span><span>{label}</span></Link></nav>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("_renderCompatToString(Link,");
    expect(output.code).not.toContain('children: "<span');
    expect(output.code).not.toContain("children: _escapeHtml(label)");
    expect(output.code).toContain('children: [(() => {');
    expect(output.code).toContain('type: "span"');
    expect(output.code).toContain("children: (label)");
  });

  test("emitted server stream component renders dynamic MDX registry components as React compat nodes", () => {
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
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderToString as _renderCompatToString");
    expect(output.code).toContain("_renderCompatToString(Content,");
    expect(output.code).not.toContain("Content({");
  });

  test("emitted server stream component renders computed MDX registry components as React compat nodes", () => {
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
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderToString as _renderCompatToString");
    expect(output.code).toContain("_renderCompatToString(Content,");
    expect(output.code).not.toContain("Content({");
  });

  test("emitted server stream component renders loop-built MDX component maps as React compat nodes", () => {
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
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderToString as _renderCompatToString");
    expect(output.code).toContain("_renderCompatToString(Content,");
    expect(output.code).not.toContain("Content({");
  });

  test("emitted server stream component maps input default props to HTML initial state attributes", async () => {
    const output = transform({
      code: `export function App() {
        const fallback = "Ada & Grace";
        return <form><input name="user" defaultValue={fallback} /><input type="checkbox" defaultChecked={true} /></form>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<form><input name="user" value="Ada &amp; Grace"></input><input type="checkbox" checked=""></input></form>',
    );
  });

  test("emitted server stream component maps textarea and select default values", async () => {
    const output = transform({
      code: `export function App({ theme }) {
        const fallback = "Ada & Grace";
        return <form><textarea name="bio" defaultValue={fallback}>ignored</textarea><select name="theme" defaultValue={theme}><option value="system">system</option><option value="dark">dark</option></select></form>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    await expect(runServerStreamComponent(output.code, "App", { theme: "dark" })).resolves.toBe(
      '<form><textarea name="bio">Ada &amp; Grace</textarea><select name="theme"><option value="system">system</option><option value="dark" selected="">dark</option></select></form>',
    );
  });

  test("emitted server stream component normalizes non-form JSX HTML attribute aliases", async () => {
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
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<meta http-equiv="refresh" content="0;url=/next" charset="utf-8"></meta><iframe></iframe><a crossorigin="anonymous" tabindex="1">link</a>',
    );
  });

  test("emitted server stream component inlines escape call for simple member dynamic attributes", async () => {
    const output = transform({
      code: `export function App({ cell }) {
        return <li data-row={cell.row} class={cell.kind}>x</li>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    // No IIFE wrapping the simple member chain
    expect(output.code).not.toMatch(/\(\(\)\s*=>\s*\{[\s\S]*?cell\.row/);
    expect(output.code).not.toMatch(/\(\(\)\s*=>\s*\{[\s\S]*?cell\.kind/);
    expect(output.code).toContain("_escapeHtml(cell.row");
    expect(output.code).toContain("_escapeHtml(cell.kind");
    await expect(
      runServerStreamComponent(output.code, "App", { cell: { row: "A&B", kind: "hot" } }),
    ).resolves.toBe('<li data-row="A&amp;B" class="hot">x</li>');
  });

  test("emitted server stream component keeps IIFE for call-expression attribute (avoid double-eval)", async () => {
    const output = transform({
      code: `export function App({ fetchValue }) {
        return <li data-x={fetchValue()}>x</li>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toMatch(/\(\(\)\s*=>\s*\{[^}]*fetchValue\(\)/);
  });

  test("emitted server stream component drops _escapeHtmlBatch import when no batch site exists", async () => {
    const output = transform({
      code: `export function App({ bg, label }) {
        return <main style={{ backgroundColor: bg, color: "red" }} aria-label={label}>x</main>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
      serverEscape: {
        batchImportName: "escapeHtmlBatch",
        batchImportSource: "@reckona/mreact-router/native-escape",
      },
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("escapeHtmlBatch");
    expect(output.code).not.toContain("native-escape");
  });

  test("emitted server stream component does not batch dynamic attributes through escapeHtmlBatch", async () => {
    const output = transform({
      code: `export function App() {
        const first = "<Ada>";
        const second = "& Grace";
        return <main title={first} data-name={second} aria-label={first}>{first}{second}</main>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
      serverEscape: {
        batchImportName: "escapeHtmlBatch",
        batchImportSource: "@reckona/mreact-router/native-escape",
      },
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("@reckona/mreact-router/native-escape");
    expect(output.code).not.toContain("_escapeHtmlBatch([_value0 === true");
    expect(output.code).toContain("[first, second]");
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<main title="&lt;Ada&gt;" data-name="&amp; Grace" aria-label="&lt;Ada&gt;">&lt;Ada&gt;&amp; Grace</main>',
    );
  });

  test("emitted server stream component static-key style avoids _styleParts array", async () => {
    const output = transform({
      code: `export function App({ bg, fg }) {
        return <div style={{ backgroundColor: bg, color: fg }}>x</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toMatch(/_styleParts\s*=\s*\[\]/);
    expect(output.code).not.toMatch(/_styleParts\.push\(/);
    expect(output.code).not.toMatch(/\.join\(";"\)/);
    await expect(
      runServerStreamComponent(output.code, "App", { bg: "red", fg: null }),
    ).resolves.toBe('<div style="background-color:red">x</div>');
    await expect(
      runServerStreamComponent(output.code, "App", { bg: false, fg: false }),
    ).resolves.toBe("<div>x</div>");
  });

  test("emitted server stream component expands static-key style object literals", async () => {
    const output = transform({
      code: `export function App() {
        const color = 'red&"';
        const gap = "1rem";
        return <div style={{ backgroundColor: color, "--gap": gap, opacity: 0.5 }}>Styled</div>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
      serverEscape: {
        batchImportName: "escapeHtmlBatch",
        batchImportSource: "@reckona/mreact-router/native-escape",
      },
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("Object.entries(_value)");
    expect(output.code).toContain("background-color:");
    expect(output.code).toContain("--gap:");
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<div style="background-color:red&amp;&quot;;--gap:1rem;opacity:0.5">Styled</div>',
    );
  });

  test("emitted server stream component can wrap output in hydration markers", async () => {
    const output = transform({
      code: "export function App() { return <main>Hello</main>; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
      serverHydration: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.serverHydration).toBe(true);

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "<!--mreact-h:start:App--><main>Hello</main><!--mreact-h:end:App-->",
    );
  });

  test("emitted server stream component lowers Suspense to React boundary helper", async () => {
    const output = transform({
      code: `import { Suspense } from "@reckona/mreact-compat";

      export function App() {
        return <Suspense fallback={<em>loading</em>}><strong>ready</strong></Suspense>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderReactSuspenseBoundary");
    expect(output.code).not.toContain("Suspense(");
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "<!--$--><strong>ready</strong><!--/$-->",
    );
  });

  test("emitted server stream component lowers Suspense await child to React out-of-order boundary", async () => {
    const output = transform({
      code: `import { Suspense } from "@reckona/mreact-compat";

      export function App() {
        const name = Promise.resolve("Ada");
        return <section><Suspense fallback={<em>loading</em>}><Await value={name}>{value => <strong>{value}</strong>}</Await></Suspense><p>after</p></section>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderReactSuspenseOutOfOrderBoundary");
    expect(output.code).not.toContain("renderOutOfOrderBoundary");

    const html = await runServerStreamComponent(output.code);

    expect(html).toContain(
      '<section><!--$?--><template id="B:0"></template><em>loading</em><!--/$--><p>after</p></section>',
    );
    expect(html).toContain('<div hidden id="S:0"><strong>Ada</strong></div>');
    expect(html).toContain('$RC("B:0","S:0")');
  });

  test("emitted server stream component lowers Suspense await catch to React reveal segment", async () => {
    const output = transform({
      code: `import { Suspense } from "@reckona/mreact-compat";

      export function App() {
        const name = Promise.reject(new Error("load failed"));
        return <Suspense fallback={<em>loading</em>}><Await value={name} catch={error => <strong>{error.message}</strong>}>{value => <span>{value}</span>}</Await></Suspense>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderReactSuspenseOutOfOrderBoundary");

    const html = await runServerStreamComponent(output.code);

    expect(html).toContain('<!--$?--><template id="B:0"></template><em>loading</em><!--/$-->');
    expect(html).toContain('<div hidden id="S:0"><strong>load failed</strong></div>');
    expect(html).toContain('$RC("B:0","S:0")');
  });

  test("reports nested Await renderers instead of dropping the inner boundary", () => {
    const output = transform({
      code: `export function App() {
        const outer = Promise.resolve(["Ada"]);
        const inner = Promise.resolve("Grace");
        return <Await value={outer}>{items => <section>{items.map((item) => <Await value={inner}>{name => <strong>{item}:{name}</strong>}</Await>)}</section>}</Await>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([
      expect.objectContaining({
        code: "MR_UNSUPPORTED_NESTED_AWAIT",
        level: "error",
        loc: expect.objectContaining({ line: 4 }),
      }),
    ]);
  });

  test("emitted server stream component preserves async function component modifier", async () => {
    const output = transform({
      code: `async function AsyncBody() {
        await Promise.resolve();
        return <p>resolved</p>;
      }

      export function App() {
        return <AsyncBody />;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("async function AsyncBody(");
    expect(output.code).toContain("await Promise.resolve();");
    expect(output.code).toContain("await AsyncBody(");
    await expect(runServerStreamComponent(output.code)).resolves.toBe("<p>resolved</p>");
  });

  test("emitted server stream component lowers async arrow function components", async () => {
    const output = transform({
      code: `export const AsyncBody = async (props) => {
        await Promise.resolve();
        return <p>{props.value}</p>;
      };

      export function App() {
        return <AsyncBody value="resolved" />;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("export async function AsyncBody(");
    expect(output.code).toContain("await Promise.resolve();");
    expect(output.code).toContain("await AsyncBody(");
    await expect(runServerStreamComponent(output.code)).resolves.toBe("<p>resolved</p>");
  });

  test("emitted server stream component preserves default function export", async () => {
    const output = transform({
      code: `export default function Page() {
        return <main>x</main>;
      }`,
      filename: "Page.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("export default function Page(");
    await expect(runServerStreamComponent(output.code, "default")).resolves.toBe("<main>x</main>");
  });

  test("emitted server stream component preserves default async function export", async () => {
    const output = transform({
      code: `export default async function Page() {
        await Promise.resolve();
        return <main>x</main>;
      }`,
      filename: "Page.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("export default async function Page(");
    await expect(runServerStreamComponent(output.code, "default")).resolves.toBe("<main>x</main>");
  });

  test("emitted server stream component preserves default arrow export", async () => {
    const output = transform({
      code: `export default () => <main>x</main>;`,
      filename: "Page.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("export default function DefaultExport(");
    await expect(runServerStreamComponent(output.code, "default")).resolves.toBe("<main>x</main>");
  });

  test("emitted server stream component preserves default async arrow export", async () => {
    const output = transform({
      code: `export default async () => {
        await Promise.resolve();
        return <main>x</main>;
      };`,
      filename: "Page.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("export default async function DefaultExport(");
    await expect(runServerStreamComponent(output.code, "default")).resolves.toBe("<main>x</main>");
  });

  test("emitted server stream component lowers Suspense async component child to React out-of-order boundary", async () => {
    const output = transform({
      code: `import { Suspense } from "@reckona/mreact-compat";

      async function AsyncBody() {
        await Promise.resolve();
        return <p>resolved</p>;
      }

      export function App() {
        return <section><Suspense fallback={<em>loading</em>}><AsyncBody /></Suspense><span>after</span></section>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderReactSuspenseOutOfOrderBoundary");
    expect(output.code).not.toContain("renderReactSuspenseBoundary");

    const html = await runServerStreamComponent(output.code);

    expect(html).toContain(
      '<section><!--$?--><template id="B:0"></template><em>loading</em><!--/$--><span>after</span></section>',
    );
    expect(html).toContain('<div hidden id="S:0"><p>resolved</p></div>');
    expect(html).toContain('$RC("B:0","S:0")');
  });

  test("emitted server stream component preserves wrappers around nested Suspense await child", async () => {
    const output = transform({
      code: `import { Suspense } from "@reckona/mreact-compat";

      export function App() {
        const name = Promise.resolve("Ada");
        return <Suspense fallback="loading"><div class="profile"><Await value={name}>{value => <strong>{value}</strong>}</Await></div></Suspense>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderReactSuspenseOutOfOrderBoundary");

    const html = await runServerStreamComponent(output.code);

    expect(html).toContain('<!--$?--><template id="B:0"></template>loading<!--/$-->');
    expect(html).toContain(
      '<div hidden id="S:0"><div class="profile"><strong>Ada</strong></div></div>',
    );
  });

  test("emitted out-of-order stream boundary can include hydration resume markers", async () => {
    const output = transform({
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section><Await value={name} placeholder={<em>loading</em>}>{value => <button>{value}</button>}</Await></section>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
      serverHydration: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("hydration: true");

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<!--mreact-h:start:App--><section><!--mreact-h:start:mreact-0--><span data-mreact-oob-placeholder="mreact-0"><em>loading</em></span><!--mreact-h:end:mreact-0--></section><!--mreact-h:end:App--><template data-mreact-oob-fragment="mreact-0"><button>Ada</button></template>',
    );
  });

  test("emitted dynamic server stream component escapes HTML", async () => {
    const output = transform({
      code: 'export function App() { const name = "&\\"<Ada>"; return <p>Hello {name}</p>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "<p>Hello &amp;&quot;&lt;Ada&gt;</p>",
    );
  });

  test("emitted server stream component renders JSX stored in body variables", async () => {
    const output = transform({
      code: `export function App() {
        const title = "<Ada>";
        const head = <h1>{title}</h1>;
        return <main>{head}</main>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("const head = <h1>");

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "<main><h1>&lt;Ada&gt;</h1></main>",
    );
  });

  test("emitted server stream component renders JSX pushed inside for-of statements", async () => {
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
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("rows.push(<li>");

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "<ul><li>A</li><li>B</li></ul>",
    );
  });

  test("emitted server stream component renders JSX pushed inside nested loops", async () => {
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
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("rows.push(<li>");

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "<ul><li>A</li><li>B</li></ul>",
    );
  });

  test("emitted server stream component renders block-body list JSX renderers", async () => {
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
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain(": string");

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "<ul><li>0:A</li><li>1:B</li></ul>",
    );
  });

  test("emitted server stream component renders conditional returns in list renderers", async () => {
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
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<ul><li>A</li><li class="off">B</li></ul>',
    );
  });

  test("emitted server stream component renders conditional root returns", async () => {
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
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    await expect(runServerStreamComponent(output.code)).resolves.toBe("<section>Sent</section>");
  });

  test("emitted server stream component handles fragments and nullish dynamic text", async () => {
    const output = transform({
      code: "export function App() { const value = null; return <>Before{value}<span>After</span></>; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);

    await expect(runServerStreamComponent(output.code)).resolves.toBe("Before<span>After</span>");
  });

  test("emitted server stream component preserves component parameters", async () => {
    const output = transform({
      code: "export function App(props) { return <p>Hello {props.name}</p>; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("props)");

    await expect(runServerStreamComponent(output.code, "App", { name: "Ada" })).resolves.toBe(
      "<p>Hello Ada</p>",
    );
  });

  test("emitted server stream component awaits uppercase Await intrinsic boundary in order", async () => {
    const output = transform({
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section>Before<Await value={name}>{value => <span>{value}</span>}</Await>After</section>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderAsyncBoundary");
    expect(output.code).toContain("export async function App(");

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "<section>Before<span>Ada</span>After</section>",
    );
  });

  test("emitted server stream component awaits intrinsic boundary in order", async () => {
    const output = transform({
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section>Before<Await value={name}>{value => <span>{value}</span>}</Await>After</section>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderAsyncBoundary");
    expect(output.code).toContain("export async function App(");

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "<section>Before<span>Ada</span>After</section>",
    );
  });

  test("emitted server stream component renders block-body map callbacks inside Await", async () => {
    const output = transform({
      code: `export function App() {
  const items = Promise.resolve([{ id: 1, name: "Ada" }]);

  return (
    <Await value={items} placeholder={<span>Loading</span>}>
      {(values) => (
        <ol>
          {values.map((item, index) => {
            const rank = index + 1;

            return <li value={rank}>{item.name}</li>;
          })}
        </ol>
      )}
    </Await>
  );
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<span data-mreact-oob-placeholder="mreact-0"><span>Loading</span></span><template data-mreact-oob-fragment="mreact-0"><ol><li value="1">Ada</li></ol></template>',
    );
  });

  test("emitted server stream component renders conditional mapped lists inside Await", async () => {
    const output = transform({
      code: `export function App() {
  const batch = Promise.resolve({
    kind: "loaded",
    stories: [{ title: "Ada" }, { title: "Grace" }],
  });

  return (
    <Await value={batch} placeholder={<ol />}>
      {(value) => (
        <>
          {value.kind === "loaded" && value.stories.length > 0 ? (
            <ol>
              {value.stories.map((story, index) => (
                <li value={index + 1}>{story.title}</li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </Await>
  );
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<span data-mreact-oob-placeholder="mreact-0"><ol></ol></span><template data-mreact-oob-fragment="mreact-0"><ol><li value="1">Ada</li><li value="2">Grace</li></ol></template>',
    );
  });

  test("emitted server stream component preserves compat components in Await conditionals", () => {
    const output = transform({
      code: `import { Link } from "@reckona/mreact-router";

export function App() {
  const user = Promise.resolve({ name: "Ada" });

  return (
    <Await value={user} placeholder={<span>Loading</span>}>
      {(value) => <p>{value.name ? <Link href={\`/user/\${value.name}\`}>{value.name}</Link> : "unknown"}</p>}
    </Await>
  );
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("_renderCompatToString(Link,");
  });

  test("emitted server stream component renders same-module component references inside Await renderers", async () => {
    const output = transform({
      code: `function BatchContent(props) {
  return <ol>{props.batch.map((item) => <li>{item.name}</li>)}</ol>;
}

export function App() {
  const batch = Promise.resolve([{ name: "Ada" }]);
  return (
    <Await value={batch} placeholder={<span>Loading</span>}>
      {(value) => <BatchContent batch={value} />}
    </Await>
  );
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<span data-mreact-oob-placeholder="mreact-0"><span>Loading</span></span><template data-mreact-oob-fragment="mreact-0"><ol><li>Ada</li></ol></template>',
    );
  });

  test("emitted server stream component renders await catch boundary", async () => {
    const output = transform({
      code: 'export function App() { const name = Promise.reject(new Error("load failed")); return <section><Await value={name} catch={error => <strong>{error.message}</strong>}>{value => <span>{value}</span>}</Await></section>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "<section><strong>load failed</strong></section>",
    );
  });

  test("emitted server stream component renders placeholder await out of order", async () => {
    const output = transform({
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section>Before<Await value={name} placeholder={<span>Loading</span>}>{value => <span>{value}</span>}</Await><p>After</p></section>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderOutOfOrderBoundary");
    expect(output.code).not.toContain("await _renderOutOfOrderBoundary");

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<section>Before<span data-mreact-oob-placeholder="mreact-0"><span>Loading</span></span><p>After</p></section><template data-mreact-oob-fragment="mreact-0"><span>Ada</span></template>',
    );
  });

  test("emitted server stream component renders mapped await boundaries out of order", async () => {
    const output = transform({
      code: `export function App() {
  const batches = [
    { index: 0, start: 0, value: Promise.resolve(["story-1", "story-2"]) },
    { index: 1, start: 2, value: Promise.resolve(["story-3"]) },
  ];
  return (
    <main>
      {batches.map((batch) => (
        <Await
          key={batch.index}
          value={batch.value}
          placeholderAs="div"
          placeholder={<ol start={batch.start + 1}><li>Loading {batch.index}</li></ol>}
        >
          {(items) => (
            <ol start={batch.start + 1}>
              {items.map((story) => <li>{story}</li>)}
            </ol>
          )}
        </Await>
      ))}
    </main>
  );
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<main><div data-mreact-oob-placeholder="mreact-0"><ol start="1"><li>Loading 0</li></ol></div><div data-mreact-oob-placeholder="mreact-0-1"><ol start="3"><li>Loading 1</li></ol></div></main><template data-mreact-oob-fragment="mreact-0"><ol start="1"><li>story-1</li><li>story-2</li></ol></template><template data-mreact-oob-fragment="mreact-0-1"><ol start="3"><li>story-3</li></ol></template>',
    );
  });

  test("emitted server stream component unwraps parenthesized await placeholder", async () => {
    const output = transform({
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section><Await value={name} placeholder={(<span>Loading</span>)}>{value => (<span>{value}</span>)}</Await></section>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<section><span data-mreact-oob-placeholder="mreact-0"><span>Loading</span></span></section><template data-mreact-oob-fragment="mreact-0"><span>Ada</span></template>',
    );
  });

  test("emitted server stream component supports block Await placeholder hosts", async () => {
    const output = transform({
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section><Await value={name} placeholderAs="div" placeholder={<ol><li>Loading</li></ol>}>{value => <span>{value}</span>}</Await></section>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<section><div data-mreact-oob-placeholder="mreact-0"><ol><li>Loading</li></ol></div></section><template data-mreact-oob-fragment="mreact-0"><span>Ada</span></template>',
    );
  });

  test("emitted server stream component renders placeholder await catch out of order", async () => {
    const output = transform({
      code: 'export function App() { const name = Promise.reject(new Error("load failed")); return <section><Await value={name} placeholder={<span>Loading</span>} catch={error => <strong>{error.message}</strong>}>{value => <span>{value}</span>}</Await><p>After</p></section>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<section><span data-mreact-oob-placeholder="mreact-0"><span>Loading</span></span><p>After</p></section><template data-mreact-oob-fragment="mreact-0"><strong>load failed</strong></template>',
    );
  });

  test("emitted server stream component renders await boundaries passed through component children", async () => {
    const output = transform({
      code: `function Frame(props) {
  return <main><h1>{props.title}</h1>{props.children}</main>;
}

export function App() {
  const stats = Promise.resolve(["admin_audit_logs"]);

  return (
    <Frame title="Dashboard">
      <h2>Table statistics</h2>
      <Await value={stats} placeholder={<p>Loading table statistics...</p>}>
        {(items) => <table><tbody>{items.map((item) => <tr><td>{item}</td></tr>)}</tbody></table>}
      </Await>
    </Frame>
  );
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<main><h1>Dashboard</h1><h2>Table statistics</h2><span data-mreact-oob-placeholder="mreact-0"><p>Loading table statistics...</p></span></main><template data-mreact-oob-fragment="mreact-0"><table><tbody><tr><td>admin_audit_logs</td></tr></tbody></table></template>',
    );
  });

  test("emitted server stream component assigns unique ids to multiple awaited component children", async () => {
    const output = transform({
      code: `function Frame(props) {
  return <section>{props.children}</section>;
}

export function App() {
  return (
    <main>
      <Frame>
        <Await value={Promise.resolve("Ada")} placeholder={<p>Loading A</p>}>
          {(name) => <strong>{name}</strong>}
        </Await>
      </Frame>
      <Frame>
        <Await value={Promise.resolve("Grace")} placeholder={<p>Loading B</p>}>
          {(name) => <em>{name}</em>}
        </Await>
      </Frame>
    </main>
  );
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    const html = await runServerStreamComponent(output.code);
    expect(html).toContain('data-mreact-oob-placeholder="mreact-0"');
    expect(html).toContain('data-mreact-oob-placeholder="mreact-1"');
    expect(html).toContain('data-mreact-oob-fragment="mreact-0"');
    expect(html).toContain('data-mreact-oob-fragment="mreact-1"');
    expect(html).not.toContain("mreact-0-1");
  });

  test("emitted server stream component lowers compat import inside await to SSR hydration boundary", () => {
    const output = transform({
      code: `import { Card } from "./Card.compat.tsx";

      export function App() {
        const user = Promise.resolve({ name: "Ada" });
        return <Await value={user} placeholder={<em>loading</em>}>{value => <Card name={value.name} />}</Await>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
      serverHydration: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.clientReferences).toEqual(["Card"]);
    expect(output.code).toContain("renderToString as _renderCompatToString");
    expect(output.code).toContain("_renderCompatToString(Card, { name: (value.name) })");
    expect(output.code).toContain("mreact-h:start:mreact-1");
    expect(output.code).toContain("mreact-h:end:mreact-1");
  });

  test("emitted server stream component leaves compat client references as client boundaries without server hydration", async () => {
    const output = transform({
      code: `import Chart from "./Chart.compat.tsx";

      export function App() {
        return <section><h1>Dashboard</h1><Chart data={[1, 2, 3]} /></section>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
      clientBoundaryImports: ["./Chart.compat.tsx"],
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.clientReferences).toEqual(["Chart"]);
    expect(output.code).not.toContain("_renderCompatToString(Chart");
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<section><h1>Dashboard</h1><template data-mreact-client-boundary="Chart"></template><script type="application/json" data-mreact-client-boundary-props="Chart">{"data":[1,2,3]}</script></section>',
    );
  });

  test("emitted server stream component can bootstrap out-of-order reorder", async () => {
    const output = transform({
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section>Before<Await value={name} placeholder={<span>Loading</span>}>{value => <span>{value}</span>}</Await><p>After</p></section>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
      serverBootstrap: "out-of-order-reorder",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderOutOfOrderReorderScript");
    expect(output.metadata.imports).toEqual([
      {
        source: "@reckona/mreact-server",
        specifiers: ["renderOutOfOrderBoundary", "renderOutOfOrderReorderScript"],
      },
    ]);

    const html = await runServerStreamComponent(output.code);
    const scriptIndex = html.indexOf("<script data-mreact-oob-reorder>");
    const fragmentIndex = html.indexOf('<template data-mreact-oob-fragment="mreact-0">');

    expect(scriptIndex).toBeGreaterThan(-1);
    expect(fragmentIndex).toBeGreaterThan(scriptIndex);
    expect(html).toContain("MutationObserver");
  });

  test("emitted server stream component passes nonce to out-of-order bootstrap", async () => {
    const output = transform({
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section><Await value={name} placeholder={<span>Loading</span>}>{value => <span>{value}</span>}</Await></section>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
      serverBootstrap: "out-of-order-reorder",
      serverBootstrapNonce: 'nonce-&"<value>',
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("nonce");
    expect(output.metadata.serverBootstrapNonce).toBe('nonce-&"<value>');

    const html = await runServerStreamComponent(output.code);

    expect(html).toContain(
      '<script data-mreact-oob-reorder nonce="nonce-&amp;&quot;&lt;value&gt;">',
    );
  });

  test("emitted server stream component can use external out-of-order bootstrap", async () => {
    const output = transform({
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section><Await value={name} placeholder={<span>Loading</span>}>{value => <span>{value}</span>}</Await></section>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
      serverBootstrap: "out-of-order-reorder",
      serverBootstrapNonce: "nonce-1",
      serverBootstrapSrc: "/assets/mreact-oob.js",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.serverBootstrapSrc).toBe("/assets/mreact-oob.js");

    await expect(runServerStreamComponent(output.code)).resolves.toContain(
      '<script data-mreact-oob-reorder nonce="nonce-1" src="/assets/mreact-oob.js"></script>',
    );
  });

  test("emitted server stream component preserves user imports", () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

      export function App() {
        const name = cell("Ada");
        return <p>Hello {name.get()}</p>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain('import { cell } from "@reckona/mreact-reactive-core";');
  });

  test("emitted server stream component passes external React Suspense reveal script options", async () => {
    const output = transform({
      code: `import { Suspense } from "@reckona/mreact-compat";

      export function App() {
        const name = Promise.resolve("Ada");
        return <Suspense fallback={<em>loading</em>}><Await value={name}>{value => <strong>{value}</strong>}</Await></Suspense>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
      serverBootstrapNonce: "nonce-1",
      reactSuspenseRevealScriptSrc: "/assets/mreact-react-suspense-reveal.js",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.reactSuspenseRevealScriptSrc).toBe(
      "/assets/mreact-react-suspense-reveal.js",
    );

    const html = await runServerStreamComponent(output.code);

    expect(html).toContain(
      '<script data-mreact-react-suspense-reveal nonce="nonce-1" src="/assets/mreact-react-suspense-reveal.js" data-boundary-id="B:0" data-segment-id="S:0"></script>',
    );
    expect(html).not.toContain("$RC(");
  });

  test("emitted server stream component preserves top-level helper function", async () => {
    const output = transform({
      code: `function formatName(name) {
        return "Hello " + name;
      }

      export function App() {
        return <p>{formatName("Ada")}</p>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);

    await expect(runServerStreamComponent(output.code)).resolves.toBe("<p>Hello Ada</p>");
  });

  test("emitted server stream component lowers top-level JSX initializers as raw HTML values", async () => {
    const output = transform({
      code: `const name = "<Ada>";
      const headline = <h1>{name}</h1>;

      export function App() {
        return <section>{headline}</section>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("const headline = <h1>");
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "<section><h1>&lt;Ada&gt;</h1></section>",
    );
  });

  test("emitted server stream component lowers lowercase JSX helper function calls as HTML", async () => {
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
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "<section><ul><li>A</li><li>B</li></ul></section>",
    );
  });

  test("emitted server stream component emits trusted dangerouslySetInnerHTML content", async () => {
    const output = transform({
      code: `const SERVICE_WORKER_BOOTSTRAP = "(function(){navigator.serviceWorker.register('/sw.js')})();";

export function App() {
  return <script dangerouslySetInnerHTML={{ __html: SERVICE_WORKER_BOOTSTRAP }} />;
}`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "<script>(function(){navigator.serviceWorker.register('/sw.js')})();</script>",
    );
  });

  test("aliases server stream runtime helper away from top-level bindings", async () => {
    const output = transform({
      code: `const _renderOutOfOrderBoundary = "user";

      export function App() {
        const name = Promise.resolve("Ada");
        return <section><Await value={name} placeholder={<span>Loading</span>}>{value => <span>{value}</span>}</Await>{_renderOutOfOrderBoundary}</section>;
      }`,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("renderOutOfOrderBoundary as _renderOutOfOrderBoundary$1");

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<section><span data-mreact-oob-placeholder="mreact-0"><span>Loading</span></span>user</section><template data-mreact-oob-fragment="mreact-0"><span>Ada</span></template>',
    );
  });

  test("emitted server stream component renders same-module component references", async () => {
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
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "<section><span>Hello Ada</span></section>",
    );
  });
});
