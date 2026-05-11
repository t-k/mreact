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
        return <section><Suspense fallback={<em>loading</em>}><await value={name}>{value => <strong>{value}</strong>}</await></Suspense><p>after</p></section>;
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
        return <Suspense fallback={<em>loading</em>}><await value={name} catch={error => <strong>{error.message}</strong>}>{value => <span>{value}</span>}</await></Suspense>;
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

  test("emitted server stream component preserves wrappers around nested Suspense await child", async () => {
    const output = transform({
      code: `import { Suspense } from "@modular-react/react-compat";

      export function App() {
        const name = Promise.resolve("Ada");
        return <Suspense fallback="loading"><div class="profile"><await value={name}>{value => <strong>{value}</strong>}</await></div></Suspense>;
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
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section><await value={name} placeholder={<em>loading</em>}>{value => <button>{value}</button>}</await></section>; }',
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

  test("emitted server stream component awaits intrinsic boundary in order", async () => {
    const output = transform({
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section>Before<await value={name}>{value => <span>{value}</span>}</await>After</section>; }',
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
      code: 'export function App() { const name = Promise.reject(new Error("load failed")); return <section><await value={name} catch={error => <strong>{error.message}</strong>}>{value => <span>{value}</span>}</await></section>; }',
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
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section>Before<await value={name} placeholder={<span>Loading</span>}>{value => <span>{value}</span>}</await><p>After</p></section>; }',
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
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section><await value={name} placeholder={(<span>Loading</span>)}>{value => (<span>{value}</span>)}</await></section>; }',
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
      code: 'export function App() { const name = Promise.reject(new Error("load failed")); return <section><await value={name} placeholder={<span>Loading</span>} catch={error => <strong>{error.message}</strong>}>{value => <span>{value}</span>}</await><p>After</p></section>; }',
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

  test("emitted server stream component can bootstrap out-of-order reorder", async () => {
    const output = transform({
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section>Before<await value={name} placeholder={<span>Loading</span>}>{value => <span>{value}</span>}</await><p>After</p></section>; }',
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
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section><await value={name} placeholder={<span>Loading</span>}>{value => <span>{value}</span>}</await></section>; }',
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
      code: 'export function App() { const name = Promise.resolve("Ada"); return <section><await value={name} placeholder={<span>Loading</span>}>{value => <span>{value}</span>}</await></section>; }',
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

  test("aliases server stream runtime helper away from top-level bindings", async () => {
    const output = transform({
      code: `const _renderOutOfOrderBoundary = "user";

      export function App() {
        const name = Promise.resolve("Ada");
        return <section><await value={name} placeholder={<span>Loading</span>}>{value => <span>{value}</span>}</await>{_renderOutOfOrderBoundary}</section>;
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
