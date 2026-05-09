import { describe, expect, test } from "vitest";
import { batch, cell, effect } from "../src/index.js";
import { setScheduler } from "../src/internal.js";
import { flushEffects } from "../src/testing.js";

describe("batch", () => {
  test("returns callback value", () => {
    const result = batch(() => 42);

    expect(result).toBe(42);
  });

  test("multiple updates cause one effect rerun", async () => {
    const calls: number[] = [];
    const count = cell(0);

    effect(() => {
      calls.push(count.get());
    });

    batch(() => {
      count.set(1);
      count.set(2);
    });

    expect(calls).toEqual([0]);

    await flushEffects();

    expect(calls).toEqual([0, 2]);
  });

  test("updater inside batch sees previous queued value", async () => {
    const count = cell(0);

    batch(() => {
      count.set((prev) => prev + 1);
      count.set((prev) => prev + 1);
    });

    await flushEffects();

    expect(count.get()).toBe(2);
  });

  test("defers scheduler until outer batch exits", () => {
    const scheduled: Array<() => void> = [];
    const restoreScheduler = setScheduler({
      schedule(flush) {
        scheduled.push(flush);
      },
    });

    try {
      const count = cell(0);
      effect(() => {
        count.get();
      });

      batch(() => {
        count.set(1);
        count.set(2);
        expect(scheduled).toHaveLength(0);
      });

      expect(scheduled).toHaveLength(1);
    } finally {
      restoreScheduler();
    }
  });
});
