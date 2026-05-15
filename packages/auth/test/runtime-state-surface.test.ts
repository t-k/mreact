import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("auth runtime state surface", () => {
  test("uses the shared runtime state helper instead of casting globalThis locally", async () => {
    const source = await readFile(
      join(process.cwd(), "packages", "auth", "src", "index.ts"),
      "utf8",
    );

    expect(source).toContain("getGlobalRuntimeState");
    expect(source).not.toContain("globalThis as typeof globalThis &");
  });
});
