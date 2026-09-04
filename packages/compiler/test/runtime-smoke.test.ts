// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import { compileClientComponent, runClientComponent } from "./helpers.js";

describe("compiler runtime smoke", () => {
  test("conditional keyed single-node lists preserve row text context", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
        const visible = cell(true);
        const rows = cell([{ id: 1, label: "One" }]);
        export function App() {
          return <main>
            <button id="replace" onClick={() => rows.set([{ id: 1, label: "Updated" }])}>Replace</button>
            <button id="hide" onClick={() => visible.set(false)}>Hide</button>
            <section>{visible.get() && rows.get().map((row) => (
              <article key={row.id}><span>{row.label}</span></article>
            ))}</section>
          </main>;
        }`,
      filename: "conditional-keyed-list.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("createList(");
    expect(output.code).toContain("bindText(");
    const node = (await runClientComponent(output.code)) as HTMLElement;
    const row = node.querySelector("article") as HTMLElement;

    expect(row.textContent).toBe("One");
    node.querySelector<HTMLButtonElement>("#replace")?.click();
    await flushEffects();
    expect(node.querySelector("article")).toBe(row);
    expect(row.textContent).toBe("Updated");

    node.querySelector<HTMLButtonElement>("#hide")?.click();
    await flushEffects();
    expect(node.querySelector("article")).toBeNull();
    node.querySelector<HTMLButtonElement>("#replace")?.click();
    await flushEffects();
    expect(row.textContent).toBe("Updated");
  });

  test("destructured list callback scope is preserved for keyed rows", async () => {
    const output = transform({
      code: `export function App() {
        const entries = [["Ada", [1, 2]], ["Byron", [3]]];
        const groups = [{ id: "admin", label: "Administrators" }];
        return <main>
          <ul data-array>{entries.map(([actor, runs]: [string, number[]]) => <li key={actor}>{actor}:{runs.length}</li>)}</ul>
          <ul data-object>{groups.map(({ id, label }: { id: string; label: string }) => <li key={id}>{label}</li>)}</ul>
        </main>;
      }`,
      filename: "destructured-list-callback.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    const node = (await runClientComponent(output.code)) as HTMLElement;

    expect(node.querySelector("[data-array]")?.textContent).toBe("Ada:2Byron:1");
    expect(node.querySelector("[data-object]")?.textContent).toBe("Administrators");
  });

  test("compiler keyed cell text retargets same-key rows and detaches old cells", async () => {
    const output = transform({
      code: `
        import { cell } from "@reckona/mreact-reactive-core";
        const oldLabel = cell("A");
        const nextLabel = cell("B");
        const rows = cell([{ id: 1, label: oldLabel }]);
        export function App() {
          return <main>
            <button id="old" onClick={() => oldLabel.set("old")}>Old</button>
            <button id="replace" onClick={() => rows.set([{ id: 1, label: nextLabel }])}>Replace</button>
            <button id="next" onClick={() => nextLabel.set("next")}>Next</button>
            <button id="clear" onClick={() => rows.set([])}>Clear</button>
            <table><tbody>{rows.get().map((row) => (
              <tr key={row.id}><td>{row.label.get()}</td></tr>
            ))}</tbody></table>
          </main>;
        }
      `,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("bindCompilerKeyedCellText(");
    expect(output.code).toContain("compilerOwnsTextCleanup: true");
    const node = (await runClientComponent(output.code)) as HTMLElement;
    const row = node.querySelector("tbody tr");

    expect(row?.textContent).toBe("A");
    node.querySelector<HTMLButtonElement>("#old")?.click();
    await flushEffects();
    expect(row?.textContent).toBe("old");

    node.querySelector<HTMLButtonElement>("#replace")?.click();
    await flushEffects();
    expect(node.querySelector("tbody tr")).toBe(row);
    expect(row?.textContent).toBe("B");

    node.querySelector<HTMLButtonElement>("#old")?.click();
    await flushEffects();
    expect(row?.textContent).toBe("B");
    node.querySelector<HTMLButtonElement>("#next")?.click();
    await flushEffects();
    expect(row?.textContent).toBe("next");

    node.querySelector<HTMLButtonElement>("#clear")?.click();
    await flushEffects();
    node.querySelector<HTMLButtonElement>("#next")?.click();
    await flushEffects();
    expect(row?.textContent).toBe("next");
  });

  test("compiler keyed rows keep directly initialized key text current across record reuse", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
        const rows = cell([{ id: 1, label: "A" }]);
        export function App() {
          return <main>
            <button id="replace" onClick={() => rows.set([{ id: 1, label: "B" }])}>Replace</button>
            <button id="change-key" onClick={() => rows.set([{ id: 2, label: "C" }])}>Change key</button>
            <table><tbody>{rows.get().map((row) => (
              <tr key={row.id}>
                <td class="id">{row.id}</td>
                <td class="label">{row.label}</td>
              </tr>
            ))}</tbody></table>
          </main>;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("bindText(");
    expect(output.code.match(/\bbindCompilerKeyedPropertyText\(/g)).toHaveLength(1);
    expect(output.code).not.toContain("() => ((item.item).label)");
    expect(output.code).toContain("compilerOwnsTextCleanup: true");
    const node = (await runClientComponent(output.code)) as HTMLElement;
    const firstRow = node.querySelector("tbody tr") as HTMLTableRowElement;

    expect(firstRow.querySelector(".id")?.textContent).toBe("1");
    node.querySelector<HTMLButtonElement>("#replace")?.click();
    await flushEffects();
    expect(node.querySelector("tbody tr")).toBe(firstRow);
    expect(firstRow.querySelector(".id")?.textContent).toBe("1");
    expect(firstRow.querySelector(".label")?.textContent).toBe("B");

    node.querySelector<HTMLButtonElement>("#change-key")?.click();
    await flushEffects();
    const nextRow = node.querySelector("tbody tr") as HTMLTableRowElement;
    expect(nextRow).not.toBe(firstRow);
    expect(nextRow.querySelector(".id")?.textContent).toBe("2");
    expect(nextRow.querySelector(".label")?.textContent).toBe("C");
  });

  test("compiler keyed live child aliases survive synchronous custom element moves", async () => {
    const elementName = "x-mreact-live-child-alias";
    if (customElements.get(elementName) === undefined) {
      customElements.define(
        elementName,
        class extends HTMLElement {
          set value(_value: unknown) {
            this.parentNode?.append(this);
          }
        },
      );
    }
    const output = transform({
      code: `export function App() {
        const rows = [{ id: 1, label: "A", value: "x", other: "B" }];
        return <section>{rows.map((row) => (
          <div key={row.id}>
            <span>{row.other}</span>
            <x-mreact-live-child-alias value={row.value} onClick={() => globalThis.__movedAliasHit = row.id}>{row.label}</x-mreact-live-child-alias>
            <b>tail</b>
          </div>
        ))}</section>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    const node = (await runClientComponent(output.code)) as HTMLElement;
    const movedElement = node.querySelector(elementName) as HTMLElement;
    expect(movedElement).toBe(node.querySelector("section div")?.lastElementChild);
    expect(movedElement.textContent).toBe("A");
    movedElement.click();
    expect((globalThis as typeof globalThis & { __movedAliasHit?: number }).__movedAliasHit).toBe(
      1,
    );
    delete (globalThis as typeof globalThis & { __movedAliasHit?: number }).__movedAliasHit;
  });

  test("compiler keyed text preserves getter dependencies across row replacement", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
        const suffix = cell("!");
        const plain = { id: 1, label: "plain" };
        const reactive = {
          id: 1,
          get label() {
            return "getter" + suffix.get();
          },
        };
        const rows = cell([plain]);
        export function App() {
          return <main>
            <button id="replace" onClick={() => rows.set([reactive])}>Replace</button>
            <button id="clear" onClick={() => rows.set([])}>Clear</button>
            <button id="suffix" onClick={() => suffix.set("?")}>Suffix</button>
            <table><tbody>{rows.get().map((row) => (
              <tr key={row.id}><td class="label">{row.label}</td></tr>
            ))}</tbody></table>
          </main>;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("bindCompilerKeyedPropertyText(");
    expect(output.code).toContain("compilerOwnsTextCleanup: true");
    const node = (await runClientComponent(output.code)) as HTMLElement;
    const row = node.querySelector("tbody tr");

    expect(row?.textContent).toBe("plain");
    node.querySelector<HTMLButtonElement>("#replace")?.click();
    await flushEffects();
    expect(node.querySelector("tbody tr")).toBe(row);
    expect(row?.textContent).toBe("getter!");

    node.querySelector<HTMLButtonElement>("#suffix")?.click();
    await flushEffects();
    expect(row?.textContent).toBe("getter?");

    node.querySelector<HTMLButtonElement>("#clear")?.click();
    await flushEffects();
    node.querySelector<HTMLButtonElement>("#suffix")?.click();
    await flushEffects();
    expect(row?.textContent).toBe("getter?");
  });

  test("compiled keyed rows retain DOM while item, index, items, and events stay current", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
        const rows = cell([{ id: 1, label: "A" }, { id: 2, label: "B" }]);
        export function App() {
          return <main>
            <button id="replace" onClick={() => rows.set([{ id: 1, label: "A!" }, { id: 2, label: "B" }])}>Replace</button>
            <button id="swap" onClick={() => rows.set([rows.get()[1], rows.get()[0]])}>Swap</button>
            <table><tbody>{rows.get().map((row, index, items) => (
              <tr key={row.id} data-index={index}>
                <td>{row.label}:{index}:{items.length}</td>
                <td><button onClick={(event) => globalThis.__compilerKeyedPayload = row.label + ":" + index + ":" + items.length + ":" + event.currentTarget.tagName}>Select</button></td>
              </tr>
            ))}</tbody></table>
          </main>;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("compilerEvents:");
    expect(output.code).not.toContain("compilerOwnsTextCleanup: true");
    expect(output.code).not.toContain("markCompilerKeyedEventSlot(");
    expect(output.code.match(/\[_keyedEventSlot\] =/g)).toHaveLength(1);
    expect(output.code).not.toContain('bindEvent(_keyedRoot.childNodes[1].childNodes[0], "click"');
    const node = await runClientComponent(output.code);
    const firstRow = (node as HTMLElement).querySelector("tbody tr") as HTMLTableRowElement;

    (node as HTMLElement).querySelector<HTMLButtonElement>("#replace")?.click();
    await flushEffects();
    expect((node as HTMLElement).querySelector("tbody tr")).toBe(firstRow);
    expect(firstRow.textContent).toContain("A!:0:2");

    (node as HTMLElement).querySelector<HTMLButtonElement>("#swap")?.click();
    await flushEffects();
    expect((node as HTMLElement).querySelectorAll("tbody tr")[1]).toBe(firstRow);
    expect(firstRow.textContent).toContain("A!:1:2");
    firstRow.querySelector("button")?.click();
    expect(
      (globalThis as typeof globalThis & { __compilerKeyedPayload?: string })
        .__compilerKeyedPayload,
    ).toBe("A!:1:2:BUTTON");
    delete (globalThis as typeof globalThis & { __compilerKeyedPayload?: string })
      .__compilerKeyedPayload;
  });

  test("compiler keyed selected classes update at list scope while retaining rows", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
        const rows = cell([{ id: 1, label: "A" }, { id: 2, label: "B" }]);
        const selected = cell(null);
        export function App() {
          return <main>
            <button id="select-two" onClick={() => selected.set(2)}>Select two</button>
            <button id="select-two-again" onClick={() => selected.set(2)}>Select two again</button>
            <button id="clear" onClick={() => selected.set(null)}>Clear</button>
            <button id="swap" onClick={() => rows.set([rows.get()[1], rows.get()[0]])}>Swap</button>
            <table><tbody>{rows.get().map((row) => (
              <tr key={row.id} class={selected.get() === row.id ? "danger" : ""}>
                <td>{row.label}</td>
              </tr>
            ))}</tbody></table>
          </main>;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain(
      'compilerSelectedClass: { className: "danger", initialClassValue: "", source: selected }',
    );
    expect(output.code).not.toContain('bindProp(_keyedRoot, "class"');
    const node = (await runClientComponent(output.code)) as HTMLElement;
    const [firstRow, secondRow] = Array.from(node.querySelectorAll("tbody tr"));

    expect(firstRow?.getAttribute("class")).toBe("");
    expect(secondRow?.getAttribute("class")).toBe("");

    node.querySelector<HTMLButtonElement>("#select-two")?.click();
    await flushEffects();
    expect(firstRow?.getAttribute("class")).toBe("");
    expect(secondRow?.getAttribute("class")).toBe("danger");

    node.querySelector<HTMLButtonElement>("#select-two-again")?.click();
    await flushEffects();
    expect(secondRow?.getAttribute("class")).toBe("danger");

    node.querySelector<HTMLButtonElement>("#swap")?.click();
    await flushEffects();
    expect(node.querySelectorAll("tbody tr")[0]).toBe(secondRow);
    expect(node.querySelectorAll("tbody tr")[1]).toBe(firstRow);
    expect(secondRow?.getAttribute("class")).toBe("danger");

    node.querySelector<HTMLButtonElement>("#clear")?.click();
    await flushEffects();
    expect(firstRow?.getAttribute("class")).toBe("");
    expect(secondRow?.getAttribute("class")).toBe("");
  });

  test("compiler keyed selected classes track structural readonly cell wrappers", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
        const rows = cell([{ id: 1 }, { id: 2 }]);
        const rawSelected = cell(null);
        const selected = { get: () => rawSelected.get() };
        export function App() {
          return <main>
            <button id="select-two" onClick={() => rawSelected.set(2)}>Select two</button>
            <table><tbody>{rows.get().map((row) => (
              <tr key={row.id} class={selected.get() === row.id ? "danger" : ""}>
                <td>{row.id}</td>
              </tr>
            ))}</tbody></table>
          </main>;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain(
      'compilerSelectedClass: { className: "danger", initialClassValue: "", source: selected }',
    );
    const node = (await runClientComponent(output.code)) as HTMLElement;
    const [firstRow, secondRow] = Array.from(node.querySelectorAll("tbody tr"));

    node.querySelector<HTMLButtonElement>("#select-two")?.click();
    await flushEffects();
    expect(firstRow?.getAttribute("class")).toBe("");
    expect(secondRow?.getAttribute("class")).toBe("danger");
  });

  test("keeps event parameter defaults that capture the row on the generic path", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
        const rows = cell([{ id: 1 }]);
        export function App() {
          return <table><tbody>{rows.get().map((row) => (
            <tr key={row.id}>
              <td><button id="select" onClick={(event, current = row) => globalThis.__compilerDefaultPayload = current.id}>Select</button></td>
            </tr>
          ))}</tbody></table>;
        }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("bindList");
    expect(output.code).not.toContain("bindCompilerKeyedSingleNodeList");
    const node = await runClientComponent(output.code);

    (node as HTMLElement).querySelector<HTMLButtonElement>("#select")?.click();
    expect(
      (globalThis as typeof globalThis & { __compilerDefaultPayload?: number })
        .__compilerDefaultPayload,
    ).toBe(1);
    delete (globalThis as typeof globalThis & { __compilerDefaultPayload?: number })
      .__compilerDefaultPayload;
  });
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
import { createTemplate } from "@reckona/mreact-reactive-dom";
import { bindText } from "@reckona/mreact-reactive-dom";

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
      code: `import { cell } from "@reckona/mreact-reactive-core";

      export function App() {
        const count = cell(0);
        return <p>{count.get()}</p>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain('import { cell } from "@reckona/mreact-reactive-core";');
  });

  test("client transform escapes hostile client boundary props JSON", async () => {
    const payload =
      "</script><script>globalThis.__mreactPwned=1</script><!--&>" + "\u2028" + "\u2029" + "\ud800";
    const output = transform({
      code: `import Chart from "./Chart.compat.tsx";

      export function App() {
        return <Chart marker=${JSON.stringify(payload)} />;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
      clientBoundaryImports: ["./Chart.compat.tsx"],
    });

    expect(output.diagnostics).toEqual([]);
    const node = await runClientComponent(output.code);
    const propsJson = (node as DocumentFragment).querySelector(
      'script[type="application/json"][data-mreact-client-boundary-props="Chart"]',
    )?.textContent;
    expect(propsJson).toBeDefined();
    expect(propsJson).not.toMatch(/[<>&]/);
    expect(propsJson).not.toContain("\u2028");
    expect(propsJson).not.toContain("\u2029");
    expect(JSON.parse(propsJson ?? "{}")).toMatchObject({
      marker: expect.stringContaining("</script><script>"),
    });
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

  test("client transform strips TypeScript syntax from preserved statements", async () => {
    for (const parser of [undefined, "oxc"] as const) {
      const output = transform({
        code: `const greeting: string = "Hello";

        export function App(props: { unused: string }) {
          const name: string = "Ada";
          return <p>{greeting + " " + name}</p>;
        }`,
        filename: `App-${parser}.tsx`,
        target: "client",
        dev: true,
        parser,
      });

      expect(output.diagnostics).toEqual([]);
      expect(output.code).not.toContain(": string");
      expect(output.code).not.toContain("props: { unused: string }");

      const node = await runClientComponent(output.code);
      expect(node.textContent).toBe("Hello Ada");
    }
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

  test("client transform preserves adjacent dynamic text and static separator order", async () => {
    const output = transform({
      code: `function formatBytes(value) {
        return value + " GB";
      }

      const billing = { storageUsedBytes: 5, storageLimitBytes: 20 };

      export function App() {
        return <p>{formatBytes(billing.storageUsedBytes)} / {formatBytes(billing.storageLimitBytes)}</p>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect(node.textContent).toBe("5 GB / 20 GB");
  });

  test("client transform lowers top-level JSX helper function switch returns", async () => {
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
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      "<article><ol><li>A</li><li>B</li><!----></ol><!----><!----></article>",
    );
  });

  test("client transform lowers lowercase JSX helper function calls", async () => {
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
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      "<section><ul><li>A</li><li>B</li><!----></ul><!----><!----></section>",
    );
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
    expect((node as HTMLElement).outerHTML).toBe("<section><span>Hello Ada</span></section>");
  });

  test("client transform renders component values selected from a route-local registry", async () => {
    const output = transform({
      code: `function Overview() {
        return <article>Overview</article>;
      }

      function Details() {
        return <article>Details</article>;
      }

      const registry = {
        overview: { Component: Overview },
        details: { Component: Details },
      };

      export function App() {
        const slug = "details";
        const Content = registry[slug].Component;
        return <main><Content /></main>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe("<main><article>Details</article></main>");
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
    expect((node as HTMLElement).outerHTML).toBe("<section><span>Hello Ada</span></section>");
  });

  test("client transform lowers imported component identifiers as value references", () => {
    const output = transform({
      code: `import { Header } from "./header";

      export function App() {
        return <Header title="x" />;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain('Header({ title: ("x") })');
    expect(output.code).not.toContain("<Header");
  });

  test("client transform lowers JSX prop values", async () => {
    const output = transform({
      code: `export function MyShow(props) {
        return <div>{props.fallback}{props.children}</div>;
      }

      export function App() {
        return <MyShow fallback={<em>loading</em>}><p>main</p></MyShow>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("fallback: (<em>");

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      "<div><em>loading</em><p>main</p><!----><!----></div>",
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
    expect((node as HTMLElement).outerHTML).toBe("<section><span>A:2</span></section>");
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
    expect((node as HTMLElement).outerHTML).toBe("<section><p>inside</p><!----></section>");
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
    expect((node as HTMLElement).outerHTML).toBe('<div id="app" class="primary">Hello</div>');
  });

  test("client transform emits loadable templates for control characters in static attributes", async () => {
    const output = transform({
      code: `export function App() { return <div title="line1
line2	end">Hello</div>; }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).getAttribute("title")).toBe("line1\nline2\tend");
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
    expect((node as HTMLElement).outerHTML).toBe("<div><span>A</span><!----></div>");
  });

  test("client transform lowers exported component conditional root returns", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

const sent = cell(false);

function SuccessView() {
  return <section>Sent</section>;
}

function ResetForm() {
  return <form><button type="button" onClick={() => sent.set(true)}>Send</button></form>;
}

export function App() {
  return sent.get() ? <SuccessView /> : <ResetForm />;
}`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const App = compileClientComponent(output.code);
    const host = document.createElement("div");
    host.append(App());
    await flushEffects();

    expect(host.innerHTML).toBe('<form><button type="button">Send</button></form><!---->');

    host.querySelector("button")?.click();
    await flushEffects();

    expect(host.innerHTML).toBe("<section>Sent</section><!---->");
  });

  test("client transform lowers early null root returns as dynamic component output", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

const open = cell(false);

function Dialog() {
  if (!open.get()) return null;
  return <div role="dialog">Dialog</div>;
}

export function App() {
  return <main><button type="button" onClick={() => open.set(true)}>Open</button><Dialog /></main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const App = compileClientComponent(output.code);
    const host = document.createElement("div");
    host.append(App());
    await flushEffects();

    expect(host.textContent).toBe("Open");
    expect(host.querySelector("[role='dialog']")).toBeNull();

    host.querySelector("button")?.click();
    await flushEffects();

    expect(host.querySelector("[role='dialog']")?.textContent).toBe("Dialog");
  });

  test("client transform keeps early null root returns reactive when fallthrough declares locals", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

const open = cell(false);

function Dialog() {
  if (!open.get()) return null;

  const label = "Dialog";
  const klass = open.get() ? "shown" : "hidden";

  return <div role="dialog" class={klass}>{label}</div>;
}

export function App() {
  return <main><button type="button" onClick={() => open.set(true)}>Open</button><Dialog /></main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const App = compileClientComponent(output.code);
    const host = document.createElement("div");
    host.append(App());
    await flushEffects();

    expect(host.querySelector("[role='dialog']")).toBeNull();

    host.querySelector("button")?.click();
    await flushEffects();

    expect(host.querySelector("[role='dialog']")?.textContent).toBe("Dialog");
    expect(host.querySelector("[role='dialog']")?.getAttribute("class")).toBe("shown");
  });

  test("client transform updates dynamic SVG attributes through the DOM binder", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

const box = cell("0 0 24 24");
const klass = cell("icon");
const width = cell(24);
(globalThis as any).__updateSvg = () => {
  box.set("0 0 48 48");
  klass.set("icon icon-large");
  width.set(48);
};

export function App() {
  return <svg viewBox={box.get()} className={klass.get()}><rect width={width.get()} height={width.get()} /></svg>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const svg = await runClientComponent(output.code);
    expect(svg).toBeInstanceOf(SVGSVGElement);
    expect((svg as SVGSVGElement).getAttribute("viewBox")).toBe("0 0 24 24");
    expect((svg as SVGSVGElement).getAttribute("class")).toBe("icon");
    expect((svg as SVGSVGElement).querySelector("rect")?.getAttribute("width")).toBe("24");

    (globalThis as { __updateSvg?: () => void }).__updateSvg?.();
    await flushEffects();

    expect((svg as SVGSVGElement).getAttribute("viewBox")).toBe("0 0 48 48");
    expect((svg as SVGSVGElement).getAttribute("class")).toBe("icon icon-large");
    expect((svg as SVGSVGElement).querySelector("rect")?.getAttribute("width")).toBe("48");
  });

  test("client transform keeps multiple early return branches reactive", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

const status = cell("pending");
(globalThis as any).__setStatus = (value) => status.set(value);

export function App() {
  const current = status.get();

  if (current === "pending") {
    return <p>Loading</p>;
  }

  if (current === "error") {
    return <p>Error</p>;
  }

  return <button type="button" onClick={() => status.set("error")}>Ready</button>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const App = compileClientComponent(output.code);
    const host = document.createElement("div");
    host.append(App());
    await flushEffects();

    expect(host.textContent).toBe("Loading");

    (globalThis as unknown as { __setStatus(value: string): void }).__setStatus("ready");
    await flushEffects();

    expect(host.querySelector("button")?.textContent).toBe("Ready");

    host.querySelector("button")?.click();
    await flushEffects();

    expect(host.textContent).toBe("Error");
  });

  test("client transform lowers component returns after an early prologue branch", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

const landing = cell(true);
const variant = cell(false);
const statusMessage = cell("Saved");
(globalThis as any).__showMain = () => landing.set(false);
(globalThis as any).__showVariant = () => variant.set(true);

function LandingPage() {
  return <section>Landing</section>;
}

function MainView() {
  return <main>Main</main>;
}

export function App() {
  landing.get();
  if (landing.get()) {
    return <LandingPage />;
  }

  const showVariant = variant.get();
  const ready = true;
  if (showVariant && ready) {
    return <aside>Variant{statusMessage.get() && <p aria-live="polite">{statusMessage.get()}</p>}</aside>;
  }

  return <MainView />;
}`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("&& <p");

    const App = compileClientComponent(output.code);
    const host = document.createElement("div");
    host.append(App());
    await flushEffects();

    expect(host.textContent).toBe("Landing");

    (globalThis as unknown as { __showMain(): void }).__showMain();
    await flushEffects();
    expect(host.textContent).toBe("Main");

    (globalThis as unknown as { __showVariant(): void }).__showVariant();
    await flushEffects();
    expect(host.querySelector("aside")?.firstChild?.textContent).toBe("Variant");
    expect(host.querySelector("[aria-live='polite']")?.textContent).toBe("Saved");
  });

  test("client transform keeps nested ternary route branches reactive through local nullable aliases", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

const currentFamily = cell({ name: "Initial" });
const isLoading = cell(false);
const statusMessage = cell("");

export function App() {
  const activeFamily = currentFamily.get() ?? null;

  return <main>
    {isLoading.get() && !activeFamily ? (
      <p>Loading</p>
    ) : activeFamily ? (
      <section><h2>{activeFamily.name}</h2></section>
    ) : (
      <p>No family</p>
    )}
    <button type="button" onClick={() => {
      currentFamily.set({ name: "Updated" });
      statusMessage.set("Saved");
    }}>Save</button>
    {statusMessage.get() && <p aria-live="polite">{statusMessage.get()}</p>}
  </main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const App = compileClientComponent(output.code);
    const host = document.createElement("div");
    host.append(App());
    await flushEffects();

    expect(host.querySelector("section")?.textContent).toBe("Initial");

    host.querySelector("button")?.click();
    await flushEffects();

    expect(host.querySelector("section")?.textContent).toBe("Updated");
    expect(host.querySelector("[aria-live='polite']")?.textContent).toBe("Saved");
  });

  test("client transform disposes child prop reads when a parent conditional clears a nullable source", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

const currentFamily = cell<{ role: string } | null>({ role: "owner" });

function FamilyReadyState(props: { readonly familyWithRole: { role: string } }) {
  return <span data-view="family">{props.familyWithRole.role}</span>;
}

export function App() {
  const activeFamily = currentFamily.get();

  return <main>
    {activeFamily && <FamilyReadyState familyWithRole={activeFamily} />}
    {!activeFamily && <p data-view="empty">No family</p>}
    <button type="button" onClick={() => currentFamily.set(null)}>Clear</button>
  </main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const App = compileClientComponent(output.code);
    const host = document.createElement("div");
    host.append(App());
    await flushEffects();

    expect(host.querySelector("[data-view='family']")?.textContent).toBe("owner");
    expect(host.querySelector("[data-view='empty']")).toBeNull();

    host.querySelector("button")?.click();

    await expect(flushEffects()).resolves.toBeUndefined();
    expect(host.querySelector("[data-view='family']")).toBeNull();
    expect(host.querySelector("[data-view='empty']")?.textContent).toBe("No family");
  });

  test("client transform removes component placeholders when a child returns null", async () => {
    const output = transform({
      code: `function Empty() {
  return null;
}

export function App() {
  return <main>Before<Empty />After</main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);

    expect(node.textContent).toBe("BeforeAfter");
  });

  test("client transform accepts exported components that only return null", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

const started = cell(false);

export function SideEffectOnlyClientComponent() {
  if (!started.get()) {
    started.set(true);
  }
  return null;
}

export function App() {
  return <main><SideEffectOnlyClientComponent /><h1>Hello</h1></main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);

    expect((node as HTMLElement).outerHTML).toBe("<main><h1>Hello</h1></main>");
  });

  test("client transform removes adjacent null component placeholders without shifting later placeholders", async () => {
    const output = transform({
      code: `function EmptyA() {
  return null;
}

function EmptyB() {
  return null;
}

function EmptyC() {
  return null;
}

export function App() {
  return <main><EmptyA /><EmptyB /><EmptyC /></main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);

    expect(node.textContent).toBe("");
    expect(node.childNodes).toHaveLength(0);
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
    expect((node as HTMLElement).outerHTML).toBe("<p><em>shown</em><!----></p>");
  });

  test("client transform renders renderable falsy logical-and left operands", async () => {
    const output = transform({
      code: "export function App() { const count = 0; return <p>{count && <em>shown</em>}</p>; }",
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe("<p>0<!----></p>");
  });

  test("client transform renders logical-and ternary JSX children as DOM nodes", async () => {
    const output = transform({
      code: `export function App() {
        const completed = false;
        const disabled = false;
        const action = { kind: "link", href: "/upload" };
        const actionLabel = "Add photo";

        return (
          <div>
            {!completed &&
              (action.kind === "link" && !disabled ? (
                <a href={action.href}>{actionLabel}</a>
              ) : (
                <button type="button">{actionLabel}</button>
              ))}
          </div>
        );
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      '<div><a href="/upload">Add photo</a><!----></div>',
    );
    expect(node.textContent).not.toContain("[object HTMLAnchorElement]");
  });

  test("client transform renders array expression JSX children as DOM nodes", async () => {
    const output = transform({
      code: `export function App() {
        return <div>{[<span>A</span>, "B"]}</div>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe("<div><span>A</span>B<!----></div>");
    expect(node.textContent).not.toContain("[object HTMLSpanElement]");
  });

  test("client transform renders JSX arrays stored in body variables as DOM nodes", async () => {
    const output = transform({
      code: `export function App() {
        const children = [<span>A</span>, "B"];
        return <div>{children}</div>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe("<div><span>A</span>B<!----></div>");
    expect(node.textContent).not.toContain("[object HTMLSpanElement]");
  });

  test("client transform renders logical JSX stored in body variables as DOM nodes", async () => {
    const output = transform({
      code: `export function App() {
        const enabled = true;
        const action = enabled && <button type="button">Save</button>;
        return <div>{action}</div>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      '<div><button type="button">Save</button><!----></div>',
    );
    expect(node.textContent).not.toContain("[object HTMLButtonElement]");
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
    expect((node as HTMLElement).outerHTML).toBe("<p><em>fallback</em><!----></p>");
  });

  test("client transform evaluates logical-or left JSX child once", async () => {
    const output = transform({
      code: `let calls = 0;
export function App() {
  function next() {
    calls += 1;
    return "value";
  }
  return <p>{next() || <em>fallback</em>}:{calls}</p>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect(node.textContent).toBe("value:1");
  });

  test("client transform lowers JSX stored in component body variables", async () => {
    const output = transform({
      code: `export function App() {
        const head = <h1 className="title">Hello</h1>;
        return <main>{head}</main>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("const head = <h1");

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      '<main><h1 class="title">Hello</h1><!----></main>',
    );
  });

  test("client transform lowers conditional JSX stored in component body variables", async () => {
    const output = transform({
      code: `export function App() {
        const show = false;
        const head = show ? <h1>A</h1> : <h2>B</h2>;
        return <main>{head}</main>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe("<main><h2>B</h2><!----></main>");
  });

  test("client transform lowers list JSX children", async () => {
    const output = transform({
      code: 'export function App() { const items = ["A", "B"]; return <ul>{items.map((item, index) => <li>{index}:{item}</li>)}</ul>; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe("<ul><li>0:A</li><li>1:B</li><!----></ul>");
  });

  test("client transform keeps map parameters from shadowed reactive aliases", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
export function App() {
  const selected = cell({ title: "Selected" });
  const item = selected.get();
  const items = [{ title: "A" }, { title: "B" }];
  return <ul>{items.map((item) => <li>{item.title}</li>)}</ul>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect(node.textContent).toBe("AB");
  });

  test("client transform keeps render-prop parameters from shadowed reactive aliases", () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";
const Theme = { Consumer: function Consumer() { return null; } };
export function App() {
  const selected = cell({ title: "Selected" });
  const value = selected.get();
  return <Theme.Consumer>{(value) => <span>{value.title}</span>}</Theme.Consumer>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("selected.get()).title");
    expect(output.code).toContain("value.title");
  });

  test("client transform lowers block-body list JSX renderers", async () => {
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
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain(": string");

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe("<ul><li>0:A</li><li>1:B</li><!----></ul>");
  });

  test("client transform strips TypeScript from block-body anchor list renderers inside dynamic array expressions", async () => {
    const output = transform({
      code: `const MAIN_NAV_ITEMS = [
        { href: "/", labelKey: "nav.home" },
        { href: "/children", labelKey: "nav.children" },
      ] as const;

      export function App() {
        return (
          <nav>
            {[MAIN_NAV_ITEMS.map((item: (typeof MAIN_NAV_ITEMS)[number]) => {
              const isActive: boolean = item.href === "/";
              return (
                <a
                  key={item.href}
                  href={item.href}
                  class={isActive ? "active" : "inactive"}
                  onClick={() => {
                    globalThis.__mreactClickedHref = item.href;
                  }}
                >
                  <span>{item.labelKey}</span>
                </a>
              );
            })]}
          </nav>
        );
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain(": (typeof MAIN_NAV_ITEMS)");
    expect(output.code).not.toContain(": boolean");

    delete (globalThis as { __mreactClickedHref?: string }).__mreactClickedHref;
    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      '<nav><a href="/" class="active"><span>nav.home</span></a><a href="/children" class="inactive"><span>nav.children</span></a><!----></nav>',
    );
    ((node as HTMLElement).querySelectorAll("a")[1] as HTMLAnchorElement).click();
    expect((globalThis as { __mreactClickedHref?: string }).__mreactClickedHref).toBe("/children");
  });

  test("client transform lowers JSX stored in list body variables", async () => {
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
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("const icon = <strong");

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      "<ul><li><strong>A</strong><!----></li><li><strong>B</strong><!----></li><!----></ul>",
    );
  });

  test("client transform lowers JSX pushed inside for-of statements", async () => {
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
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("rows.push(<li>");

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe("<ul><li>A</li><li>B</li><!----></ul>");
  });

  test("client transform lowers JSX pushed inside classic for statements", async () => {
    const output = transform({
      code: `export function App() {
        const rows = [];
        const items = ["A", "B"];
        for (let i = 0; i < items.length; i += 1) {
          rows.push(<li>{i}:{items[i]}</li>);
        }
        return <ul>{rows}</ul>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe("<ul><li>0:A</li><li>1:B</li><!----></ul>");
  });

  test("client transform lowers JSX pushed inside nested loops", async () => {
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
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("rows.push(<li>");

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe("<ul><li>A</li><li>B</li><!----></ul>");
  });

  test("client transform lowers conditional returns in list renderers", async () => {
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
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      '<ul><li>A</li><li class="off">B</li><!----></ul>',
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
    expect(output.code).toContain("{ key: (item) => (item.id), compilerOwnsTextCleanup: true }");

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe("<ul><li>A</li><!----></ul>");
  });

  test("client keyed list keeps nested object properties reactive after async population", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

      const members = cell([]);

      export function App() {
        return <main>
          <button type="button" onClick={() => members.set([
            {
              user: {
                id: "u1",
                displayName: "Ada Lovelace",
                email: "ada@example.test",
              },
              role: "owner",
            },
          ])}>Load</button>
          <ul>
            {members.get().map((member) => (
              <li key={member.user.id}>
                <p>{member.user.displayName}</p>
                <p>{member.user.email}</p>
              </li>
            ))}
          </ul>
        </main>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("nestedObjectFallback: true");

    const node = await runClientComponent(output.code);
    (node as HTMLElement).querySelector("button")?.click();
    await flushEffects();

    expect((node as HTMLElement).textContent).toBe("LoadAda Lovelaceada@example.test");
  });

  test("client keyed list render values preserve DOM across unrelated parent state updates", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

      const selected = cell(false);
      const items = cell([{ id: "a" }, { id: "b" }]);
      const mediaIds = ["a", "b"];

      function MediaCard(props) {
        return <article data-id={props.mediaId} data-priority={props.priority}>
          <img alt={props.mediaId} />
        </article>;
      }

      export function App() {
        return <main>
          {selected.get()
            ? items.get().map((item) => (
              <MediaCard
                mediaId={item.id}
                priority={mediaIds.indexOf(item.id) === 0 ? "high" : "auto"}
                key={item.id}
              />
            ))
            : items.get().map((item) => (
              <MediaCard
                mediaId={item.id}
                priority={mediaIds.indexOf(item.id) === 0 ? "high" : "auto"}
                key={item.id}
              />
            ))}
          <button type="button" onClick={() => selected.set(!selected.get())}>Toggle</button>
        </main>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    const firstCard = (node as HTMLElement).querySelector('[data-id="a"]');
    const firstImage = firstCard?.querySelector("img");

    expect(firstCard).toBeInstanceOf(HTMLElement);
    expect(firstImage).toBeInstanceOf(HTMLImageElement);

    (node as HTMLElement).querySelector("button")?.click();
    await flushEffects();

    expect((node as HTMLElement).querySelector('[data-id="a"]')).toBe(firstCard);
    expect((node as HTMLElement).querySelector('[data-id="a"] img')).toBe(firstImage);
  });

  test("client dynamic fragments tolerate validation errors toggling into success", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

      const errors = cell([]);
      const saved = cell(false);

      export function App() {
        return <main>
          {saved.get() && <p>Saved</p>}
          <p>
            {errors.get().map((error) => (
              <span>{error}</span>
            ))}
          </p>
          <button type="button" onClick={() => errors.set(["Name is required."])}>Show error</button>
          <button type="button" onClick={() => {
            errors.set([]);
            saved.set(true);
          }}>Save</button>
        </main>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    const buttons = Array.from((node as HTMLElement).querySelectorAll("button"));

    buttons[0]?.click();
    await flushEffects();
    expect((node as HTMLElement).textContent).toContain("Name is required.");

    expect(() => buttons[1]?.click()).not.toThrow();
    await flushEffects();

    expect((node as HTMLElement).textContent).toContain("Saved");
    expect((node as HTMLElement).textContent).not.toContain("Name is required.");
  });

  test.each([true, false])(
    "client transform refreshes transitive local derived values with dev=$dev",
    async (dev) => {
      const output = transform({
        code: `import { cell } from "@reckona/mreact-reactive-core";

const selectedIds = cell<readonly string[]>([]);

export function App() {
  const ids = selectedIds.get();
  const canSubmit = ids.length > 0;

  return <main>
    <button
      id="select"
      type="button"
      aria-pressed={ids.includes("a")}
      onClick={() => selectedIds.set(["a"])}
    >Select</button>
    <button id="submit" type="button" disabled={!canSubmit}>Submit</button>
  </main>;
}`,
        filename: "App.tsx",
        target: "client",
        dev,
      });

      expect(output.diagnostics).toEqual([]);
      expect(output.code).not.toContain("() => (!canSubmit)");

      const node = (await runClientComponent(output.code)) as HTMLElement;
      const select = node.querySelector<HTMLButtonElement>("#select");
      const submit = node.querySelector<HTMLButtonElement>("#submit");

      expect(select?.getAttribute("aria-pressed")).toBe("false");
      expect(submit?.disabled).toBe(true);

      select?.click();
      await flushEffects();

      expect(select?.getAttribute("aria-pressed")).toBe("true");
      expect(submit?.disabled).toBe(false);
    },
  );

  test("client transform switches a transitive local keyed branch", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

const itemsCell = cell<readonly { readonly id: string; readonly label: string }[]>([]);

export function App() {
  const items = itemsCell.get();
  const hasItems = items.length > 0;

  return <main>
    <button type="button" onClick={() => itemsCell.set([{ id: "a", label: "A" }])}>Load</button>
    {!hasItems && <p data-state="empty">Empty</p>}
    {hasItems && <ul>{items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>}
  </main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);

    const node = (await runClientComponent(output.code)) as HTMLElement;
    expect(node.querySelector("[data-state='empty']")?.textContent).toBe("Empty");
    expect(node.querySelector("li")).toBeNull();

    node.querySelector("button")?.click();
    await flushEffects();

    expect(node.querySelector("[data-state='empty']")).toBeNull();
    expect(node.querySelector("li")?.textContent).toBe("A");
  });

  test("client transform switches transitive sibling branches after a promise update", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

const status = cell<"ready" | "success">("ready");

export function App() {
  const currentStatus = status.get();
  const isReady = currentStatus === "ready";
  const isSuccess = currentStatus === "success";

  return <main>
    {isReady && <button type="button" onClick={() => Promise.resolve().then(() => status.set("success"))}>Confirm</button>}
    {isSuccess && <h1>Success</h1>}
  </main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    const node = (await runClientComponent(output.code)) as HTMLElement;

    node.querySelector("button")?.click();
    await Promise.resolve();
    await flushEffects();

    expect(node.querySelector("button")).toBeNull();
    expect(node.querySelector("h1")?.textContent).toBe("Success");
  });

  test("client transform leaves unsafe and mutable reactive snapshots on the tracked fallback", () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

const active = cell(true);
const rows = cell([{ id: "a" }]);
const normalize = (value: boolean) => value;

export function App() {
  let mutable = active.get();
  const called = normalize(active.get());
  const snapshot = active.get();
  const chained = normalize(snapshot);
  const sorted = rows.get().sort((left, right) => left.id.localeCompare(right.id));
  return <main>{mutable && <p>Mutable</p>}{called && <p>Called</p>}{chained && <p>Chained</p>}{sorted.length}</main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("let mutable = active.get();");
    expect(output.code).toContain("const called = normalize(active.get());");
    expect(output.code).toContain("const snapshot = active.get();");
    expect(output.code).toContain("const chained = normalize(snapshot);");
    expect(output.code).toContain("const sorted = rows.get().sort(");
    expect(output.code).not.toContain("untrack");
  });

  test("client transform keeps imperative safe alias uses on the tracked fallback", () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

const count = cell(0);

export function App() {
  const current = count.get();
  globalThis.__imperativeCount = current;
  return <button type="button" onClick={() => count.set(count.get() + 1)}>Count</button>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("const current = count.get();");
    expect(output.code).not.toContain("untrack");
  });

  test("client transform allocates a collision-free untrack helper", async () => {
    const output = transform({
      code: `import { cell } from "@reckona/mreact-reactive-core";

const enabled = cell(false);

export function App() {
  const untrack = "local";
  const current = enabled.get();
  const visible = current === true;
  return <button type="button" data-local={untrack} onClick={() => enabled.set(true)}>{visible && <span>Visible</span>}</button>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("import { untrack as _untrack }");
    const node = (await runClientComponent(output.code)) as HTMLElement;

    expect(node.querySelector("span")).toBeNull();
    node.click();
    await flushEffects();
    expect(node.querySelector("span")?.textContent).toBe("Visible");
    expect(node.dataset.local).toBe("local");
  });

  test("client transform honors native memo comparators at dynamic insertion owners", async () => {
    const output = transform({
      code: `import { memo } from "@reckona/mreact";
import { cell } from "@reckona/mreact-reactive-core";

const revision = cell(0);
const signature = cell("stable");

const Card = memo(
  function Card(props: { readonly revision: number; readonly signature: string }) {
    (globalThis as any).__nativeMemoRenders = ((globalThis as any).__nativeMemoRenders ?? 0) + 1;
    return <article data-revision={props.revision}>Stable</article>;
  },
  (previous, next) => {
    (globalThis as any).__nativeMemoComparisons = ((globalThis as any).__nativeMemoComparisons ?? 0) + 1;
    return previous.signature === next.signature;
  },
);

export function App() {
  return <main>
    <button type="button" onClick={() => revision.set(revision.get() + 1)}>Update</button>
    <button type="button" onClick={() => signature.set("changed")}>Change signature</button>
    {revision.get() >= 0 ? <Card revision={revision.get()} signature={signature.get()} /> : null}
  </main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("createMemo(");
    expect(output.code).toContain("__nativeMemoComparisons");
    expect(output.code).toContain("insertMemo(");
    expect(output.code).not.toContain("insertMemoDynamic(");
    const node = (await runClientComponent(output.code)) as HTMLElement;
    const card = node.querySelector("article");

    expect(
      (globalThis as typeof globalThis & { __nativeMemoRenders?: number }).__nativeMemoRenders,
    ).toBe(1);
    const buttons = node.querySelectorAll("button");
    buttons[0]?.click();
    await flushEffects();

    expect(
      (globalThis as typeof globalThis & { __nativeMemoComparisons?: number })
        .__nativeMemoComparisons,
    ).toBe(1);
    expect(
      (globalThis as typeof globalThis & { __nativeMemoRenders?: number }).__nativeMemoRenders,
    ).toBe(1);
    expect(node.querySelector("article")).toBe(card);
    expect(card?.getAttribute("data-revision")).toBe("0");

    buttons[1]?.click();
    await flushEffects();

    const changedCard = node.querySelector("article");
    expect(
      (globalThis as typeof globalThis & { __nativeMemoComparisons?: number })
        .__nativeMemoComparisons,
    ).toBe(2);
    expect(
      (globalThis as typeof globalThis & { __nativeMemoRenders?: number }).__nativeMemoRenders,
    ).toBe(2);
    expect(changedCard).not.toBe(card);
    expect(changedCard?.getAttribute("data-revision")).toBe("1");
    expect(card?.isConnected).toBe(false);

    delete (globalThis as typeof globalThis & { __nativeMemoRenders?: number }).__nativeMemoRenders;
    delete (globalThis as typeof globalThis & { __nativeMemoComparisons?: number })
      .__nativeMemoComparisons;
  });

  test("client transform keeps static and keyed-list memo calls on direct native paths", async () => {
    const output = transform({
      code: `import { memo } from "@reckona/mreact";

const Card = memo(function Card(props: { readonly label: string }) {
  return <article>{props.label}</article>;
});

export function App() {
  const rows = [{ id: "a", label: "A" }];
  return <main><Card label="Static" />{rows.map((row) => <Card key={row.id} label={row.label} />)}</main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).not.toContain("createMemo");
    const node = (await runClientComponent(output.code)) as HTMLElement;
    expect(Array.from(node.querySelectorAll("article"), (article) => article.textContent)).toEqual([
      "Static",
      "A",
    ]);
  });

  test("client transform preserves memo semantics with expression alternates", async () => {
    const output = transform({
      code: `import { memo } from "@reckona/mreact";
import { cell } from "@reckona/mreact-reactive-core";

const show = cell(true);
const revision = cell(0);
const fallback = cell("Fallback");
const Card = memo(
  function Card(props: { readonly revision: number; readonly signature: string }) {
    return <article data-revision={props.revision}>Card</article>;
  },
  (previous, next) => previous.signature === next.signature,
);

export function App() {
  return <main>
    <button type="button" onClick={() => revision.set(revision.get() + 1)}>Update</button>
    <button type="button" onClick={() => show.set(false)}>Hide</button>
    {show.get() ? <Card revision={revision.get()} signature="stable" /> : fallback.get()}
  </main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("insertMemoDynamic");
    const node = (await runClientComponent(output.code)) as HTMLElement;
    const buttons = node.querySelectorAll("button");
    const card = node.querySelector("article");

    buttons[0]?.click();
    await flushEffects();
    expect(node.querySelector("article")).toBe(card);
    expect(card?.getAttribute("data-revision")).toBe("0");

    buttons[1]?.click();
    await flushEffects();
    expect(node.querySelector("article")).toBeNull();
    expect(node.textContent).toContain("Fallback");
  });

  test("client transform switches a memo conditional to a keyed list alternate", async () => {
    const output = transform({
      code: `import { memo } from "@reckona/mreact";
import { cell } from "@reckona/mreact-reactive-core";

const show = cell(true);
const rows = [{ id: "a", label: "A" }];
const Card = memo(function Card() { return <article>Card</article>; });

export function App() {
  return <main>
    <button type="button" onClick={() => show.set(false)}>Show rows</button>
    {show.get() ? <Card /> : rows.map((row) => <span key={row.id}>Row</span>)}
  </main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("insertMemoDynamic");
    const node = (await runClientComponent(output.code)) as HTMLElement;

    node.querySelector("button")?.click();
    await flushEffects();
    expect(node.querySelector("article")).toBeNull();
    expect(node.querySelector("span")?.textContent).toBe("Row");
    expect(node.textContent).not.toContain("[object Object]");
  });

  test("client transform unwraps explicit list render values from memo expression alternates", async () => {
    const output = transform({
      code: `import { memo } from "@reckona/mreact";
import { cell } from "@reckona/mreact-reactive-core";

const show = cell(true);
const rows = [{ id: "a", label: "A" }];
const LIST_RENDER_VALUE = Symbol.for("mreact.list-render-value");
const Card = memo(function Card() { return <article>Card</article>; });

function explicitList() {
  return {
    [LIST_RENDER_VALUE]: true,
    items: () => rows,
    renderItem: (row: { readonly id: string; readonly label: string }) => {
      const span = document.createElement("span");
      span.textContent = row.label;
      return span;
    },
    options: { key: (row: { readonly id: string }) => row.id },
  };
}

export function App() {
  return <main>
    <button type="button" onClick={() => show.set(false)}>Show rows</button>
    {show.get() ? <Card /> : explicitList()}
  </main>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("insertMemoDynamic");
    const node = (await runClientComponent(output.code)) as HTMLElement;

    node.querySelector("button")?.click();
    await flushEffects();
    expect(node.querySelector("article")).toBeNull();
    expect(node.querySelector("span")?.textContent).toBe("A");
    expect(node.textContent).not.toContain("[object Object]");
  });
});
