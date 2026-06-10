import type { ReactiveComputation, Source } from "./state.js";
import { schedulePendingFlush } from "./scheduler.js";
import { runtimeState } from "./state.js";
import {
  cleanupAddedDeps,
  cleanupDeps,
  cleanupUntrackedDeps,
  nextTrackingVersionFor,
  notifySubscribers,
  preserveIncrementalTracking,
  trackIncrementalSource,
  trackSource,
} from "./tracking.js";
import type { ReadonlyCell } from "./types.js";

/** Equality function used to decide whether a computed value changed. */
export type ComputedEquality<T> = (previous: T, next: T) => boolean;

/** Options for creating a computed reactive value. */
export interface ComputedOptions<T> {
  equals?: ComputedEquality<T> | undefined;
}

/** Creates a lazily evaluated reactive value derived from other cells. */
export function computed<T>(
  fn: () => T,
  options?: ComputedOptions<T> | ComputedEquality<T>,
): ReadonlyCell<T> {
  let hasValue = false;
  let value: T;
  let dirty = true;
  const equals = typeof options === "function" ? options : (options?.equals ?? Object.is);

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
        if (source.subscribers.size === 0 || computation.queued) {
          return;
        }
      }

      dirty = true;

      if (source.subscribers.size > 0) {
        if (runtimeState.notificationDepth > 0) {
          computation.queued = true;
          runtimeState.pendingComputed.add(computation);
          return;
        }

        publishIfChanged();
      }
    },
    run() {
      publishIfChanged();
    },
    trackSource(source) {
      trackIncrementalSource(source, computation);
    },
    dispose() {
      if (computation.disposed) {
        return;
      }

      computation.disposed = true;
      computation.queued = false;
      runtimeState.pendingComputed.delete(computation);
      cleanupDeps(computation);
      source.subscribers.clear();
      source.singleSubscriber = undefined;
    },
  };

  runtimeState.nextComputationId += 1;

  function publishIfChanged(): void {
    const previousHasValue = hasValue;
    const previousValue = value;

    try {
      const nextValue = recompute();

      if (!previousHasValue || !equals(previousValue, nextValue)) {
        notifySubscribers(source);
      }
    } catch {
      runtimeState.batchDepth += 1;

      try {
        notifySubscribers(source);
      } finally {
        runtimeState.batchDepth -= 1;

        if (runtimeState.batchDepth === 0) {
          schedulePendingFlush();
        }
      }
    }
  }

  function recompute(): T {
    if (!dirty && hasValue) {
      return value;
    }

    const previousTracker = runtimeState.activeTracker;
    const previousDepsSize = computation.deps.size;
    const nextTrackingVersion = nextTrackingVersionFor(computation);

    computation.trackingAddedDeps = [];
    computation.trackingCount = 0;
    computation.trackingVersion = nextTrackingVersion;
    runtimeState.activeTracker = computation;

    try {
      const nextValue = fn();

      const addedDeps = computation.trackingAddedDeps;
      const trackedCount = computation.trackingCount ?? 0;

      if (trackedCount !== previousDepsSize || (addedDeps?.length ?? 0) > 0) {
        cleanupUntrackedDeps(computation, nextTrackingVersion);
      }

      value = nextValue;
      hasValue = true;
      dirty = false;

      return value;
    } catch (error) {
      cleanupAddedDeps(computation);
      dirty = true;

      throw error;
    } finally {
      computation.trackingAddedDeps = undefined;
      computation.trackingCount = undefined;
      computation.trackingTouchedDeps = undefined;
      runtimeState.activeTracker = previousTracker;
    }
  }

  return {
    get(): T {
      trackSource(source);

      if (dirty) {
        const activeTracker = runtimeState.activeTracker;

        if (activeTracker !== null && activeTracker !== computation) {
          preserveIncrementalTracking(activeTracker);
        }
      }

      return recompute();
    },
  };
}
