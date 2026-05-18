import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("router package entrypoints", () => {
  test("exposes stable session and native escape subpaths for workspace integrations", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "router", "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(manifest.exports).toHaveProperty("./session");
    expect(manifest.exports).toHaveProperty("./native-escape");
  });

  test("exposes app-router global types for Slot layouts", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "router", "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(manifest.exports).toHaveProperty("./app-router-globals");
  });
});
