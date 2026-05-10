import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
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

  test("can use the Oxc analyzer as the transform front-end for the supported subset", () => {
    const code = 'export function App() { const items = ["A"]; return <main id="app">{items.map((item) => <span>{item}</span>)}</main>; }';
    const typescriptOutput = transform({
      code,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });
    const oxcOutput = transform({
      code,
      filename: "App.tsx",
      target: "client",
      dev: false,
      parser: "oxc",
    });

    expect(oxcOutput.diagnostics).toEqual([]);
    expect(oxcOutput.code).toBe(typescriptOutput.code);
    expect(oxcOutput.metadata.components).toEqual([
      { name: "App", exportName: "App" },
    ]);
  });

  test("keeps Oxc ModuleIr parity for member tags, logical JSX, spread props, and children", () => {
    const result = analyzeOxcParity({
      code: `export function App() {
        const props = { value: "x" };
        const ok = true;
        return <Box.Provider {...props}>{ok && <span>child</span>}</Box.Provider>;
      }`,
      filename: "App.tsx",
      target: "client",
    });

    expect(result.oxc.errors).toEqual([]);
    expect(result.matches).toBe(true);
  });

  test("keeps Oxc ModuleIr parity for component render props", () => {
    const result = analyzeOxcParity({
      code: `export function MyShow(props) {
        return <div>{props.fallback}{props.children}</div>;
      }

      export function App() {
        return <MyShow fallback={<em>loading</em>}><p>main</p></MyShow>;
      }`,
      filename: "App.tsx",
      target: "client",
    });

    expect(result.oxc.errors).toEqual([]);
    expect(result.matches).toBe(true);
  });
});
