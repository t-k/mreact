import type { HttpTrial } from "./http-trial-types.js";
import type { RouterBenchmarkRow } from "./types.js";

/** Keep large raw arrays once, rather than duplicating them for all five metric rows. */
export function httpOutputArtifacts(rows: readonly RouterBenchmarkRow[]) {
  const trials = new Map<string, HttpTrial>();
  const summaries = rows.map((row) => {
    if (!row.httpTrials) return row;
    return {
      ...row,
      httpTrials: row.httpTrials.map((trial) => {
        trials.set(trial.trialId, trial);
        const { latenciesMs: _latencies, ...metadata } = trial;
        return { ...metadata, latencySamplesRef: `router.http-trials.json#${trial.trialId}` };
      }),
    };
  });
  return { rows: summaries, trials: [...trials.values()] };
}
