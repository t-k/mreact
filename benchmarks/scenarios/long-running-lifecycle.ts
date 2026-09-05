import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cell,
  createCleanupScope,
  effect,
  runWithCleanupScope,
} from "../../packages/reactive-core/src/index.ts";
import {
  resetSchedulerStateForTesting,
  setScheduler,
} from "../../packages/reactive-core/src/scheduler.ts";
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
    abortReleasedWaiter: boolean;
    activeQueryRetained: boolean;
    routeOwnerRuns: number;
    schedulerRecovered: boolean;
    ssrPeakChunkCapacity: number;
    ssrPeakRetainedBufferCount: number;
    ssrSlowReaderChunks: number;
    slowReaderCompleted: boolean;
    ssrTerminalFailures: number;
    unusedQueryEntries: number;
  };
  runtime: {
    gcAvailable: boolean;
    platform: NodeJS.Platform;
  };
  version: 3;
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
  const runsBeforePostDisposeUpdate = routeOwnerRuns;
  shared.set((value) => value + 1);
  await tick();
  if (routeOwnerRuns !== runsBeforePostDisposeUpdate) {
    throw new Error("disposed route owners still responded to a shared store update");
  }

  const partialScope = createCleanupScope();
  let partialCleanupRuns = 0;
  try {
    runWithCleanupScope(partialScope, () => {
      partialScope.register(() => {
        partialCleanupRuns += 1;
      });
      throw new Error("partial route construction failed");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "partial route construction failed") {
      throw error;
    }
  }
  partialScope.dispose();
  if (!partialScope.disposed || partialCleanupRuns !== 1) {
    throw new Error("partial route construction left an owned cleanup behind");
  }

  const client = createQueryClient({ inactiveGcTime: 0, maxInactiveEntries: 4 });
  await client.prefetchQuery({ queryKey: ["shared"], queryFn: async () => "retained" });
  const retained = createQuery(client, {
    autoFetch: false,
    queryFn: async () => "retained",
    queryKey: ["shared"],
  });
  const unsubscribeRetained = client.subscribe(["shared"], () => {}, { exact: true, gcTime: 0 });
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
  unsubscribeRetained();
  client.removeQueries();

  if (!activeQueryRetained) {
    throw new Error("an actively subscribed query was evicted under inactive cache pressure");
  }
  if (unusedQueryEntries > 4) {
    throw new Error(`inactive query cap was exceeded: ${unusedQueryEntries} entries`);
  }

  let ssrTerminalFailures = 0;
  let ssrPeakChunkCapacity = 0;
  let ssrPeakRetainedBufferCount = 0;
  let ssrSlowReaderChunks = 0;
  let slowReaderCompleted = true;
  for (let cycle = 0; cycle < options.cycles; cycle += 1) {
    const slowStream = renderToReadableStream(
      (sink) => {
        sink.append(`<section data-cycle="${cycle}">`);
        for (let fragment = 0; fragment < 8; fragment += 1) {
          sink.defer?.(
            (async () => {
              await tick();
              sink.append(`<span>${fragment}</span>`);
            })(),
          );
        }
        sink.defer?.(
          (async () => {
            await tick();
            sink.append("</section>");
          })(),
        );
      },
      {
        maxQueuedBytes: 16_384,
        onQueueStateChange(state) {
          ssrPeakChunkCapacity = Math.max(ssrPeakChunkCapacity, state.retainedBackingBytes);
          ssrPeakRetainedBufferCount = Math.max(
            ssrPeakRetainedBufferCount,
            state.retainedBackingBufferCount,
          );
        },
      },
    );
    const slowReader = slowStream.getReader();
    const slowParts: string[] = [];
    for (;;) {
      const result = await slowReader.read();
      if (result.done) {
        break;
      }
      ssrSlowReaderChunks += 1;
      if (result.value.buffer.byteLength > result.value.byteLength * 2) {
        throw new Error(
          `slow reader received a chunk retaining excess backing capacity in cycle ${cycle}`,
        );
      }
      slowParts.push(new TextDecoder().decode(result.value));
      await tick();
    }
    const slowOutput = slowParts.join("");
    if (
      slowOutput !==
      `<section data-cycle="${cycle}">${Array.from({ length: 8 }, (_, index) => `<span>${index}</span>`).join("")}</section>`
    ) {
      slowReaderCompleted = false;
      throw new Error(`slow reader lost streamed output in cycle ${cycle}`);
    }
    if (ssrPeakChunkCapacity <= 0) {
      throw new Error("slow reader did not report retained queue capacity");
    }
    if (ssrPeakRetainedBufferCount < 2) {
      throw new Error("slow reader did not retain more than one backing buffer at once");
    }

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

    await verifyPendingWaiterAfterFailure("async");
    await verifyPendingWaiterAfterFailure("deferred");
    ssrTerminalFailures += 2;
    updatePeak();
  }

  let abortReleasedWaiter = false;
  let abortSignal: AbortSignal | undefined;
  let backpressureWaiter: Promise<void> | undefined;
  const abortStream = renderToReadableStream((sink) => {
    abortSignal = sink.signal;
    sink.append("SHELL");
    sink.defer?.(
      Promise.resolve().then(async () => {
        backpressureWaiter = sink.backpressure?.();
        await backpressureWaiter;
      }),
    );
  });
  await Promise.resolve();
  await Promise.resolve();
  const abortReader = abortStream.getReader();
  await abortReader.cancel("scenario abort");
  if (backpressureWaiter !== undefined) {
    abortReleasedWaiter = await resolvesBeforeTimeout(backpressureWaiter, 1_000);
  }
  if (!abortSignal?.aborted || !abortReleasedWaiter) {
    throw new Error("aborting an SSR stream did not release its backpressure waiter");
  }

  resetSchedulerStateForTesting();
  let pendingFlush: (() => void) | undefined;
  const restoreScheduler = setScheduler({
    schedule(flush) {
      pendingFlush = flush;
    },
  });
  let schedulerRecovered = false;
  try {
    const trigger = cell(0);
    let looping = true;
    let schedulerRuns = 0;
    const stop = effect(() => {
      const value = trigger.get();
      schedulerRuns += 1;
      if (looping) {
        trigger.set(value + 1);
      }
    });
    const failedFlush = pendingFlush;
    pendingFlush = undefined;
    let iterationLimitObserved = false;
    try {
      failedFlush?.();
    } catch (error) {
      iterationLimitObserved = /flush limit exceeded/i.test(String(error));
    }
    looping = false;
    trigger.set(trigger.get() + 1);
    const recoveryRunsBefore = schedulerRuns;
    const recoveryValueBefore = trigger.get();
    const recoveryFlush = pendingFlush;
    pendingFlush = undefined;
    recoveryFlush?.();
    const recoveryRunsAfter = schedulerRuns;
    schedulerRecovered =
      iterationLimitObserved &&
      schedulerRuns > 100 &&
      recoveryFlush !== undefined &&
      recoveryRunsAfter > recoveryRunsBefore &&
      trigger.get() === recoveryValueBefore;
    stop();
    if (!schedulerRecovered) {
      throw new Error(`scheduler did not recover after iteration limit: ${schedulerRuns} runs`);
    }
  } finally {
    restoreScheduler();
    resetSchedulerStateForTesting();
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
      abortReleasedWaiter,
      activeQueryRetained,
      routeOwnerRuns,
      schedulerRecovered,
      ssrPeakChunkCapacity,
      ssrPeakRetainedBufferCount,
      ssrSlowReaderChunks,
      slowReaderCompleted,
      ssrTerminalFailures,
      unusedQueryEntries,
    },
    runtime: { gcAvailable: typeof globalThis.gc === "function", platform: process.platform },
    version: 3,
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

async function verifyPendingWaiterAfterFailure(mode: "async" | "deferred"): Promise<void> {
  let signal: AbortSignal | undefined;
  let pressure: Promise<void> | undefined;
  let rejectFailure: ((error: unknown) => void) | undefined;
  const failure = new Error(`${mode} scenario failure`);
  const failurePromise = new Promise<void>((_, reject) => {
    rejectFailure = reject;
  });
  const stream = renderToReadableStream(
    mode === "async"
      ? async (sink) => {
          signal = sink.signal;
          sink.append("SHELL");
          queueMicrotask(() => {
            pressure = sink.backpressure?.();
          });
          await failurePromise;
        }
      : (sink) => {
          signal = sink.signal;
          sink.append("SHELL");
          queueMicrotask(() => {
            pressure = sink.backpressure?.();
          });
          sink.defer?.(failurePromise);
        },
  );

  await Promise.resolve();
  await Promise.resolve();
  if (pressure === undefined) {
    throw new Error(`${mode} scenario did not create a backpressure waiter`);
  }
  let pressureSettled = false;
  pressure.then(() => {
    pressureSettled = true;
  });
  await Promise.resolve();
  if (pressureSettled) {
    throw new Error(`${mode} scenario waiter settled before the terminal failure`);
  }

  const reader = stream.getReader();
  rejectFailure?.(failure);
  const shell = await reader.read();
  if (shell.done) {
    throw new Error(`${mode} scenario closed before delivering its shell`);
  }
  await expectRejectWithIdentity(reader.read(), failure);
  await pressure;
  reader.releaseLock();
  if (!signal?.aborted) {
    throw new Error(`${mode} scenario did not abort its producer`);
  }
}

async function expectReject<T>(promise: Promise<T>): Promise<void> {
  try {
    await promise;
  } catch {
    return;
  }

  throw new Error("expected stream failure");
}

async function expectRejectWithIdentity<T>(promise: Promise<T>, expected: unknown): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (error === expected) {
      return;
    }
    throw new Error(`stream rejected with an unexpected reason: ${String(error)}`);
  }

  throw new Error("expected stream failure");
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function resolvesBeforeTimeout(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    promise.then(() => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}
