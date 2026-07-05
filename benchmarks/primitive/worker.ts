import { primitiveCases } from "./cases.js";
import { createBenchmarkDom } from "./dom.js";
import { registerPrimitiveBenchmarkAliases } from "./register-aliases.js";
import { collectPrimitiveCaseSamples, primitiveRunnerDefaults } from "./runner.js";
import type { PrimitiveAdapter, PrimitiveCaseDefinition } from "./types.js";
import { summarizeSamples } from "../shared/stats.js";
import type { BenchmarkRow } from "../shared/types.js";

registerPrimitiveBenchmarkAliases(new URL(import.meta.url));

const { primitiveAdapters } = await import("./adapters/index.js");
const adapter = findAdapter(primitiveAdapters, requireEnv("BENCH_PRIMITIVE_ADAPTER"));
const benchmarkCase = findCase(requireEnv("BENCH_PRIMITIVE_CASE"));
const count = parsePositiveInteger(requireEnv("BENCH_PRIMITIVE_COUNT"), "BENCH_PRIMITIVE_COUNT");
const warmupRuns = parseNonNegativeInteger(
  process.env.BENCH_PRIMITIVE_WARMUP_RUNS ?? String(primitiveRunnerDefaults.warmupRuns),
  "BENCH_PRIMITIVE_WARMUP_RUNS",
);
const measuredRuns = parseNonNegativeInteger(
  process.env.BENCH_PRIMITIVE_MEASURED_RUNS ?? String(primitiveRunnerDefaults.measuredRuns),
  "BENCH_PRIMITIVE_MEASURED_RUNS",
);
const runCase = adapter.cases[benchmarkCase.name];

let row: BenchmarkRow;

if (runCase === undefined) {
  row = {
    suite: "primitive",
    framework: adapter.name,
    version: adapter.version,
    caseName: benchmarkCase.name,
    status: "unsupported",
    metric: benchmarkCase.metric,
    unit: benchmarkCase.unit,
    value: 0,
    notes: ["adapter does not implement this case"],
  };
} else {
  const result = await collectPrimitiveCaseSamples(
    () => ({ ...createBenchmarkDom(), count }),
    runCase,
    {
      measuredRuns,
      sampleBatchSize: benchmarkCase.sampleBatchSize,
      warmupRuns,
    },
  );
  const summary = summarizeSamples(result.samples);
  const notes = [
    ...(result.notes ?? []),
    ...negativeSampleNotes(benchmarkCase.metric, result.samples),
  ];

  row = {
    suite: "primitive",
    framework: adapter.name,
    version: adapter.version,
    caseName: benchmarkCase.name,
    status: "completed",
    metric: benchmarkCase.metric,
    unit: benchmarkCase.unit,
    value: summary.median,
    summary,
    samples: result.samples,
    notes: notes.length > 0 ? notes : undefined,
  };
}

process.stdout.write(`${JSON.stringify(row)}\n`);

function findAdapter(adapters: readonly PrimitiveAdapter[], name: string): PrimitiveAdapter {
  const adapter = adapters.find((candidate) => candidate.name === name);

  if (adapter === undefined) {
    throw new Error(`Unknown primitive adapter: ${name}`);
  }

  return adapter;
}

function findCase(name: string): PrimitiveCaseDefinition {
  const benchmarkCase = primitiveCases.find((candidate) => candidate.name === name);

  if (benchmarkCase === undefined) {
    throw new Error(`Unknown primitive case: ${name}`);
  }

  return benchmarkCase;
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function parseNonNegativeInteger(value: string, name: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}

function negativeSampleNotes(metric: PrimitiveCaseDefinition["metric"], samples: readonly number[]): string[] {
  if (metric !== "memory") {
    return [];
  }

  const negativeCount = samples.filter((sample) => sample < 0).length;
  if (negativeCount === 0) {
    return [];
  }

  return [`${negativeCount}/${samples.length} samples negative`];
}
