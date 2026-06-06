import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test, vi } from "vitest";

describe("escapeHtmlBatch (JS fallback)", () => {
  test("escapes the four core HTML characters in each entry", async () => {
    const { escapeHtmlBatch } = await importNativeEscape();

    expect(escapeHtmlBatch(['a & b', '"q"', "<x>", "it's ok"])).toEqual([
      "a &amp; b",
      "&quot;q&quot;",
      "&lt;x&gt;",
      "it's ok",
    ]);
  });

  test("Cloudflare emitted native-escape shim leaves single quotes unchanged", async () => {
    const buildSource = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/build.ts", import.meta.url), "utf8")
    );

    expect(buildSource).not.toContain("&#39;");
  });

  test("coerces null/undefined entries into an empty string before escaping", async () => {
    const { escapeHtmlBatch } = await importNativeEscape();

    expect(escapeHtmlBatch([null, undefined, 0, 1])).toEqual(["", "", "0", "1"]);
  });

  test("returns an empty array for an empty input", async () => {
    const { escapeHtmlBatch } = await importNativeEscape();

    expect(escapeHtmlBatch([])).toEqual([]);
  });

  test("is idempotent on already-escaped values", async () => {
    const { escapeHtmlBatch } = await importNativeEscape();

    expect(escapeHtmlBatch(["&amp;"])).toEqual(["&amp;amp;"]);
  });

  test("does not load optional native packages from the current working directory", async () => {
    const originalCwd = process.cwd();
    const unsafeCwd = await mkdtemp(join(tmpdir(), "mreact-native-escape-cwd-"));
    const fakePackageDir = join(unsafeCwd, "node_modules", "@reckona", "mreact-router-native");
    await mkdir(fakePackageDir, { recursive: true });
    await writeFile(
      join(fakePackageDir, "package.json"),
      JSON.stringify({ main: "index.cjs", type: "commonjs" }),
    );
    await writeFile(
      join(fakePackageDir, "index.cjs"),
      `module.exports = { escapeHtmlBatch: () => ["loaded-from-cwd"] };`,
    );

    try {
      process.chdir(unsafeCwd);
      const { escapeHtmlBatch } = await importNativeEscape();

      expect(escapeHtmlBatch(["<x>"])).toEqual(["&lt;x&gt;"]);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

async function importNativeEscape(): Promise<typeof import("../src/native-escape.js")> {
  vi.resetModules();
  return import("../src/native-escape.js");
}
