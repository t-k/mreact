import {
  measureBrowserTrial,
  type BrowserProfile,
  type BrowserTrial,
  type BrowserInteraction,
} from "./browser-trials.js";
import type {
  RouterBenchmarkAdapter,
  RouterBenchmarkCaseName,
  RouterBenchmarkRow,
} from "./types.js";

const definitions = [
  ["domcontentloaded", "initial content observed", (t: BrowserTrial) => t.initialContentMs],
  [
    "domcontentloaded",
    "navigation to first verified update",
    (t: BrowserTrial) => t.navigationToVerifiedMs,
  ],
  ["domcontentloaded", "first click E2E", (t: BrowserTrial) => t.first?.e2eMs],
  ["domcontentloaded", "first click event-to-DOM", (t: BrowserTrial) => t.first?.eventToDomMs],
  ["networkidle", "first click E2E", (t: BrowserTrial) => t.first?.e2eMs],
  ["networkidle", "first click event-to-DOM", (t: BrowserTrial) => t.first?.eventToDomMs],
  ["networkidle", "second click E2E", (t: BrowserTrial) => t.second?.e2eMs],
  ["networkidle", "second click event-to-DOM", (t: BrowserTrial) => t.second?.eventToDomMs],
] as const;

export const browserBenchmarkCases = definitions.map(([profile, label, read]) => ({
  profile,
  read,
  name: `app browser v2 ${profile} ${label}` as RouterBenchmarkCaseName,
  metric: "duration" as const,
  unit: "ms" as const,
  description: `Verified ${label} in a fresh ${profile} trial. SSR content is checked separately with JavaScript disabled. E2E includes Playwright; event-to-DOM includes observer delivery, not paint or INP.`,
}));

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validInteraction(value: BrowserInteraction | undefined): value is BrowserInteraction {
  return (
    !!value &&
    [value.dispatchMs, value.domObservedMs, value.eventToDomMs, value.e2eMs].every(validNumber) &&
    value.domObservedMs >= value.dispatchMs &&
    Math.abs(value.eventToDomMs - (value.domObservedMs - value.dispatchMs)) < 0.001 &&
    value.e2eMs >= value.eventToDomMs
  );
}

export function validBrowserTrial(trial: BrowserTrial, profile: BrowserProfile): boolean {
  return (
    trial.status === "completed" &&
    trial.error === undefined &&
    trial.diagnostics.length === 0 &&
    trial.profile === profile &&
    trial.ssrVerified === true &&
    (profile !== "networkidle" || trial.networkIdleReached === true) &&
    validNumber(trial.initialContentMs) &&
    validNumber(trial.domContentLoadedMs) &&
    validInteraction(trial.first) &&
    validInteraction(trial.second) &&
    trial.first.dispatchMs >= trial.initialContentMs &&
    trial.second.dispatchMs >= trial.first.domObservedMs &&
    trial.navigationToVerifiedMs === trial.first.domObservedMs
  );
}

export function browserRowsFromTrials(
  adapter: RouterBenchmarkAdapter,
  profile: BrowserProfile,
  trials: BrowserTrial[],
  error?: unknown,
): RouterBenchmarkRow[] {
  const invalid = trials.find((trial) => !validBrowserTrial(trial, profile));
  const failed = error !== undefined || invalid !== undefined;
  return browserBenchmarkCases
    .filter((item) => item.profile === profile)
    .map((item) => {
      const values = trials
        .filter((trial) => validBrowserTrial(trial, profile))
        .map((trial) => item.read(trial)!);
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      const median = sorted.length
        ? sorted.length % 2
          ? sorted[middle]!
          : (sorted[middle - 1]! + sorted[middle]!) / 2
        : 0;
      return {
        framework: adapter.name,
        version: adapter.version,
        caseName: item.name,
        status: failed ? "failed" : trials.length ? "completed" : "unsupported",
        metric: "duration",
        unit: "ms",
        value: failed ? 0 : median,
        hz: 0,
        meanMs: 0,
        p75Ms: 0,
        p99Ms: 0,
        samples: { unit: "ms", values },
        browserTrials: trials,
        note:
          error !== undefined
            ? String(error)
            : invalid
              ? (invalid.error ?? "Invalid completed browser trial")
              : trials.length
                ? "Browser methodology v2: median of same-trial metrics. DOM observation is not paint, INP or exact hydration completion; see browserTrials for boundaries and verification."
                : "Adapter does not expose a browser target for verified interaction trials.",
      };
    });
}

export async function collectBrowserRows(
  adapters: readonly RouterBenchmarkAdapter[],
  options: { rounds?: number; timeoutMs?: number } = {},
): Promise<RouterBenchmarkRow[]> {
  const rounds = options.rounds ?? 5;
  if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 20)
    throw new Error("Invalid browser trial rounds");
  const states = adapters.flatMap((adapter) =>
    (["domcontentloaded", "networkidle"] as const).map((profile) => ({
      adapter,
      profile,
      trials: [] as BrowserTrial[],
      error: undefined as unknown,
    })),
  );
  for (let round = 0; round < rounds; round++) {
    for (let position = 0; position < states.length; position++) {
      const state = states[(position + round) % states.length]!;
      if (
        !state.adapter.getBrowserTarget ||
        state.error !== undefined ||
        state.trials.some((t) => t.status === "failed")
      )
        continue;
      try {
        const trial = await measureBrowserTrial(
          await state.adapter.getBrowserTarget(),
          state.profile,
          options,
        );
        trial.executionOrder = { round, position };
        state.trials.push(trial);
      } catch (error) {
        state.error = String(error);
      }
    }
  }
  return states.flatMap((state) =>
    browserRowsFromTrials(state.adapter, state.profile, state.trials, state.error),
  );
}
