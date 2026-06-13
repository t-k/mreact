import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("UI primitive compat package script", () => {
  test("exposes a compat-lab runner script", async () => {
    const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["compat-lab:ui-primitives"]).toBe(
      "pnpm build && tsx compat-lab/ui-primitives/runner.ts",
    );
  });
});
