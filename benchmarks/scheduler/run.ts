import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import type { SchedulerHost } from "../../packages/react-compat/src/fiber-scheduler.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";

const sizes = [1_000, 2_000, 4_000, 8_000, 16_000];
const sampleCount = 9;
const targetSampleMs = 100;
const targetRoot = process.env.MREACT_SCHEDULER_BENCH_TARGET_ROOT ?? process.cwd();
const { cancelCallback, scheduleCallback, setSchedulerHostForTesting } = (await import(
  pathToFileURL(join(targetRoot, "packages/react-compat/dist/fiber-scheduler.js")).href
)) as typeof import("../../packages/react-compat/src/fiber-scheduler.js");

interface BenchmarkHost extends SchedulerHost {
  advanceTo(time: number): void;
  flush(): void;
}

function createHost(): BenchmarkHost {
  let time = 0;
  const callbacks: Array<() => void> = [];
  const timeouts = new Map<number, { callback: () => void; due: number }>();
  let timeoutId = 0;
  return {
    now: () => time,
    scheduleHostCallback(callback) {
      callbacks.push(callback);
      return callback;
    },
    scheduleHostTimeout(callback, ms) {
      timeoutId += 1;
      timeouts.set(timeoutId, { callback, due: time + ms });
      return timeoutId;
    },
    cancelHostTimeout(id) {
      timeouts.delete(id as number);
    },
    advanceTo(nextTime) {
      time = nextTime;
      for (const [id, timeout] of timeouts) {
        if (timeout.due <= time) {
          timeouts.delete(id);
          timeout.callback();
        }
      }
    },
    flush() {
      while (callbacks.length > 0) {
        callbacks.shift()?.();
      }
    },
  };
}

function median(values: number[]): number {
  return [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)] ?? 0;
}

function measure(operation: (size: number) => void, size: number): {
  iterations: number;
  medianMs: number;
  samplesMs: number[];
} {
  operation(size);
  const pilotStarted = performance.now();
  operation(size);
  const pilotMs = Math.max(performance.now() - pilotStarted, 0.001);
  const iterations = Math.max(1, Math.min(1_000, Math.ceil(targetSampleMs / pilotMs)));
  const samplesMs = Array.from({ length: sampleCount }, () => {
    const started = performance.now();
    for (let iteration = 0; iteration < iterations; iteration += 1) operation(size);
    return (performance.now() - started) / iterations;
  });
  return { iterations, medianMs: median(samplesMs), samplesMs };
}

const scenarios = {
  ready(size: number) {
    setSchedulerHostForTesting(createHost());
    for (let index = 0; index < size; index += 1) {
      scheduleCallback("normal", () => {});
    }
  },
  delayed(size: number) {
    const host = createHost();
    setSchedulerHostForTesting(host);
    for (let index = size; index > 0; index -= 1) {
      scheduleCallback("normal", () => {}, { delay: index });
    }
    host.advanceTo(size);
    host.flush();
  },
  cancellationHeavy(size: number) {
    const host = createHost();
    setSchedulerHostForTesting(host);
    const tasks = Array.from({ length: size }, () => scheduleCallback("normal", () => {}));
    for (let index = 0; index < tasks.length; index += 2) {
      const task = tasks[index];
      if (task !== undefined) cancelCallback(task);
    }
    host.flush();
  },
};

const rows = Object.entries(scenarios).flatMap(([scenario, operation]) => {
  let previous: number | undefined;
  return sizes.map((size) => {
    const measurement = measure(operation, size);
    const { medianMs } = measurement;
    const row = {
      scenario,
      size,
      medianMs,
      iterations: measurement.iterations,
      samplesMs: measurement.samplesMs,
      nanosecondsPerCallback: (medianMs * 1_000_000) / size,
      doublingRatio: previous === undefined ? null : medianMs / previous,
    };
    previous = medianMs;
    return row;
  });
});

setSchedulerHostForTesting(undefined);
const outputDir = await createDatedResultsDir();
const commit = execFileSync("git", ["-C", targetRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const result = { commit, node: process.version, sampleCount, sizes, targetSampleMs, rows };
await writeJsonFile(join(outputDir, "scheduler.json"), result);
await writeTextFile(
  join(outputDir, "scheduler.md"),
  [
    "# Scheduler queue scaling",
    "",
    `Commit: \`${commit}\``,
    `Node: \`${process.version}\``,
    "",
    "| Scenario | Callbacks | Iterations/sample | Median (ms) | ns/callback | Doubling ratio |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map((row) => `| ${row.scenario} | ${row.size} | ${row.iterations} | ${row.medianMs.toFixed(3)} | ${row.nanosecondsPerCallback.toFixed(1)} | ${row.doublingRatio?.toFixed(2) ?? "-"} |`),
  ].join("\n"),
);
console.log(JSON.stringify(result, null, 2));
