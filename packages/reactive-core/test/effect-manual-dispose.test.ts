import { describe, expect, test } from "vitest";
import { cell, createCleanupScope, effect, runWithCleanupScope } from "../src/index.js";
import { getCellSource } from "../src/cell.js";
import { withCleanupScope } from "../src/internal.js";
import { runtimeState, type Source } from "../src/state.js";
import { createReactiveTestRuntime } from "../src/testing.js";
import { sourceSubscriberCount } from "../src/tracking.js";

function subscriberCount(value: unknown): number {
  const source = getCellSource(value);

  if (source === undefined) {
    throw new Error("expected a source-backed cell");
  }

  return sourceSubscriberCount(source);
}

describe("effect manual disposal", () => {
  test("unregisters the stopped effect from its cleanup owner", () => {
    const count = cell(0);
    const registered: Array<() => void> = [];
    const unregistered: Array<() => void> = [];

    const stop = withCleanupScope(
      (dispose) => {
        registered.push(dispose);
        return () => {
          unregistered.push(dispose);
        };
      },
      () =>
        effect(() => {
          count.get();
        }),
    );

    expect(registered).toHaveLength(1);
    expect(unregistered).toEqual([]);

    stop();

    expect(unregistered).toEqual(registered);
  });

  test("invokes user cleanup once across repeated stops and parent disposal", () => {
    const scope = createCleanupScope();
    const count = cell(0);
    const events: string[] = [];

    const stop = runWithCleanupScope(scope, () =>
      effect(() => {
        count.get();
        events.push("run");
        return () => {
          events.push("cleanup");
        };
      }),
    );

    stop();
    stop();
    scope.dispose();

    expect(events).toEqual(["run", "cleanup"]);
    expect(subscriberCount(count)).toBe(0);
  });

  test("releases the owner registration when the user cleanup throws", () => {
    const count = cell(0);
    const unregistered: string[] = [];

    const stop = withCleanupScope(
      () => () => {
        unregistered.push("unregistered");
      },
      () =>
        effect(() => {
          count.get();
          return () => {
            throw new Error("cleanup failed");
          };
        }),
    );

    expect(() => stop()).toThrow("cleanup failed");
    expect(unregistered).toEqual(["unregistered"]);
    expect(subscriberCount(count)).toBe(0);
    expect(() => stop()).not.toThrow();
    expect(unregistered).toEqual(["unregistered"]);
  });

  test("stops effects created without a cleanup owner", async () => {
    const runtime = createReactiveTestRuntime();

    try {
      const count = cell(0);
      const runs: number[] = [];

      expect(runtimeState.cleanupOwner).toBeUndefined();
      const stop = effect(() => {
        runs.push(count.get());
      });

      stop();
      count.set(1);
      runtime.flushAll();

      expect(runs).toEqual([0]);
      expect(subscriberCount(count)).toBe(0);
    } finally {
      runtime.dispose();
    }
  });

  test("stops effects registered against an already disposed owner", () => {
    const runtime = createReactiveTestRuntime();

    try {
      const scope = createCleanupScope();
      scope.dispose();
      const count = cell(0);
      const runs: number[] = [];

      const stop = runWithCleanupScope(scope, () =>
        effect(() => {
          runs.push(count.get());
        }),
      );

      expect(runs).toEqual([0]);
      expect(subscriberCount(count)).toBe(0);

      count.set(1);
      runtime.flushAll();

      expect(runs).toEqual([0]);
      expect(() => stop()).not.toThrow();
    } finally {
      runtime.dispose();
    }
  });

  test("registers nested effects with the innermost cleanup owner", () => {
    const outer = createCleanupScope();
    const inner = createCleanupScope();
    const count = cell(0);
    const events: string[] = [];

    runWithCleanupScope(outer, () => {
      runWithCleanupScope(inner, () => {
        effect(() => {
          count.get();
          return () => {
            events.push("inner-cleanup");
          };
        });
      });
    });

    inner.dispose();

    expect(events).toEqual(["inner-cleanup"]);
    expect(subscriberCount(count)).toBe(0);

    outer.dispose();

    expect(events).toEqual(["inner-cleanup"]);
  });

  test("stops effects owned by a registration that returns no unregister handle", () => {
    const count = cell(0);
    const collected: Array<() => void> = [];
    const events: string[] = [];

    const stop = withCleanupScope(
      (dispose) => {
        collected.push(dispose);
      },
      () =>
        effect(() => {
          count.get();
          return () => {
            events.push("cleanup");
          };
        }),
    );

    stop();

    expect(events).toEqual(["cleanup"]);
    expect(subscriberCount(count)).toBe(0);

    for (const dispose of collected) {
      dispose();
    }

    expect(events).toEqual(["cleanup"]);
  });

  test("drops the registration of an effect its owner disposes during registration", () => {
    const count = cell(0);
    const events: string[] = [];

    const stop = withCleanupScope(
      (dispose) => {
        dispose();
        return () => {
          events.push("unregister");
        };
      },
      () =>
        effect(() => {
          count.get();
          events.push("run");
        }),
    );

    expect(events).toEqual(["run", "unregister"]);
    expect(subscriberCount(count)).toBe(0);

    stop();

    expect(events).toEqual(["run", "unregister"]);
  });

  test("stops an effect whose owner disposes it without returning a handle", () => {
    const count = cell(0);
    const runs: number[] = [];

    const stop = withCleanupScope(
      (dispose) => {
        dispose();
      },
      () =>
        effect(() => {
          runs.push(count.get());
        }),
    );

    expect(runs).toEqual([0]);
    expect(subscriberCount(count)).toBe(0);
    expect(() => stop()).not.toThrow();
  });

  test("ignores an owner registration result that is not an unregister handle", () => {
    const count = cell(0);
    const disposers: Array<() => void> = [];
    const events: string[] = [];

    const stop = withCleanupScope(
      (dispose) => disposers.push(dispose),
      () =>
        effect(() => {
          count.get();
          return () => {
            events.push("cleanup");
          };
        }),
    );

    expect(disposers).toHaveLength(1);
    expect(() => stop()).not.toThrow();
    expect(events).toEqual(["cleanup"]);
    expect(subscriberCount(count)).toBe(0);
  });

  test("prevents a queued effect from running after it is stopped", () => {
    const runtime = createReactiveTestRuntime();

    try {
      const count = cell(0);
      const runs: number[] = [];
      const stop = effect(() => {
        runs.push(count.get());
      });

      count.set(1);

      expect(runtime.scheduledFlushCount()).toBe(1);

      stop();
      runtime.flushAll();

      expect(runs).toEqual([0]);
      expect(subscriberCount(count)).toBe(0);

      count.set(2);
      runtime.flushAll();

      expect(runs).toEqual([0]);
      expect(runtime.scheduledFlushCount()).toBe(0);
    } finally {
      runtime.dispose();
    }
  });

  test("keeps sibling effects owned by the same scope after one is stopped", async () => {
    const scope = createCleanupScope();
    const count = cell(0);
    const events: string[] = [];

    const stopped = runWithCleanupScope(scope, () =>
      effect(() => {
        events.push(`stopped:${count.get()}`);
      }),
    );
    runWithCleanupScope(scope, () =>
      effect(() => {
        events.push(`kept:${count.get()}`);
      }),
    );

    stopped();
    count.set(1);
    await Promise.resolve();

    expect(events).toEqual(["stopped:0", "kept:0", "kept:1"]);

    scope.dispose();
    count.set(2);
    await Promise.resolve();

    expect(events).toEqual(["stopped:0", "kept:0", "kept:1"]);
    expect(subscriberCount(count)).toBe(0);
  });
});

describe("effect source typing", () => {
  test("exposes the cell source used by the retention assertions", () => {
    const count = cell(0);
    const source: Source | undefined = getCellSource(count);

    expect(source).toBeDefined();
    expect(sourceSubscriberCount(source as Source)).toBe(0);
  });
});
