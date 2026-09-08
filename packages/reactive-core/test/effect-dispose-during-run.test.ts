import { describe, expect, test } from "vitest";
import { cell, createCleanupScope, effect, runWithCleanupScope } from "../src/index.js";
import { flushEffects } from "../src/testing.js";

describe("effect disposed during its own run", () => {
  test("runs the cleanup returned by the body that stopped the effect", async () => {
    const trigger = cell(0);
    const target = new EventTarget();
    let calls = 0;
    let cleanups = 0;
    let stop!: () => void;

    stop = effect(() => {
      const current = trigger.get();
      const listener = () => {
        calls += 1;
      };
      target.addEventListener("ping", listener);

      if (current === 1) {
        stop();
      }

      return () => {
        cleanups += 1;
        target.removeEventListener("ping", listener);
      };
    });

    trigger.setValue(1);
    await flushEffects();
    target.dispatchEvent(new Event("ping"));

    expect(cleanups).toBe(2);
    expect(calls).toBe(0);

    stop();
    expect(cleanups).toBe(2);
  });

  test("runs the cleanup when the owning scope is disposed from the body", async () => {
    const scope = createCleanupScope();
    const trigger = cell(0);
    let cleanups = 0;

    runWithCleanupScope(scope, () => {
      effect(() => {
        if (trigger.get() === 1) {
          scope.dispose();
        }
        return () => {
          cleanups += 1;
        };
      });
    });

    trigger.setValue(1);
    await flushEffects();

    expect(scope.disposed).toBe(true);
    expect(cleanups).toBe(2);
  });

  test("runs the cleanup when the first run stops the effect", () => {
    let cleanups = 0;
    let stop: (() => void) | undefined;

    stop = effect(() => {
      stop?.();
      return () => {
        cleanups += 1;
      };
    });

    // The handle is not assigned during the first run, so stop after it.
    stop();
    expect(cleanups).toBe(1);
  });

  test("does not track reads made by the cleanup run after a mid-body stop", async () => {
    const trigger = cell(0);
    const other = cell(0);
    let runs = 0;
    let stop!: () => void;

    stop = effect(() => {
      runs += 1;
      if (trigger.get() === 1) {
        stop();
      }
      return () => {
        other.get();
      };
    });

    trigger.setValue(1);
    await flushEffects();
    other.setValue(1);
    trigger.setValue(2);
    await flushEffects();

    expect(runs).toBe(2);
  });

  test("a throwing cleanup after a mid-body stop still surfaces and leaves nothing behind", async () => {
    const trigger = cell(0);
    let stop!: () => void;
    let cleanups = 0;

    stop = effect(() => {
      if (trigger.get() === 1) {
        stop();
      }
      return () => {
        cleanups += 1;
        if (cleanups === 2) {
          throw new Error("cleanup failed");
        }
      };
    });

    trigger.setValue(1);
    await expect(flushEffects()).rejects.toThrow("cleanup failed");
    expect(cleanups).toBe(2);
    stop();
    expect(cleanups).toBe(2);
  });
});
