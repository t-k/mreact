import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { BenchmarkRow } from "../shared/types.js";
import type { PrimitiveAdapter, PrimitiveCaseDefinition } from "./types.js";

interface WorkerOptions {
  adapter: PrimitiveAdapter;
  benchmarkCase: PrimitiveCaseDefinition;
  warmupRuns?: number;
  measuredRuns?: number;
}

export async function runPrimitiveBenchmarkWorker({
  adapter,
  benchmarkCase,
  warmupRuns,
  measuredRuns,
}: WorkerOptions): Promise<BenchmarkRow> {
  const workerPath = fileURLToPath(new URL("./worker.ts", import.meta.url));
  const child = spawn(process.execPath, buildPrimitiveWorkerArgs({ benchmarkCase, workerPath }), {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BENCH_PRIMITIVE_ADAPTER: adapter.name,
      BENCH_PRIMITIVE_CASE: benchmarkCase.name,
      BENCH_PRIMITIVE_COUNT: String(benchmarkCase.count),
      BENCH_PRIMITIVE_METRIC: benchmarkCase.metric,
      BENCH_PRIMITIVE_UNIT: benchmarkCase.unit,
      ...(warmupRuns === undefined ? {} : { BENCH_PRIMITIVE_WARMUP_RUNS: String(warmupRuns) }),
      ...(measuredRuns === undefined
        ? {}
        : { BENCH_PRIMITIVE_MEASURED_RUNS: String(measuredRuns) }),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code, signal) => resolve({ code, signal }));
    },
  );

  if (exit.code !== 0) {
    const status = exit.signal === null ? `exit code ${exit.code}` : `signal ${exit.signal}`;
    throw new Error(
      `primitive worker failed for ${adapter.name} / ${benchmarkCase.name} with ${status}\n${stderr}${stdout}`,
    );
  }

  return parseWorkerRow(stdout, adapter.name, benchmarkCase.name);
}

export function buildPrimitiveWorkerArgs({
  benchmarkCase,
  workerPath,
}: {
  benchmarkCase: PrimitiveCaseDefinition;
  workerPath: string;
}): string[] {
  return [
    ...(benchmarkCase.metric === "memory" ? ["--expose-gc"] : []),
    "--import",
    "tsx",
    workerPath,
  ];
}

function parseWorkerRow(stdout: string, adapterName: string, caseName: string): BenchmarkRow {
  const output = stdout.trim();

  if (output.length === 0) {
    throw new Error(`primitive worker produced no output for ${adapterName} / ${caseName}`);
  }

  try {
    return JSON.parse(output) as BenchmarkRow;
  } catch (error) {
    throw new Error(
      `primitive worker produced invalid JSON for ${adapterName} / ${caseName}: ${
        error instanceof Error ? error.message : String(error)
      }\n${stdout}`,
    );
  }
}
