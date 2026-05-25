import { describe, expect, test } from "vitest";
import { batch, cell, effect, untrack } from "../src/index.js";
import {
  createReactiveTestRuntime,
  flushEffects,
  flushMicrotasks,
} from "../src/testing.js";

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
    const runtime = createReactiveTestRuntime();

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

      expect(runtime.scheduledFlushCount()).toBe(1);
    } finally {
      runtime.dispose();
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
    const runtime = createReactiveTestRuntime();

    try {
      const count = cell(0);
      const calls: number[] = [];

      effect(() => {
        calls.push(count.get());
      });

      count.set(1);

      expect(runtime.scheduledFlushCount()).toBe(1);

      await flushMicrotasks();

      expect(calls).toEqual([0]);

      runtime.flushNext();

      expect(calls).toEqual([0, 1]);

      count.set(2);
      runtime.flushAll();

      expect(calls).toEqual([0, 1, 2]);
    } finally {
      runtime.dispose();
    }
  });
});
