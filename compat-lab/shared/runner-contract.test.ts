import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const runnerPaths = [
  "compat-lab/recharts/runner.ts",
  "compat-lab/radix/runner.ts",
  "compat-lab/react-flow/runner.ts",
  "compat-lab/ui-primitives/runner.ts",
];

describe("compat lab runner fail-closed wiring", () => {
  for (const runnerPath of runnerPaths) {
    test(`${runnerPath} persists results before enforcing success`, async () => {
      const source = await readFile(join(process.cwd(), runnerPath), "utf8");
      const writeIndex = source.indexOf("await writeRunSummary({ outputDir, runId, results });");
      const assertIndex = source.indexOf("assertCompatLabPassed({");

      expect(writeIndex).toBeGreaterThan(-1);
      expect(assertIndex).toBeGreaterThan(writeIndex);
      expect(source).toContain("main().catch((error: unknown) => {");
      expect(source).toContain("process.exitCode = 1;");
    });
  }
});
