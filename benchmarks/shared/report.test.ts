import { describe, expect, it } from "vitest";
import { formatBenchmarkMarkdown } from "./report.js";
import type { BenchmarkEnvironment, BenchmarkRow } from "./types.js";

const env: BenchmarkEnvironment = {
  date: "2026-05-15",
  gitCommit: "abc123",
  nodeVersion: "v20.19.0",
  pnpmVersion: "10.19.0",
  platform: "linux",
  arch: "x64",
  cpuModel: "Test CPU",
  cpuCount: 8,
  totalMemoryBytes: 16,
  packageVersions: {
    react: "19.2.6",
  },
};

describe("formatBenchmarkMarkdown", () => {
  it("renders environment and benchmark rows", () => {
    const rows: BenchmarkRow[] = [
      {
        suite: "primitive",
        framework: "react",
        version: "19.2.6",
        caseName: "create 1k rows",
        status: "completed",
        metric: "duration",
        unit: "ms",
        value: 12.34,
        notes: ["validated DOM output"],
      },
    ];

    expect(formatBenchmarkMarkdown("Primitive Benchmark", env, rows)).toContain(
      "| primitive | react | 19.2.6 | create 1k rows | completed | duration | ms | 12.34 | validated DOM output |",
    );
  });
});
