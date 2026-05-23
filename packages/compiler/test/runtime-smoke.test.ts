// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import { compileClientComponent, runClientComponent } from "./helpers.js";

describe("compiler runtime smoke", () => {
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
    expect(output.code).toContain(
      'import { cell } from "@reckona/mreact-reactive-core";',
    );
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
    expect((node as HTMLElement).outerHTML).toBe(
      "<section><span>Hello Ada</span></section>",
    );
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
    expect((node as HTMLElement).outerHTML).toBe(
      "<section><span>Hello Ada</span></section>",
    );
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
    expect(output.code).toContain("Header({ title: (\"x\") })");
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
    expect((node as HTMLElement).outerHTML).toBe(
      "<section><span>A:2</span></section>",
    );
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
    expect((node as HTMLElement).outerHTML).toBe(
      "<section><p>inside</p><!----></section>",
    );
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
    expect((node as HTMLElement).outerHTML).toBe(
      '<div id="app" class="primary">Hello</div>',
    );
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
    expect((node as HTMLElement).outerHTML).toBe(
      "<div><span>A</span><!----></div>",
    );
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

    (globalThis as { __setStatus(value: string): void }).__setStatus("ready");
    await flushEffects();

    expect(host.querySelector("button")?.textContent).toBe("Ready");

    host.querySelector("button")?.click();
    await flushEffects();

    expect(host.textContent).toBe("Error");
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

  test("client transform lowers logical-and JSX children", async () => {
    const output = transform({
      code: "export function App() { const flag = true; return <p>{flag && <em>shown</em>}</p>; }",
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      "<p><em>shown</em><!----></p>",
    );
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
    expect((node as HTMLElement).outerHTML).toBe(
      "<p><em>fallback</em><!----></p>",
    );
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
    expect((node as HTMLElement).outerHTML).toBe(
      "<main><h2>B</h2><!----></main>",
    );
  });

  test("client transform lowers list JSX children", async () => {
    const output = transform({
      code: "export function App() { const items = [\"A\", \"B\"]; return <ul>{items.map((item, index) => <li>{index}:{item}</li>)}</ul>; }",
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);
    expect((node as HTMLElement).outerHTML).toBe(
      "<ul><li>0:A</li><li>1:B</li><!----></ul>",
    );
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
    expect((node as HTMLElement).outerHTML).toBe(
      "<ul><li>0:A</li><li>1:B</li><!----></ul>",
    );
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
    expect((node as HTMLElement).outerHTML).toBe(
      "<ul><li>A</li><li>B</li><!----></ul>",
    );
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
    expect((node as HTMLElement).outerHTML).toBe(
      "<ul><li>0:A</li><li>1:B</li><!----></ul>",
    );
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
    expect((node as HTMLElement).outerHTML).toBe(
      "<ul><li>A</li><li>B</li><!----></ul>",
    );
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
    expect(output.code).toContain("{ key: (item) => (item.id) }");

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

    expect((node as HTMLElement).textContent).toBe(
      "LoadAda Lovelaceada@example.test",
    );
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
});
