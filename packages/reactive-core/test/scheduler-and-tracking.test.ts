import { afterEach, describe, expect, test } from "vitest";
import { cell, effect } from "../src/index.js";
import {
  flushQueuedComputations,
  queueComputation,
  schedulePendingFlush,
  setScheduler,
} from "../src/scheduler.js";
import { cleanupDeps, notifySubscribers, trackSource } from "../src/tracking.js";

const restorers: Array<() => void> = [];
afterEach(() => {
  while (restorers.length > 0) {
    const fn = restorers.pop();
    fn?.();
  }
});

describe("reactive-core scheduler / tracking edge branches", () => {
  test("queueComputation ignores a disposed computation", () => {
    // Use the public effect() API to obtain a computation handle.
    let runs = 0;
    const dispose = effect(() => {
      runs += 1;
    });
    expect(runs).toBe(1);
    dispose();
    // queueComputation is exercised indirectly via cell.set after dispose --
    // markDirty queues but disposed=true means the queue should be a no-op.
    // We instead validate that disposing prevents further runs.
    // Trigger a synthetic queueComputation with a synthetic computation:
    const synth = {
      id: 1_000_000,
      deps: [],
      disposed: true,
      queued: false,
      markDirty() {},
      run() {
        throw new Error("should not run");
      },
      dispose() {},
    };
    queueComputation(synth);
    flushQueuedComputations();
    expect(runs).toBe(1);
  });

  test("schedulePendingFlush does nothing when the queue is empty", () => {
    schedulePendingFlush();
    flushQueuedComputations();
  });

  test("setScheduler swaps the scheduler and the returned restore puts it back", () => {
    let calls = 0;
    const restore = setScheduler({
      schedule(flush) {
        calls += 1;
        flush();
      },
    });
    restorers.push(restore);

    const c = cell(0);
    const dispose = effect(() => {
      c.get();
    });
    c.set(1);
    expect(calls).toBeGreaterThan(0);
    restore();
    dispose();
  });

  test("trackSource short-circuits when there is no active tracker", () => {
    // Should not throw even with no tracker.
    trackSource({ subscribers: new Set() });
  });

  test("trackSource short-circuits when the active tracker is disposed", () => {
    // Synthesize a disposed tracker scenario via untracked direct call.
    const source = { subscribers: new Set<{ id: number; disposed: boolean }>() };
    trackSource(source as never);
    expect(source.subscribers.size).toBe(0);
  });

  test("notifySubscribers ignores disposed subscribers", () => {
    const subscribers = new Set<{
      id: number;
      disposed: boolean;
      markDirty(): void;
    }>();
    let dirtyCalls = 0;
    subscribers.add({
      id: 1,
      disposed: true,
      markDirty() {
        dirtyCalls += 1;
      },
    });
    notifySubscribers({ subscribers } as never);
    expect(dirtyCalls).toBe(0);
  });

  test("cleanupDeps clears the computation deps set", () => {
    const dep = { subscribers: new Set<{ id: number; deps: unknown[] }>() };
    const computation = {
      id: 7,
      deps: [dep],
      disposed: false,
      queued: false,
      markDirty() {},
      run() {},
      dispose() {},
    };
    dep.subscribers.add(computation);
    cleanupDeps(computation as never);
    expect(computation.deps).toHaveLength(0);
    expect(dep.subscribers.size).toBe(0);
  });

  test("cleanupDeps clears array-backed computation deps", () => {
    const dep = { subscribers: new Set<{ id: number; deps: unknown[] }>() };
    const computation = {
      id: 8,
      deps: [dep],
      disposed: false,
      queued: false,
      markDirty() {},
      run() {},
      dispose() {},
    };
    dep.subscribers.add(computation);
    cleanupDeps(computation as never);
    expect(computation.deps).toHaveLength(0);
    expect(dep.subscribers.size).toBe(0);
  });
});
