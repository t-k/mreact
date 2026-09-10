import { describe, expect, it } from "vitest";
import { httpRowsFromTrials, httpBenchmarkCases, collectHttpRows } from "./runner-http.js";
import type { HttpTrial } from "./http-trial-types.js";
import { normalizeHttpOptions } from "./http-trial-types.js";

const adapter = { name: "mreact-app-router" as const, version: "test" };
const trial: HttpTrial = {
  methodologyVersion: 2,
  trialId: "trial-1",
  seriesId: "series-1",
  window: 0,
  options: normalizeHttpOptions({ profile: "burst" }),
  target: { url: "http://127.0.0.1:1/", serverPid: 123, requiredText: "ok", workload: {} },
  serverPid: 123,
  generatorPid: 124,
  orchestratorPid: 125,
  nodeVersion: process.version,
  client: "node:http HTTP/1.1 keep-alive, no pipelining",
  warmupRequests: 0,
  warmupElapsedMs: 0,
  status: "completed",
  throughputOps: 200,
  p50Ms: 1,
  p95Ms: 2,
  p99Ms: 3,
  rssBeforeBytes: 100,
  rssAfterBytes: 90,
  rssDeltaBytes: -10,
};

describe("HTTP same-trial reporting", () => {
  it("uses sorted medians for odd and even trial counts", () => {
    const trials = [90, 10, 30, 20].map((throughputOps) => ({ ...trial, throughputOps }));
    expect(httpRowsFromTrials(adapter, "burst", trials)[0]?.value).toBe(25);
    expect(httpRowsFromTrials(adapter, "burst", trials.slice(0, 3))[0]?.value).toBe(30);
    expect(httpRowsFromTrials(adapter, "burst", trials)[0]?.hz).toBe(25);
    expect(httpRowsFromTrials(adapter, "burst", trials)[1]?.hz).toBe(0);
    expect(httpRowsFromTrials(adapter, "burst", trials)[0]).toMatchObject({
      framework: adapter.name,
      version: "test",
      meanMs: 0,
      p75Ms: 0,
      p99Ms: 0,
    });
  });
  it("preserves an explicit setup failure even without trial data", () => {
    const rows = httpRowsFromTrials(adapter, "steady", [], new Error("setup failed"));
    expect(rows.every((row) => row.status === "failed" && row.value === 0 && row.hz === 0)).toBe(
      true,
    );
    expect(rows[0]?.note).toContain("setup failed");
    expect(rows.every((row) => row.caseName.includes("steady"))).toBe(true);
  });
  it("derives five unit-labelled rows from the same trial without invoking an adapter", () => {
    const rows = httpRowsFromTrials(adapter, "burst", [trial]);
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.value)).toEqual([200, 1, 2, 3, -10]);
    for (const row of rows) {
      expect(row.httpTrials).toEqual([trial]);
      expect(row.samplesMs).toBeUndefined();
      expect(row.samples).toEqual({ unit: row.unit, values: [row.value] });
    }
  });
  it("keeps raw trials and fails all derived metrics when any trial fails", () => {
    const failed: HttpTrial = { ...trial, trialId: "trial-2", status: "failed", error: "HTTP 503" };
    const rows = httpRowsFromTrials(adapter, "burst", [trial, failed]);
    expect(rows.every((row) => row.status === "failed")).toBe(true);
    expect(rows[0]?.httpTrials).toEqual([trial, failed]);
    expect(rows[0]?.note).toContain("HTTP 503");
    expect(rows[0]?.samples?.values).toEqual([200]);
  });
  it("separates new methodology names and reports missing targets as unsupported", async () => {
    expect(httpBenchmarkCases).toHaveLength(10);
    expect(httpBenchmarkCases.every((item) => item.name.includes("HTTP v2"))).toBe(true);
    const rows = await collectHttpRows([adapter]);
    expect(rows).toHaveLength(10);
    expect(rows.every((row) => row.status === "unsupported")).toBe(true);
    expect(rows.every((row) => row.value === 0)).toBe(true);
    expect(rows[0]?.note).toContain("Methodology v2");
  });
});
