import { runtimeState, type ReactiveComputation, type Source } from "./state.js";

export function trackSource(source: Source): void {
  const tracker = runtimeState.activeTracker;

  if (tracker === null || tracker.disposed) {
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

    if (dep.subscribers.size === 0) {
      dep.singleSubscriber = undefined;
    } else if (dep.subscribers.size === 1) {
      dep.singleSubscriber = dep.subscribers.values().next().value;
    }
  }

  computation.deps.clear();
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

export function flushPendingComputed(): void {
  if (runtimeState.flushingComputed) {
    return;
  }

  runtimeState.flushingComputed = true;

  try {
    while (runtimeState.pendingComputed.size > 0) {
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
