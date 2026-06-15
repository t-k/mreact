import { describe, expect, test } from "vitest";
import { cell, effect } from "../src/index.js";
import { setScheduler } from "../src/internal.js";
import { runtimeState, type ReactiveComputation } from "../src/state.js";
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

  test("does not allocate added dependency tracking before a dependency is added", () => {
    const count = cell(0);
    let addedDepsAllocated = false;

    const dispose = effect(() => {
      const computation = (runtimeState.activeTracker as ReactiveComputation | null) ?? undefined;
      addedDepsAllocated = computation?.trackingAddedDeps !== undefined;
      count.get();
    });

    dispose();

    expect(addedDepsAllocated).toBe(false);
  });

  test("initial run does not probe cleanup touched dependency set", () => {
    const count = cell(0);
    const originalHas = Set.prototype.has;
    let sourceHasCalls = 0;

    try {
      Set.prototype.has = function countedHas<T>(this: Set<T>, value: T): boolean {
        if (
          typeof value === "object" &&
          value !== null &&
          "subscribers" in value
        ) {
          sourceHasCalls += 1;
        }

        return originalHas.call(this, value);
      };

      const dispose = effect(() => {
        count.get();
      });
      dispose();
    } finally {
      Set.prototype.has = originalHas;
    }

    expect(sourceHasCalls).toBe(0);
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

  test("cleanup throw preserves subscriptions and retries cleanup on later updates", async () => {
    const scheduled: Array<() => void> = [];
    const restoreScheduler = setScheduler({
      schedule(flush) {
        scheduled.push(flush);
      },
    });

    try {
      const count = cell(0);
      const events: string[] = [];

      effect(() => {
        events.push(`run:${count.get()}`);
        return () => {
          events.push("cleanup:throw");
          throw new Error("cleanup failed");
        };
      });

      count.set(1);
      await expect(flushEffects()).rejects.toThrow("cleanup failed");

      count.set(2);
      await expect(flushEffects()).rejects.toThrow("cleanup failed");

      expect(events).toEqual(["run:0", "cleanup:throw", "cleanup:throw"]);
      expect(scheduled).toHaveLength(2);
    } finally {
      restoreScheduler();
    }
  });

  test("unsubscribes from dependencies no longer read", async () => {
    const calls: number[] = [];
    const enabled = cell(true);
    const first = cell(1);
    const second = cell(10);

    effect(() => {
      calls.push(enabled.get() ? first.get() : second.get());
    });

    enabled.set(false);
    await flushEffects();
    first.set(2);
    await flushEffects();

    expect(calls).toEqual([1, 10]);
  });
});
