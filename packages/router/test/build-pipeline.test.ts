import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("router build pipeline", () => {
  test("does not import esbuild directly from router source files", async () => {
    const sourceDir = join(process.cwd(), "packages", "router", "src");
    const offenders: string[] = [];

    for (const file of await collectSourceFiles(sourceDir)) {
      const source = await readFile(file, "utf8");

      if (/\bfrom\s+["']esbuild["']/.test(source)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(path)));
      continue;
    }

    if (entry.isFile() && /\.(?:mreact\.)?[cm]?[jt]sx?$/.test(entry.name)) {
      files.push(path);
    }
  }

  return files;
}
