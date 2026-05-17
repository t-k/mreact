import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runServerComponent, runServerStreamComponent } from "./helpers.js";

function compileServerPair(source: string): { stream: string; string: string } {
  const base = {
    code: source,
    dev: true,
    filename: "App.tsx",
    target: "server" as const,
  };
  const stringOutput = transform(base);
  const streamOutput = transform({ ...base, serverOutput: "stream" });

  expect(stringOutput.diagnostics).toEqual([]);
  expect(streamOutput.diagnostics).toEqual([]);

  return {
    stream: streamOutput.code,
    string: stringOutput.code,
  };
}

describe("server emit shared behavior", () => {
  test("string and stream emitters normalize aliases and static style literals the same way", async () => {
    const source = `export function App() {
  return (
    <label className="field" htmlFor="name" style={{ backgroundColor: "red", "--gap": 4 }}>
      Name
    </label>
  );
}`;
    const compiled = compileServerPair(source);
    const expected = '<label class="field" for="name" style="background-color:red;--gap:4">Name</label>';

    expect(runServerComponent(compiled.string)).toBe(expected);
    await expect(runServerStreamComponent(compiled.stream)).resolves.toBe(expected);
  });

  test("string and stream emitters drop unsafe static URL attributes the same way", async () => {
    const source = `export function App() {
  return (
    <main>
      <a href="javascript:alert(1)">link</a>
      <img src="data:image/svg+xml,<svg><script>alert(1)</script></svg>" alt="bad" />
      <img src="data:image/png;base64,abc" alt="ok" />
    </main>
  );
}`;
    const compiled = compileServerPair(source);
    const expected = '<main><a>link</a><img alt="bad"></img><img src="data:image/png;base64,abc" alt="ok"></img></main>';

    expect(runServerComponent(compiled.string)).toBe(expected);
    await expect(runServerStreamComponent(compiled.stream)).resolves.toBe(expected);
  });

  test("string and stream emitters serialize dynamic style objects the same way", async () => {
    const source = `export function App(props) {
  return <div style={{ backgroundColor: props.color, opacity: props.opacity, "--gap": props.gap }}>x</div>;
}`;
    const compiled = compileServerPair(source);
    const props = { color: "red&", gap: "2rem", opacity: false };
    const expected = '<div style="background-color:red&amp;;--gap:2rem">x</div>';

    expect(runServerComponent(compiled.string, "App", props)).toBe(expected);
    await expect(runServerStreamComponent(compiled.stream, "App", props)).resolves.toBe(expected);
  });
});
