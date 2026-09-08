import { afterEach, describe, expect, test } from "vitest";
import { runtimeState, type ReactiveComputation } from "../src/state.js";
import { flushPendingComputed, queuePendingComputed } from "../src/tracking.js";

// Drives the flush directly with synthetic computations so the merge order of
// work queued mid-pass is observable without going through cells.
function node(id: number, log: number[], onRun?: () => void): ReactiveComputation {
  const computation: ReactiveComputation = {
    id,
    deps: new Set(),
    disposed: false,
    queued: false,
    dispose() {},
    markDirty() {},
    run() {
      log.push(id);
      onRun?.();
    },
  };
  return computation;
}

afterEach(() => {
  runtimeState.pendingComputed.clear();
  runtimeState.pendingComputedMinId = Infinity;
  runtimeState.flushingComputed = false;
});

describe("pending computed merge order", () => {
  test("work queued mid-pass runs in creation order relative to the remaining pass", () => {
    const log: number[] = [];
    const early = node(5, log);
    const between = node(25, log);
    const late = node(40, log);
    const first = node(10, log, () => {
      queuePendingComputed(early);
      queuePendingComputed(between);
    });
    const second = node(20, log, () => {
      queuePendingComputed(late);
    });
    const third = node(30, log);
    queuePendingComputed(first);
    queuePendingComputed(second);
    queuePendingComputed(third);

    flushPendingComputed();

    expect(log).toEqual([10, 5, 20, 25, 30, 40]);
    for (const computation of [early, between, late, first, second, third]) {
      expect(computation.queued).toBe(false);
    }
  });

  test("a computation queued again while it waits in the merged pass runs once", () => {
    const log: number[] = [];
    const second = node(20, log);
    const early = node(5, log, () => {
      queuePendingComputed(second);
    });
    const first = node(10, log, () => {
      queuePendingComputed(early);
      queuePendingComputed(second);
    });
    const third = node(30, log);
    queuePendingComputed(first);
    queuePendingComputed(second);
    queuePendingComputed(third);

    flushPendingComputed();

    expect(log).toEqual([10, 5, 20, 30]);
    expect(runtimeState.pendingComputed.size).toBe(0);
  });

  test("many merges always run the smallest waiting id next", () => {
    const log: number[] = [];
    const waiting = new Set<number>();
    const violations: number[] = [];
    let seed = 7;
    const nextId = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return 100 + (seed % 100000);
    };
    const ids = new Set<number>();
    while (ids.size < 200) ids.add(nextId());
    const pool = [...ids];
    let cursor = 0;
    const queue = (id: number, onRun?: () => void) => {
      waiting.add(id);
      queuePendingComputed(
        node(id, log, () => {
          if (id !== Math.min(...waiting)) violations.push(id);
          waiting.delete(id);
          onRun?.();
        }),
      );
    };
    const queueSome = (count: number) => {
      for (let i = 0; i < count && cursor < pool.length; i += 1, cursor += 1) {
        queue(pool[cursor]!, () => queueSome(3));
      }
    };
    queue(1_000_000, () => queueSome(20));
    queue(1_000_001);

    flushPendingComputed();

    expect(violations).toEqual([]);
    expect(log).toHaveLength(pool.length + 2);
    expect(new Set(log).size).toBe(log.length);
    expect(waiting.size).toBe(0);
  });

  test("a failure while draining the merged pass releases the heap", () => {
    const log: number[] = [];
    const early = node(5, log, () => {
      throw new Error("boom");
    });
    const first = node(10, log, () => {
      queuePendingComputed(early);
    });
    const second = node(20, log);
    const third = node(30, log);
    queuePendingComputed(first);
    queuePendingComputed(second);
    queuePendingComputed(third);

    expect(() => flushPendingComputed()).toThrow("boom");

    expect(log).toEqual([10, 5]);
    expect(second.queued).toBe(false);
    expect(third.queued).toBe(false);
    expect(runtimeState.pendingComputed.size).toBe(0);
    expect(runtimeState.flushingComputed).toBe(false);
  });
});
