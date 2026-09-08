import { describe, expect, test } from "vitest";
import { batch, cell, computed, effect } from "../src/index.js";
import { getCellSource } from "../src/cell.js";
import { runtimeState, type ReactiveComputation } from "../src/state.js";
import { setScheduler } from "../src/internal.js";

const schedulers = ["microtask", "sync", "queued"] as const;

describe.each(schedulers)("computed reads within a batch (%s scheduler)", (scheduler) => {
  test.each(["single", "set-many", "set-one"] as const)(
    "invalidates a refreshed queued cache with %s subscribers",
    async (representation) => {
      const callbacks: Array<() => void> = [];
      const restore =
        scheduler === "microtask"
          ? () => {}
          : setScheduler({
              schedule: (callback) =>
                scheduler === "sync" ? callback() : void callbacks.push(callback),
            });
      const source = cell(0);
      const derived = computed(() => source.get() * 10);
      const seen: number[] = [];
      const stop = effect(() => {
        seen.push(derived.get());
      });
      const extra =
        representation === "single"
          ? () => {}
          : effect(() => {
              source.get();
            });
      if (representation === "set-one") extra();
      try {
        batch(() => {
          source.setValue(1);
          expect(derived.get()).toBe(10);
          source.setValue(2);
          expect(seen).toEqual([0]);
        });
        while (callbacks.length) callbacks.shift()!();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(seen).toEqual([0, 20]);
        expect(derived.get()).toBe(20);
      } finally {
        extra();
        stop();
        restore();
      }
    },
  );

  test.each([1, 2, 3, 4, 8])(
    "reads a fresh %i-stage chain without running effects",
    async (depth) => {
      const callbacks: Array<() => void> = [];
      const restore =
        scheduler === "microtask"
          ? () => {}
          : setScheduler({
              schedule: (callback) =>
                scheduler === "sync" ? callback() : void callbacks.push(callback),
            });
      const source = cell(0);
      let tail: { get(): number } = source;
      for (let index = 0; index < depth; index++) {
        const previous = tail;
        tail = computed(() => previous.get() + 1);
      }
      const seen: number[] = [];
      const stop = effect(() => {
        seen.push(tail.get());
      });
      try {
        batch(() => {
          source.setValue(1);
          expect(tail.get()).toBe(depth + 1);
          expect(runtimeState.pull).toBeUndefined();
          batch(() => {
            source.setValue(2);
            expect(tail.get()).toBe(depth + 2);
          });
          expect(seen).toEqual([depth]);
          source.setValue(3);
        });
        while (callbacks.length) callbacks.shift()!();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(runtimeState.pull).toBeUndefined();
        expect(seen).toEqual([depth, depth + 3]);
        expect(tail.get()).toBe(depth + 3);
      } finally {
        stop();
        restore();
      }
    },
  );
});

test("pulls only the requested branch and recovers after an upstream error", () => {
  const source = cell(0);
  let unrelatedRuns = 0;
  const unrelated = computed(() => {
    unrelatedRuns++;
    return source.get();
  });
  const first = computed(() => {
    if (source.get() === 1) throw new Error("upstream");
    return source.get();
  });
  const second = computed(() => first.get() + 1);
  const third = computed(() => second.get() + 1);
  const stop = effect(() => {
    third.get();
    unrelated.get();
  });
  try {
    batch(() => {
      source.setValue(1);
      expect(() => third.get()).toThrow("upstream");
      expect(unrelatedRuns).toBe(1);
      source.setValue(2);
      expect(third.get()).toBe(4);
      expect(unrelatedRuns).toBe(1);
    });
    expect(third.get()).toBe(4);
  } finally {
    stop();
  }
});

// Count actual dependency iteration, including nested reads during publishing.
function diamondVisits(depth: number): number {
  const source = cell(0);
  let tail: { get(): number } = source;
  for (let index = 0; index < depth; index++) {
    const previous = tail;
    const left = computed(() => previous.get() + 1);
    const right = computed(() => previous.get() + 2);
    tail = computed(() => left.get() + right.get());
  }
  const stop = effect(() => {
    tail.get();
  });
  let visits = 0;
  const patched = new Set<ReactiveComputation>();
  const restorers: Array<() => void> = [];
  const patch = (computation: ReactiveComputation) => {
    if (patched.has(computation)) return;
    patched.add(computation);
    for (const dep of computation.deps) if (dep.publisher) patch(dep.publisher);
    const deps = computation.deps;
    const original = deps[Symbol.iterator];
    deps[Symbol.iterator] = function* () {
      for (const dep of original.call(deps)) {
        visits++;
        yield dep;
      }
    };
    restorers.push(() => {
      deps[Symbol.iterator] = original;
    });
  };
  // Walk upstream from a reader attached to a probe cell and the graph tail.
  const probe = cell(0);
  const stopProbe = effect(() => {
    probe.get();
    tail.get();
  });
  patch(getCellSource(probe)!.subscribers as ReactiveComputation);
  try {
    batch(() => {
      source.setValue(1);
      visits = 0;
      expect(tail.get()).toBe(2 ** depth + 3 * (2 ** depth - 1));
    });
    return visits;
  } finally {
    for (const restore of restorers) restore();
    stopProbe();
    stop();
  }
}

test("shares upstream validation across diamonds and nested computed reads", () => {
  const small = diamondVisits(8);
  const large = diamondVisits(16);
  expect(large).toBeLessThan(small * 3);
  expect(large).toBeLessThan(16 * 40);
});

test("validates a dormant leaf through an observed clean middle in a batch", () => {
  const source = cell(3);
  const upstream = computed(() => source.get());
  const middle = computed(() => upstream.get());
  const leaf = computed(() => middle.get());
  const stopMiddle = effect(() => {
    middle.get();
  });
  const stopLeaf = effect(() => {
    leaf.get();
  });
  stopLeaf();
  try {
    batch(() => {
      source.setValue(2);
      expect(leaf.get()).toBe(2);
    });
  } finally {
    stopMiddle();
  }
});

function chainFlushVisits(depth: number): number {
  const source = cell(0);
  const probe = cell(0);
  let tail: { get(): number } = source;
  for (let index = 0; index < depth; index++) {
    const previous = tail;
    tail = computed(() => previous.get() + 1);
  }
  const stop = effect(() => {
    probe.get();
    tail.get();
  });
  let visits = 0;
  const patched = new Set<ReactiveComputation>();
  const restores: Array<() => void> = [];
  const patch = (computation: ReactiveComputation) => {
    if (patched.has(computation)) return;
    patched.add(computation);
    for (const dep of computation.deps) if (dep.publisher) patch(dep.publisher);
    const deps = computation.deps;
    const original = deps[Symbol.iterator];
    deps[Symbol.iterator] = function* () {
      for (const dep of original.call(deps)) {
        visits++;
        yield dep;
      }
    };
    restores.push(() => {
      deps[Symbol.iterator] = original;
    });
  };
  patch(getCellSource(probe)!.subscribers as ReactiveComputation);
  try {
    batch(() => {
      source.setValue(1);
    });
    expect(tail.get()).toBe(depth + 1);
    return visits;
  } finally {
    for (const restore of restores) restore();
    stop();
  }
}

test("keeps ordinary topological chain flush validation linear", () => {
  const small = chainFlushVisits(32);
  const large = chainFlushVisits(128);
  expect(large).toBeLessThan(small * 5);
  // A successful recompute already validated its reads; later consumers need
  // not walk those dependencies again during the same flush.
  expect(large).toBeLessThan(128);
});

test("revalidates shared dependencies after a reentrant write during a pull", () => {
  const source = cell(0);
  const first = computed(() => source.get());
  const writer = computed(() => {
    const value = first.get();
    if (value === 1) source.setValue(2);
    return value;
  });
  const middle = computed(() => writer.get());
  const tail = computed(() => middle.get());
  const other = computed(() => first.get() + tail.get());
  const stop = effect(() => {
    other.get();
  });
  try {
    batch(() => {
      source.setValue(1);
      tail.get();
      expect(other.get()).toBe(4);
      expect(tail.get()).toBe(2);
    });
    expect(other.get()).toBe(4);
  } finally {
    stop();
  }
});

test("discards earlier proofs when a later sibling writes their source", () => {
  const source = cell(0);
  const trigger = cell(0);
  const first = computed(() => source.get());
  const left = computed(() => first.get() + 1);
  const writer = computed(() => {
    const value = trigger.get();
    if (value === 1) source.setValue(2);
    return value;
  });
  const middle = computed(() => first.get() + 1);
  const right = computed(() => middle.get() + 1);
  const total = computed(() => left.get() + writer.get() + right.get());
  const stop = effect(() => {
    total.get();
  });
  try {
    batch(() => {
      source.setValue(1);
      trigger.setValue(1);
      expect(total.get()).toBe(8);
    });
    expect(total.get()).toBe(8);
    expect(runtimeState.pull).toBeUndefined();
  } finally {
    stop();
  }
});
