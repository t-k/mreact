// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import {
  compileClientModule,
  runClientComponent,
} from "./helpers.js";

describe("compiler client runtime dynamic output", () => {
  test("emits dynamic writer source labels only in development output", () => {
    const code = `export function App(props) {
      return <main>{props.active ? <span>Active</span> : <span>Idle</span>}</main>;
    }`;
    const development = transform({
      code,
      filename: "/app/page.mreact.tsx",
      target: "client",
      dev: true,
    });
    const production = transform({
      code,
      filename: "/app/page.mreact.tsx",
      target: "client",
      dev: false,
    });

    expect(development.code).toContain("/app/page.mreact.tsx#App");
    expect(development.code).toContain("debugLabel");
    expect(production.code).not.toContain("/app/page.mreact.tsx");
    expect(production.code).not.toContain("debugLabel");
  });

  test("runs intrinsic domRef after the generated element is connected", async () => {
    const output = transform({
      code: `export function App() {
        return <section domRef={(element) => {
          globalThis.__attachedDomRef = element;
        }}>Ready</section>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("bindDomRef");
    const { App } = compileClientModule(output.code);
    const node = App();
    const runtimeState = globalThis as typeof globalThis & {
      __attachedDomRef?: Element;
    };
    expect(runtimeState.__attachedDomRef).toBeUndefined();

    document.body.append(node);
    await Promise.resolve();

    expect(runtimeState.__attachedDomRef).toBe(node);
    delete runtimeState.__attachedDomRef;
    node.remove();
  });

  test("preserves component body statements used by dynamic text", async () => {
    const output = transform({
      code: 'export function App() { const name = "Ada"; return <div>Hello {name}</div>; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);

    expect(node.textContent).toBe("Hello Ada");
  });

  test("does not collide with user locals named like emitter internals", async () => {
    const output = transform({
      code: 'export function App() { const _tmpl_App = "template"; const _root = "Ada"; const _fragment = "Lovelace"; const _text_0 = `${_root} ${_fragment}`; return <div>{_text_0}</div>; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);

    expect(node.textContent).toBe("Ada Lovelace");
  });

  test("does not collide module template names across components", () => {
    const output = transform({
      code: 'export function App() { const _tmpl_App = "x"; return <div />; } export function App$1() { return <span />; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const { App, App$1 } = compileClientModule(output.code);

    expect(App()).toBeInstanceOf(HTMLDivElement);
    expect(App$1()).toBeInstanceOf(HTMLSpanElement);
  });

  test("does not collide with nested var declarations named like emitter internals", async () => {
    const output = transform({
      code: 'export function App() { if (true) { var _root = "Ada"; } return <div>{_root}</div>; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);

    expect(node.textContent).toBe("Ada");
  });

  test("does not collide with for var declarations named like emitter internals", async () => {
    const output = transform({
      code: 'export function App() { for (var _root = "Ada", i = 0; i < 1; i += 1) {} return <div>{_root}</div>; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);

    expect(node.textContent).toBe("Ada");
  });

  test("preserves same-line whitespace between dynamic expressions", async () => {
    const output = transform({
      code: 'export function App() { const first = "Ada"; const last = "Lovelace"; return <div>{first} {last}</div>; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);

    expect(node.textContent).toBe("Ada Lovelace");
  });

  test("decodes JSX entities inside function-call component DOM output", async () => {
    const output = transform({
      code: 'function Chevron() { return <span>&rsaquo;</span>; } export function App() { return <div>{Chevron()}</div>; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    const node = await runClientComponent(output.code);

    expect(node.textContent).toBe("›");
  });

  test("emits an async-boundary marker comment so stream hydration can preserve resolved server content", async () => {
    const output = transform({
      code: `export function App() {
        const items = Promise.resolve(["a", "b"]);
        return (
          <main>
            <Await value={items}>{(values) => <ul>{values.map((v) => <li key={v}>{v}</li>)}</ul>}</Await>
          </main>
        );
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("<!--mreact-async-boundary-->");
    // The await renderer reads serialized data via __mreactAwaitData and
    // re-renders its children client-side so inner cells / onClicks hydrate.
    expect(output.code).toContain("__mreactAwaitData");
  });

  test("imports bindList / bindText helpers required by await renderer body", () => {
    const output = transform({
      code: `export function App() {
        const items = Promise.resolve(["a", "b"]);
        return (
          <main>
            <Await value={items}>{(values) => <ul>{values.map((v) => <li key={v}>{v}</li>)}</ul>}</Await>
          </main>
        );
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    // bindList for the .map inside the await renderer and bindText for the
    // {v} text node must both land in the runtime import so the generated
    // hydration code is callable.
    expect(output.code).toMatch(/import \{[^}]*\bbindList\b/);
    expect(output.code).toMatch(/import \{[^}]*\bbindText\b/);
  });
});
