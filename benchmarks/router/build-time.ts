import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { buildApp } from "../../packages/router/src/build.js";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";

interface RouterBuildTimeRow {
  caseName: string;
  meanMs: number;
  p75Ms: number;
  p99Ms: number;
  routeCount: number;
  samplesMs: number[];
}

const routeCount = readNumberEnv("MREACT_ROUTER_BUILD_BENCH_ROUTES", 40);
const repeatCount = readNumberEnv("MREACT_ROUTER_BUILD_BENCH_REPEATS", 5);
const rootDir = await mkdtemp(join(tmpdir(), "mreact-router-build-time-"));
const appDir = join(rootDir, "app");
const outDir = join(rootDir, ".mreact");

try {
  await writeFixtureApp(appDir, routeCount);
  const samplesMs: number[] = [];

  for (let index = 0; index < repeatCount; index += 1) {
    await rm(outDir, { force: true, recursive: true });
    const startedAt = performance.now();
    await buildApp({ appDir, outDir });
    samplesMs.push(round(performance.now() - startedAt));
  }

  const row: RouterBuildTimeRow = {
    caseName: "app build with rendered-export client inference",
    meanMs: round(mean(samplesMs)),
    p75Ms: percentile(samplesMs, 75),
    p99Ms: percentile(samplesMs, 99),
    routeCount,
    samplesMs,
  };
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
    "| case | routes | mean ms | p75 ms | p99 ms | raw samples ms |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
    `| ${row.caseName} | ${row.routeCount} | ${row.meanMs} | ${row.p75Ms} | ${row.p99Ms} | ${row.samplesMs.join(", ")} |`,
  ].join("\n");

  await writeJsonFile(join(dir, "router-build-time.summary.json"), row);
  await writeTextFile(join(dir, "router-build-time.md"), markdown);

  console.log(markdown);
} finally {
  await rm(rootDir, { force: true, recursive: true });
}

async function writeFixtureApp(directory: string, routes: number): Promise<void> {
  await mkdir(join(directory, "components"), { recursive: true });
  await writeFile(
    join(directory, "layout.tsx"),
    `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}
`,
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

function routeSource(index: number): string {
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
  return <main><h1>Route ${index}</h1></main>;
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
