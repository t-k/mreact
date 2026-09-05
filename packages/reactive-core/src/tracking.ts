import {
  bumpSourceVersion,
  runtimeState,
  type ReactiveComputation,
  type Source,
} from "./state.js";

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
  tracker.deps.add(source);
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
  if (computation.deps.size === 1) {
    const dep = computation.deps.values().next().value as Source;

    if (removeSourceSubscriber(dep, computation) && dep.trackedBy === computation) {
      dep.trackedBy = undefined;
      dep.trackedVersion = undefined;
    }

    computation.deps.clear();
    computation.orderedDeps = undefined;
    return;
  }

  for (const dep of computation.deps) {
    if (!removeSourceSubscriber(dep, computation)) {
      continue;
    }

    if (dep.trackedBy === computation) {
      dep.trackedBy = undefined;
      dep.trackedVersion = undefined;
    }
  }

  computation.deps.clear();
  computation.orderedDeps = undefined;
}

export function nextTrackingVersionFor(computation: ReactiveComputation): number {
  const nextTrackingVersion = (computation.trackingVersion ?? 0) + 1;

  if (Number.isSafeInteger(nextTrackingVersion)) {
    return nextTrackingVersion;
  }

  for (const dep of computation.deps) {
    if (dep.trackedBy === computation) {
      dep.trackedVersion = undefined;
    }
  }

  return 1;
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

  if (alreadyTrackedByComputation || (computation.deps.size > 0 && computation.deps.has(source))) {
    return;
  }

  addSourceSubscriber(source, computation);
  computation.deps.add(source);
  const addedDeps = computation.trackingAddedDeps;
  if (addedDeps === undefined) {
    computation.trackingAddedDeps = source;
  } else if (Array.isArray(addedDeps)) {
    addedDeps.push(source);
  } else {
    computation.trackingAddedDeps = [addedDeps, source];
  }
}

export function preserveIncrementalTracking(computation: ReactiveComputation): void {
  const trackingVersion = computation.trackingVersion;

  if (trackingVersion === undefined || computation.trackingTouchedDeps !== undefined) {
    return;
  }

  const touchedDeps: Source[] = [];

  for (const dep of computation.deps) {
    if (dep.trackedBy === computation && dep.trackedVersion === trackingVersion) {
      touchedDeps.push(dep);
    }
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

  for (const dep of computation.deps) {
    if (
      touchedDeps?.has(dep) === true ||
      (dep.trackedBy === computation && dep.trackedVersion === trackingVersion)
    ) {
      continue;
    }

    if (!removeSourceSubscriber(dep, computation)) {
      continue;
    }

    if (dep.trackedBy === computation) {
      dep.trackedBy = undefined;
      dep.trackedVersion = undefined;
    }

    computation.deps.delete(dep);
  }
}

export function cleanupAddedDeps(computation: ReactiveComputation): void {
  const addedDeps = computation.trackingAddedDeps;

  if (addedDeps === undefined) {
    return;
  }

  if (Array.isArray(addedDeps)) {
    for (const dep of addedDeps) {
      cleanupAddedDependency(dep, computation);
    }
  } else {
    cleanupAddedDependency(addedDeps, computation);
  }
}

function cleanupAddedDependency(dep: Source, computation: ReactiveComputation): void {
  if (!removeSourceSubscriber(dep, computation)) {
    return;
  }

  if (dep.trackedBy === computation) {
    dep.trackedBy = undefined;
    dep.trackedVersion = undefined;
  }

  computation.deps.delete(dep);
}

export function notifySubscribers(source: Source): void {
  bumpSourceVersion(source);
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
  let completed = false;

  try {
    for (let iteration = 0; runtimeState.pendingComputed.size > 0; iteration += 1) {
      if (iteration >= maxPendingComputedFlushIterations) {
        discardPendingComputed();
        throw new Error(
          `Reactive computed flush limit exceeded after ${maxPendingComputedFlushIterations} iterations; a computed likely writes a value it also reads. Check for cell.set() inside a computation that reads the same cell.`,
        );
      }

      const computations =
        runtimeState.pendingComputed.size === 1
          ? [runtimeState.pendingComputed.values().next().value as ReactiveComputation]
          : orderedComputations(runtimeState.pendingComputed);
      runtimeState.pendingComputed.clear();

      for (let index = 0; index < computations.length; index += 1) {
        const computation = computations[index];
        if (computation === undefined) {
          continue;
        }
        computation.queued = false;

        try {
          if (!computation.disposed) {
            computation.run();
          }
        } catch (error) {
          // The snapshot is detached from pendingComputed while it runs. Clear
          // queued flags for work that was in the same snapshot so recovery can
          // schedule it again after the caller handles the failure.
          for (let remaining = index + 1; remaining < computations.length; remaining += 1) {
            const pending = computations[remaining];
            if (pending !== undefined) {
              pending.queued = false;
            }
          }
          throw error;
        }
      }
    }

    completed = true;
  } finally {
    if (!completed) {
      discardPendingComputed();
    }
    runtimeState.flushingComputed = false;
  }
}

function discardPendingComputed(): void {
  for (const computation of runtimeState.pendingComputed) {
    computation.queued = false;
  }

  runtimeState.pendingComputed.clear();
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
