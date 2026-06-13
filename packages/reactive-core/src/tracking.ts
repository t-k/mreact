import { runtimeState, type ReactiveComputation, type Source } from "./state.js";

const maxPendingComputedFlushIterations = 100;

export function trackSource(source: Source): void {
  const tracker = runtimeState.activeTracker;

  if (tracker === null || tracker.disposed) {
    return;
  }

  if (tracker.trackSource !== undefined) {
    tracker.trackSource(source);
    return;
  }

  addSourceSubscriber(source, tracker);
  tracker.deps.add(source);
}

function addSourceSubscriber(source: Source, computation: ReactiveComputation): void {
  const subscribers = source.subscribers;

  if (subscribers === null) {
    source.subscribers = computation;
  } else if (subscribers instanceof Set) {
    subscribers.add(computation);
  } else if (subscribers !== computation) {
    source.subscribers = new Set([subscribers, computation]);
  }
}

function removeSourceSubscriber(source: Source, computation: ReactiveComputation): boolean {
  const subscribers = source.subscribers;

  if (subscribers === computation) {
    source.subscribers = null;
    return true;
  }

  if (subscribers instanceof Set && subscribers.delete(computation)) {
    if (subscribers.size === 0) {
      source.subscribers = null;
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

export function trackIncrementalSource(
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
  computation.trackingTouchedDeps?.push(source);

  if (computation.deps.has(source)) {
    return;
  }

  addSourceSubscriber(source, computation);
  computation.deps.add(source);
  computation.trackingAddedDeps?.push(source);
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

  for (const dep of addedDeps) {
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
    const singleSubscriber =
      subscribers.size === 1 ? subscribers.values().next().value : undefined;

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
    for (
      let iteration = 0;
      runtimeState.pendingComputed.size > 0;
      iteration += 1
    ) {
      if (iteration >= maxPendingComputedFlushIterations) {
        runtimeState.pendingComputed.clear();
        throw new Error("Reactive computed flush limit exceeded");
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

  return monotonic || ordered.length < 2
    ? ordered
    : ordered.sort((a, b) => a.id - b.id);
}
