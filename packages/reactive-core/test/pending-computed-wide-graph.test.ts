import { describe, expect, test } from "vitest";
import { cell, computed, effect } from "../src/index.js";
import { runtimeState, type ReactiveComputation } from "../src/state.js";
import { flushEffects } from "../src/testing.js";

// Counts the elements handed out by every iteration over the pending queue,
// which is the flush bookkeeping cost that must stay linear in the queue size.
function countPendingQueueTraffic(run: () => void): number {
  const original = runtimeState.pendingComputed;
  let visited = 0;
  const counting = new Set<ReactiveComputation>();
  const iterate = counting[Symbol.iterator].bind(counting);
  const values = counting.values.bind(counting);
  const counted = function* (source: () => IterableIterator<ReactiveComputation>) {
    for (const item of source()) {
      visited += 1;
      yield item;
    }
  };
  counting[Symbol.iterator] = () => counted(iterate);
  counting.values = () => counted(values);
  runtimeState.pendingComputed = counting;
  try {
    run();
  } finally {
    runtimeState.pendingComputed = original;
  }
  return visited;
}

async function measureWideGraph(width: number): Promise<number> {
  const source = cell(0);
  const first = Array.from({ length: width }, (_, index) => computed(() => source.get() + index));
  const second = first.map((node) => computed(() => node.get() * 2));
  let total = 0;
  const stop = effect(() => {
    total = second.reduce((sum, node) => sum + node.get(), 0);
  });
  await flushEffects();

  try {
    const visited = countPendingQueueTraffic(() => {
      source.setValue(1);
    });
    await flushEffects();
    expect(total).toBe(width * 2 + width * (width - 1));
    return visited;
  } finally {
    stop();
  }
}

async function timeWideGraphUpdates(width: number, updates: number): Promise<number> {
  const source = cell(0);
  const first = Array.from({ length: width }, (_, index) => computed(() => source.get() + index));
  const second = first.map((node) => computed(() => node.get() * 2));
  const stop = effect(() => {
    second.reduce((sum, node) => sum + node.get(), 0);
  });
  await flushEffects();

  try {
    let best = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const started = performance.now();
      for (let update = 1; update <= updates; update += 1) {
        source.setValue(attempt * updates + update);
      }
      best = Math.min(best, performance.now() - started);
    }
    return best;
  } finally {
    stop();
  }
}

describe("pending computed flush on wide graphs", () => {
  test("merging later consumers queued mid-pass keeps queue traffic linear in the width", async () => {
    const small = await measureWideGraph(128);
    const large = await measureWideGraph(512);

    // Four times the width may cost about four times the traffic, not sixteen.
    expect(large).toBeLessThan(small * 6);
  });

  test("a pass that only queues later consumers does not re-sort the pass per computation", async () => {
    // Re-merging on every computation would copy and re-order the remaining
    // pass each time, which grows with the square of the width. Compare the
    // best of several runs so machine speed and load cancel out of the ratio.
    const small = await timeWideGraphUpdates(512, 20);
    const large = await timeWideGraphUpdates(2048, 20);

    expect(large).toBeLessThan(Math.max(small, 0.5) * 10);
  });
});

describe("pending computed flush on deep chains", () => {
  test("a subscribed chain deeper than the flush iteration limit updates in one flush", async () => {
    const source = cell(0);
    let node: { get(): number } = source;
    for (let depth = 0; depth < 300; depth += 1) {
      const previous = node;
      node = computed(() => previous.get() + 1);
    }
    let last = -1;
    const stop = effect(() => {
      last = node.get();
    });
    await flushEffects();

    try {
      expect(last).toBe(300);
      source.setValue(5);
      await flushEffects();
      expect(last).toBe(305);
      expect(node.get()).toBe(305);
    } finally {
      stop();
    }
  });
});
