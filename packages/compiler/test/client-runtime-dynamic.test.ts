// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { compileClientComponent, runClientComponent } from "./helpers.js";

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

    const App = compileClientComponent(output.code);
    const App$1 = compileClientComponent(
      output.code
        .replace("export function App()", "export function IgnoredApp()")
        .replace("export function App$1()", "export function App()"),
    );

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
});
