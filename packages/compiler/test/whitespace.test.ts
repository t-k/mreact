// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runClientComponent, runServerComponent } from "./helpers.js";

describe("compiler JSX whitespace semantics", () => {
  test("preserves same-line text before child element", async () => {
    const output = transform({
      code: "export function App() { return <div>Hello <span>world</span></div>; }",
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect((await runClientComponent(output.code)).textContent).toBe(
      "Hello world",
    );
  });

  test("preserves same-line text after child element", () => {
    const output = transform({
      code: "export function App() { return <div><span>Hello</span> world</div>; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      "<div><span>Hello</span> world</div>",
    );
  });

  test("drops trailing indentation after multiline text before child element", () => {
    const output = transform({
      code: "export function App() { return <div>\n    Hello\n    <span>world</span>\n  </div>; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      "<div>Hello<span>world</span></div>",
    );
  });

  test("preserves same-line whitespace between expressions", async () => {
    const output = transform({
      code: 'export function App() { const first = "Ada"; const last = "Lovelace"; return <p>{first} {last}</p>; }',
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect((await runClientComponent(output.code)).textContent).toBe(
      "Ada Lovelace",
    );
  });

  test("drops indentation whitespace between multiline children", () => {
    const output = transform({
      code: "export function App() { return <div>\n  <span>Hello</span>\n</div>; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(runServerComponent(output.code)).toBe(
      "<div><span>Hello</span></div>",
    );
  });
});
