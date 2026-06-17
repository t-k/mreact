import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = new URL("../../..", import.meta.url);
const utilityPackages = ["query", "virtual", "forms"] as const;
const forbiddenRuntimeDependencies = [
  "@reckona/mreact-compat",
  "@reckona/mreact-react",
  "@reckona/mreact-react-dom",
  "@reckona/mreact-react-compat",
  "@reckona/mreact-devtools",
  "react",
  "react-dom",
] as const;

function readPackageJson(packageName: (typeof utilityPackages)[number]): {
  dependencies?: Record<string, string>;
} {
  return JSON.parse(
    readFileSync(new URL(`packages/${packageName}/package.json`, repoRoot), "utf8"),
  ) as { dependencies?: Record<string, string> };
}

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return listSourceFiles(path);
    }

    return path.endsWith(".ts") ? [path] : [];
  });
}

describe("utility package boundaries", () => {
  test("query, virtual, and forms avoid React compatibility runtime dependencies", () => {
    for (const packageName of utilityPackages) {
      const packageJson = readPackageJson(packageName);
      const dependencies = Object.keys(packageJson.dependencies ?? {});

      for (const forbiddenDependency of forbiddenRuntimeDependencies) {
        expect(dependencies, packageName).not.toContain(forbiddenDependency);
      }
    }
  });

  test("query, virtual, and forms source files do not import runtime compatibility modules", () => {
    const forbiddenImportPattern = new RegExp(
      `(?:from\\s+|import\\s+)["'](?:${forbiddenRuntimeDependencies.map(escapeRegExp).join("|")})(?:/[^"']*)?["']`,
    );

    for (const packageName of utilityPackages) {
      const sourceDirectory = new URL(`packages/${packageName}/src`, repoRoot);
      const importedForbiddenModules = listSourceFiles(sourceDirectory.pathname).filter((file) =>
        forbiddenImportPattern.test(readFileSync(file, "utf8")),
      );

      expect(importedForbiddenModules, packageName).toEqual([]);
    }
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
