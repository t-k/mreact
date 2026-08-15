import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("@reckona/mreact-auth README contract", () => {
  test("reads user data from the documented SessionRecord field", async () => {
    const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

    expect(readme).toContain("session?.data");
    expect(readme).not.toContain("session?.claims");
  });
});
