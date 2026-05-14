import { runtimeState, type ReactiveComputation, type Source } from "./state.js";

export function trackSource(source: Source): void {
  const tracker = runtimeState.activeTracker;

  if (tracker === null || tracker.disposed) {
    return;
  }

  source.subscribers.add(tracker);

  if (!tracker.deps.includes(source)) {
    tracker.deps.push(source);
  }
}

export function cleanupDeps(computation: ReactiveComputation): void {
  for (const dep of computation.deps) {
    dep.subscribers.delete(computation);
  }

  computation.deps.length = 0;
}

export function notifySubscribers(source: Source): void {
  const subscribers = Array.from(source.subscribers).sort((a, b) => a.id - b.id);

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
      const computations = Array.from(runtimeState.pendingComputed).sort(
        (a, b) => a.id - b.id,
      );
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
