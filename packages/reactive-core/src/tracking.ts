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
  const subscribers = Array.from(source.subscribers).sort((a, b) => a.id - b.id);

  for (const subscriber of subscribers) {
    if (!subscriber.disposed) {
      subscriber.markDirty();
    }
  }
}
