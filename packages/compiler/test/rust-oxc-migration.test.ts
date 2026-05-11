import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { analyzeWithOxc } from "../src/oxc.js";

describe("Rust/Oxc compiler migration", () => {
  test("uses Oxc as the default transform front-end", () => {
    const output = transform({
      code: `export function App(props: { label: string }) { return <main>{props.label}</main>; }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
    });

    expect(output.metadata.compiler).toEqual({
      frontend: "oxc",
      typescriptFallback: false,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test("Oxc transform does not fall back to the TypeScript analyzer", () => {
    const output = analyzeWithOxc({
      code: `export function App() {
        const rows = [];
        const items = ["A"];
        for (const item of items) {
          rows.push(<li>{item}</li>);
        }
        return <ul>{rows}</ul>;
      }`,
      filename: "App.tsx",
      target: "client",
    });

    expect(output.usedTypescriptFallback).toBe(false);
    expect(output.diagnostics).toEqual([]);
  });

  test("compiler runtime package ships Oxc dependencies instead of TypeScript", async () => {
    const packageJson = JSON.parse(
      await readFile(join(process.cwd(), "packages/compiler/package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).toMatchObject({
      "oxc-parser": "0.129.0",
      "oxc-transform": "0.129.0",
    });
    expect(packageJson.dependencies).not.toHaveProperty("typescript");
  });

  test("runtime entrypoints do not statically import the TypeScript analyzer", async () => {
    const [transformSource, internalSource, oxcSource] = await Promise.all([
      readFile(join(process.cwd(), "packages/compiler/src/transform.ts"), "utf8"),
      readFile(join(process.cwd(), "packages/compiler/src/internal.ts"), "utf8"),
      readFile(join(process.cwd(), "packages/compiler/src/oxc.ts"), "utf8"),
    ]);

    expect(transformSource).not.toContain("./analyze.js");
    expect(transformSource).not.toContain("./parse.js");
    expect(internalSource).not.toContain("./analyze.js");
    expect(internalSource).not.toContain("./parse.js");
    expect(oxcSource).not.toContain("analyzeToIr");
  });

  test("legacy TypeScript analyzer sources are not shipped as compiler sources", async () => {
    await expect(
      access(join(process.cwd(), "packages/compiler/src/analyze.ts")),
    ).rejects.toThrow();
    await expect(
      access(join(process.cwd(), "packages/compiler/src/parse.ts")),
    ).rejects.toThrow();
  });
});
