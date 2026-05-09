import { describe, expect, test } from "vitest";
import { batch, cell, effect, untrack } from "../src/index.js";
import type { Scheduler } from "../src/internal.js";
import { flushQueuedComputations, setScheduler } from "../src/internal.js";
import { flushEffects, flushMicrotasks } from "../src/testing.js";

describe("error semantics", () => {
  test("current tracker is restored if effect throws", async () => {
    const second = cell(10);
    const calls: string[] = [];

    expect(() => {
      effect(() => {
        throw new Error("boom");
      });
    }).toThrow("boom");

    effect(() => {
      calls.push(`ok:${second.get()}`);
    });

    second.set(20);
    await flushEffects();

    expect(calls).toEqual(["ok:10", "ok:20"]);
  });

  test("batch depth is restored if callback throws", async () => {
    const count = cell(0);
    const calls: number[] = [];

    effect(() => {
      calls.push(count.get());
    });

    expect(() => {
      batch(() => {
        count.set(1);
        throw new Error("boom");
      });
    }).toThrow("boom");

    count.set(2);
    await flushEffects();

    expect(calls).toEqual([0, 2]);
  });

  test("untrack restores previous tracker if callback throws", async () => {
    const tracked = cell(1);
    const calls: number[] = [];

    expect(() => {
      effect(() => {
        untrack(() => {
          throw new Error("boom");
        });
      });
    }).toThrow("boom");

    effect(() => {
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
