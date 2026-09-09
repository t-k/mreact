import { measureHttpTrials } from "./http-trials.js";
import type { HttpTrial, HttpTrialOptions } from "./http-trial-types.js";
import type {
  RouterBenchmarkAdapter,
  RouterBenchmarkCaseName,
  RouterBenchmarkRow,
} from "./types.js";

const metrics = [
  { key: "throughputOps", label: "throughput", metric: "throughput", unit: "ops/sec" },
  { key: "p50Ms", label: "p50 latency", metric: "duration", unit: "ms" },
  { key: "p95Ms", label: "p95 latency", metric: "duration", unit: "ms" },
  { key: "p99Ms", label: "p99 latency", metric: "duration", unit: "ms" },
  { key: "rssDeltaBytes", label: "server RSS delta", metric: "memory", unit: "bytes" },
] as const;

export const httpBenchmarkCases = (["burst", "steady"] as const).flatMap((profile) =>
  metrics.map((item) => ({
    ...item,
    profile,
    name: `app HTTP v2 ${profile} ${item.label} (max 100 in-flight)` as RouterBenchmarkCaseName,
    description: `Isolated HTTP/1.1 ${profile} load. All five metrics derive from the same trials; workload and connection metadata are retained in JSON.`,
  })),
);

export function httpRowsFromTrials(
  adapter: RouterBenchmarkAdapter,
  profile: HttpTrialOptions["profile"],
  trials: HttpTrial[],
  error?: unknown,
): RouterBenchmarkRow[] {
  const failure =
    error === undefined ? trials.find((trial) => trial.status === "failed")?.error : String(error);
  return httpBenchmarkCases
    .filter((item) => item.profile === profile)
    .map((item) => {
      const values = trials
        .filter((trial) => trial.status === "completed")
        .map((trial) => trial[item.key]!);
      const failed = error !== undefined || trials.some((trial) => trial.status === "failed");
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      const value =
        sorted.length === 0
          ? 0
          : sorted.length % 2
            ? sorted[middle]!
            : (sorted[middle - 1]! + sorted[middle]!) / 2;
      return {
        framework: adapter.name,
        version: adapter.version,
        caseName: item.name,
        status: failed ? "failed" : trials.length ? "completed" : "unsupported",
        metric: item.metric,
        unit: item.unit,
        value: failed ? 0 : value,
        hz: !failed && item.metric === "throughput" ? value : 0,
        meanMs: 0,
        p75Ms: 0,
        p99Ms: 0,
        samples: { unit: item.unit, values },
        httpTrials: trials,
        note:
          failure ??
          "Methodology v2: median of trial metrics; single-server-PID RSS; not comparable to legacy concurrent probes. See httpTrials for workload differences and sequence.",
      };
    });
}

export async function collectHttpRows(
  adapters: readonly RouterBenchmarkAdapter[],
  overrides: Partial<Omit<HttpTrialOptions, "profile" | "windows">> = {},
): Promise<RouterBenchmarkRow[]> {
  const states = adapters.map((adapter) => ({
    adapter,
    burst: [] as HttpTrial[],
    steady: [] as HttpTrial[],
    burstError: undefined as unknown,
    steadyError: undefined as unknown,
  }));
  // Rotate whole burst trials, never individual metrics.
  for (let round = 0; round < 3; round++) {
    for (let index = 0; index < states.length; index++) {
      const state = states[(index + round) % states.length]!;
      if (
        !state.adapter.getHttpTarget ||
        state.burstError !== undefined ||
        state.burst.some((trial) => trial.status === "failed")
      )
        continue;
      try {
        const trials = await measureHttpTrials(await state.adapter.getHttpTarget(), {
          ...overrides,
          profile: "burst",
          windows: 1,
        });
        for (const trial of trials) trial.executionOrder = { round, position: index };
        state.burst.push(...trials);
      } catch (error) {
        state.burstError = String(error);
      }
    }
  }
  for (let index = 0; index < states.length; index++) {
    const state = states[index]!;
    if (!state.adapter.getHttpTarget) continue;
    try {
      state.steady = await measureHttpTrials(await state.adapter.getHttpTarget(), {
        ...overrides,
        profile: "steady",
        windows: 3,
      });
      for (const trial of state.steady)
        trial.executionOrder = { round: trial.window, position: index };
    } catch (error) {
      state.steadyError = String(error);
    }
  }
  return states.flatMap((state) => [
    ...httpRowsFromTrials(state.adapter, "burst", state.burst, state.burstError),
    ...httpRowsFromTrials(state.adapter, "steady", state.steady, state.steadyError),
  ]);
}
