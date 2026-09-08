import type { CurrentCheckContext, ReactiveComputation, Source } from "./state.js";
import { schedulePendingFlush } from "./scheduler.js";
import {
  bumpSourceVersion,
  createCurrentCheckContext,
  createUntrackedDependency,
  invalidateAttachmentCheckContext,
  runtimeState,
  untrackedDependencyIsCurrent,
} from "./state.js";
import { registerCleanup } from "./cleanup-scope.js";
import { registerReactiveDevtoolsResource } from "./devtools.js";
import {
  cleanupAddedDeps,
  cleanupDeps,
  cleanupUntrackedDeps,
  nextTrackingVersionFor,
  queuePendingComputed,
  notifySubscribers,
  preserveIncrementalTracking,
  addSourceSubscriber,
  trackSource,
} from "./tracking.js";
import type { ReadonlyCell } from "./types.js";

function invalidatePullContext(computation: ReactiveComputation): void {
  const context = runtimeState.pull;
  if (context?.checked.has(computation)) {
    context.checked = new Set();
  }
}

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
  return createComputed(fn, options, false);
}

/** Defers compiler-owned, potentially consuming reads until their owner reads them. */
export function deferredComputed<T>(fn: () => T): ReadonlyCell<T> {
  return createComputed(fn, undefined, true);
}

function createComputed<T>(
  fn: () => T,
  options: ComputedOptions<T> | ComputedEquality<T> | undefined,
  deferred: boolean,
): ReadonlyCell<T> {
  let hasValue = false;
  let value: T;
  // The value the current subscribers last heard about. It lags behind the
  // cache when a downstream reader recomputes this computed before its own
  // queued publish runs, so the publish still sees the change to announce.
  let publishedHasValue = false;
  let publishedValue: T;
  let dirty = true;
  // Set while fn() runs. A publish cascade started by a nested read can
  // reach this computed before its own recompute returns; the invalidation
  // must survive that recompute instead of being overwritten by its result.
  let recomputing = false;
  let invalidatedWhileRecomputing = false;
  let untrackedDependencies: Array<NonNullable<ReturnType<typeof createUntrackedDependency>>> = [];
  const equals = typeof options === "function" ? options : (options?.equals ?? Object.is);
  const resource = registerReactiveDevtoolsResource("computed");

  const source: Source = {
    isCurrent: (context?: CurrentCheckContext) => {
      if (dirty) {
        return false;
      }

      const canShareCurrentCheckContext = untrackedDependencies.length > 1;
      let currentCheckContext = context;
      for (const dependency of untrackedDependencies) {
        if (
          currentCheckContext === undefined &&
          canShareCurrentCheckContext &&
          dependency.requiresCurrentCheckContext
        ) {
          currentCheckContext = createCurrentCheckContext();
        }

        if (!untrackedDependencyIsCurrent(dependency, currentCheckContext)) {
          return false;
        }
      }

      if (runtimeState.flushingComputed || runtimeState.pendingComputed.size > 0) {
        // An observed clean dependency can still hide a queued ancestor from
        // dormant readers. Validate without evaluating user computations.
        for (const dependency of computation.deps) {
          if (dependency.isCurrent === undefined) continue;
          currentCheckContext ??= createCurrentCheckContext();
          const results = currentCheckContext.results;
          let current = results.get(dependency);
          if (current === undefined) {
            current = dependency.isCurrent(currentCheckContext);
            results.set(dependency, current);
          }
          if (!current) return false;
        }
      }

      return true;
    },
    onFirstSubscriber: () => restoreUntrackedDependencies(true),
    // Reattaching a cached computed can briefly remove its last direct
    // subscriber while a sibling reader is still restoring the same graph.
    // Preserve the dormant transitive dependencies through that transition.
    onNoSubscribers: () => suspendIfUnobserved(true),
    subscribers: null,
    version: 0,
  };

  const computation: ReactiveComputation = {
    id: runtimeState.nextComputationId,
    deps: new Set(),
    disposed: false,
    queued: false,
    flushToken: undefined,
    flushRuns: 0,
    markDirty() {
      invalidatePullContext(computation);
      invalidateAttachmentCheckContext();
      if (recomputing) {
        invalidatedWhileRecomputing = true;
      }
      if (dirty) {
        if (source.subscribers === null || computation.queued) {
          return;
        }
      }

      dirty = true;

      if (source.subscribers !== null) {
        if (deferred) {
          notifySubscribers(source);
          return;
        }
        if (runtimeState.notificationDepth > 0 || runtimeState.batchDepth > 0) {
          queuePendingComputed(computation);
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

      invalidateAttachmentCheckContext();
      invalidatePullContext(computation);
      computation.disposed = true;
      computation.queued = false;
      runtimeState.pendingComputed.delete(computation);
      cleanupDeps(computation);
      computation.orderedDeps = undefined;
      source.subscribers = null;
      source.onFirstSubscriber = undefined;
      source.onNoSubscribers = undefined;
      hasValue = false;
      value = undefined as T;
      publishedHasValue = false;
      publishedValue = undefined as T;
      dirty = true;
      untrackedDependencies = [];
      resource.dispose();
    },
  };

  runtimeState.nextComputationId += 1;
  registerCleanup(computation.dispose);
  source.computation = computation;
  if (!deferred) {
    source.publisher = computation;
  }

  function pullQueuedDependencies(): void {
    if (runtimeState.pull?.checked.has(computation)) return;
    // Cell-only dependencies cannot hide a queued computed. Keep this common
    // clean-read path allocation-free during a wide computed flush.
    let hasComputation = false;
    for (const dependency of computation.deps) {
      if (dependency.computation !== undefined) {
        hasComputation = true;
        break;
      }
    }
    if (!hasComputation) return;

    const previousContext = runtimeState.pull;
    const context = (runtimeState.pull ??= { checked: new Set(), active: new Set() });
    // A nested publish can re-stamp dependencies already read by the caller.
    const activeTracker = runtimeState.activeTracker;
    if (activeTracker !== null && activeTracker !== computation) {
      preserveIncrementalTracking(activeTracker);
    }
    runtimeState.batchDepth += 1;
    try {
      pull(computation, false);
    } finally {
      runtimeState.batchDepth -= 1;
      if (!runtimeState.flushingComputed) runtimeState.pull = previousContext;
    }

    function pull(current: ReactiveComputation, publish: boolean): void {
      if (context.checked.has(current) || context.active.has(current) || current.disposed) {
        return;
      }
      const completed = context.checked;
      context.active.add(current);
      try {
        // An unqueued direct dependency can hide a queued ancestor. Walk in
        // dependency order, sharing proofs across diamonds and nested reads.
        // Deferred computeds never queue a publish, but they forward the
        // invalidation of an ancestor that does, so walk through them too.
        for (const dependency of current.deps) {
          const upstream = dependency.computation;
          if (upstream !== undefined) {
            pull(upstream, dependency.publisher !== undefined);
          }
        }
        if (publish && current.queued) {
          current.run();
        }
        // Reentrant writes replace the proofs; never revive that old map.
        completed.add(current);
      } finally {
        context.active.delete(current);
      }
    }
  }

  function publishIfChanged(): void {
    const previousHasValue = publishedHasValue;
    const previousValue = publishedValue;

    try {
      const nextValue = recompute();
      publishedValue = nextValue;
      publishedHasValue = true;

      if (!previousHasValue || !equals(previousValue, nextValue)) {
        notifySubscribers(source);
      }
    } catch {
      // The error itself is announced below, so the next successful value
      // must publish again even when it equals the last one consumers saw.
      publishedHasValue = false;
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

    invalidateAttachmentCheckContext();
    const previousTracker = runtimeState.activeTracker;
    const previousDepsSize = computation.deps.size;
    const nextTrackingVersion = nextTrackingVersionFor(computation);

    computation.trackingAddedDeps = undefined;
    computation.trackingCount = 0;
    computation.trackingOrderedIndex = computation.orderedDeps === undefined ? undefined : 0;
    computation.trackingOrderedMismatch = false;
    computation.trackingVersion = nextTrackingVersion;
    runtimeState.activeTracker = computation;
    recomputing = true;

    // Only extend the proof set that existed before user code ran. Reentrant
    // writes may replace it while fn() is evaluating earlier dependencies.
    const checked = runtimeState.pull?.checked;
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
      // A dependency published a newer value while fn() was still reading
      // the old one. Keep the cache invalid so the publish that was queued
      // for this computed recomputes it instead of announcing this value.
      dirty = invalidatedWhileRecomputing;

      if (source.subscribers === null) {
        suspendIfUnobserved();
      } else {
        untrackedDependencies = [];
        if (!dirty) checked?.add(computation);
      }

      return nextValue;
    } catch (error) {
      cleanupAddedDeps(computation);
      dirty = true;

      if (source.subscribers === null) {
        suspendIfUnobserved();
      }

      throw error;
    } finally {
      computation.trackingAddedDeps = undefined;
      computation.trackingCount = undefined;
      computation.trackingOrderedIndex = undefined;
      computation.trackingOrderedMismatch = undefined;
      computation.trackingTouchedDeps = undefined;
      runtimeState.activeTracker = previousTracker;
      recomputing = false;
      invalidatedWhileRecomputing = false;
    }
  }

  function suspendIfUnobserved(preserveExisting = false): void {
    if (computation.disposed || source.subscribers !== null) {
      return;
    }

    const wasDirty = dirty;
    const capturedDependencies = Array.from(computation.deps, createUntrackedDependency);
    if (preserveExisting && computation.deps.size === 0 && untrackedDependencies.length > 0) {
      return;
    }

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
      const wasDormant = untrackedDependencies.length > 0;
      const canShareCurrentCheckContext = untrackedDependencies.length > 1;
      let currentCheckContext: CurrentCheckContext | undefined;
      let dependenciesChanged = false;
      for (const dependency of untrackedDependencies) {
        if (
          currentCheckContext === undefined &&
          canShareCurrentCheckContext &&
          dependency.requiresCurrentCheckContext
        ) {
          currentCheckContext = createCurrentCheckContext();
        }

        if (!untrackedDependencyIsCurrent(dependency, currentCheckContext)) {
          dependenciesChanged = true;
          break;
        }
      }
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

      if (
        !dirty &&
        source.subscribers !== null &&
        (runtimeState.flushingComputed || runtimeState.pendingComputed.size > 0)
      ) {
        pullQueuedDependencies();
      }

      const wasDirty = dirty;
      const previousHasValue = hasValue;
      const previousValue = value;
      const nextValue = recompute();

      if (wasDormant && wasDirty && previousHasValue && !equals(previousValue, nextValue)) {
        // A dormant computed has no subscribers to notify before this read,
        // but its source version still needs to advance so other dormant
        // readers observe the refreshed value through their snapshots. The
        // current reader publishes its own result after this nested read.
        bumpSourceVersion(source);
      }

      // This read may have refreshed a value that existing subscribers never
      // heard about, for example when a sibling reader reaches this computed
      // through a dirty dependency before that dependency publishes, or when
      // a nested publish queued this computed while its recompute was on the
      // stack. Announce it now so a later publish, which compares against
      // this baseline, cannot swallow the change. The reader that triggered
      // this recompute already holds the fresh value, so it is skipped. A
      // clean read leaves the baseline as it is: it already equals the cache.
      // Deferred computeds forward dirtiness eagerly instead of publishing
      // values, so their subscribers were already told.
      const owed =
        !deferred &&
        source.subscribers !== null &&
        wasDirty &&
        publishedHasValue &&
        !equals(publishedValue, nextValue);
      publishedValue = nextValue;
      publishedHasValue = true;

      if (owed) {
        // Only mark and queue: a synchronous publish here could cascade back
        // into a computed that is still mid-recompute on the reader stack.
        // The enclosing flush, batch, or notification drains the queue once
        // this read returns.
        runtimeState.batchDepth += 1;
        try {
          notifySubscribers(source, runtimeState.activeTracker ?? undefined);
        } finally {
          runtimeState.batchDepth -= 1;
        }
      }

      return nextValue;
    },
  };

  function restoreUntrackedDependencies(preserveSnapshots = false): void {
    if (untrackedDependencies.length === 0) {
      return;
    }

    const dependencies = untrackedDependencies.map((dependency) => dependency.ref.deref());
    if (dependencies.some((dependency) => dependency === undefined)) {
      untrackedDependencies = [];
      return;
    }

    const previousContext = runtimeState.attachmentCheckContext;
    if (preserveSnapshots) {
      runtimeState.attachmentCheckContext ??= createCurrentCheckContext();
    }
    try {
      // A subscriber may attach this computed without reading it, for example
      // while restoring its own dormant graph. The snapshots taken at the last
      // suspend are the only proof the cache is fresh: if any of them is stale,
      // the value must stay invalid so a later suspend cannot re-stamp it with
      // the current versions and revive an outdated cache.
      if (
        preserveSnapshots &&
        !dirty &&
        source.isCurrent?.(runtimeState.attachmentCheckContext) === false
      ) {
        dirty = true;
      }

      for (const dependency of dependencies as Source[]) {
        addSourceSubscriber(dependency, computation);
        computation.deps.add(dependency);
      }
      computation.orderedDeps = dependencies as Source[];
      if (!preserveSnapshots) untrackedDependencies = [];
    } finally {
      runtimeState.attachmentCheckContext = previousContext;
    }
  }
}
