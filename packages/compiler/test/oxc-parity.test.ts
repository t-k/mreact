import { describe, expect, test } from "vitest";
import { analyzeOxcParity } from "../src/oxc.js";

describe("Oxc parser parity spike", () => {
  test("parses TSX and compares exported component names with TypeScript analyzer", () => {
    const result = analyzeOxcParity({
      code: 'export function App() { return <main><h1>Hello</h1></main>; }',
      filename: "App.tsx",
      target: "client",
    });

    expect(result.oxc.errors).toEqual([]);
    expect(result.oxc.exportedComponents).toEqual(["App"]);
    expect(result.typescript.exportedComponents).toEqual(["App"]);
    expect(result.matches).toBe(true);
  });

  test("generates a ModuleIr subset that matches the TypeScript analyzer", () => {
    const result = analyzeOxcParity({
      code: 'export function App() { const show = true; const items = ["A"]; const onClick = () => {}; return <main id="app" onClick={onClick}>{show ? <span>Hello</span> : null}<ul>{items.map((item) => <li>{item}</li>)}</ul></main>; }',
      filename: "App.tsx",
      target: "client",
    });

    expect(result.matches).toBe(true);
    expect(result.oxc.ir).toBeDefined();
    expect(result.oxc.ir).toEqual(result.typescript.ir);
  });
});
