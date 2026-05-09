import { describe, expect, test } from "vitest";
import { cell, effect } from "../src/index.js";
import { setScheduler } from "../src/internal.js";
import { flushEffects } from "../src/testing.js";

describe("effect", () => {
  test("runs once synchronously on creation", () => {
    const calls: number[] = [];
    const count = cell(0);

    effect(() => {
      calls.push(count.get());
    });

    expect(calls).toEqual([0]);
  });

  test("reruns asynchronously and sees the latest value once", async () => {
    const calls: number[] = [];
    const count = cell(0);

    effect(() => {
      calls.push(count.get());
    });

    count.set(1);
    count.set(2);

    expect(calls).toEqual([0]);

    await flushEffects();

    expect(calls).toEqual([0, 2]);
  });

  test("does not rerun for unrelated cells", async () => {
    const calls: number[] = [];
    const count = cell(0);
    const other = cell(0);

    effect(() => {
      calls.push(count.get());
    });

    other.set(1);
    await flushEffects();

    expect(calls).toEqual([0]);
  });

  test("cleans up before rerun and once on dispose", async () => {
    const events: string[] = [];
    const count = cell(0);

    const dispose = effect(() => {
      events.push(`run:${count.get()}`);
      return () => events.push(`cleanup:${count.get()}`);
    });

    count.set(1);
    await flushEffects();
    dispose();
    dispose();

    expect(events).toEqual(["run:0", "cleanup:1", "run:1", "cleanup:1"]);
  });

  test("disposed effect is not resubscribed", async () => {
    const calls: number[] = [];
    const count = cell(0);

    const dispose = effect(() => {
      calls.push(count.get());
    });

    dispose();
    count.set(1);
    await flushEffects();

    expect(calls).toEqual([0]);
  });

  test("continues flushing queued effects after one effect throws", async () => {
    const scheduled: Array<() => void> = [];
    const restoreScheduler = setScheduler({
      schedule(flush) {
        scheduled.push(flush);
      },
    });

    try {
      const calls: string[] = [];
      const count = cell(0);

      effect(() => {
        const value = count.get();

        if (value > 0) {
          throw new Error("effect failed");
        }
      });
      effect(() => {
        calls.push(`second:${count.get()}`);
      });

      count.set(1);

      await expect(flushEffects()).rejects.toThrow("effect failed");

      expect(calls).toEqual(["second:0", "second:1"]);
    } finally {
      restoreScheduler();
    }
  });

  test("cleans up subscriptions when initial run throws", async () => {
    const scheduled: Array<() => void> = [];
    const restoreScheduler = setScheduler({
      schedule(flush) {
        scheduled.push(flush);
      },
    });

    try {
      const count = cell(0);
      let runs = 0;

      expect(() =>
        effect(() => {
          runs += 1;
          count.get();
          throw new Error("initial effect failed");
        }),
      ).toThrow("initial effect failed");

      count.set(1);
      await flushEffects();

      expect(runs).toBe(1);
      expect(scheduled).toHaveLength(0);
    } finally {
      restoreScheduler();
    }
  });

  test("restores scheduling state when scheduler throws", async () => {
    const scheduleError = new Error("schedule failed");
    const restoreThrowingScheduler = setScheduler({
      schedule() {
        throw scheduleError;
      },
    });

    const count = cell(0);
    const calls: number[] = [];

    effect(() => {
      calls.push(count.get());
    });

    try {
      expect(() => count.set(1)).toThrow(scheduleError);
    } finally {
      restoreThrowingScheduler();
    }

    const scheduled: Array<() => void> = [];
    const restoreScheduler = setScheduler({
      schedule(flush) {
        scheduled.push(flush);
      },
    });

    try {
      count.set(2);

      expect(scheduled).toHaveLength(1);

      await flushEffects();

      expect(calls).toEqual([0, 2]);
    } finally {
      restoreScheduler();
    }
  });
});
