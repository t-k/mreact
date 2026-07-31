import { runtimeState, type ReactiveComputation, type Source } from "./state.js";

const maxPendingComputedFlushIterations = 100;

export function trackSource(source: Source): void {
  const tracker = runtimeState.activeTracker;

  if (tracker === null || tracker.disposed) {
    return;
  }

  if (tracker.trackingVersion !== undefined) {
    trackIncrementalSource(source, tracker);
    return;
  }

  trackSourceDirect(source, tracker);
}

function trackSourceDirect(source: Source, tracker: ReactiveComputation): void {
  addSourceSubscriber(source, tracker);
  addComputationDependency(tracker, source);
}

export function computationDependencyCount(computation: ReactiveComputation): number {
  const deps = computation.deps;
  return deps === null ? 0 : deps instanceof Set ? deps.size : 1;
}

function computationHasDependency(computation: ReactiveComputation, source: Source): boolean {
  const deps = computation.deps;
  return deps === source || (deps instanceof Set && deps.has(source));
}

function addComputationDependency(computation: ReactiveComputation, source: Source): void {
  const deps = computation.deps;

  if (deps === null) {
    computation.deps = source;
  } else if (deps instanceof Set) {
    deps.add(source);
  } else if (deps !== source) {
    computation.deps = new Set([deps, source]);
  }
}

function removeComputationDependency(computation: ReactiveComputation, source: Source): void {
  const deps = computation.deps;

  if (deps === source) {
    computation.deps = null;
    return;
  }

  if (!(deps instanceof Set) || !deps.delete(source)) {
    return;
  }

  if (deps.size === 0) {
    computation.deps = null;
  } else if (deps.size === 1) {
    computation.deps = deps.values().next().value as Source;
  }
}

export function addSourceSubscriber(source: Source, computation: ReactiveComputation): void {
  const subscribers = source.subscribers;

  if (subscribers === null) {
    source.subscribers = computation;
  } else if (subscribers instanceof Set) {
    subscribers.add(computation);
  } else if (subscribers !== computation) {
    source.subscribers = new Set([subscribers, computation]);
  }
}

export function removeSourceSubscriber(source: Source, computation: ReactiveComputation): boolean {
  const subscribers = source.subscribers;

  if (subscribers === computation) {
    source.subscribers = null;
    source.onNoSubscribers?.();
    return true;
  }

  if (subscribers instanceof Set && subscribers.delete(computation)) {
    if (subscribers.size === 0) {
      source.subscribers = null;
      source.onNoSubscribers?.();
    }
    return true;
  }

  return false;
}

export function sourceSubscriberCount(source: Source): number {
  const subscribers = source.subscribers;

  return subscribers === null ? 0 : subscribers instanceof Set ? subscribers.size : 1;
}

export function cleanupDeps(computation: ReactiveComputation): void {
  const deps = computation.deps;

  if (deps instanceof Set) {
    for (const dep of deps) {
      removeTrackedDependency(dep, computation);
    }
    deps.clear();
  } else if (deps !== null) {
    removeTrackedDependency(deps, computation);
  }

  computation.deps = null;
  computation.orderedDeps = undefined;
}

function removeTrackedDependency(source: Source, computation: ReactiveComputation): void {
  if (removeSourceSubscriber(source, computation) && source.trackedBy === computation) {
    source.trackedBy = undefined;
    source.trackedVersion = undefined;
  }
}

export function nextTrackingVersionFor(computation: ReactiveComputation): number {
  const nextTrackingVersion = (computation.trackingVersion ?? 0) + 1;

  if (Number.isSafeInteger(nextTrackingVersion)) {
    return nextTrackingVersion;
  }

  const deps = computation.deps;

  if (deps instanceof Set) {
    for (const dep of deps) {
      if (dep.trackedBy === computation) {
        dep.trackedVersion = undefined;
      }
    }
  } else if (deps !== null && deps.trackedBy === computation) {
    deps.trackedVersion = undefined;
  }

  return 1;
}

function shouldKeepTrackedDependency(
  source: Source,
  computation: ReactiveComputation,
  trackingVersion: number,
  touchedDeps: ReadonlySet<Source> | undefined,
): boolean {
  return (
    touchedDeps?.has(source) === true ||
    (source.trackedVersion === trackingVersion && source.trackedBy === computation)
  );
}

function cleanupUntrackedDependency(
  source: Source,
  computation: ReactiveComputation,
  trackingVersion: number,
  touchedDeps: ReadonlySet<Source> | undefined,
): void {
  if (
    shouldKeepTrackedDependency(source, computation, trackingVersion, touchedDeps) ||
    !removeSourceSubscriber(source, computation)
  ) {
    return;
  }

  if (source.trackedBy === computation) {
    source.trackedBy = undefined;
    source.trackedVersion = undefined;
  }

  removeComputationDependency(computation, source);
}

function cleanupAddedDependency(source: Source, computation: ReactiveComputation): void {
  if (!removeSourceSubscriber(source, computation)) {
    return;
  }

  if (source.trackedBy === computation) {
    source.trackedBy = undefined;
    source.trackedVersion = undefined;
  }

  removeComputationDependency(computation, source);
}

export function trackIncrementalSource(source: Source, computation: ReactiveComputation): void {
  const trackingVersion = computation.trackingVersion;

  if (trackingVersion === undefined) {
    trackSourceDirect(source, computation);
    return;
  }

  const orderedIndex = computation.trackingOrderedIndex;
  const orderedDeps = computation.orderedDeps;

  if (
    orderedIndex !== undefined &&
    computation.trackingOrderedMismatch !== true &&
    orderedDeps !== undefined
  ) {
    if (orderedDeps[orderedIndex] === source) {
      computation.trackingOrderedIndex = orderedIndex + 1;
      computation.trackingCount = computation.trackingCount! + 1;
      return;
    }

    computation.trackingOrderedMismatch = true;

    if (orderedIndex > 0) {
      computation.trackingTouchedDeps = orderedDeps.slice(0, orderedIndex);
    }
  }

  if (source.trackedBy === computation && source.trackedVersion === trackingVersion) {
    return;
  }

  const alreadyTrackedByComputation = source.trackedBy === computation;

  source.trackedBy = computation;
  source.trackedVersion = trackingVersion;
  computation.trackingCount = computation.trackingCount! + 1;
  computation.trackingTouchedDeps?.push(source);

  if (alreadyTrackedByComputation || computationHasDependency(computation, source)) {
    return;
  }

  addSourceSubscriber(source, computation);
  addComputationDependency(computation, source);
  (computation.trackingAddedDeps ??= []).push(source);
}

export function preserveIncrementalTracking(computation: ReactiveComputation): void {
  const trackingVersion = computation.trackingVersion;

  if (trackingVersion === undefined || computation.trackingTouchedDeps !== undefined) {
    return;
  }

  const touchedDeps: Source[] = [];
  const deps = computation.deps;

  if (deps instanceof Set) {
    for (const dep of deps) {
      if (dep.trackedBy === computation && dep.trackedVersion === trackingVersion) {
        touchedDeps.push(dep);
      }
    }
  } else if (
    deps !== null &&
    deps.trackedBy === computation &&
    deps.trackedVersion === trackingVersion
  ) {
    touchedDeps.push(deps);
  }

  computation.trackingTouchedDeps = touchedDeps;
}

export function cleanupUntrackedDeps(
  computation: ReactiveComputation,
  trackingVersion: number,
): void {
  const touchedDeps =
    computation.trackingTouchedDeps === undefined
      ? undefined
      : new Set(computation.trackingTouchedDeps);
  const deps = computation.deps;

  if (deps instanceof Set) {
    for (const dep of deps) {
      cleanupUntrackedDependency(dep, computation, trackingVersion, touchedDeps);
    }
  } else if (deps !== null) {
    cleanupUntrackedDependency(deps, computation, trackingVersion, touchedDeps);
  }
}

export function cleanupAddedDeps(computation: ReactiveComputation): void {
  const addedDeps = computation.trackingAddedDeps;

  if (addedDeps === undefined) {
    return;
  }

  for (const dep of addedDeps) {
    cleanupAddedDependency(dep, computation);
  }
}

export function notifySubscribers(source: Source): void {
  const subscribers = source.subscribers;

  if (subscribers === null) {
    return;
  }

  if (!(subscribers instanceof Set)) {
    if (runtimeState.batchDepth > 0) {
      if (!subscribers.disposed && !subscribers.queued) {
        subscribers.markDirty();
      }
      return;
    }

    runtimeState.notificationDepth += 1;

    try {
      if (!subscribers.disposed && !subscribers.queued) {
        subscribers.markDirty();
      }
    } finally {
      runtimeState.notificationDepth -= 1;

      if (runtimeState.notificationDepth === 0 && runtimeState.batchDepth === 0) {
        flushPendingComputed();
      }
    }
    return;
  }

  runtimeState.notificationDepth += 1;

  try {
    const singleSubscriber = subscribers.size === 1 ? subscribers.values().next().value : undefined;

    if (singleSubscriber !== undefined) {
      if (!singleSubscriber.disposed && !singleSubscriber.queued) {
        singleSubscriber.markDirty();
      }
    } else {
      for (const subscriber of orderedComputations(subscribers)) {
        if (!subscriber.disposed && !subscriber.queued) {
          subscriber.markDirty();
        }
      }
    }
  } finally {
    runtimeState.notificationDepth -= 1;

    if (runtimeState.notificationDepth === 0 && runtimeState.batchDepth === 0) {
      flushPendingComputed();
    }
  }
}

/** Flushes computed values that were dirtied during batched notifications. */
export function flushPendingComputed(): void {
  if (runtimeState.flushingComputed) {
    return;
  }

  runtimeState.flushingComputed = true;

  try {
    for (let iteration = 0; runtimeState.pendingComputed.size > 0; iteration += 1) {
      if (iteration >= maxPendingComputedFlushIterations) {
        runtimeState.pendingComputed.clear();
        throw new Error(
          `Reactive computed flush limit exceeded after ${maxPendingComputedFlushIterations} iterations; a computed likely writes a value it also reads. Check for cell.set() inside a computation that reads the same cell.`,
        );
      }

      const computations =
        runtimeState.pendingComputed.size === 1
          ? [runtimeState.pendingComputed.values().next().value as ReactiveComputation]
          : orderedComputations(runtimeState.pendingComputed);
      runtimeState.pendingComputed.clear();

      for (const computation of computations) {
        computation.queued = false;

        if (!computation.disposed) {
          computation.run();
        }
      }
    }
  } finally {
    runtimeState.flushingComputed = false;
  }
}

function orderedComputations(
  computations: ReadonlySet<ReactiveComputation>,
): ReactiveComputation[] {
  const ordered: ReactiveComputation[] = [];
  let previousId = -1;
  let monotonic = true;

  for (const computation of computations) {
    ordered.push(computation);

    if (computation.id < previousId) {
      monotonic = false;
    }

    previousId = computation.id;
  }

  return monotonic || ordered.length < 2 ? ordered : ordered.sort((a, b) => a.id - b.id);
}
