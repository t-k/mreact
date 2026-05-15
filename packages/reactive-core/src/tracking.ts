import { runtimeState, type ReactiveComputation, type Source } from "./state.js";

export function trackSource(source: Source): void {
  const tracker = runtimeState.activeTracker;

  if (tracker === null || tracker.disposed) {
    return;
  }

  source.subscribers.add(tracker);
  tracker.deps.add(source);
}

export function cleanupDeps(computation: ReactiveComputation): void {
  for (const dep of computation.deps) {
    dep.subscribers.delete(computation);
  }

  computation.deps.clear();
}

export function notifySubscribers(source: Source): void {
  const subscribers = orderedComputations(source.subscribers);

  runtimeState.notificationDepth += 1;

  try {
    for (const subscriber of subscribers) {
      if (!subscriber.disposed) {
        subscriber.markDirty();
      }
    }
  } finally {
    runtimeState.notificationDepth -= 1;

    if (runtimeState.notificationDepth === 0) {
      flushPendingComputed();
    }
  }
}

function flushPendingComputed(): void {
  if (runtimeState.flushingComputed) {
    return;
  }

  runtimeState.flushingComputed = true;

  try {
    while (runtimeState.pendingComputed.size > 0) {
      const computations = orderedComputations(runtimeState.pendingComputed);
      runtimeState.pendingComputed.clear();

      for (const computation of computations) {
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
