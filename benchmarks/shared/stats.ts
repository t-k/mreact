import type { SampleSummary } from "./types.js";

export function summarizeSamples(samples: readonly number[]): SampleSummary {
  if (samples.length === 0) {
    throw new Error("summarizeSamples requires at least one sample");
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance =
    samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    samples.length;

  return {
    count: samples.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean: round(mean),
    median: round(percentile(sorted, 0.5)),
    p75: round(percentile(sorted, 0.75)),
    p95: round(percentile(sorted, 0.95)),
    standardDeviation: round(Math.sqrt(variance)),
  };
}

function percentile(sorted: readonly number[], ratio: number): number {
  const index = Math.ceil(sorted.length * ratio) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))]!;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
