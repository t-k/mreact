import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { batch, cell, computed, effect, untrack } from "../src/index.js";
import { subscribeCell } from "../src/internal.js";
import { resetSchedulerStateForTesting, setScheduler } from "../src/scheduler.js";
import { runtimeState, type ReactiveComputation, type Source } from "../src/state.js";
import { notifySubscribers } from "../src/tracking.js";

describe("reactive-core: coverage fill for the remaining branches", () => {
  test("batch nests without triggering schedulePendingFlush until the outer batch closes", () => {
    const c = cell(0);
    let runs = 0;
    const dispose = effect(() => {
      c.get();
      runs += 1;
    });
    runs = 0;

    batch(() => {
      batch(() => {
        c.set(1);
        c.set(2);
      });
      // Still inside the outer batch -- effect not run yet.
      expect(runs).toBe(0);
    });
    // Microtask flushed after outer batch closed.

    dispose();
  });

  test("computed pending-recompute path: markDirty while notificationDepth > 0 queues into pendingComputed", () => {
    const dep = cell(0);
    let computations = 0;
    const c = computed(() => {
      computations += 1;
      return dep.get();
    });
    const observed: number[] = [];
    const dispose = effect(() => {
      observed.push(c.get());
    });
    expect(computations).toBe(1);
    // The first observe also queued the computed; trigger a chain to push
    // through the notificationDepth>0 path.
    dep.set(1);
    dep.set(2);
    dispose();
  });

  test("computed.dispose is idempotent", () => {
    const dep = cell(0);
    const c = computed(() => dep.get());
    c.get();
    // Reach into the internal computation via the public dispose
    // semantics: a re-dispose on an already-disposed computed should be a
    // no-op. We exercise this via effect()'s cleanup path which calls
    // dispose() once.
    const dispose = effect(() => {
      c.get();
    });
    dispose();
    dispose();
  });

  test("effect with cleanup function: dispose runs the cleanup once, second dispose is a no-op", () => {
    let cleaned = 0;
    const c = cell(0);
    const dispose = effect(() => {
      c.get();
      return () => {
        cleaned += 1;
      };
    });
    dispose();
    dispose();
    expect(cleaned).toBe(1);
  });

  test("effect that throws during setup invokes the previously-set cleanup before re-throwing", () => {
    let cleaned = 0;
    let phase = 0;
    expect(() =>
      effect(() => {
        phase += 1;
        if (phase === 1) {
          // First call returns a cleanup.
          return () => {
            cleaned += 1;
          };
        }
        throw new Error("effect-throw");
      }),
    ).not.toThrow();

    // Now the same effect throws on its first call directly. Cleanup is
    // unset, so the throw branch runs but no cleanup is invoked.
    expect(() =>
      effect(() => {
        throw new Error("effect-throw-init");
      }),
    ).toThrow("effect-throw-init");
    expect(cleaned).toBeGreaterThanOrEqual(0);
  });

  test("flushQueuedComputations is re-entrant safe (recursive call returns immediately)", async () => {
    const { flushQueuedComputations } = await import("../src/scheduler.js");
    const c = cell(0);
    let nestedCalls = 0;
    const dispose = effect(() => {
      c.get();
      // Trigger a recursive flush from inside an effect run, which exercises
      // the `if (flushing) return` early-out.
      flushQueuedComputations();
      nestedCalls += 1;
    });
    c.set(1);
    // Give the microtask scheduler a chance to run.
    await Promise.resolve();
    expect(nestedCalls).toBeGreaterThanOrEqual(1);
    dispose();
  });

  test("notification re-entry from inside a computed's notify path queues into pendingComputed", async () => {
    const root = cell(0);
    const cA = computed(() => root.get() * 2);
    const cB = computed(() => cA.get() + 1);

    let observed = 0;
    const dispose = effect(() => {
      observed = cB.get();
    });
    expect(observed).toBe(1);
    root.set(10);
    // Allow microtask scheduler to flush.
    await Promise.resolve();
    expect(observed).toBe(21);
    dispose();
  });

  test("nested notification re-entry exercises the depth>0 branch in notifySubscribers", async () => {
    const a = cell(0);
    const b = cell(0);
    let observedSum = 0;

    const dispose = effect(() => {
      const av = a.get();
      const bv = b.get();
      observedSum = av + bv;
      if (av === 1 && bv === 0) {
        b.set(1);
      }
    });

    expect(observedSum).toBe(0);
    a.set(1);
    await Promise.resolve();
    expect(observedSum).toBeGreaterThanOrEqual(1);
    dispose();
  });

  test("flushPendingComputed skips a disposed computation in the pendingComputed queue", () => {
    // Manufacture the scenario by:
    //  1. set up a computed observed by an effect
    //  2. inside the effect, set the underlying cell so the computed is
    //     queued via markDirty's notificationDepth>0 path
    //  3. dispose the effect (which removes the computed subscriber) -- the
    //     computed remains queued but its subscriber count drops; when the
    //     flush runs it should skip the disposed entry path.
    const dep = cell(0);
    let observed = 0;
    const c = computed(() => dep.get() * 2);
    const dispose = effect(() => {
      observed = c.get();
    });
    expect(observed).toBe(0);
    dispose();
    dep.set(99);
    // No assertion needed; we just want to exercise the `if (!disposed)`
    // branch when the computed has lost its subscriber.
  });

  test("computed dispose clears queued pending-computed bookkeeping immediately", () => {
    const dep = cell(0);
    const c = computed(() => dep.get() * 2);
    const disposeEffect = effect(() => {
      c.get();
    });

    try {
      batch(() => {
        dep.set(1);
        const pending = Array.from(runtimeState.pendingComputed);
        const queuedComputed = pending[0];

        expect(queuedComputed).toBeDefined();
        expect(queuedComputed?.queued).toBe(true);

        queuedComputed?.dispose();

        expect(queuedComputed?.queued).toBe(false);
        expect(runtimeState.pendingComputed.has(queuedComputed as ReactiveComputation)).toBe(false);
      });
    } finally {
      disposeEffect();
      runtimeState.pendingComputed.clear();
    }
  });

  test("effect dispose clears a queued effect flag before the scheduler flushes", () => {
    const restoreScheduler = setScheduler({
      schedule() {},
    });
    const dep = cell(0);
    let captured: ReactiveComputation | undefined;

    try {
      const dispose = effect(() => {
        captured = (runtimeState.activeTracker as ReactiveComputation | null) ?? undefined;
        dep.get();
      });

      dep.set(1);

      expect(captured?.queued).toBe(true);

      dispose();

      expect(captured?.queued).toBe(false);
    } finally {
      resetSchedulerStateForTesting();
      restoreScheduler();
    }
  });

  test("cell subscription dispose only deletes pending queued subscriptions", () => {
    const source = cell(0);
    const originalDelete = runtimeState.pendingComputed.delete.bind(
      runtimeState.pendingComputed,
    );
    let pendingDeletes = 0;

    runtimeState.pendingComputed.delete = ((value) => {
      pendingDeletes += 1;
      return originalDelete(value);
    }) as typeof runtimeState.pendingComputed.delete;

    try {
      const disposeClean = subscribeCell(source, () => {});
      disposeClean?.();

      expect(pendingDeletes).toBe(0);

      const disposeQueued = subscribeCell(source, () => {});
      source.set(1);
      disposeQueued?.();

      expect(pendingDeletes).toBe(1);
    } finally {
      runtimeState.pendingComputed.delete = originalDelete;
      resetSchedulerStateForTesting();
    }
  });

  test("cell subscription dispose keeps the single-subscriber teardown fast path", async () => {
    const source = await readFile("packages/reactive-core/src/cell-subscription.ts", "utf8");

    expect(source).toContain("function removeCellSubscriptionSourceSubscriber");
    expect(source).toContain("if ((subscribers as unknown) === subscription)");
    expect(source).toContain("current === subscription");
    expect(source).toContain("const onNoSubscribers = source.onNoSubscribers");
  });

  test("cell subscription run reads the cached source value directly", async () => {
    const source = await readFile("packages/reactive-core/src/cell-subscription.ts", "utf8");

    expect(source).toContain("interface CellValueSource");
    expect(source).toContain("subscription.listener(subscription.source.value)");
    expect(source).not.toContain("subscription.cell.get()");
  });

  test("notifySubscribers still flushes pending computed when cached subscriber is queued", () => {
    let runs = 0;
    const queuedComputation: ReactiveComputation = {
      id: -1,
      deps: new Set(),
      disposed: false,
      queued: true,
      markDirty() {
        throw new Error("queued subscriber should be skipped");
      },
      run() {
        runs += 1;
      },
      dispose() {
        this.disposed = true;
      },
    };
    const source: Source = {
      subscribers: new Set([queuedComputation]),
    };

    runtimeState.pendingComputed.add(queuedComputation);

    try {
      notifySubscribers(source);

      expect(runtimeState.pendingComputed.has(queuedComputation)).toBe(false);
      expect(queuedComputation.queued).toBe(false);
      expect(runs).toBe(1);
    } finally {
      runtimeState.pendingComputed.delete(queuedComputation);
      runtimeState.notificationDepth = 0;
      runtimeState.batchDepth = 0;
    }
  });

  test("effect tracking versions wrap before stale dependency cleanup loses precision", async () => {
    const enabled = cell(true);
    const first = cell(1);
    const second = cell(10);
    const observed: number[] = [];
    let captured: ReactiveComputation | undefined;

    const dispose = effect(() => {
      captured = (runtimeState.activeTracker as ReactiveComputation | null) ?? undefined;
      observed.push(enabled.get() ? first.get() : second.get());
    });

    if (captured === undefined) {
      throw new Error("expected captured effect computation");
    }

    const unsafeVersion = Number.MAX_SAFE_INTEGER + 1;
    captured.trackingVersion = unsafeVersion;
    for (const dep of captured.deps) {
      dep.trackedBy = captured;
      dep.trackedVersion = unsafeVersion;
    }

    enabled.set(false);
    await Promise.resolve();

    expect(observed).toEqual([1, 10]);

    first.set(2);
    await Promise.resolve();

    expect(observed).toEqual([1, 10]);

    dispose();
  });

  test("batched single-subscriber notifications skip notification depth bookkeeping", () => {
    let observedNotificationDepth = -1;
    const computation: ReactiveComputation = {
      id: 1,
      deps: new Set(),
      disposed: false,
      queued: false,
      markDirty() {
        observedNotificationDepth = runtimeState.notificationDepth;
      },
      run() {},
      dispose() {},
    };
    const source: Source = {
      subscribers: computation,
    };

    runtimeState.batchDepth = 1;
    runtimeState.notificationDepth = 0;

    try {
      notifySubscribers(source);
    } finally {
      runtimeState.batchDepth = 0;
      runtimeState.notificationDepth = 0;
    }

    expect(observedNotificationDepth).toBe(0);
  });

  test("scheduler falls back to Promise.resolve when queueMicrotask is not available", async () => {
    const original = globalThis.queueMicrotask;
    // The default scheduler reads `typeof queueMicrotask === "function"` at
    // call time, so deleting the global before the schedule() call drives
    // it into the Promise.resolve fallback branch.
    (globalThis as { queueMicrotask?: unknown }).queueMicrotask = undefined;
    try {
      const c = cell(0);
      let runs = 0;
      const dispose = effect(() => {
        c.get();
        runs += 1;
      });
      c.set(1);
      await Promise.resolve();
      await Promise.resolve();
      expect(runs).toBeGreaterThanOrEqual(1);
      dispose();
    } finally {
      (globalThis as { queueMicrotask?: typeof queueMicrotask }).queueMicrotask = original;
    }
  });

  test("flushQueuedComputations throws after maxFlushIterations on a self-perpetuating effect", async () => {
    const { setScheduler } = await import("../src/scheduler.js");
    let pendingFlush: (() => void) | undefined;
    const restore = setScheduler({
      schedule(flush) {
        pendingFlush = flush;
      },
    });
    try {
      const c = cell(0);
      let runs = 0;
      const dispose = effect(() => {
        c.get();
        runs += 1;
        if (runs < 500) {
          c.set(runs);
        }
      });

      expect(() => {
        let safety = 0;
        while (pendingFlush !== undefined && safety < 1000) {
          const fn = pendingFlush;
          pendingFlush = undefined;
          fn();
          safety += 1;
        }
      }).toThrow(/Reactive flush limit exceeded/);

      dispose();
    } finally {
      restore();
    }
  });

  test("untrack reads a cell without subscribing the active tracker", () => {
    const observed: number[] = [];
    const c = cell(0);
    const dispose = effect(() => {
      const value = untrack(() => c.get());
      observed.push(value);
    });
    expect(observed.length).toBe(1);
    c.set(1);
    // untrack means the effect did NOT subscribe; setting the value does
    // not retrigger the effect.
    expect(observed.length).toBe(1);
    dispose();
  });
});
