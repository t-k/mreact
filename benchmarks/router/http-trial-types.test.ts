import { describe, expect, it } from "vitest";
import { normalizeHttpOptions, summarizeHttpLoad } from "./http-trial-types.js";

describe("HTTP workload and statistics", () => {
  it("uses explicit burst and steady defaults", () => {
    expect(normalizeHttpOptions({ profile: "burst" })).toEqual({
      profile: "burst",
      concurrency: 100,
      totalRequests: 200,
      warmupMs: 0,
      durationMs: 5000,
      windows: 3,
      requestTimeoutMs: 10000,
    });
    expect(normalizeHttpOptions({ profile: "steady" }).warmupMs).toBe(2000);
    expect(normalizeHttpOptions({ profile: "burst", warmupMs: 50 }).warmupMs).toBe(0);
  });
  it.each(["concurrency", "totalRequests", "durationMs", "windows", "requestTimeoutMs"] as const)(
    "validates %s",
    (key) => {
      for (const value of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
        expect(() => normalizeHttpOptions({ profile: "steady", [key]: value })).toThrow(
          `invalid HTTP ${key}`,
        );
      expect(normalizeHttpOptions({ profile: "steady", [key]: 1 })[key]).toBe(1);
    },
  );
  it("checks profile and warmup boundaries", () => {
    expect(() => normalizeHttpOptions({ profile: "wrong" as "burst" })).toThrow("profile");
    for (const value of [-1, 0.5, NaN, Infinity])
      expect(() => normalizeHttpOptions({ profile: "steady", warmupMs: value })).toThrow(
        "warmupMs",
      );
    expect(normalizeHttpOptions({ profile: "steady", warmupMs: 0 }).warmupMs).toBe(0);
  });
  it.each([
    ["concurrency", 1000],
    ["windows", 100],
    ["totalRequests", 1000000],
    ["durationMs", 60000],
    ["warmupMs", 60000],
    ["requestTimeoutMs", 60000],
  ] as const)("bounds %s workload", (key, limit) => {
    expect(normalizeHttpOptions({ profile: "steady", [key]: limit })[key]).toBe(limit);
    expect(() => normalizeHttpOptions({ profile: "steady", [key]: limit + 1 })).toThrow(
      "safety limits",
    );
  });
  it("uses nearest-rank percentiles without mutating raw latency order", () => {
    const latenciesMs = Array.from({ length: 100 }, (_, index) => 100 - index);
    expect(
      summarizeHttpLoad({
        latenciesMs,
        requestCount: 100,
        elapsedMs: 250,
        connectionsOpened: 1,
        reusedRequests: 99,
      }),
    ).toEqual({ throughputOps: 400, p50Ms: 50, p95Ms: 95, p99Ms: 99 });
    expect(latenciesMs[0]).toBe(100);
    expect(
      summarizeHttpLoad({
        latenciesMs: [0],
        requestCount: 1,
        elapsedMs: 1,
        connectionsOpened: 1,
        reusedRequests: 0,
      }).p50Ms,
    ).toBe(0);
  });
  it("rejects empty, inconsistent, nonfinite and negative samples", () => {
    const base = {
      latenciesMs: [1],
      requestCount: 1,
      elapsedMs: 1,
      connectionsOpened: 1,
      reusedRequests: 0,
    };
    for (const change of [
      { requestCount: 2, latenciesMs: [1, -1] },
      { requestCount: 2 },
      { requestCount: 0, latenciesMs: [] },
      { elapsedMs: 0 },
      { elapsedMs: -1 },
      { elapsedMs: NaN },
      { elapsedMs: Infinity },
      { latenciesMs: [-1] },
      { latenciesMs: [NaN] },
      { latenciesMs: [Infinity] },
    ])
      expect(() => summarizeHttpLoad({ ...base, ...change })).toThrow("invalid HTTP load result");
  });
});
