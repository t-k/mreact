import { describe, expect, test } from "vitest";
import { cell, computed, effect, untrack } from "../src/index.js";
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
});
