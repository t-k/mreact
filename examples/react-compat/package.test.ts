import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("react compatibility example", () => {
  test("typechecks against React while Vite redirects the runtime to mreact", async () => {
    const tsconfig = await readFile(new URL("./tsconfig.json", import.meta.url), "utf8");
    const viteConfig = await readFile(new URL("./vite.config.ts", import.meta.url), "utf8");

    expect(tsconfig).toContain('"jsxImportSource": "react"');
    expect(viteConfig).toContain('react: "@reckona/mreact"');
    expect(viteConfig).toContain('"react-dom": "@reckona/mreact-dom"');
    expect(viteConfig).toContain('"react-dom/client": "@reckona/mreact-dom/client"');
  });
});
