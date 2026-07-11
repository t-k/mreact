import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  cancelCallback,
  scheduleCallback,
  setSchedulerHostForTesting,
  type SchedulerHost,
} from "../../packages/react-compat/src/fiber-scheduler.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";

const sizes = [1_000, 2_000, 4_000, 8_000, 16_000];
const samples = 5;

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

function measure(operation: (size: number) => void, size: number): number {
  operation(size);
  const values = Array.from({ length: samples }, () => {
    const started = performance.now();
    operation(size);
    return performance.now() - started;
  });
  return median(values);
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
    const medianMs = measure(operation, size);
    const row = {
      scenario,
      size,
      medianMs,
      nanosecondsPerCallback: (medianMs * 1_000_000) / size,
      doublingRatio: previous === undefined ? null : medianMs / previous,
    };
    previous = medianMs;
    return row;
  });
});

setSchedulerHostForTesting(undefined);
const outputDir = await createDatedResultsDir();
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const result = { commit, node: process.version, sizes, samples, rows };
await writeJsonFile(join(outputDir, "scheduler.json"), result);
await writeTextFile(
  join(outputDir, "scheduler.md"),
  [
    "# Scheduler queue scaling",
    "",
    `Commit: \`${commit}\``,
    `Node: \`${process.version}\``,
    "",
    "| Scenario | Callbacks | Median (ms) | ns/callback | Doubling ratio |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...rows.map((row) => `| ${row.scenario} | ${row.size} | ${row.medianMs.toFixed(3)} | ${row.nanosecondsPerCallback.toFixed(1)} | ${row.doublingRatio?.toFixed(2) ?? "-"} |`),
  ].join("\n"),
);
console.log(JSON.stringify(result, null, 2));
