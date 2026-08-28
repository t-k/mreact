import { join } from "node:path";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";
import type { BenchmarkRow } from "../shared/types.js";
import {
  createMultipartBenchmarkScenarios,
  formatMultipartBenchmarkRows,
  measureMultipartScenario,
} from "./multipart-core.js";

const warmupRuns = readPositiveIntegerEnv("MREACT_MULTIPART_BENCH_WARMUPS", 5);
const measuredRuns = readPositiveIntegerEnv("MREACT_MULTIPART_BENCH_RUNS", 30);
const rows: BenchmarkRow[] = [];

for (const scenario of createMultipartBenchmarkScenarios()) {
  rows.push(await measureMultipartScenario({ measuredRuns, scenario, warmupRuns }));
}

const env = await collectBenchmarkEnvironment(["@reckona/mreact-router"]);
const dir = await createDatedResultsDir();
const markdown = formatMultipartBenchmarkRows(rows, env);

await writeJsonFile(join(dir, "multipart.summary.json"), rows);
await writeTextFile(join(dir, "multipart.md"), markdown);

console.log(markdown);

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];

  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number(raw);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
