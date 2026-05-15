import { describe, expect, it } from "vitest";
import { formatRouterBenchmarkMarkdown } from "./report.js";
import type { BenchmarkEnvironment } from "../shared/types.js";
import type { RouterBenchmarkRow } from "./types.js";

describe("router benchmark report", () => {
  it("includes ranking tables for completed rows", () => {
    const rows: RouterBenchmarkRow[] = [
      completedRow("mreact-app-router", "app render 1000 nodes", "throughput", "ops/sec", 20),
      completedRow("next-app-router", "app render 1000 nodes", "throughput", "ops/sec", 10),
      completedRow("marko-run", "app client bundle gzip bytes (server-only page)", "size", "gzip bytes", 40),
      completedRow("qwik-city", "app client bundle gzip bytes (server-only page)", "size", "gzip bytes", 100),
    ];

    const markdown = formatRouterBenchmarkMarkdown(testEnvironment, rows);

    expect(markdown).toContain(
      "Renders a production app route that emits 1,000 simple text spans.",
    );
    expect(markdown).toContain("| 1 | mreact-app-router | app render 1000 nodes | 20 | ops/sec |");
    expect(markdown).toContain("| 1 | marko-run | app client bundle gzip bytes (server-only page) | 40 | gzip bytes |");
  });
});

const testEnvironment: BenchmarkEnvironment = {
  arch: "x64",
  cpuCount: 1,
  cpuModel: "test",
  date: "2026-05-15",
  gitCommit: "abc",
  nodeEnv: "production",
  nodeVersion: "v1",
  packageVersions: {},
  platform: "linux",
  pnpmVersion: "1",
  totalMemoryBytes: 1,
};

function completedRow(
  framework: RouterBenchmarkRow["framework"],
  caseName: RouterBenchmarkRow["caseName"],
  metric: RouterBenchmarkRow["metric"],
  unit: RouterBenchmarkRow["unit"],
  value: number,
): RouterBenchmarkRow {
  return {
    caseName,
    framework,
    metric,
    status: "completed",
    unit,
    value,
    version: "test",
  };
}
