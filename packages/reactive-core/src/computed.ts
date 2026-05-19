import type { ReactiveComputation, Source } from "./state.js";
import { schedulePendingFlush } from "./scheduler.js";
import { runtimeState } from "./state.js";
import { cleanupDeps, notifySubscribers, trackSource } from "./tracking.js";
import type { ReadonlyCell } from "./types.js";

export type ComputedEquality<T> = (previous: T, next: T) => boolean;

export interface ComputedOptions<T> {
  equals?: ComputedEquality<T> | undefined;
}

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
      trackComputedSource(source, computation);
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
    const nextTrackingVersion = (computation.trackingVersion ?? 0) + 1;

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
      computation.trackingVersion = undefined;
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

function trackComputedSource(
  source: Source,
  computation: ReactiveComputation,
): void {
  const trackingVersion = computation.trackingVersion;

  if (trackingVersion === undefined) {
    trackSource(source);
    return;
  }

  if (source.trackedBy === computation && source.trackedVersion === trackingVersion) {
    return;
  }

  source.trackedBy = computation;
  source.trackedVersion = trackingVersion;
  computation.trackingCount = (computation.trackingCount ?? 0) + 1;

  if (computation.deps.has(source)) {
    return;
  }

  const previousSize = source.subscribers.size;
  source.subscribers.add(computation);
  computation.deps.add(source);
  computation.trackingAddedDeps?.push(source);

  if (previousSize === 0) {
    source.singleSubscriber = computation;
  } else if (source.subscribers.size > 1) {
    source.singleSubscriber = undefined;
  }
}

function cleanupUntrackedDeps(
  computation: ReactiveComputation,
  trackingVersion: number,
): void {
  for (const dep of computation.deps) {
    if (dep.trackedBy === computation && dep.trackedVersion === trackingVersion) {
      continue;
    }

    if (!dep.subscribers.delete(computation)) {
      continue;
    }

    if (dep.trackedBy === computation) {
      dep.trackedBy = undefined;
      dep.trackedVersion = undefined;
    }

    computation.deps.delete(dep);

    if (dep.subscribers.size === 0) {
      dep.singleSubscriber = undefined;
    } else if (dep.subscribers.size === 1) {
      dep.singleSubscriber = dep.subscribers.values().next().value;
    }
  }
}

function cleanupAddedDeps(computation: ReactiveComputation): void {
  const addedDeps = computation.trackingAddedDeps;

  if (addedDeps === undefined) {
    return;
  }

  for (const dep of addedDeps) {
    if (!dep.subscribers.delete(computation)) {
      continue;
    }

    if (dep.trackedBy === computation) {
      dep.trackedBy = undefined;
      dep.trackedVersion = undefined;
    }

    computation.deps.delete(dep);

    if (dep.subscribers.size === 0) {
      dep.singleSubscriber = undefined;
    } else if (dep.subscribers.size === 1) {
      dep.singleSubscriber = dep.subscribers.values().next().value;
    }
  }
}
