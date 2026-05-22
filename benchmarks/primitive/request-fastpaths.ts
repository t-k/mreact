import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { parseCookieHeader } from "../../packages/router/src/cookies.js";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";
import { summarizeSamples } from "../shared/stats.js";
import type { BenchmarkRow } from "../shared/types.js";

type Candidate = () => unknown;

interface RequestFastPathCase {
  baseline: Candidate;
  candidate: Candidate;
  name: string;
}

const repeatCount = readNumberEnv("MREACT_REQUEST_FASTPATH_BENCH_REPEATS", 100_000);
const measuredRuns = readNumberEnv("MREACT_REQUEST_FASTPATH_BENCH_RUNS", 15);
const warmupRuns = readNumberEnv("MREACT_REQUEST_FASTPATH_BENCH_WARMUPS", 5);

const plainCookieHeader = "sid=abc123; theme=dark; mreact.csrf=token-123";
const encodedCookieHeader = "sid=abc123; theme=%E6%9A%97; mreact.csrf=token-123";

const cases: RequestFastPathCase[] = [
  {
    name: "parse plain cookie header",
    baseline: () => parseCookieHeaderBaseline(plainCookieHeader),
    candidate: () => parseCookieHeader(plainCookieHeader),
  },
  {
    name: "parse encoded cookie header",
    baseline: () => parseCookieHeaderBaseline(encodedCookieHeader),
    candidate: () => parseCookieHeader(encodedCookieHeader),
  },
];

const rows: BenchmarkRow[] = [];

for (const benchmarkCase of cases) {
  rows.push(measureCandidate("baseline", benchmarkCase.name, benchmarkCase.baseline));
  rows.push(measureCandidate("fast-path", benchmarkCase.name, benchmarkCase.candidate));
}

const env = await collectBenchmarkEnvironment(["@reckona/mreact-router"]);
const dir = await createDatedResultsDir();
const markdown = formatRows(rows, env);

await writeJsonFile(join(dir, "request-fastpaths.summary.json"), rows);
await writeTextFile(join(dir, "request-fastpaths.md"), markdown);

console.log(markdown);

function measureCandidate(
  candidateName: string,
  caseName: string,
  candidate: Candidate,
): BenchmarkRow {
  const samples: number[] = [];
  let checksum = 0;

  for (let index = 0; index < warmupRuns + measuredRuns; index += 1) {
    const startedAt = performance.now();

    for (let repeat = 0; repeat < repeatCount; repeat += 1) {
      checksum += checksumValue(candidate());
    }

    if (index >= warmupRuns) {
      samples.push(performance.now() - startedAt);
    }
  }

  const summary = summarizeSamples(samples);
  return {
    suite: "request-fastpaths",
    framework: candidateName,
    version: "local",
    caseName,
    status: "completed",
    metric: "duration",
    unit: "ms",
    value: summary.median,
    summary,
    samples,
    notes: [`repeatCount=${repeatCount}`, `checksum=${checksum}`],
  };
}

function parseCookieHeaderBaseline(cookieHeader: string | null | undefined): Map<string, string> {
  const values = new Map<string, string>();

  for (const part of (cookieHeader ?? "").split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (rawName === undefined || rawName === "") {
      continue;
    }

    try {
      values.set(rawName, decodeURIComponent(rawValue.join("=")));
    } catch {
      // Treat malformed cookie values as absent for this request.
    }
  }

  return values;
}

function checksumValue(value: unknown): number {
  if (value instanceof Map) {
    let size = value.size;
    for (const item of value.values()) {
      size += item.length;
    }
    return size;
  }

  return value === undefined ? 0 : 1;
}

function formatRows(
  benchmarkRows: readonly BenchmarkRow[],
  env: Awaited<ReturnType<typeof collectBenchmarkEnvironment>>,
): string {
  const lines = [
    "# Request Fast Path Microbenchmark",
    "",
    "## Environment",
    "",
    `- Date: ${env.date}`,
    `- Git commit: ${env.gitCommit}`,
    `- Node: ${env.nodeVersion}`,
    `- NODE_ENV: ${env.nodeEnv}`,
    `- pnpm: ${env.pnpmVersion}`,
    `- Platform: ${env.platform} ${env.arch}`,
    `- CPU: ${env.cpuModel} (${env.cpuCount})`,
    "",
    "## Results",
    "",
    `- Repeat count per sample: ${repeatCount}`,
    `- Warmup runs: ${warmupRuns}`,
    `- Measured runs: ${measuredRuns}`,
    "",
    "| candidate | case | median ms | p75 ms | p95 ms | raw samples ms |",
    "| --- | --- | ---: | ---: | ---: | --- |",
  ];

  for (const row of benchmarkRows) {
    lines.push(
      `| ${row.framework} | ${row.caseName} | ${round(row.summary?.median ?? 0)} | ${round(row.summary?.p75 ?? 0)} | ${round(row.summary?.p95 ?? 0)} | ${(row.samples ?? []).map(round).join(", ")} |`,
    );
  }

  return lines.join("\n");
}

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
