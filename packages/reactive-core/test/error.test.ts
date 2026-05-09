import { describe, expect, test } from "vitest";
import { batch, cell, effect, untrack } from "../src/index.js";
import type { Scheduler } from "../src/internal.js";
import { flushQueuedComputations, setScheduler } from "../src/internal.js";
import { flushEffects, flushMicrotasks } from "../src/testing.js";

describe("error semantics", () => {
  test("current tracker is restored if nested effect throws", async () => {
    const tracked = cell(1);
    const calls: number[] = [];

    effect(() => {
      try {
        effect(() => {
          throw new Error("boom");
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      calls.push(tracked.get());
    });

    tracked.set(2);
    await flushEffects();

    expect(calls).toEqual([1, 2]);
  });

  test("batch depth is restored if callback throws", () => {
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

      expect(() => {
        batch(() => {
          count.set(1);
          throw new Error("boom");
        });
      }).toThrow("boom");

      count.set(2);

      expect(scheduled).toHaveLength(1);
    } finally {
      restoreScheduler();
    }
  });

  test("untrack restores previous tracker if callback throws", async () => {
    const tracked = cell(1);
    const calls: number[] = [];

    effect(() => {
      try {
        untrack(() => {
          throw new Error("boom");
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      calls.push(tracked.get());
    });

    tracked.set(2);
    await flushEffects();

    expect(calls).toEqual([1, 2]);
  });

  test("testing and internal scheduler helpers are usable together", async () => {
    const scheduled: Array<() => void> = [];
    const testScheduler: Scheduler = {
      schedule(flush) {
        scheduled.push(flush);
      },
    };
    const restoreScheduler = setScheduler(testScheduler);

    try {
      const count = cell(0);
      const calls: number[] = [];

      effect(() => {
        calls.push(count.get());
      });

      count.set(1);

      expect(scheduled).toHaveLength(1);

      await flushMicrotasks();

      expect(calls).toEqual([0]);

      flushQueuedComputations();

      expect(calls).toEqual([0, 1]);

      count.set(2);
      await flushEffects();

      expect(calls).toEqual([0, 1, 2]);
    } finally {
      restoreScheduler();
    }
  });
});
