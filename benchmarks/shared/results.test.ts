import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { writeJsonFile } from "./results.js";

describe("writeJsonFile", () => {
  it("rejects values that are not JSON serializable", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-benchmark-results-"));

    try {
      await expect(
        writeJsonFile(join(dir, "result.json"), undefined),
      ).rejects.toThrow("JSON serializable");
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
});
