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

  if (source.singleSubscriber === tracker) {
    tracker.deps.add(source);
    return;
  }

  const previousSize = source.subscribers.size;
  source.subscribers.add(tracker);
  tracker.deps.add(source);

  if (previousSize === 0) {
    source.singleSubscriber = tracker;
  } else if (source.subscribers.size > 1) {
    source.singleSubscriber = undefined;
  }
}

export function cleanupDeps(computation: ReactiveComputation): void {
  for (const dep of computation.deps) {
    if (!dep.subscribers.delete(computation)) {
      continue;
    }

    if (dep.trackedBy === computation) {
      dep.trackedBy = undefined;
      dep.trackedVersion = undefined;
    }

    if (dep.subscribers.size === 0) {
      dep.singleSubscriber = undefined;
    } else if (dep.subscribers.size === 1) {
      dep.singleSubscriber = dep.subscribers.values().next().value;
    }
  }

  computation.deps.clear();
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

export function cleanupAddedDeps(computation: ReactiveComputation): void {
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

export function notifySubscribers(source: Source): void {
  if (source.subscribers.size === 0) {
    return;
  }

  const cachedSingleSubscriber = source.singleSubscriber;
  if (cachedSingleSubscriber !== undefined) {
    if (cachedSingleSubscriber.disposed || cachedSingleSubscriber.queued) {
      return;
    }

    runtimeState.notificationDepth += 1;

    try {
      cachedSingleSubscriber.markDirty();
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
      source.subscribers.size === 1
        ? source.subscribers.values().next().value
        : undefined;

    if (singleSubscriber !== undefined) {
      if (!singleSubscriber.disposed && !singleSubscriber.queued) {
        singleSubscriber.markDirty();
      }
    } else {
      const subscribers = orderedComputations(source.subscribers);

      for (const subscriber of subscribers) {
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
