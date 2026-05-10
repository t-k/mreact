import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runServerComponent } from "./helpers.js";

describe("compiler server JSX transform", () => {
  test("emitted static server component returns an HTML string", () => {
    const output = transform({
      code: 'export function App() { return <div id="app">Hello SSR</div>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    expect(runServerComponent(output.code)).toBe('<div id="app">Hello SSR</div>');
  });

  test("emitted dynamic server component preserves body statements and escapes HTML", () => {
    const output = transform({
      code: 'export function App() { const name = "&\\"<Ada>"; return <p>Hello {name}</p>; }',
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);

    expect(runServerComponent(output.code)).toBe(
      "<p>Hello &amp;&quot;&lt;Ada&gt;</p>",
    );
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
});
