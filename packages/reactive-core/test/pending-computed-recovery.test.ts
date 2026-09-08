import { describe, expect, test } from "vitest";
import { cell, computed, effect } from "../src/index.js";
import { runtimeState, type ReactiveComputation } from "../src/state.js";
import { flushEffects } from "../src/testing.js";
import { flushPendingComputed, queuePendingComputed } from "../src/tracking.js";

describe("pending computed creation order", () => {
  test.each(["layered", "paired", "shuffled"] as const)(
    "updates 128 independent pairs created in %s order",
    async (order) => {
      const source = cell(0);
      const first: Array<{ get(): number }> = [];
      const second: Array<{ get(): number }> = [];
      const tasks = Array.from({ length: 256 }, (_, id) => id);
      if (order === "paired")
        tasks.sort(
          (a, b) => (a % 128) * 2 + Math.floor(a / 128) - ((b % 128) * 2 + Math.floor(b / 128)),
        );
      if (order === "shuffled") {
        let seed = 42;
        for (let i = tasks.length - 1; i > 0; i -= 1) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          const j = seed % (i + 1);
          [tasks[i], tasks[j]] = [tasks[j]!, tasks[i]!];
        }
      }
      for (const task of tasks) {
        const i = task % 128;
        if (task < 128) first[i] = computed(() => source.get() + i);
        else second[i] = computed(() => first[i]!.get() * 2);
      }
      let total = 0;
      const stop = effect(() => {
        total = second.reduce((sum, node) => sum + node.get(), 0);
      });
      try {
        await flushEffects();
        source.setValue(1);
        await flushEffects();
        expect(total).toBe(16512);
        source.setValue(2);
        await flushEffects();
        expect(total).toBe(16768);
      } finally {
        stop();
      }
    },
  );
});

describe("pending computed failure recovery", () => {
  test.each([false, true])(
    "a self-requeue loop releases waiting work (later snapshot: %s)",
    (withLater) => {
      let looping = true;
      let loopRuns = 0;
      let laterRuns = 0;
      const loop: ReactiveComputation = {
        id: 1000001,
        deps: new Set(),
        disposed: false,
        queued: false,
        dispose() {},
        markDirty() {},
        run() {
          loopRuns += 1;
          if (looping) queuePendingComputed(loop);
        },
      };
      const later: ReactiveComputation = {
        id: 1000002,
        deps: new Set(),
        disposed: false,
        queued: false,
        dispose() {},
        markDirty() {},
        run() {
          laterRuns += 1;
        },
      };
      queuePendingComputed(loop);
      if (withLater) queuePendingComputed(later);
      try {
        expect(() => flushPendingComputed()).toThrow(/computed flush limit exceeded/i);
        expect(loopRuns).toBe(100);
        expect(loop.queued).toBe(false);
        expect(later.queued).toBe(false);
        expect(runtimeState.pendingComputed.size).toBe(0);
        expect(runtimeState.pendingComputedMinId).toBe(Infinity);
        expect(runtimeState.flushingComputed).toBe(false);
        looping = false;
        queuePendingComputed(loop);
        if (!later.queued) queuePendingComputed(later);
        flushPendingComputed();
        expect(loopRuns).toBe(101);
        expect(laterRuns).toBe(1);
      } finally {
        runtimeState.pendingComputed.clear();
        runtimeState.pendingComputedMinId = Infinity;
      }
    },
  );
});

test("a flush limit releases remaining pairs for an update after most observers stop", async () => {
  const source = cell(0);
  let looping = true;
  const loop: ReactiveComputation = {
    id: runtimeState.nextComputationId++,
    deps: new Set(),
    disposed: false,
    queued: false,
    dispose() {},
    markDirty() {},
    run() {
      if (looping) queuePendingComputed(loop);
    },
  };
  const stops: Array<() => void> = [];
  const history: number[] = [];
  for (let i = 0; i < 128; i += 1) {
    const first = computed(() => {
      const value = source.get();
      return value + i;
    });
    const second = computed(() => first.get() * 2);
    stops.push(
      effect(() => {
        const value = second.get();
        if (i === 127) history.push(value);
      }),
    );
  }
  try {
    await flushEffects();
    queuePendingComputed(loop);
    expect(() => source.setValue(1)).toThrow(/computed flush limit exceeded/i);
    for (const stop of stops.slice(0, -1)) stop();
    looping = false;
    source.setValue(2);
    await flushEffects();
    expect(history).toEqual([254, 258]);
    expect(runtimeState.pendingComputed.size).toBe(0);
  } finally {
    for (const stop of stops) stop();
  }
});

test("a cycle alternating between computations still reaches the execution limit", () => {
  let cycling = true;
  let runs = 0;
  const first: ReactiveComputation = {
    id: 2000001,
    deps: new Set(),
    disposed: false,
    queued: false,
    dispose() {},
    markDirty() {},
    run() {
      runs += 1;
      if (cycling) queuePendingComputed(second);
    },
  };
  const second: ReactiveComputation = {
    ...first,
    id: 2000002,
    run() {
      runs += 1;
      if (cycling) queuePendingComputed(first);
    },
  };
  queuePendingComputed(first);
  expect(() => flushPendingComputed()).toThrow(/computed flush limit exceeded/i);
  expect(runs).toBe(200);
  expect(first.queued).toBe(false);
  expect(second.queued).toBe(false);
  cycling = false;
  queuePendingComputed(first);
  flushPendingComputed();
  expect(runs).toBe(201);
});

test("a nested flush does not run pending work until the active computation returns", () => {
  const events: string[] = [];
  const later: ReactiveComputation = {
    id: runtimeState.nextComputationId++,
    deps: new Set(),
    disposed: false,
    queued: false,
    dispose() {},
    markDirty() {},
    run() {
      events.push("later");
    },
  };
  const first: ReactiveComputation = {
    ...later,
    id: runtimeState.nextComputationId++,
    run() {
      queuePendingComputed(later);
      events.push("start");
      flushPendingComputed();
      events.push("end");
    },
  };
  queuePendingComputed(first);
  flushPendingComputed();
  expect(events).toEqual(["start", "end", "later"]);
});

test("a disposed queued computation is released without running", () => {
  let runs = 0;
  const computation: ReactiveComputation = {
    id: runtimeState.nextComputationId++,
    deps: new Set(),
    disposed: true,
    queued: false,
    dispose() {},
    markDirty() {},
    run() {
      runs += 1;
    },
  };
  queuePendingComputed(computation);
  flushPendingComputed();
  expect(runs).toBe(0);
  expect(computation.queued).toBe(false);
  expect(runtimeState.pendingComputed.size).toBe(0);
});

test("a throwing run releases both newly queued work and the detached snapshot for recovery", () => {
  let fail = true;
  const events: string[] = [];
  const first: ReactiveComputation = {
    id: runtimeState.nextComputationId++,
    deps: new Set(),
    disposed: false,
    queued: false,
    dispose() {},
    markDirty() {},
    run() {
      queuePendingComputed(fresh);
      if (fail) throw new Error("run failed");
      events.push("first");
    },
  };
  const waiting: ReactiveComputation = {
    ...first,
    id: runtimeState.nextComputationId++,
    run() {
      events.push("waiting");
    },
  };
  const fresh: ReactiveComputation = {
    ...first,
    id: runtimeState.nextComputationId++,
    run() {
      events.push("fresh");
    },
  };
  queuePendingComputed(first);
  queuePendingComputed(waiting);
  expect(() => flushPendingComputed()).toThrow("run failed");
  expect(events).toEqual([]);
  expect([first.queued, waiting.queued, fresh.queued]).toEqual([false, false, false]);
  expect(runtimeState.pendingComputed.size).toBe(0);
  expect(runtimeState.pendingComputedMinId).toBe(Infinity);
  expect(runtimeState.flushingComputed).toBe(false);
  fail = false;
  queuePendingComputed(first);
  if (!waiting.queued) queuePendingComputed(waiting);
  flushPendingComputed();
  expect(events).toEqual(["first", "waiting", "fresh"]);
});
