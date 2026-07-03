import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("publish packages script", () => {
  test("publishes packages in dependency levels instead of one strict serial loop", async () => {
    const source = await readFile(join(process.cwd(), "scripts", "publish-packages.mjs"), "utf8");

    expect(source).toContain("groupPackagesByDependencyLevel");
    expect(source).toContain("for (const packageLevel of groupPackagesByDependencyLevel");
    expect(source).toContain("Promise.all(packageLevel.map");
  });
});
