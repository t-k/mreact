import { describe, expect, test } from "vitest";
import { setScheduler } from "../src/internal.js";
import { batch, cell, computed, effect, untrack } from "../src/index.js";
import { flushEffects } from "../src/testing.js";

describe("computed", () => {
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

  test("flat computed fan-in reruns do not append touched dependency metadata", () => {
    const first = cell(0);
    const second = cell(0);
    const third = cell(0);
    const total = computed(() => first.get() + second.get() + third.get());

    expect(total.get()).toBe(0);

    const originalPush = Array.prototype.push;
    let pushCalls = 0;

    try {
      Array.prototype.push = function countedPush<T>(
        this: T[],
        ...items: T[]
      ): number {
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
    const selected = computed(
      () => ({ id: source.get().id }),
      { equals: (previous, next) => previous.id === next.id },
    );
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
});
