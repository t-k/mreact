import { describe, expect, test } from "vitest";
import { setScheduler } from "../src/internal.js";
import { batch, cell, computed, effect, untrack } from "../src/index.js";
import { getCellSource } from "../src/cell.js";
import { withCleanupScope } from "../src/internal.js";
import type { ReadonlyCell } from "../src/types.js";
import { runtimeState, type ReactiveComputation } from "../src/state.js";
import { flushEffects } from "../src/testing.js";

describe("computed", () => {
  test("does not retain upstream dependencies after an untracked read", () => {
    const source = cell(1);
    const doubled = computed(() => source.get() * 2);

    expect(doubled.get()).toBe(2);
    expect(getCellSource(source)?.subscribers).toBeNull();

    source.set(2);

    expect(doubled.get()).toBe(4);
  });

  test("refreshes a nested computed after both computations become dormant", async () => {
    const source = cell(1);
    const inner = computed(() => source.get() * 2);
    const outer = computed(() => inner.get() + 1);
    const observed: number[] = [];

    const firstDispose = effect(() => {
      observed.push(outer.get());
    });
    firstDispose();

    source.set(2);

    const secondDispose = effect(() => {
      observed.push(outer.get());
    });
    expect(observed).toEqual([3, 5]);

    source.set(3);
    await flushEffects();

    expect(observed).toEqual([3, 5, 7]);
    secondDispose();
  });

  test("restores transitive dependencies when a cached nested computed is re-subscribed", async () => {
    const source = cell(1);
    const inner = computed(() => source.get() * 2);
    const outer = computed(() => inner.get() + 1);
    const observed: number[] = [];

    expect(outer.get()).toBe(3);

    const dispose = effect(() => {
      observed.push(outer.get());
    });

    expect(observed).toEqual([3]);
    source.set(3);
    await flushEffects();

    expect(observed).toEqual([3, 7]);
    dispose();
  });

  test("keeps transitive dependencies when sibling readers reattach to a dormant computed", () => {
    const source = cell(1);
    const shared = computed(() => source.get() * 2);
    const first = computed(() => shared.get() + 10);
    const second = computed(() => shared.get() + 20);

    expect(first.get()).toBe(12);
    expect(second.get()).toBe(22);

    source.set(2);

    expect(first.get()).toBe(14);
    expect(second.get()).toBe(24);
  });

  test("does not refresh a sibling dormant reader when the shared value is unchanged", () => {
    const source = cell(1);
    let sharedRuns = 0;
    let firstRuns = 0;
    let secondRuns = 0;
    const shared = computed(() => {
      sharedRuns += 1;
      return source.get() % 2;
    });
    const first = computed(() => {
      firstRuns += 1;
      return shared.get() + 10;
    });
    const second = computed(() => {
      secondRuns += 1;
      return shared.get() + 20;
    });

    expect(first.get()).toBe(11);
    expect(second.get()).toBe(21);
    expect([sharedRuns, firstRuns, secondRuns]).toEqual([1, 1, 1]);

    source.set(3);

    expect(first.get()).toBe(11);
    expect(second.get()).toBe(21);
    expect([sharedRuns, firstRuns, secondRuns]).toEqual([2, 2, 1]);
  });

  test("releases restored upstream dependencies when a dormant computed throws", () => {
    const shouldThrow = cell(false);
    const source = cell(1);
    const derived = computed(() => {
      if (shouldThrow.get()) {
        throw new Error("derived failed");
      }

      return source.get();
    });

    expect(derived.get()).toBe(1);
    shouldThrow.set(true);

    expect(() => derived.get()).toThrow("derived failed");
    expect(getCellSource(shouldThrow)?.subscribers).toBeNull();
    expect(getCellSource(source)?.subscribers).toBeNull();
  });

  test("releases upstream dependencies when its cleanup owner is disposed", () => {
    const source = cell(1);
    const disposers: Array<() => void> = [];
    let doubled: ReadonlyCell<number> | undefined;

    withCleanupScope(
      (dispose) => disposers.push(dispose),
      () => {
        doubled = computed(() => source.get() * 2);
        doubled.get();
      },
    );

    expect(getCellSource(source)?.subscribers).toBeNull();
    disposers[0]?.();
    expect(() => doubled?.get()).toThrow(/disposed/i);
  });

  test("computes initial value", () => {
    const count = cell(1);
    const doubled = computed(() => count.get() * 2);

    expect(doubled.get()).toBe(2);
  });

  test("get after dependency set returns fresh value synchronously", () => {
    const count = cell(1);
    const doubled = computed(() => count.get() * 2);

    count.set(2);

    expect(doubled.get()).toBe(4);
  });

  test("does not recompute without a read", () => {
    const count = cell(1);
    let runs = 0;
    const doubled = computed(() => {
      runs += 1;
      return count.get() * 2;
    });

    expect(runs).toBe(0);
    expect(doubled.get()).toBe(2);
    count.set(2);
    expect(runs).toBe(1);
    expect(doubled.get()).toBe(4);
    expect(runs).toBe(2);
  });

  test("observed computed may recompute during propagation", async () => {
    const count = cell(1);
    let runs = 0;
    const doubled = computed(() => {
      runs += 1;
      return count.get() * 2;
    });

    effect(() => {
      doubled.get();
    });

    count.set(2);

    expect(runs).toBe(2);

    await flushEffects();

    expect(runs).toBe(2);
  });

  test("defers observed computed recomputation until a batch completes", async () => {
    const values = Array.from({ length: 5 }, () => cell(0));
    let runs = 0;
    const total = computed(() => {
      runs += 1;
      return values.reduce((sum, value) => sum + value.get(), 0);
    });
    const seen: number[] = [];

    effect(() => {
      seen.push(total.get());
    });

    expect(runs).toBe(1);

    batch(() => {
      for (const value of values) {
        value.set(1);
      }

      expect(runs).toBe(1);
    });

    expect(runs).toBe(2);

    await flushEffects();

    expect(seen).toEqual([0, 5]);
  });

  test("clears a queued computed when its last subscriber is removed", () => {
    const source = cell(0);
    const derived = computed(() => source.get() * 2);
    const dispose = effect(() => {
      derived.get();
    });

    try {
      batch(() => {
        source.set(1);
        const queued = Array.from(runtimeState.pendingComputed)[0];

        expect(queued).toBeDefined();
        expect(queued?.queued).toBe(true);

        dispose();

        expect(queued?.queued).toBe(false);
        expect(runtimeState.pendingComputed.has(queued as ReactiveComputation)).toBe(false);
      });
    } finally {
      dispose();
      runtimeState.pendingComputed.clear();
    }
  });

  test("flat computed fan-in reruns do not append touched dependency metadata", () => {
    const first = cell(0);
    const second = cell(0);
    const third = cell(0);
    const total = computed(() => first.get() + second.get() + third.get());

    expect(total.get()).toBe(0);

    const originalPush = Array.prototype.push;
    let pushCalls = 0;

    try {
      Array.prototype.push = function countedPush<T>(this: T[], ...items: T[]): number {
        pushCalls += 1;
        return originalPush.apply(this, items);
      };

      batch(() => {
        first.set(1);
        second.set(2);
        third.set(3);
      });

      expect(total.get()).toBe(6);
    } finally {
      Array.prototype.push = originalPush;
    }

    expect(pushCalls).toBe(0);
  });

  test("stable flat computed fan-in reruns do not probe the dependency set", () => {
    const first = cell(0);
    const second = cell(0);
    const third = cell(0);
    const total = computed(() => first.get() + second.get() + third.get());

    expect(total.get()).toBe(0);

    const originalHas = Set.prototype.has;
    let sourceHasCalls = 0;

    try {
      Set.prototype.has = function countedHas<T>(this: Set<T>, value: T): boolean {
        if (typeof value === "object" && value !== null && "subscribers" in value) {
          sourceHasCalls += 1;
        }

        return originalHas.call(this, value);
      };

      batch(() => {
        first.set(1);
        second.set(2);
        third.set(3);
      });

      expect(total.get()).toBe(6);
    } finally {
      Set.prototype.has = originalHas;
    }

    expect(sourceHasCalls).toBe(0);
  });

  test("initial run does not probe cleanup touched dependency set", () => {
    const count = cell(0);
    const label = computed(() => count.get());
    const originalHas = Set.prototype.has;
    let sourceHasCalls = 0;

    try {
      Set.prototype.has = function countedHas<T>(this: Set<T>, value: T): boolean {
        if (typeof value === "object" && value !== null && "subscribers" in value) {
          sourceHasCalls += 1;
        }

        return originalHas.call(this, value);
      };

      expect(label.get()).toBe(0);
    } finally {
      Set.prototype.has = originalHas;
    }

    expect(sourceHasCalls).toBe(0);
  });

  test("stable flat computed fan-in reruns do not allocate added dependency tracking", () => {
    const first = cell(0);
    const second = cell(0);
    const third = cell(0);
    let runs = 0;
    const addedDepsTrackingDuringStableRun: unknown[] = [];
    const total = computed(() => {
      runs += 1;

      if (runs > 1) {
        addedDepsTrackingDuringStableRun.push(
          (runtimeState.activeTracker as ReactiveComputation | null)?.trackingAddedDeps,
        );
      }

      return first.get() + second.get() + third.get();
    });

    expect(total.get()).toBe(0);

    batch(() => {
      first.set(1);
      second.set(2);
      third.set(3);
    });

    expect(total.get()).toBe(6);
    expect(addedDepsTrackingDuringStableRun).toEqual([undefined]);
  });

  test("preserves ordered dependency metadata for cached observed reads", () => {
    const first = cell(1);
    const second = cell(2);
    const third = cell(3);
    let computation: ReactiveComputation | null = null;
    const total = computed(() => {
      computation = runtimeState.activeTracker as ReactiveComputation | null;
      return first.get() + second.get() + third.get();
    });
    const dispose = effect(() => {
      total.get();
    });

    expect(computation?.orderedDeps).toHaveLength(3);

    total.get();

    expect(computation?.orderedDeps).toHaveLength(3);
    dispose();
  });

  test("stable ordered computed fan-in reruns do not rewrite source tracking versions", () => {
    const first = cell(0);
    const second = cell(0);
    const third = cell(0);
    let capturedComputation: ReactiveComputation | undefined;
    const total = computed(() => {
      capturedComputation = (runtimeState.activeTracker as ReactiveComputation | null) ?? undefined;
      return first.get() + second.get() + third.get();
    });

    expect(total.get()).toBe(0);

    const deps = [...(capturedComputation?.deps ?? [])];
    const trackedVersions = deps.map((dep) => dep.trackedVersion);

    batch(() => {
      first.set(1);
      second.set(2);
      third.set(3);
    });

    expect(total.get()).toBe(6);
    expect(deps.map((dep) => dep.trackedVersion)).toEqual(trackedVersions);
  });

  test("nested computed reruns preserve direct dependencies read before the nested read", () => {
    const source = cell(1);
    const parity = computed(() => source.get() % 2);
    const total = computed(() => source.get() + parity.get());

    expect(total.get()).toBe(2);

    source.set(3);

    expect(total.get()).toBe(4);
  });

  test("can depend on another computed", () => {
    const count = cell(1);
    const doubled = computed(() => count.get() * 2);
    const label = computed(() => `count:${doubled.get()}`);

    count.set(3);

    expect(label.get()).toBe("count:6");
  });

  test("diamond dependency is glitch-free and effect runs once", async () => {
    const source = cell(1);
    const plusOne = computed(() => source.get() + 1);
    const doubled = computed(() => source.get() * 2);
    const observed: Array<[number, number]> = [];

    effect(() => {
      observed.push([plusOne.get(), doubled.get()]);
    });

    source.set(2);
    await flushEffects();

    expect(observed).toEqual([
      [2, 2],
      [3, 4],
    ]);
  });

  test("does not notify downstream when Object.is result is unchanged", async () => {
    const count = cell(1);
    const parity = computed(() => count.get() % 2);
    const calls: number[] = [];

    effect(() => {
      calls.push(parity.get());
    });

    count.set(3);
    await flushEffects();

    expect(calls).toEqual([1]);
  });

  test("uses a custom equality comparator to skip downstream notifications", async () => {
    const source = cell({ id: 1, label: "first" });
    const selected = computed(() => ({ id: source.get().id }), {
      equals: (previous, next) => previous.id === next.id,
    });
    const calls: Array<{ id: number }> = [];

    effect(() => {
      calls.push(selected.get());
    });

    source.set({ id: 1, label: "renamed" });
    await flushEffects();

    source.set({ id: 2, label: "second" });
    await flushEffects();

    expect(calls).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("can force notification by returning false from the equality comparator", async () => {
    const source = cell(1);
    const selected = computed(() => source.get() % 2, { equals: () => false });
    const calls: number[] = [];

    effect(() => {
      calls.push(selected.get());
    });

    source.set(3);
    await flushEffects();

    expect(calls).toEqual([1, 1]);
  });

  test("unsubscribes from stale dependencies", () => {
    const enabled = cell(true);
    const first = cell(1);
    const second = cell(10);
    const value = computed(() => (enabled.get() ? first.get() : second.get()));

    expect(value.get()).toBe(1);
    enabled.set(false);
    expect(value.get()).toBe(10);
    first.set(2);

    expect(value.get()).toBe(10);
  });

  test("keeps prefix dependencies when a stable ordered computed drops a suffix", () => {
    const includeSecond = cell(true);
    const first = cell(1);
    const second = cell(10);
    const value = computed(() => (includeSecond.get() ? first.get() + second.get() : first.get()));

    expect(value.get()).toBe(11);
    includeSecond.set(false);
    expect(value.get()).toBe(1);
    first.set(2);

    expect(value.get()).toBe(2);
  });

  test("read inside untrack inside computed is not subscribed", () => {
    const tracked = cell(1);
    const ignored = cell(10);
    const value = computed(() => tracked.get() + untrack(() => ignored.get()));

    expect(value.get()).toBe(11);
    ignored.set(20);
    expect(value.get()).toBe(11);
    tracked.set(2);
    expect(value.get()).toBe(22);
  });

  test("fan-in diamond with unchanged final value does not rerun downstream", async () => {
    const source = cell(1);
    const left = computed(() => source.get() + 1);
    const right = computed(() => 3 - source.get());
    let combinedRuns = 0;
    const combined = computed(() => {
      combinedRuns += 1;
      return left.get() + right.get();
    });
    const seen: number[] = [];

    effect(() => {
      seen.push(combined.get());
    });

    source.set(2);
    await flushEffects();

    expect(seen).toEqual([4]);
    expect(combinedRuns).toBe(2);
  });

  test("throwing computed keeps subscriptions and recovers on later dependency update", async () => {
    const restoreScheduler = setScheduler({
      schedule() {
        // The test drains effects explicitly with flushEffects.
      },
    });

    try {
      const shouldThrow = cell(false);
      const value = cell(1);
      const derived = computed(() => {
        if (shouldThrow.get()) {
          throw new Error("derived failed");
        }

        return value.get();
      });
      const seen: number[] = [];

      effect(() => {
        seen.push(derived.get());
      });

      shouldThrow.set(true);
      await expect(flushEffects()).rejects.toThrow("derived failed");

      shouldThrow.set(false);
      value.set(3);
      await flushEffects();

      expect(seen).toEqual([1, 3]);
    } finally {
      restoreScheduler();
    }
  });

  test("throwing observed computed schedules downstream flush", () => {
    const scheduled: Array<() => void> = [];
    const restoreScheduler = setScheduler({
      schedule(flush) {
        scheduled.push(flush);
      },
    });

    try {
      const shouldThrow = cell(false);
      const derived = computed(() => {
        if (shouldThrow.get()) {
          throw new Error("derived failed");
        }

        return 1;
      });

      effect(() => {
        derived.get();
      });

      shouldThrow.set(true);

      expect(scheduled).toHaveLength(1);
    } finally {
      restoreScheduler();
    }
  });

  test("propagates an upstream computed failure instead of returning a stale downstream cache", () => {
    const source = cell(1);
    const inner = computed(() => {
      const value = source.get();
      if (value === 2) {
        throw new Error("inner failed");
      }

      return value;
    });
    const outer = computed(() => inner.get() + 10);

    expect(outer.get()).toBe(11);
    source.set(2);

    expect(() => inner.get()).toThrow("inner failed");
    expect(() => outer.get()).toThrow("inner failed");

    source.set(3);
    expect(outer.get()).toBe(13);
  });
});
