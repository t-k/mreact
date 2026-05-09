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
      if (dirty && source.subscribers.size === 0) {
        return;
      }

      dirty = true;

      if (source.subscribers.size > 0) {
        if (runtimeState.notificationDepth > 0) {
          runtimeState.pendingComputed.add(computation);
          return;
        }

        publishIfChanged();
      }
    },
    run() {
      publishIfChanged();
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

  function publishIfChanged(): void {
    const previousHasValue = hasValue;
    const previousValue = value;

    try {
      const nextValue = recompute();

      if (!previousHasValue || !Object.is(previousValue, nextValue)) {
        notifySubscribers(source);
      }
    } catch {
      runtimeState.batchDepth += 1;

      try {
        notifySubscribers(source);
      } finally {
        runtimeState.batchDepth -= 1;
      }
    }
  }

  function recompute(): T {
    if (!dirty && hasValue) {
      return value;
    }

    const previousTracker = runtimeState.activeTracker;
    const previousDeps = computation.deps;
    const nextDeps = new Set<Source>();

    computation.deps = nextDeps;
    runtimeState.activeTracker = computation;

    try {
      const nextValue = fn();

      for (const dep of previousDeps) {
        if (!nextDeps.has(dep)) {
          dep.subscribers.delete(computation);
        }
      }

      value = nextValue;
      hasValue = true;
      dirty = false;

      return value;
    } catch (error) {
      for (const dep of nextDeps) {
        if (!previousDeps.has(dep)) {
          dep.subscribers.delete(computation);
        }
      }

      computation.deps = previousDeps;
      dirty = true;

      throw error;
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
