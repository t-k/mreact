import { describe, expect, test } from "vitest";
import { cell, createCleanupScope, effect, runWithCleanupScope } from "../src/index.js";
import { flushEffects } from "../src/testing.js";

describe("effect cleanup reentry", () => {
  test("disposing the owning scope from a cleanup runs that cleanup once", async () => {
    const scope = createCleanupScope();
    const count = cell(0);
    let cleanupCalls = 0;
    let runs = 0;

    runWithCleanupScope(scope, () => {
      effect(() => {
        runs += 1;
        count.get();

        return () => {
          cleanupCalls += 1;
          scope.dispose();
        };
      });
    });

    count.setValue(1);
    await flushEffects();

    expect(cleanupCalls).toBe(1);
    expect(runs).toBe(1);
    expect(scope.disposed).toBe(true);
  });

  test("stopping the effect from its own cleanup runs that cleanup once", async () => {
    const count = cell(0);
    let cleanupCalls = 0;
    let runs = 0;
    let stop: (() => void) | undefined;

    stop = effect(() => {
      runs += 1;
      count.get();

      return () => {
        cleanupCalls += 1;
        stop?.();
      };
    });

    count.setValue(1);
    await flushEffects();
    count.setValue(2);
    await flushEffects();

    expect(cleanupCalls).toBe(1);
    expect(runs).toBe(1);
  });
});
