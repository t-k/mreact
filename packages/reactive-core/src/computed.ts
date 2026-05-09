import type { ReactiveComputation, Source } from "./state.js";
import { runtimeState } from "./state.js";
import { cleanupDeps, notifySubscribers, trackSource } from "./tracking.js";
import type { ReadonlyCell } from "./types.js";

export function computed<T>(fn: () => T): ReadonlyCell<T> {
  let hasValue = false;
  let value: T;
  let dirty = true;

  const source: Source = {
    subscribers: new Set(),
  };

  const computation: ReactiveComputation = {
    id: runtimeState.nextComputationId,
    deps: new Set(),
    disposed: false,
    queued: false,
    markDirty() {
      if (dirty) {
        return;
      }

      dirty = true;

      if (source.subscribers.size > 0) {
        const previousValue = hasValue ? value : undefined;
        const nextValue = recompute();

        if (!hasValue || !Object.is(previousValue, nextValue)) {
          notifySubscribers(source);
        }
      }
    },
    run() {
      recompute();
    },
    dispose() {
      if (computation.disposed) {
        return;
      }

      computation.disposed = true;
      cleanupDeps(computation);
      source.subscribers.clear();
    },
  };

  runtimeState.nextComputationId += 1;

  function recompute(): T {
    if (!dirty && hasValue) {
      return value;
    }

    const previousTracker = runtimeState.activeTracker;
    cleanupDeps(computation);
    runtimeState.activeTracker = computation;

    try {
      const nextValue = fn();
      value = nextValue;
      hasValue = true;
      dirty = false;

      return value;
    } finally {
      runtimeState.activeTracker = previousTracker;
    }
  }

  return {
    get(): T {
      trackSource(source);
      return recompute();
    },
  };
}
