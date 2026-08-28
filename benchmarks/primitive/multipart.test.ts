import { describe, expect, test } from "vitest";
import {
  createMultipartBenchmarkScenarios,
  formatMultipartBenchmarkRows,
  measureMultipartScenario,
  runMultipartScenario,
} from "./multipart-core.js";

describe("multipart benchmark harness", () => {
  test("validates production parser output before recording samples", async () => {
    const scenario = createMultipartBenchmarkScenarios({
      largeFileBytes: 1_024,
      manyPartBytes: 64,
      manyPartCount: 3,
    })[0]!;

    const result = await runMultipartScenario(scenario);

    expect(result).toMatchObject({
      bytes: 1_024,
      parts: 1,
    });
    expect(result.checksum).toBeGreaterThan(0);
  });

  test("validates every benchmark scenario through the production parser", async () => {
    const scenarios = createMultipartBenchmarkScenarios({
      largeFileBytes: 2_048,
      manyPartBytes: 32,
      manyPartCount: 4,
    });

    expect(scenarios.map((scenario) => scenario.name)).toEqual([
      "large-file",
      "many-parts",
      "small-form",
      "prefix-heavy",
    ]);

    for (const scenario of scenarios) {
      const result = await runMultipartScenario(scenario);
      expect(result).toEqual({
        bytes: scenario.expectedBytes,
        checksum: scenario.expectedChecksum,
        partDescriptors: scenario.expectedPartDescriptors,
        parts: scenario.expectedParts,
      });
    }
  });

  test("records raw samples and percentile summaries", async () => {
    const scenario = createMultipartBenchmarkScenarios({
      largeFileBytes: 256,
      manyPartBytes: 16,
      manyPartCount: 2,
    })[0]!;

    const row = await measureMultipartScenario({
      measuredRuns: 3,
      scenario,
      warmupRuns: 1,
    });

    expect(row.status).toBe("completed");
    expect(row.samples).toHaveLength(3);
    expect(row.summary).toMatchObject({ count: 3 });
  });

  test("formats environment, p99, and raw samples in Markdown", () => {
    const markdown = formatMultipartBenchmarkRows(
      [
        {
          suite: "multipart",
          framework: "mreact",
          version: "local",
          caseName: "large-file",
          status: "completed",
          metric: "duration",
          unit: "ms",
          value: 2,
          summary: {
            count: 3,
            min: 1,
            max: 3,
            mean: 2,
            median: 2,
            medianAbsoluteDeviation: 1,
            p75: 2.5,
            p95: 2.9,
            p99: 2.98,
            standardDeviation: 1,
          },
          samples: [1, 2, 3],
          notes: ["chunkBytes=65536", "primary=true"],
        },
      ],
      {
        date: "2026-08-28T00:00:00.000Z",
        gitCommit: "abc123",
        nodeVersion: "v24.0.0",
        nodeEnv: "production",
        pnpmVersion: "10.0.0",
        platform: "darwin",
        arch: "arm64",
        cpuModel: "test-cpu",
        cpuCount: 8,
        totalMemoryBytes: 1024,
        packageVersions: { "@reckona/mreact-router": "0.0.0" },
      },
    );

    expect(markdown).toContain("p99 ms");
    expect(markdown).toContain("1, 2, 3");
    expect(markdown).toContain("test-cpu");
  });
});
