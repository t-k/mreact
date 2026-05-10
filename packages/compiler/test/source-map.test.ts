import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";

describe("compiler source maps", () => {
  test("emits a source map with sourcesContent when requested", () => {
    const code = "export function App() { return <div>Hello</div>; }";
    const output = transform({
      code,
      filename: "App.tsx",
      target: "client",
      dev: true,
      sourceMap: true,
    });

    expect(output.map).not.toBeNull();
    expect(output.map).not.toBeUndefined();

    const map = JSON.parse(output.map as string) as {
      version: number;
      file: string;
      sources: string[];
      sourcesContent: string[];
      mappings: string;
    };

    expect(map.version).toBe(3);
    expect(map.file).toBe("App.tsx.js");
    expect(map.sources).toEqual(["App.tsx"]);
    expect(map.sourcesContent).toEqual([code]);
    expect(map.mappings).not.toBe("");
    expect(map.mappings.split(";").length).toBe(
      output.code.split("\n").length,
    );
    expect(
      map.mappings.split(";").some((line) => line.split(",").length > 1),
    ).toBe(true);
  });

  test("maps generated template segments back to the JSX source column", () => {
    const code = [
      "export function App() {",
      '  return <div id="x">Hello</div>;',
      "}",
      "",
    ].join("\n");
    const output = transform({
      code,
      filename: "App.tsx",
      target: "client",
      dev: true,
      sourceMap: true,
    });
    const map = JSON.parse(output.map as string) as {
      names: string[];
      mappings: string;
    };
    const decoded = decodeMappings(map.mappings);
    const generatedTemplateLine = output.code
      .split("\n")
      .findIndex((line) => line.includes('createTemplate("'));
    const jsxColumn = code.split("\n")[1]?.indexOf("<div") ?? -1;

    expect(generatedTemplateLine).toBeGreaterThanOrEqual(0);
    expect(jsxColumn).toBeGreaterThanOrEqual(0);
    expect(decoded[generatedTemplateLine]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceLine: 1,
          sourceColumn: jsxColumn,
        }),
      ]),
    );
  });

  test("maps generated dynamic expression segments back to the JSX expression column", () => {
    const code = [
      "export function App() {",
      '  const name = "Ada";',
      "  return <p>Hello {name}</p>;",
      "}",
      "",
    ].join("\n");
    const output = transform({
      code,
      filename: "App.tsx",
      target: "client",
      dev: true,
      sourceMap: true,
    });
    const map = JSON.parse(output.map as string) as {
      mappings: string;
    };
    const decoded = decodeMappings(map.mappings);
    const generatedBindingLine = output.code
      .split("\n")
      .findIndex((line) => line.includes("bindText("));
    const sourceExpressionColumn = code.split("\n")[2]?.indexOf("name") ?? -1;

    expect(generatedBindingLine).toBeGreaterThanOrEqual(0);
    expect(sourceExpressionColumn).toBeGreaterThanOrEqual(0);
    expect(map.names).toContain("name");
    expect(decoded[generatedBindingLine]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceLine: 2,
          sourceColumn: sourceExpressionColumn,
          nameIndex: map.names.indexOf("name"),
        }),
      ]),
    );
  });

  test("maps Oxc generated dynamic expression segments back to the JSX expression column", () => {
    const code = [
      "export function App() {",
      '  const name = "Ada";',
      "  return <p>Hello {name}</p>;",
      "}",
      "",
    ].join("\n");
    const output = transform({
      code,
      filename: "App.tsx",
      target: "client",
      dev: true,
      sourceMap: true,
      parser: "oxc",
    });
    const map = JSON.parse(output.map as string) as {
      mappings: string;
      names: string[];
    };
    const decoded = decodeMappings(map.mappings);
    const generatedBindingLine = output.code
      .split("\n")
      .findIndex((line) => line.includes("bindText("));
    const sourceExpressionColumn = code.split("\n")[2]?.indexOf("name") ?? -1;

    expect(output.diagnostics).toEqual([]);
    expect(generatedBindingLine).toBeGreaterThanOrEqual(0);
    expect(sourceExpressionColumn).toBeGreaterThanOrEqual(0);
    expect(map.names).toContain("name");
    expect(decoded[generatedBindingLine]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceLine: 2,
          sourceColumn: sourceExpressionColumn,
          nameIndex: map.names.indexOf("name"),
        }),
      ]),
    );
  });

  test("maps generated dynamic attribute expressions to their own JSX attribute columns", () => {
    const code = [
      "export function App() {",
      '  const name = "Ada";',
      "  return <input value={name} aria-label={name} />;",
      "}",
      "",
    ].join("\n");
    const output = transform({
      code,
      filename: "App.tsx",
      target: "client",
      dev: true,
      sourceMap: true,
    });
    const map = JSON.parse(output.map as string) as {
      mappings: string;
    };
    const decoded = decodeMappings(map.mappings);
    const generatedAriaLine = output.code
      .split("\n")
      .findIndex((line) => line.includes('bindProp(_root, "aria-label"'));
    const sourceLine = code.split("\n")[2] ?? "";
    const sourceExpressionColumn = sourceLine.indexOf(
      "name",
      sourceLine.indexOf("aria-label"),
    );

    expect(generatedAriaLine).toBeGreaterThanOrEqual(0);
    expect(sourceExpressionColumn).toBeGreaterThanOrEqual(0);
    expect(decoded[generatedAriaLine]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceLine: 2,
          sourceColumn: sourceExpressionColumn,
        }),
      ]),
    );
  });

  test("maps names inside compound dynamic expressions", () => {
    const code = [
      "export function App() {",
      '  const first = "Ada";',
      '  const last = "Lovelace";',
      "  return <p>{first + last}</p>;",
      "}",
      "",
    ].join("\n");
    const output = transform({
      code,
      filename: "App.tsx",
      target: "client",
      dev: true,
      sourceMap: true,
    });
    const map = JSON.parse(output.map as string) as {
      mappings: string;
      names: string[];
    };
    const decoded = decodeMappings(map.mappings);
    const generatedBindingLine = output.code
      .split("\n")
      .findIndex((line) => line.includes("bindText("));
    const sourceLine = code.split("\n")[3] ?? "";

    expect(map.names).toEqual(expect.arrayContaining(["first", "last"]));
    expect(decoded[generatedBindingLine]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceLine: 3,
          sourceColumn: sourceLine.indexOf("first"),
          nameIndex: map.names.indexOf("first"),
        }),
        expect.objectContaining({
          sourceLine: 3,
          sourceColumn: sourceLine.indexOf("last"),
          nameIndex: map.names.indexOf("last"),
        }),
      ]),
    );
  });
});

interface DecodedSegment {
  generatedColumn: number;
  sourceIndex: number;
  sourceLine: number;
  sourceColumn: number;
  nameIndex?: number;
}

function decodeMappings(mappings: string): DecodedSegment[][] {
  let previousSourceIndex = 0;
  let previousSourceLine = 0;
  let previousSourceColumn = 0;

  return mappings.split(";").map((line) => {
    let previousGeneratedColumn = 0;

    if (line === "") {
      return [];
    }

    return line.split(",").map((segment) => {
      const values = decodeSegment(segment);
      previousGeneratedColumn += values[0] ?? 0;
      previousSourceIndex += values[1] ?? 0;
      previousSourceLine += values[2] ?? 0;
      previousSourceColumn += values[3] ?? 0;

      return {
        generatedColumn: previousGeneratedColumn,
        sourceIndex: previousSourceIndex,
        sourceLine: previousSourceLine,
        sourceColumn: previousSourceColumn,
        ...(values[4] === undefined ? {} : { nameIndex: values[4] }),
      };
    });
  });
}

function decodeSegment(segment: string): number[] {
  const values: number[] = [];
  let shift = 0;
  let value = 0;

  for (const char of segment) {
    const digit = sourceMapBase64.indexOf(char);
    const continuation = (digit & 32) !== 0;
    value += (digit & 31) << shift;

    if (continuation) {
      shift += 5;
      continue;
    }

    values.push((value & 1) === 1 ? -(value >> 1) : value >> 1);
    value = 0;
    shift = 0;
  }

  return values;
}

const sourceMapBase64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
