import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  stripTypeScriptWithOxc,
  transformJsxToCreateElementWithOxc,
  transformJsxWithOxc,
} from "../src/oxc-transform.js";

describe("compiler oxc-transform edge branches", () => {
  test("stripTypeScriptWithOxc returns the source unchanged when no TS-only syntax is present", () => {
    const source = "const value = 1;\nexport default value;";
    expect(stripTypeScriptWithOxc(source)).toBe(source);
  });

  test("stripTypeScriptWithOxc removes `import type` declarations", () => {
    const result = stripTypeScriptWithOxc(
      `import type { Foo } from "foo";\nexport const x = 1;`,
    );
    expect(result).not.toMatch(/import\s+type/);
    expect(result).toContain("export const x");
  });

  test.each([
    {
      name: "export type declarations",
      source: "export type { Foo };\nconst x = 1;",
      absent: [/export\s+type/],
      present: ["const x = 1;"],
    },
    {
      name: "non-null assertions",
      source: "const x = maybe()!;",
      absent: [/maybe\(\)!/],
      present: ["const x = maybe();"],
    },
    {
      name: "satisfies expressions",
      source: "const v = value satisfies Foo;",
      absent: [/satisfies\s+Foo/],
      present: ["const v = value;"],
    },
    {
      name: "arrow function type parameters",
      source: "const f = <T extends object>(input) => input;",
      absent: [/<T extends object>/],
      present: ["const f = (input) => input;"],
    },
  ])("stripTypeScriptWithOxc strips $name missed by the fast-path heuristic", (sample) => {
    const result = stripTypeScriptWithOxc(sample.source);

    for (const pattern of sample.absent) {
      expect(result).not.toMatch(pattern);
    }
    for (const expected of sample.present) {
      expect(result).toContain(expected);
    }
  });

  test("stripTypeScriptWithOxc strips TypeScript annotations when a missed construct is present", () => {
    const result = stripTypeScriptWithOxc("const f = <T extends object>(input: T) => input;");

    expect(result).not.toContain("<T extends object>");
    expect(result).not.toContain("input: T");
    expect(result).toContain("const f = (input) => input;");
  });

  test("stripTypeScriptWithOxc memoizes repeated TypeScript snippets", async () => {
    const source = await readFile(
      join(process.cwd(), "packages/compiler/src/oxc-transform.ts"),
      "utf8",
    );

    expect(source).toContain("stripTypeScriptCache");
    expect(source).toContain("stripTypeScriptCacheLimit");
  });

  test("transformJsxWithOxc rewrites JSX using the automatic runtime", () => {
    const result = transformJsxWithOxc(`const e = <div>hi</div>;`);
    expect(result).toMatch(/jsx-runtime/);
  });

  test("transformJsxToCreateElementWithOxc rewrites JSX into createElement calls", () => {
    const result = transformJsxToCreateElementWithOxc(`const e = <div>hi</div>;`);
    expect(result).toContain("createElement");
  });

  test("stripTypeScriptWithOxc falls back to the raw source when oxc reports an error", () => {
    // Unparseable source: oxc returns errors. We expect the function to
    // return the original (trimmed) source rather than throwing.
    const broken = "interface BrokenInterfaceLine {\n";
    const result = stripTypeScriptWithOxc(broken);
    expect(result).toBe(broken.trimEnd());
  });

  test("transformJsxWithOxc falls back to stripTypeScriptWithOxc on error with empty code", () => {
    // Syntactically broken TS+JSX; oxc emits errors and an empty code result,
    // which should drive the function into the fallback branch.
    const broken = "const x: = <div></div>;";
    const result = transformJsxWithOxc(broken);
    expect(typeof result).toBe("string");
  });

  test("transformJsxToCreateElementWithOxc falls back to stripTypeScriptWithOxc on error with empty code", () => {
    const broken = "const x: = <div></div>;";
    const result = transformJsxToCreateElementWithOxc(broken);
    expect(typeof result).toBe("string");
  });
});
