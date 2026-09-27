import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../../packages/router/dist/index.js";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";
import { startFixtureServer } from "./fixture-server.js";
import { writeHttpCacheModeFixture } from "./http-cache-modes-fixture.js";
import { measureHttpTrials } from "./http-trials.js";
import type { HttpTarget, HttpTrial, HttpTrialOptions } from "./http-trial-types.js";

type CacheMode = "hit" | "miss" | "uncached";
const modes: CacheMode[] = ["hit", "miss", "uncached"];
const rounds = readPositiveInteger("MREACT_HTTP_CACHE_BENCH_ROUNDS", 3);
const concurrency = readPositiveInteger("MREACT_HTTP_CACHE_BENCH_CONCURRENCY", 100);
const totalRequests = readPositiveInteger("MREACT_HTTP_CACHE_BENCH_REQUESTS", 200);
const durationMs = readPositiveInteger("MREACT_HTTP_CACHE_BENCH_DURATION_MS", 5_000);
const warmupMs = readNonnegativeInteger("MREACT_HTTP_CACHE_BENCH_WARMUP_MS", 2_000);
const root = await mkdtemp(join(tmpdir(), "mreact-http-cache-modes-"));
let server: Awaited<ReturnType<typeof startFixtureServer>> | undefined;

try {
  const appDir = join(root, "app");
  const outDir = join(root, "out");
  await writeHttpCacheModeFixture(appDir);
  await buildApp({ appDir, outDir });
  server = await startFixtureServer({ framework: "mreact", directory: outDir });
  const url = server.url;
  const source = await fetch(`${url}/cacheable`);
  const uncached = await fetch(`${url}/uncached`);
  if (source.status !== 200 || uncached.status !== 200) throw new Error("HTTP cache fixture returned a non-200 response");
  const main = (await source.text()).match(/<main>.*?<\/main>/s)?.[0];
  const uncachedMain = (await uncached.text()).match(/<main>.*?<\/main>/s)?.[0];
  if (main === undefined || main !== uncachedMain || !main.includes("<span>999</span>")) {
    throw new Error("HTTP cache fixture routes do not render the same 1,000-span content");
  }
  const trials: Array<HttpTrial & { cacheMode: CacheMode }> = [];
  for (const profile of ["burst", "steady"] as const) {
    for (let round = 0; round < rounds; round++) {
      for (let position = 0; position < modes.length; position++) {
        const mode = modes[(position + round) % modes.length]!;
        if (mode === "hit") await assertWarmHit(`${url}/cacheable`);
        const target = targetForMode(mode, url, server.pid);
        const options: HttpTrialOptions = {
          profile,
          concurrency,
          totalRequests,
          durationMs,
          warmupMs,
          windows: 1,
        };
        const measured = await measureHttpTrials(target, options);
        const trial = measured[0];
        if (trial === undefined || trial.status !== "completed") {
          throw new Error(`HTTP ${mode} ${profile} trial failed: ${trial?.error ?? "missing trial"}`);
        }
        trial.executionOrder = { round, position };
        trials.push({ ...trial, cacheMode: mode });
      }
    }
  }
  const environment = await collectBenchmarkEnvironment(["@reckona/mreact-router"]);
  const outputDir = await createDatedResultsDir(new Date(), { resultsRoot: join("benchmarks", "results", "router-http-cache-modes") });
  const summary = modes.flatMap((mode) => (["burst", "steady"] as const).map((profile) => {
    const samples = trials.filter((trial) => trial.cacheMode === mode && trial.options.profile === profile);
    return {
      cacheMode: mode,
      profile,
      trialCount: samples.length,
      medianThroughputOps: median(samples.map((trial) => trial.throughputOps!)),
      medianP50Ms: median(samples.map((trial) => trial.p50Ms!)),
      medianP95Ms: median(samples.map((trial) => trial.p95Ms!)),
      medianP99Ms: median(samples.map((trial) => trial.p99Ms!)),
      medianRssDeltaBytes: median(samples.map((trial) => trial.rssDeltaBytes!)),
      rawThroughputOps: samples.map((trial) => trial.throughputOps!),
      rawRssDeltaBytes: samples.map((trial) => trial.rssDeltaBytes!),
    };
  }));
  const result = {
    methodologyVersion: 1,
    track: "mreact-production-http-cache-modes",
    environment,
    fixture: "ordinary compiled JSX, 1,000 spans with identical main content",
    rounds,
    limitations: [
      "This track compares mreact cache states in the production server; peer frameworks are unsupported until their cache state can be verified per response.",
      "Each burst and steady trial runs in a separate HTTP load process; unique cache-miss query keys also cover warmup requests.",
      "RSS deltas cover one server PID and are not peak memory or total process-tree memory.",
    ],
    summary,
    trials,
  };
  await writeJsonFile(join(outputDir, "http-cache-modes.json"), result);
  const markdown = [
    "# Production HTTP Cache Modes",
    "",
    `Git commit: ${environment.gitCommit}; Node: ${environment.nodeVersion}; rounds: ${rounds}; concurrency: ${concurrency}.`,
    "",
    "The same 1,000-span JSX content is rendered by cacheable and uncached production routes. Every scored response is checked for the declared HIT, MISS, or uncached header state. The cache-hit route is warmed immediately before each trial. Cache misses use a unique query key for every request, including warmup. Peer frameworks are not ranked in this track because equivalent cache contracts have not been verified.",
    "",
    "| cache mode | profile | trials | median throughput ops/s | median p50 ms | median p95 ms | median p99 ms | median RSS delta bytes | raw throughput ops/s | raw RSS delta bytes |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ...summary.map((row) => `| ${row.cacheMode} | ${row.profile} | ${row.trialCount} | ${row.medianThroughputOps} | ${row.medianP50Ms} | ${row.medianP95Ms} | ${row.medianP99Ms} | ${row.medianRssDeltaBytes} | ${row.rawThroughputOps.join(", ")} | ${row.rawRssDeltaBytes.join(", ")} |`),
  ].join("\n");
  await writeTextFile(join(outputDir, "http-cache-modes.md"), markdown);
  console.log(markdown);
} finally {
  await server?.close();
  await rm(root, { force: true, recursive: true });
}

function targetForMode(mode: CacheMode, baseUrl: string, serverPid: number): HttpTarget {
  return {
    url: `${baseUrl}/${mode === "uncached" ? "uncached" : "cacheable"}`,
    serverPid,
    requiredText: "<span>999</span>",
    requestKeyMode: mode === "miss" ? "unique-query" : "fixed",
    ...(mode === "uncached"
      ? { expectedHeaders: { "cache-control": "max-age=0" }, forbiddenHeaders: ["x-mreact-cache"] }
      : { expectedHeaders: { "x-mreact-cache": mode === "hit" ? "HIT" : "MISS" } }),
    workload: { cacheMode: mode, route: mode === "uncached" ? "/uncached" : "/cacheable", ssr: "native", output: "1000 spans" },
  };
}

async function assertWarmHit(url: string): Promise<void> {
  const first = await fetch(url);
  await first.arrayBuffer();
  const second = await fetch(url);
  await second.arrayBuffer();
  if (second.headers.get("x-mreact-cache") !== "HIT") throw new Error("Cacheable route did not become a HIT before scoring");
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function readNonnegativeInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const result = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return Math.round(result * 100) / 100;
}
