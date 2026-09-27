import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { buildApp } from "../../packages/router/src/build.js";
import type { BuildAppPhaseTiming } from "../../packages/router/src/build.js";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";

interface RouterBuildTimeRow {
  caseName: string;
  methodologyVersion: 2;
  processModel: "same-process-rebuild";
  osCache: "retained";
  meanMs: number;
  meanRssDeltaBytes: number;
  medianMs: number;
  medianRssDeltaBytes: number;
  maxMs: number;
  maxRssDeltaBytes: number;
  p75Ms: number;
  p75RssDeltaBytes: number;
  p99Ms: number;
  p99RssDeltaBytes: number;
  routeCount: number;
  rssDeltaBytesSamples: number[];
  samplesMs: number[];
}

interface RouterBuildPhaseTimingRow {
  meanMs: number;
  p75Ms: number;
  p99Ms: number;
  phase: string;
  samplesMs: number[];
}

interface FreshProcessBuildSample {
  elapsedMs: number;
  importMs: number;
  buildMs: number;
  peakRssBytes: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  phaseTimings: BuildAppPhaseTiming[];
}

const routeCount = readNumberEnv("MREACT_ROUTER_BUILD_BENCH_ROUTES", 40);
const repeatCount = readNumberEnv("MREACT_ROUTER_BUILD_BENCH_REPEATS", 5);
const collectPhaseTimings = process.env.MREACT_BUILD_TIMINGS === "1";
const processModel = process.env.MREACT_ROUTER_BUILD_BENCH_PROCESS_MODEL ?? "same-process-rebuild";
const rootDir = await mkdtemp(join(tmpdir(), "mreact-router-build-time-"));
const appDir = join(rootDir, "app");
const outDir = join(rootDir, ".mreact");

try {
  await writeFixtureApp(appDir, routeCount);
  if (processModel === "fresh-process") {
    await runFreshProcessBenchmark(appDir, outDir);
  } else if (processModel === "incremental-source-change") {
    await runIncrementalSourceChangeBenchmark(appDir, outDir);
  } else if (processModel === "same-process-rebuild") {
    await runSameProcessBenchmark(appDir, outDir);
  } else {
    throw new Error(`Unsupported router build benchmark process model: ${processModel}`);
  }
} finally {
  await rm(rootDir, { force: true, recursive: true });
}

async function runSameProcessBenchmark(appDir: string, outDir: string): Promise<void> {
  const samplesMs: number[] = [];
  const rssDeltaBytesSamples: number[] = [];
  const phaseSamples = new Map<string, number[]>();

  for (let index = 0; index < repeatCount; index += 1) {
    await rm(outDir, { force: true, recursive: true });
    const phaseTimings: BuildAppPhaseTiming[] = [];
    const beforeRss = process.memoryUsage().rss;
    const startedAt = performance.now();
    await buildApp({
      appDir,
      outDir,
      ...(collectPhaseTimings
        ? {
            onBuildPhaseTiming(timing: BuildAppPhaseTiming) {
              phaseTimings.push(timing);
            },
          }
        : {}),
    });
    samplesMs.push(round(performance.now() - startedAt));
    rssDeltaBytesSamples.push(process.memoryUsage().rss - beforeRss);

    for (const timing of phaseTimings) {
      const samples = phaseSamples.get(timing.phase) ?? [];
      samples.push(timing.ms);
      phaseSamples.set(timing.phase, samples);
    }
  }

  const row: RouterBuildTimeRow = {
    caseName: "app build with rendered-export client inference",
    methodologyVersion: 2,
    processModel: "same-process-rebuild",
    osCache: "retained",
    meanMs: round(mean(samplesMs)),
    meanRssDeltaBytes: round(mean(rssDeltaBytesSamples)),
    medianMs: percentile(samplesMs, 50),
    medianRssDeltaBytes: percentile(rssDeltaBytesSamples, 50),
    maxMs: percentile(samplesMs, 100),
    maxRssDeltaBytes: percentile(rssDeltaBytesSamples, 100),
    p75Ms: percentile(samplesMs, 75),
    p75RssDeltaBytes: percentile(rssDeltaBytesSamples, 75),
    p99Ms: percentile(samplesMs, 99),
    p99RssDeltaBytes: percentile(rssDeltaBytesSamples, 99),
    routeCount,
    rssDeltaBytesSamples,
    samplesMs,
  };
  const phaseRows = [...phaseSamples.entries()].map<RouterBuildPhaseTimingRow>(
    ([phase, phaseSamplesMs]) => ({
      meanMs: round(mean(phaseSamplesMs)),
      p75Ms: percentile(phaseSamplesMs, 75),
      p99Ms: percentile(phaseSamplesMs, 99),
      phase,
      samplesMs: phaseSamplesMs,
    }),
  );
  const env = await collectBenchmarkEnvironment(["@reckona/mreact-router"]);
  const dir = await createDatedResultsDir();
  const markdown = [
    "# Router Build Time Benchmark",
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
    `- Memory: ${env.totalMemoryBytes} bytes`,
    "",
    "## Results",
    "",
    "This track deletes generated output between builds but reuses one Node process and retains OS caches. RSS deltas are signed; they are not peak or process-tree memory. With the default five samples, p99 is the maximum sample, so use the median and raw samples for comparisons.",
    "",
    "| case | routes | median ms | max ms | mean ms | p75 ms | p99 ms | median RSS delta bytes | max RSS delta bytes | raw samples ms | raw RSS delta bytes |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
    `| ${row.caseName} | ${row.routeCount} | ${row.medianMs} | ${row.maxMs} | ${row.meanMs} | ${row.p75Ms} | ${row.p99Ms} | ${row.medianRssDeltaBytes} | ${row.maxRssDeltaBytes} | ${row.samplesMs.join(", ")} | ${row.rssDeltaBytesSamples.join(", ")} |`,
    ...(phaseRows.length === 0
      ? []
      : [
          "",
          "## Build Phase Timings",
          "",
          "Set `MREACT_BUILD_TIMINGS=1` to collect this table.",
          "",
          "| phase | mean ms | p75 ms | p99 ms | raw samples ms |",
          "| --- | ---: | ---: | ---: | --- |",
          ...phaseRows.map(
            (phase) =>
              `| ${phase.phase} | ${phase.meanMs} | ${phase.p75Ms} | ${phase.p99Ms} | ${phase.samplesMs.join(", ")} |`,
          ),
        ]),
  ].join("\n");

  await writeJsonFile(join(dir, "router-build-time.summary.json"), row);
  if (phaseRows.length > 0) {
    await writeJsonFile(join(dir, "router-build-time.phases.json"), phaseRows);
  }
  await writeTextFile(join(dir, "router-build-time.md"), markdown);

  console.log(markdown);
}

async function runFreshProcessBenchmark(appDir: string, outDir: string): Promise<void> {
  const samples: FreshProcessBuildSample[] = [];
  for (let index = 0; index < repeatCount; index += 1) {
    await rm(outDir, { force: true, recursive: true });
    samples.push(await runFreshProcessBuild(appDir, outDir));
  }

  const env = await collectBenchmarkEnvironment(["@reckona/mreact-router"]);
  const dir = await createDatedResultsDir();
  const elapsed = samples.map((sample) => sample.elapsedMs);
  const summary = {
    methodologyVersion: 3,
    caseName: "fresh process app build with rendered-export client inference",
    processModel: "fresh-process",
    osCache: "retained",
    routeCount,
    repeatCount,
    medianMs: percentile(elapsed, 50),
    maxMs: percentile(elapsed, 100),
    samples,
    environment: env,
  };
  const markdown = [
    "# Router Fresh Process Build Benchmark",
    "",
    `Date: ${env.date}; Git commit: ${env.gitCommit}; Node: ${env.nodeVersion}; platform: ${env.platform} ${env.arch}.`,
    "",
    "Each trial launches a new Node process and deletes generated output. OS filesystem caches remain warm. Elapsed time includes process startup, module loading, and the build; phase timings and CPU time come from the child process. Peak RSS is the child process high-water mark, not the process tree or system peak. With five samples, p99 equals the maximum, so use the median and raw samples for comparisons.",
    "",
    "| routes | median elapsed ms | max elapsed ms | raw elapsed ms | import ms | build ms | peak RSS bytes | CPU user ms | CPU system ms |",
    "| ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |",
    `| ${routeCount} | ${summary.medianMs} | ${summary.maxMs} | ${samples.map((sample) => sample.elapsedMs).join(", ")} | ${samples.map((sample) => sample.importMs).join(", ")} | ${samples.map((sample) => sample.buildMs).join(", ")} | ${samples.map((sample) => sample.peakRssBytes).join(", ")} | ${samples.map((sample) => sample.cpuUserMs).join(", ")} | ${samples.map((sample) => sample.cpuSystemMs).join(", ")} |`,
  ].join("\n");
  await writeJsonFile(join(dir, "router-build-time-fresh.summary.json"), summary);
  await writeTextFile(join(dir, "router-build-time-fresh.md"), markdown);
  console.log(markdown);
}

async function runFreshProcessBuild(appDir: string, outDir: string): Promise<FreshProcessBuildSample> {
  const startedAt = performance.now();
  const worker = new URL("./build-time-worker.mjs", import.meta.url);
  const child = spawn(process.execPath, [fileURLToPath(worker), appDir, outDir, collectPhaseTimings ? "1" : "0"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? -1));
  });
  const elapsedMs = round(performance.now() - startedAt);
  if (exitCode !== 0) {
    throw new Error(`Fresh process build exited ${exitCode}: ${stderr || stdout}`);
  }
  const marker = "MREACT_BUILD_SAMPLE:";
  const line = stdout.split("\n").find((value) => value.startsWith(marker));
  if (line === undefined) {
    throw new Error(`Fresh process build returned no sample: ${stdout}\n${stderr}`);
  }
  return { elapsedMs, ...JSON.parse(line.slice(marker.length)) as Omit<FreshProcessBuildSample, "elapsedMs"> };
}

async function runIncrementalSourceChangeBenchmark(appDir: string, outDir: string): Promise<void> {
  if (routeCount < 4) throw new Error("Incremental source-change benchmark requires at least four routes");
  const changeKind = process.env.MREACT_ROUTER_BUILD_BENCH_CHANGE_KIND ?? "leaf";
  if (changeKind !== "leaf" && changeKind !== "shared-layout") {
    throw new Error(`Unsupported router build change kind: ${changeKind}`);
  }
  await buildApp({ appDir, outDir });
  let previousFingerprint = await readBuildFingerprint(outDir);
  const samples = [];
  for (let revision = 1; revision <= repeatCount; revision++) {
    if (changeKind === "leaf") {
      await writeFile(join(appDir, "route-3", "page.tsx"), routeSource(3, revision));
    } else {
      await writeFile(join(appDir, "layout.tsx"), layoutSource(revision));
    }
    const phaseTimings: BuildAppPhaseTiming[] = [];
    const beforeRss = process.memoryUsage().rss;
    const beforeCpu = process.cpuUsage();
    const startedAt = performance.now();
    await buildApp({
      appDir,
      outDir,
      ...(collectPhaseTimings ? { onBuildPhaseTiming(timing: BuildAppPhaseTiming) { phaseTimings.push(timing); } } : {}),
    });
    const elapsedMs = round(performance.now() - startedAt);
    const cpu = process.cpuUsage(beforeCpu);
    const fingerprint = await readBuildFingerprint(outDir);
    if (fingerprint === previousFingerprint) throw new Error(`Build fingerprint did not change for ${changeKind} revision ${revision}`);
    previousFingerprint = fingerprint;
    samples.push({
      revision,
      elapsedMs,
      cpuUserMs: round(cpu.user / 1_000),
      cpuSystemMs: round(cpu.system / 1_000),
      rssDeltaBytes: process.memoryUsage().rss - beforeRss,
      phaseTimings,
      fingerprint,
    });
  }
  const elapsed = samples.map((sample) => sample.elapsedMs);
  const env = await collectBenchmarkEnvironment(["@reckona/mreact-router"]);
  const dir = await createDatedResultsDir();
  const result = {
    methodologyVersion: 3,
    caseName: `incremental ${changeKind} source change`,
    processModel: "incremental-source-change",
    changeKind,
    routeCount,
    repeatCount,
    osCache: "retained",
    medianMs: percentile(elapsed, 50),
    maxMs: percentile(elapsed, 100),
    samples,
    environment: env,
  };
  const markdown = [
    "# Router Incremental Source Change Benchmark",
    "",
    `Date: ${env.date}; Git commit: ${env.gitCommit}; Node: ${env.nodeVersion}; platform: ${env.platform} ${env.arch}.`,
    "",
    "An unmeasured initial build creates the output cache. Each measured trial changes rendered source, retains the output directory and Node process, and verifies that the build fingerprint changes. The build may still regenerate all outputs; this track measures that cost rather than asserting partial recompilation. OS caches remain warm. RSS deltas are signed and do not measure peak or process-tree memory.",
    "",
    "| change | routes | median ms | max ms | raw elapsed ms | CPU user ms | CPU system ms | RSS delta bytes |",
    "| --- | ---: | ---: | ---: | --- | --- | --- | --- |",
    `| ${changeKind} | ${routeCount} | ${result.medianMs} | ${result.maxMs} | ${samples.map((sample) => sample.elapsedMs).join(", ")} | ${samples.map((sample) => sample.cpuUserMs).join(", ")} | ${samples.map((sample) => sample.cpuSystemMs).join(", ")} | ${samples.map((sample) => sample.rssDeltaBytes).join(", ")} |`,
  ].join("\n");
  await writeJsonFile(join(dir, `router-build-time-${changeKind}.summary.json`), result);
  await writeTextFile(join(dir, `router-build-time-${changeKind}.md`), markdown);
  console.log(markdown);
}

async function readBuildFingerprint(outDir: string): Promise<string> {
  const raw = JSON.parse(await readFile(join(outDir, "build-cache.json"), "utf8")) as { fingerprint?: unknown };
  if (typeof raw.fingerprint !== "string") throw new Error("Router build cache fingerprint is unavailable");
  return raw.fingerprint;
}

async function writeFixtureApp(directory: string, routes: number): Promise<void> {
  await mkdir(join(directory, "components"), { recursive: true });
  await writeFile(
    join(directory, "layout.tsx"),
    layoutSource(0),
  );
  await writeFile(
    join(directory, "components", "Counter.tsx"),
    `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}
`,
  );
  await writeFile(
    join(directory, "components", "ServerTitle.tsx"),
    `export function ServerTitle(props: { title: string }) {
  return <h1>{props.title}</h1>;
}
`,
  );

  for (let index = 0; index < routes; index += 1) {
    const routeDir = join(directory, `route-${index}`);
    await mkdir(routeDir, { recursive: true });
    await writeFile(join(routeDir, "page.tsx"), routeSource(index));
  }
}

function layoutSource(revision: number): string {
  return `export default function Layout() {
  return <html lang="en"><body${revision === 0 ? "" : ` data-revision="${revision}"`}><Slot /></body></html>;
}
`;
}

function routeSource(index: number, revision = 0): string {
  if (index % 4 === 0) {
    return `import { Counter } from "../components/Counter";

const registry = { Counter };
const Selected = registry.Counter;

export default function Page() {
  return <main><Selected /></main>;
}
`;
  }

  if (index % 4 === 1) {
    return `import { ServerTitle } from "../components/ServerTitle";

function Wrapper() {
  return <ServerTitle title="Route ${index}" />;
}

export default function Page() {
  return <main><Wrapper /></main>;
}
`;
  }

  if (index % 4 === 2) {
    return `import { Counter as ImportedCounter } from "../components/Counter";

const InteractiveCounter = ImportedCounter;

export default function Page() {
  return <main><InteractiveCounter /></main>;
}
`;
  }

  return `export default function Page() {
  return <main><h1>Route ${index}${revision === 0 ? "" : ` revision ${revision}`}</h1></main>;
}
`;
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: readonly number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );

  return round(sorted[index] ?? 0);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
