import { describe, expect, it } from "vitest";
import { httpOutputArtifacts } from "./http-artifacts.js";
import { httpRowsFromTrials } from "./runner-http.js";
import type { HttpTrial } from "./http-trial-types.js";
import { normalizeHttpOptions } from "./http-trial-types.js";

describe("HTTP raw artifacts", () => {
  it("stores latency samples once and links all metric rows without losing failed trial metadata", () => {
    const trial: HttpTrial = {
      methodologyVersion: 2,
      trialId: "id",
      seriesId: "series",
      window: 0,
      status: "failed",
      error: "cleanup failed",
      options: normalizeHttpOptions({ profile: "burst" }),
      target: { url: "http://127.0.0.1/", serverPid: 123, requiredText: "ok", workload: {} },
      serverPid: 123,
      orchestratorPid: 124,
      nodeVersion: process.version,
      client: "node:http HTTP/1.1 keep-alive, no pipelining",
      warmupRequests: 0,
      warmupElapsedMs: 0,
      latenciesMs: [1, 2, 3],
    };
    const rows = httpRowsFromTrials({ name: "mreact-app-router", version: "test" }, "burst", [
      trial,
    ]);
    const output = httpOutputArtifacts(rows);
    expect(output.trials).toEqual([trial]);
    expect(output.rows).toHaveLength(5);
    expect(output.rows.every((row) => row.httpTrials?.[0]?.latenciesMs === undefined)).toBe(true);
    expect(output.rows[0]?.httpTrials?.[0]).toMatchObject({
      error: "cleanup failed",
      latencySamplesRef: "router.http-trials.json#id",
    });
    expect(rows[0]?.httpTrials?.[0]?.latenciesMs).toEqual([1, 2, 3]);
  });
});
