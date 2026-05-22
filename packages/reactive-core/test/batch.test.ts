import { describe, expect, test } from "vitest";
import { batch, batchAsync, cell, computed, effect } from "../src/index.js";
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

  test("batchAsync defers effect flush across await points", async () => {
    const count = cell(0);
    const calls: number[] = [];

    effect(() => {
      calls.push(count.get());
    });

    await batchAsync(async () => {
      count.set(1);
      await Promise.resolve();
      count.set(2);
      expect(calls).toEqual([0]);
    });

    await flushEffects();

    expect(calls).toEqual([0, 2]);
  });

  test("batchAsync flushes a diamond dependency graph once after await points", async () => {
    const source = cell(1);
    const left = computed(() => source.get() + 1);
    const right = computed(() => source.get() * 2);
    const total = computed(() => left.get() + right.get());
    const calls: number[] = [];

    effect(() => {
      calls.push(total.get());
    });

    await batchAsync(async () => {
      source.set(2);
      await Promise.resolve();
      source.set(3);
      expect(calls).toEqual([4]);
    });

    await flushEffects();

    expect(calls).toEqual([4, 10]);
  });

  test("batchAsync releases queued effects when the callback throws", async () => {
    const count = cell(0);
    const calls: number[] = [];

    effect(() => {
      calls.push(count.get());
    });

    await expect(
      batchAsync(async () => {
        count.set(1);
        await Promise.resolve();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await flushEffects();

    expect(calls).toEqual([0, 1]);
  });

  test("nested batchAsync waits for the outer batch before flushing", async () => {
    const count = cell(0);
    const calls: number[] = [];

    effect(() => {
      calls.push(count.get());
    });

    await batchAsync(async () => {
      count.set(1);
      await batchAsync(async () => {
        count.set(2);
        await Promise.resolve();
      });
      expect(calls).toEqual([0]);
      count.set(3);
    });

    await flushEffects();

    expect(calls).toEqual([0, 3]);
  });
});
