import { describe, expect, test } from "vitest";
import { batch, cell, computed, effect, untrack } from "../src/index.js";
import { setScheduler } from "../src/scheduler.js";

describe("reactive-core: edge branches", () => {
  test("batch returns the inner callback result even when no writes happen", () => {
    expect(batch(() => 42)).toBe(42);
  });

  test("cell.set with a function ignores updates when the value is reference-equal", () => {
    const c = cell({ a: 1 });
    let notifications = 0;
    const dispose = effect(() => {
      c.get();
      notifications += 1;
    });

    notifications = 0;
    c.set((prev) => prev);
    expect(notifications).toBe(0);
    dispose();
  });

  test("computed runs lazily and re-uses the cached value when not dirty", () => {
    const value = cell(1);
    let computations = 0;
    const doubled = computed(() => {
      computations += 1;
      return value.get() * 2;
    });

    expect(doubled.get()).toBe(2);
    expect(doubled.get()).toBe(2);
    expect(computations).toBe(1);
  });

  test("computed propagates throws and re-marks dirty so a later read can recompute cleanly", () => {
    let shouldThrow = true;
    const dep = cell(0);
    const flaky = computed(() => {
      dep.get();
      if (shouldThrow) {
        throw new Error("boom");
      }
      return "ok";
    });

    expect(() => flaky.get()).toThrow("boom");
    shouldThrow = false;
    expect(flaky.get()).toBe("ok");
  });

  test("computed without subscribers does not re-publish on markDirty", () => {
    const dep = cell(0);
    let computations = 0;
    const c = computed(() => {
      computations += 1;
      return dep.get();
    });
    c.get();
    expect(computations).toBe(1);
    dep.set(1); // no subscribers => markDirty should early-return after computation has not value
    dep.set(2);
    expect(computations).toBe(1);
    expect(c.get()).toBe(2);
    expect(computations).toBe(2);
  });

  test("trackSource is a no-op when there is no active tracker", () => {
    const c = cell(1);
    // Reading outside of any computation just returns the value without throwing.
    expect(c.get()).toBe(1);
    untrack(() => {
      expect(c.get()).toBe(1);
    });
  });

  test("setScheduler returns a restore function that puts the previous scheduler back", async () => {
    let scheduled = 0;
    const scheduledFlushes: Array<() => void> = [];
    const restore = setScheduler({
      schedule(flush) {
        scheduled += 1;
        scheduledFlushes.push(flush);
      },
    });

    const c = cell(0);
    const dispose = effect(() => {
      c.get();
    });
    c.set(1);
    expect(scheduled).toBe(1);
    scheduledFlushes.shift()?.();
    restore();
    c.set(2);
    await Promise.resolve();
    expect(scheduled).toBe(1);
    dispose();
  });
});
