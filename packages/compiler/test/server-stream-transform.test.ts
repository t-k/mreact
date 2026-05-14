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
        batchImportSource: "@modular-react/router/internal/native-escape",
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
        batchImportSource: "@modular-react/router/internal/native-escape",
      },
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("@modular-react/router/internal/native-escape");
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
        batchImportSource: "@modular-react/router/internal/native-escape",
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
      code: `import { Suspense } from "@modular-react/react-compat";

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
      code: `import { Suspense } from "@modular-react/react-compat";

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
      code: `import { Suspense } from "@modular-react/react-compat";

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
      code: `import { Suspense } from "@modular-react/react-compat";

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
      code: `import { Suspense } from "@modular-react/react-compat";

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
      '<!--mreact-h:start:App--><section><!--mreact-h:start:mreact-0--><template data-mreact-oob-placeholder="mreact-0"><em>loading</em></template><!--mreact-h:end:mreact-0--></section><!--mreact-h:end:App--><template data-mreact-oob-fragment="mreact-0"><button>Ada</button></template>',
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
      '<section>Before<template data-mreact-oob-placeholder="mreact-0"><span>Loading</span></template><p>After</p></section><template data-mreact-oob-fragment="mreact-0"><span>Ada</span></template>',
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
      '<section><template data-mreact-oob-placeholder="mreact-0"><span>Loading</span></template></section><template data-mreact-oob-fragment="mreact-0"><span>Ada</span></template>',
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
      '<section><template data-mreact-oob-placeholder="mreact-0"><span>Loading</span></template><p>After</p></section><template data-mreact-oob-fragment="mreact-0"><strong>load failed</strong></template>',
    );
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
        source: "@modular-react/server",
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
      code: `import { cell } from "@modular-react/reactive-core";

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
    expect(output.code).toContain('import { cell } from "@modular-react/reactive-core";');
  });

  test("emitted server stream component passes external React Suspense reveal script options", async () => {
    const output = transform({
      code: `import { Suspense } from "@modular-react/react-compat";

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
      '<section><template data-mreact-oob-placeholder="mreact-0"><span>Loading</span></template>user</section><template data-mreact-oob-fragment="mreact-0"><span>Ada</span></template>',
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
