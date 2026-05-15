import { describe, expect, it } from "vitest";
import { routerBenchmarkAdapters } from "./adapters/index.js";
import { routerBenchmarkCases, rankCompletedRows } from "./runner.js";
import type { RouterBenchmarkRow } from "./types.js";

describe("router benchmark configuration", () => {
  it("includes every planned router/app framework adapter", () => {
    expect(routerBenchmarkAdapters.map((adapter) => adapter.name)).toEqual([
      "marko-run",
      "qwik-city",
      "solid-start",
      "tanstack-start",
      "next-app-router",
      "mreact-app-router",
    ]);
  });

  it("covers render, streaming, dynamic attributes, and client bundle cases", () => {
    expect(routerBenchmarkCases.map((benchmarkCase) => benchmarkCase.name)).toEqual([
      "app render 1000 nodes",
      "app streaming 1000 nodes",
      "app real streaming 1000 nodes (async 50ms)",
      "app dynamic-attr grid 200 cells",
      "app client bundle gzip bytes (server-only page)",
      "app client bundle gzip bytes (interactive page)",
      "app client bundle gzip bytes (interactive page, minimal opt-out)",
    ]);
  });

  it("ranks throughput high-to-low and size low-to-high", () => {
    const rows: RouterBenchmarkRow[] = [
      completedRow("next-app-router", "app render 1000 nodes", "throughput", "ops/sec", 10),
      completedRow("mreact-app-router", "app render 1000 nodes", "throughput", "ops/sec", 20),
      completedRow("qwik-city", "app client bundle gzip bytes (server-only page)", "size", "gzip bytes", 100),
      completedRow("marko-run", "app client bundle gzip bytes (server-only page)", "size", "gzip bytes", 40),
    ];

    expect(rankCompletedRows(rows, "app render 1000 nodes").map((row) => row.framework)).toEqual([
      "mreact-app-router",
      "next-app-router",
    ]);
    expect(rankCompletedRows(rows, "app client bundle gzip bytes (server-only page)").map((row) => row.framework)).toEqual([
      "marko-run",
      "qwik-city",
    ]);
  });

  it("breaks rounded throughput ties by lower mean latency", () => {
    const rows: RouterBenchmarkRow[] = [
      {
        ...completedRow("marko-run", "app real streaming 1000 nodes (async 50ms)", "throughput", "ops/sec", 20),
        meanMs: 51.1,
      },
      {
        ...completedRow("mreact-app-router", "app real streaming 1000 nodes (async 50ms)", "throughput", "ops/sec", 20),
        meanMs: 51,
      },
    ];

    expect(
      rankCompletedRows(rows, "app real streaming 1000 nodes (async 50ms)").map(
        (row) => row.framework,
      ),
    ).toEqual(["mreact-app-router", "marko-run"]);
  });
});

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
