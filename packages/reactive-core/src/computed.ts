import type { ReactiveComputation, Source } from "./state.js";
import { schedulePendingFlush } from "./scheduler.js";
import { createUntrackedDependency, runtimeState, untrackedDependencyIsCurrent } from "./state.js";
import { registerCleanup } from "./cleanup-scope.js";
import { registerReactiveDevtoolsResource } from "./devtools.js";
import {
  cleanupAddedDeps,
  cleanupDeps,
  cleanupUntrackedDeps,
  nextTrackingVersionFor,
  notifySubscribers,
  preserveIncrementalTracking,
  addSourceSubscriber,
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
  let untrackedDependencies: Array<NonNullable<ReturnType<typeof createUntrackedDependency>>> = [];
  const equals = typeof options === "function" ? options : (options?.equals ?? Object.is);
  const resource = registerReactiveDevtoolsResource("computed");

  const source: Source = {
    onNoSubscribers: suspendIfUnobserved,
    subscribers: null,
  };

  const computation: ReactiveComputation = {
    id: runtimeState.nextComputationId,
    deps: new Set(),
    disposed: false,
    queued: false,
    markDirty() {
      if (dirty) {
        if (source.subscribers === null || computation.queued) {
          return;
        }
      }

      dirty = true;

      if (source.subscribers !== null) {
        if (runtimeState.notificationDepth > 0 || runtimeState.batchDepth > 0) {
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
    dispose() {
      if (computation.disposed) {
        return;
      }

      computation.disposed = true;
      computation.queued = false;
      runtimeState.pendingComputed.delete(computation);
      cleanupDeps(computation);
      computation.orderedDeps = undefined;
      source.subscribers = null;
      source.onNoSubscribers = undefined;
      hasValue = false;
      value = undefined as T;
      dirty = true;
      untrackedDependencies = [];
      resource.dispose();
    },
  };

  runtimeState.nextComputationId += 1;
  registerCleanup(computation.dispose);

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
    if (computation.disposed) {
      throw new Error("Cannot read a disposed computed value");
    }

    if (!dirty && hasValue) {
      return value;
    }

    const previousTracker = runtimeState.activeTracker;
    const previousDepsSize = computation.deps.size;
    const nextTrackingVersion = nextTrackingVersionFor(computation);

    computation.trackingAddedDeps = undefined;
    computation.trackingCount = 0;
    computation.trackingOrderedIndex = computation.orderedDeps === undefined ? undefined : 0;
    computation.trackingOrderedMismatch = false;
    computation.trackingVersion = nextTrackingVersion;
    runtimeState.activeTracker = computation;

    try {
      const nextValue = fn();

      const addedDeps = computation.trackingAddedDeps as ReactiveComputation["trackingAddedDeps"];
      const trackedCount = computation.trackingCount ?? 0;
      const addedDepsCount =
        addedDeps === undefined ? 0 : Array.isArray(addedDeps) ? addedDeps.length : 1;
      const orderedMismatch = computation.trackingOrderedMismatch as boolean | undefined;

      if (previousDepsSize > 0 && (trackedCount !== previousDepsSize || addedDepsCount > 0)) {
        const orderedIndex = computation.trackingOrderedIndex;

        if (
          computation.trackingTouchedDeps === undefined &&
          orderedIndex !== undefined &&
          orderedIndex > 0 &&
          computation.orderedDeps !== undefined
        ) {
          computation.trackingTouchedDeps = computation.orderedDeps.slice(0, orderedIndex);
        }

        cleanupUntrackedDeps(computation, nextTrackingVersion);
      }

      if (orderedMismatch !== true && trackedCount === previousDepsSize && addedDepsCount === 0) {
        // Keep the previous stable order.
      } else if (
        previousDepsSize === 0 &&
        addedDeps !== undefined &&
        trackedCount === addedDepsCount
      ) {
        computation.orderedDeps = Array.isArray(addedDeps) ? addedDeps : [addedDeps];
      } else {
        computation.orderedDeps = undefined;
      }

      value = nextValue;
      hasValue = true;
      dirty = false;

      if (source.subscribers === null) {
        suspendIfUnobserved();
      } else {
        untrackedDependencies = [];
      }

      return nextValue;
    } catch (error) {
      cleanupAddedDeps(computation);
      dirty = true;

      throw error;
    } finally {
      computation.trackingAddedDeps = undefined;
      computation.trackingCount = undefined;
      computation.trackingOrderedIndex = undefined;
      computation.trackingOrderedMismatch = undefined;
      computation.trackingTouchedDeps = undefined;
      runtimeState.activeTracker = previousTracker;
    }
  }

  function suspendIfUnobserved(): void {
    if (computation.disposed || source.subscribers !== null) {
      return;
    }

    const wasDirty = dirty;
    const capturedDependencies = Array.from(computation.deps, createUntrackedDependency);
    if (capturedDependencies.some((dependency) => dependency === undefined)) {
      untrackedDependencies = [];
      hasValue = false;
      value = undefined as T;
      dirty = true;
    } else {
      untrackedDependencies = capturedDependencies as Array<
        NonNullable<ReturnType<typeof createUntrackedDependency>>
      >;
      dirty = wasDirty;
    }
    computation.queued = false;
    runtimeState.pendingComputed.delete(computation);
    cleanupDeps(computation);
    computation.orderedDeps = undefined;
  }

  return {
    get(): T {
      const dependenciesChanged = untrackedDependencies.some(
        (dependency) => !untrackedDependencyIsCurrent(dependency),
      );
      if (dependenciesChanged) {
        dirty = true;
        restoreUntrackedDependencies();
      }

      trackSource(source);

      if (source.subscribers !== null) {
        restoreUntrackedDependencies();
      }

      if (dirty) {
        const activeTracker = runtimeState.activeTracker;

        if (activeTracker !== null && activeTracker !== computation) {
          preserveIncrementalTracking(activeTracker);
        }
      }

      return recompute();
    },
  };

  function restoreUntrackedDependencies(): void {
    if (untrackedDependencies.length === 0) {
      return;
    }

    const dependencies = untrackedDependencies.map((dependency) => dependency.ref.deref());
    if (dependencies.some((dependency) => dependency === undefined)) {
      untrackedDependencies = [];
      return;
    }

    for (const dependency of dependencies as Source[]) {
      addSourceSubscriber(dependency, computation);
      computation.deps.add(dependency);
    }
    computation.orderedDeps = dependencies as Source[];
    untrackedDependencies = [];
  }
}
