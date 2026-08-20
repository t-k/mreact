import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);

const testSourcePattern = /\.tsx?$/;

const collectTypeScriptFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectTypeScriptFiles(path);
      }
      return testSourcePattern.test(entry.name) ? [path] : [];
    }),
  );
  return files.flat();
};

describe("package test typecheck graph", () => {
  test("discovers every TypeScript test source in every package", async () => {
    const rootDir = process.cwd();
    const packagesDir = join(rootDir, "packages");
    const packageEntries = await readdir(packagesDir, { withFileTypes: true });
    const expectedFiles = (
      await Promise.all(
        packageEntries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const testDir = join(packagesDir, entry.name, "test");
            try {
              return await collectTypeScriptFiles(testDir);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return [];
              }
              throw error;
            }
          }),
      )
    )
      .flat()
      .map((file) => relative(rootDir, file))
      .sort();

    const { stdout } = await execFileAsync(
      process.execPath,
      [join(rootDir, "scripts", "typecheck-package-tests.mjs"), "--list-files"],
      { cwd: rootDir },
    );
    const discoveredFiles = stdout.trim().split("\n").filter(Boolean).sort();

    expect(discoveredFiles).toEqual(expectedFiles);
    expect(discoveredFiles).toContain(
      "packages/reactive-dom/test/dom-prop-application.types.ts",
    );
  });

  test("exposes the package test graph through a root script", async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));

    expect(packageJson.scripts.typecheck).toBe("pnpm typecheck:tests");
    expect(packageJson.scripts["typecheck:tests"]).toBe(
      "pnpm build && node scripts/typecheck-package-tests.mjs",
    );
  });
});
