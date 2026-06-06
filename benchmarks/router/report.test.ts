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
    expect(markdown).toContain(
      "| rank | framework | case | value | diff vs 1st | unit |",
    );
    expect(markdown).toContain(
      "| 1 | **mreact-app-router** | app render 1000 nodes | 20 | best | ops/sec |",
    );
    expect(markdown).toContain(
      "| 2 | next-app-router | app render 1000 nodes | 10 | -50% | ops/sec |",
    );
    expect(markdown).toContain(
      "| 1 | marko-run | app client bundle gzip bytes (server-only page) | 40 | best | gzip bytes |",
    );
    expect(markdown).toContain(
      "| 2 | qwik-city | app client bundle gzip bytes (server-only page) | 100 | +150% | gzip bytes |",
    );
  });

  it("includes raw samples in the results table when rows provide them", () => {
    const rows: RouterBenchmarkRow[] = [
      {
        ...completedRow(
          "mreact-app-router",
          "app streaming first byte 1000 nodes",
          "duration",
          "ms",
          8,
        ),
        samplesMs: [7.5, 8, 8.5],
      },
    ];

    const markdown = formatRouterBenchmarkMarkdown(testEnvironment, rows);

    expect(markdown).toContain(
      "| router | mreact-app-router | test | app streaming first byte 1000 nodes | completed | duration | ms | 8 | best | 0 | 0 | 0 | 0 | 0 | 7.5, 8, 8.5 |  |",
    );
  });

  it("annotates server cold start rankings when they are only mreact variant comparisons", () => {
    const rows: RouterBenchmarkRow[] = [
      completedRow("mreact-app-router", "app server cold start", "duration", "ms", 200),
      completedRow(
        "mreact-app-router+mreact react-compat",
        "app server cold start",
        "duration",
        "ms",
        240,
      ),
      completedRow(
        "mreact-app-router+log enabled",
        "app server cold start",
        "duration",
        "ms",
        210,
      ),
    ];

    const markdown = formatRouterBenchmarkMarkdown(testEnvironment, rows);

    expect(markdown).toContain(
      "This section currently compares mreact app-router variants only; it is not a cross-framework ranking.",
    );
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
