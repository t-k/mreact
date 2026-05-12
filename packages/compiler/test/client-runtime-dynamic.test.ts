// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import {
  compileClientModule,
  runClientComponent,
} from "./helpers.js";

describe("compiler client runtime dynamic output", () => {
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

  test("emits an async-boundary marker comment so stream hydration can preserve resolved server content", async () => {
    const output = transform({
      code: `export function App() {
        const items = Promise.resolve(["a", "b"]);
        return (
          <main>
            <await value={items}>{(values) => <ul>{values.map((v) => <li key={v}>{v}</li>)}</ul>}</await>
          </main>
        );
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("<!--mreact-async-boundary-->");
    expect(output.code).not.toContain("<!---->");
  });
});
