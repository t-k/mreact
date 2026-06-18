import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("React Flow compat lab package script", () => {
  test("exposes a compat-lab runner script", async () => {
    const packageJson = JSON.parse(
      await readFile(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["compat-lab:react-flow"]).toBe(
      "pnpm build && tsx compat-lab/react-flow/runner.ts",
    );
  });
});
