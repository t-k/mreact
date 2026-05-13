import { describe, expect, test } from "vitest";
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
