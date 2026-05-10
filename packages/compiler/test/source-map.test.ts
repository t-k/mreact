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
});
