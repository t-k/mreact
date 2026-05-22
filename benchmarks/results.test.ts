import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createDatedResultsDir } from "./shared/results.js";

describe("benchmark results", () => {
  test("creates a new numbered run directory for repeated runs on the same day", async () => {
    const resultsRoot = await mkdtemp(join(tmpdir(), "mreact-benchmark-results-"));
    const date = new Date("2026-05-20T12:00:00.000Z");

    const first = await createDatedResultsDir(date, { resultsRoot });
    const second = await createDatedResultsDir(date, { resultsRoot });

    expect(first).toBe(join(resultsRoot, "2026-05-20", "001"));
    expect(second).toBe(join(resultsRoot, "2026-05-20", "002"));
  });

  test("uses an explicit benchmark result directory when the workflow provides one", async () => {
    const resultsRoot = await mkdtemp(join(tmpdir(), "mreact-benchmark-results-"));
    const resultDir = join(resultsRoot, "2026-05-22", "001");
    await mkdir(resultDir, { recursive: true });
    const previous = process.env.MREACT_BENCHMARK_RESULTS_DIR;

    try {
      process.env.MREACT_BENCHMARK_RESULTS_DIR = resultDir;

      await expect(createDatedResultsDir()).resolves.toBe(resultDir);
    } finally {
      if (previous === undefined) {
        delete process.env.MREACT_BENCHMARK_RESULTS_DIR;
      } else {
        process.env.MREACT_BENCHMARK_RESULTS_DIR = previous;
      }
    }
  });
});
