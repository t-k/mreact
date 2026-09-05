import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cell, createCleanupScope, effect } from "../../packages/reactive-core/src/index.ts";
import { batch } from "../../packages/reactive-core/src/index.ts";
import { createQuery, createQueryClient } from "../../packages/query/src/index.ts";
import { renderToReadableStream } from "../../packages/server/src/index.ts";

interface MemorySample {
  arrayBuffers: number;
  external: number;
  heapUsed: number;
  rss: number;
}

interface ScenarioReport {
  cycles: number;
  memory: {
    after: MemorySample;
    before: MemorySample;
    peak: MemorySample;
  };
  node: string;
  results: {
    activeQueryRetained: boolean;
    routeOwnerRuns: number;
    schedulerRecovered: boolean;
    ssrTerminalFailures: number;
    unusedQueryEntries: number;
  };
  runtime: {
    gcAvailable: boolean;
    platform: NodeJS.Platform;
  };
  version: 1;
  warmupCycles: number;
}

const cycles = Number(process.env.MREACT_LIFECYCLE_CYCLES ?? 50);
const warmupCycles = 5;
const outputDirectory =
  process.env.MREACT_SCENARIO_OUTPUT_DIR ?? join("docs.local", "benchmarks", "lifecycle");

const report = await runScenario({ cycles, warmupCycles });
await mkdir(outputDirectory, { recursive: true });
const outputPath = join(
  outputDirectory,
  `${new Date().toISOString().replaceAll(/[:.]/gu, "-")}.json`,
);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, report }));

async function runScenario(options: {
  cycles: number;
  warmupCycles: number;
}): Promise<ScenarioReport> {
  const before = memorySample();
  let peak = before;
  const updatePeak = (): void => {
    const current = memorySample();
    peak = {
      arrayBuffers: Math.max(peak.arrayBuffers, current.arrayBuffers),
      external: Math.max(peak.external, current.external),
      heapUsed: Math.max(peak.heapUsed, current.heapUsed),
      rss: Math.max(peak.rss, current.rss),
    };
  };

  const shared = cell(0);
  let routeOwnerRuns = 0;
  for (let cycle = 0; cycle < options.warmupCycles + options.cycles; cycle += 1) {
    const scope = createCleanupScope();
    scope.register(
      effect(() => {
        shared.get();
        routeOwnerRuns += 1;
      }),
    );
    shared.set((value) => value + 1);
    scope.dispose();
    updatePeak();
  }
  const expectedRouteRuns = options.warmupCycles + options.cycles;
  if (routeOwnerRuns !== expectedRouteRuns) {
    throw new Error(`route owner run count drifted: ${routeOwnerRuns} !== ${expectedRouteRuns}`);
  }

  const client = createQueryClient({ inactiveGcTime: 0, maxInactiveEntries: 4 });
  await client.prefetchQuery({ queryKey: ["shared"], queryFn: async () => "retained" });
  const retained = createQuery(client, {
    autoFetch: false,
    queryFn: async () => "retained",
    queryKey: ["shared"],
  });
  for (let index = 0; index < options.cycles; index += 1) {
    await client.prefetchQuery({
      queryKey: ["unused", index],
      queryFn: async () => index,
    });
    updatePeak();
  }
  await tick();
  const activeQueryRetained = client.getQueryEntry(["shared"]) !== undefined;
  const unusedQueryEntries = client
    .entries()
    .filter((entry) => entry.queryKey[0] === "unused").length;
  retained.dispose();
  client.removeQueries();

  let ssrTerminalFailures = 0;
  for (let cycle = 0; cycle < options.cycles; cycle += 1) {
    const stream = renderToReadableStream(
      async (sink) => {
        for (let fragment = 0; fragment < 4; fragment += 1) {
          sink.append(`<span>${cycle}:${fragment}</span>`);
          await Promise.resolve();
        }
      },
      { maxQueuedBytes: 4_096 },
    );
    const reader = stream.getReader();
    while (!(await reader.read()).done) {
      await Promise.resolve();
    }
    reader.releaseLock();

    const failed = renderToReadableStream((sink) => {
      sink.append("<span>partial</span>");
      throw new Error("scenario failure");
    });
    await expectStreamFailure(failed);
    ssrTerminalFailures += 1;
    updatePeak();
  }

  const trigger = cell(0);
  let schedulerRuns = 0;
  const stop = effect(() => {
    trigger.get();
    schedulerRuns += 1;
  });
  batch(() => {
    trigger.set(1);
    trigger.set(2);
  });
  await tick();
  stop();
  const schedulerRecovered = schedulerRuns >= 2;
  if (!schedulerRecovered) {
    throw new Error(`scheduler did not recover: ${schedulerRuns} runs`);
  }

  if (typeof globalThis.gc === "function") {
    globalThis.gc();
    await tick();
  }
  const after = memorySample();

  return {
    cycles: options.cycles,
    memory: { after, before, peak },
    node: process.version,
    results: {
      activeQueryRetained,
      routeOwnerRuns,
      schedulerRecovered,
      ssrTerminalFailures,
      unusedQueryEntries,
    },
    runtime: { gcAvailable: typeof globalThis.gc === "function", platform: process.platform },
    version: 1,
    warmupCycles: options.warmupCycles,
  };
}

function memorySample(): MemorySample {
  const memory = process.memoryUsage();
  return {
    arrayBuffers: memory.arrayBuffers,
    external: memory.external,
    heapUsed: memory.heapUsed,
    rss: memory.rss,
  };
}

async function expectStreamFailure(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader();
  await expectReject(reader.read());
  reader.releaseLock();
}

async function expectReject<T>(promise: Promise<T>): Promise<void> {
  try {
    await promise;
  } catch {
    return;
  }

  throw new Error("expected stream failure");
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
