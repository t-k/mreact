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
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("export function App(");
    expect(output.code).toContain(".append(");

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      '<div id="app">Hello stream</div>',
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

  test("emitted server stream component handles fragments and nullish dynamic text", async () => {
    const output = transform({
      code: "export function App() { const value = null; return <>Before{value}<span>After</span></>; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toEqual([]);

    await expect(runServerStreamComponent(output.code)).resolves.toBe(
      "Before<span>After</span>",
    );
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

    await expect(
      runServerStreamComponent(output.code, "App", { name: "Ada" }),
    ).resolves.toBe("<p>Hello Ada</p>");
  });
});
