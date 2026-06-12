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
      "oxc-parser": "0.135.0",
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

  test("lowers parenthesized arrow function JSX bodies", () => {
    const output = transform({
      code: `export const Badge = (props: { label: string }) => (
        <span>{props.label}</span>
      );`,
      filename: "Badge.tsx",
      target: "client",
      dev: false,
      mode: "reactive",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.components).toEqual([
      { name: "Badge", exportName: "Badge" },
    ]);
    expect(output.code).toContain("export function Badge(props)");
    expect(output.code).toContain('createTemplate("<span');
  });

  test("lowers nested parenthesized arrow function JSX bodies", () => {
    const output = transform({
      code: `export const Badge = (props: { label: string }) => ((<span>{props.label}</span>));`,
      filename: "Badge.tsx",
      target: "client",
      dev: false,
      mode: "reactive",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.components).toEqual([
      { name: "Badge", exportName: "Badge" },
    ]);
    expect(output.code).toContain("export function Badge(props)");
    expect(output.code).toContain('createTemplate("<span');
  });

  test("lowers compat call argument JSX recursively", () => {
    const output = transform({
      code: `function Greet() { return <p>Hi</p>; }
      function noop(x) { return x; }
      export function App() {
        return <div>{noop(<Greet />)}</div>;
      }`,
      filename: "App.compat.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain('type: Greet');
    expect(output.code).not.toContain("noop(<Greet");
  });

  test("lowers nested compat call argument JSX recursively", () => {
    const output = transform({
      code: `import { isValidElement } from "@reckona/mreact-compat";
      function Greet() { return <p>Hi</p>; }
      export function App() {
        return <p>{String(isValidElement(<Greet />))}</p>;
      }`,
      filename: "App.compat.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain('String(isValidElement((() => {');
    expect(output.code).toContain('type: Greet');
    expect(output.code).not.toContain("isValidElement(<Greet");
  });

  test("lowers reactive call argument JSX recursively", () => {
    const output = transform({
      code: `function Greet() { return <p>Hi</p>; }
      function noop(x) { return x; }
      export function App() {
        return <div>{noop(<Greet />)}</div>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: false,
      mode: "reactive",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("noop(Greet({}))");
    expect(output.code).not.toContain("noop(<Greet");
  });
});
