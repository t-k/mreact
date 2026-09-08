import { describe, expect, test } from "vitest";
import { batch, cell, computed, effect } from "../src/index.js";
import { setScheduler } from "../src/scheduler.js";
import { flushPendingComputed } from "../src/tracking.js";
import { createReactiveTestRuntime } from "../src/testing.js";

function createGraph(reverse: boolean) {
  const source = cell(2);
  const readValid = () => source.get() >= 0 && mirrored.get() >= 0;
  const first = reverse ? computed(readValid) : undefined;
  const mirrored = computed(() => source.get());
  const valid = first ?? computed(readValid);
  const seen: number[] = [];
  const stopMirrored = effect(() => {
    seen.push(mirrored.get());
  });
  const stopValid = effect(() => {
    valid.get();
  });
  return {
    source,
    mirrored,
    valid,
    seen,
    dispose() {
      stopMirrored();
      stopValid();
    },
  };
}

describe("effect wakeup after computed publication", () => {
  test.each([false, true])("schedules exactly once with reversed creation order %s", (reverse) => {
    const runtime = createReactiveTestRuntime();
    const graph = createGraph(reverse);
    try {
      graph.source.setValue(0);
      expect(graph.seen).toEqual([2]);
      expect(runtime.scheduledFlushCount()).toBe(1);
      runtime.flushAll();
      expect(graph.seen).toEqual([2, 0]);
      expect(graph.valid.get()).toBe(true);
      expect(runtime.scheduledFlushCount()).toBe(0);
    } finally {
      graph.dispose();
      runtime.dispose();
    }
  });

  test("wakes through the default microtask scheduler without a manual flush", async () => {
    const graph = createGraph(true);
    try {
      graph.source.setValue(0);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(graph.seen).toEqual([2, 0]);
    } finally {
      graph.dispose();
    }
  });

  test("waits for the outer batch and coalesces repeated updates", () => {
    const runtime = createReactiveTestRuntime();
    const graph = createGraph(true);
    try {
      batch(() => {
        batch(() => {
          graph.source.setValue(0);
          graph.valid.get();
        });
        expect(runtime.scheduledFlushCount()).toBe(0);
        graph.source.setValue(1);
      });
      expect(runtime.scheduledFlushCount()).toBe(1);
      runtime.flushAll();
      expect(graph.seen).toEqual([2, 1]);
    } finally {
      graph.dispose();
      runtime.dispose();
    }
  });

  test("does not schedule when computed results stay equal", () => {
    const runtime = createReactiveTestRuntime();
    const source = cell(2);
    const valid = computed(() => source.get() >= 0);
    const stop = effect(() => {
      valid.get();
    });
    try {
      source.setValue(0);
      expect(runtime.scheduledFlushCount()).toBe(0);
    } finally {
      stop();
      runtime.dispose();
    }
  });

  test("keeps an explicit computed drain inside an outer batch unscheduled", () => {
    const runtime = createReactiveTestRuntime();
    const graph = createGraph(true);
    try {
      batch(() => {
        graph.source.setValue(0);
        flushPendingComputed();
        expect(runtime.scheduledFlushCount()).toBe(0);
        expect(graph.seen).toEqual([2]);
      });
      expect(runtime.scheduledFlushCount()).toBe(1);
      runtime.flushAll();
      expect(graph.seen).toEqual([2, 0]);
    } finally {
      graph.dispose();
      runtime.dispose();
    }
  });

  test("recovers when the scheduler rejects the computed handoff", () => {
    const graph = createGraph(true);
    const restore = setScheduler({
      schedule() {
        throw new Error("scheduler rejected");
      },
    });
    try {
      expect(() => graph.source.setValue(0)).toThrow("scheduler rejected");
    } finally {
      restore();
    }
    const runtime = createReactiveTestRuntime();
    try {
      graph.source.setValue(1);
      expect(runtime.scheduledFlushCount()).toBe(1);
      runtime.flushAll();
      expect(graph.seen).toEqual([2, 1]);
    } finally {
      graph.dispose();
      runtime.dispose();
    }
  });

  test("finishes computed work before invoking a synchronous scheduler", () => {
    const restore = setScheduler({ schedule: (flush) => flush() });
    const source = cell(2);
    let calculating = false;
    const valid = computed(() => {
      calculating = true;
      try {
        return source.get() >= 0 && mirrored.get() >= 0;
      } finally {
        calculating = false;
      }
    });
    const mirrored = computed(() => source.get());
    const later = computed(() => source.get() * 10);
    const seen: number[][] = [];
    const stopMirrored = effect(() => {
      expect(calculating).toBe(false);
      seen.push([mirrored.get(), later.get()]);
    });
    const stopValid = effect(() => {
      valid.get();
    });
    try {
      source.setValue(0);
      expect(seen).toEqual([
        [2, 20],
        [0, 0],
      ]);
    } finally {
      stopMirrored();
      stopValid();
      restore();
    }
  });
});
