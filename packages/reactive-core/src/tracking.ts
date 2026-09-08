import { bumpSourceVersion, runtimeState, type ReactiveComputation, type Source } from "./state.js";

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
    source.onFirstSubscriber?.();
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

  // Ordered reads are retained by their prefix index, not per-source stamps.
  // A later mismatch snapshots that prefix before switching to stamped tracking.
  if (
    computation.trackingOrderedIndex !== undefined &&
    computation.trackingOrderedMismatch !== true
  ) {
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

// Queued subscribers are still marked: a read may have recomputed one since it
// was queued, and markDirty itself returns early when it is dirty and queued.
export function notifySubscribers(source: Source, skip?: ReactiveComputation): void {
  bumpSourceVersion(source);
  const subscribers = source.subscribers;

  if (subscribers === null) {
    return;
  }

  if (!(subscribers instanceof Set)) {
    if (runtimeState.batchDepth > 0) {
      if (!subscribers.disposed && subscribers !== skip) {
        subscribers.markDirty();
      }
      return;
    }

    runtimeState.notificationDepth += 1;

    try {
      if (!subscribers.disposed && subscribers !== skip) {
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
      if (!singleSubscriber.disposed && singleSubscriber !== skip) {
        singleSubscriber.markDirty();
      }
    } else {
      for (const subscriber of orderedComputations(subscribers)) {
        if (!subscriber.disposed && subscriber !== skip) {
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

/** Queues a computed publish for the next flush of batched notifications. */
export function queuePendingComputed(computation: ReactiveComputation): void {
  computation.queued = true;
  runtimeState.pendingComputed.add(computation);
  if (computation.id < runtimeState.pendingComputedMinId) {
    runtimeState.pendingComputedMinId = computation.id;
  }
}

function takePendingComputed(): ReactiveComputation[] {
  const pending = runtimeState.pendingComputed;
  const taken =
    pending.size === 1
      ? [pending.values().next().value as ReactiveComputation]
      : orderedComputations(pending);
  pending.clear();
  runtimeState.pendingComputedMinId = Number.POSITIVE_INFINITY;
  return taken;
}

/** Flushes computed values that were dirtied during batched notifications. */
export function flushPendingComputed(): void {
  if (runtimeState.flushingComputed || runtimeState.pendingComputed.size === 0) {
    return;
  }

  runtimeState.flushingComputed = true;
  let completed = false;
  let computations: ReactiveComputation[] = [];
  let index = 0;
  // Work queued mid-pass that sorts before the rest of the pass. Keeping it in
  // a heap next to the sorted pass costs a logarithmic merge per entry instead
  // of copying and re-sorting the whole remaining pass on every merge.
  const merged: ReactiveComputation[] = [];

  try {
    // Count executions per computation, not queue merges: independent branches
    // may need arbitrarily many merges without repeating any computation.
    const flushToken = {};

    while (runtimeState.pendingComputed.size > 0) {
      computations = takePendingComputed();

      for (index = 0; ; ) {
        // A publish in this pass can queue a computed created earlier than the
        // rest of the pass, and a later computed may read through it while it
        // is still clean. Merge such work back in creation order so consumers
        // run after the publishes they depend on instead of seeing a glitch.
        // The tracked low bound avoids rescanning the queue per computation
        // when a wide pass only queues later consumers. Work that sorts after
        // the whole pass, such as the next link of a chain, is appended so a
        // deep chain drains in one pass instead of one iteration per link.
        if (runtimeState.pendingComputed.size > 0) {
          const pendingMinId = runtimeState.pendingComputedMinId;
          if (
            merged.length === 0 &&
            pendingMinId > (computations[computations.length - 1] as ReactiveComputation).id
          ) {
            computations.push(...takePendingComputed());
          } else if (
            merged.length > 0 ||
            (index < computations.length &&
              pendingMinId < (computations[index] as ReactiveComputation).id)
          ) {
            for (const computation of takePendingComputed()) {
              heapPush(merged, computation);
            }
          }
        }

        let computation: ReactiveComputation;
        if (merged.length > 0) {
          const next = merged[0] as ReactiveComputation;
          if (
            index < computations.length &&
            (computations[index] as ReactiveComputation).id < next.id
          ) {
            computation = computations[index] as ReactiveComputation;
            index += 1;
          } else {
            heapPop(merged);
            computation = next;
            // The same computation can be queued again while it still waits in
            // the pass or the heap. Run it once, like the set-based merge did.
            if (index < computations.length && computations[index] === computation) {
              index += 1;
            }
            while (merged.length > 0 && merged[0] === computation) {
              heapPop(merged);
            }
          }
        } else if (index < computations.length) {
          computation = computations[index] as ReactiveComputation;
          index += 1;
        } else {
          break;
        }

        computation.queued = false;

        if (!computation.disposed) {
          const count = computation.flushToken === flushToken ? (computation.flushRuns ?? 0) : 0;
          if (count >= maxPendingComputedFlushIterations) {
            throw new Error(
              `Reactive computed flush limit exceeded after ${maxPendingComputedFlushIterations} iterations; a computed likely writes a value it also reads. Check for cell.set() inside a computation that reads the same cell.`,
            );
          }
          computation.flushToken = flushToken;
          computation.flushRuns = count + 1;
          computation.run();
        }
      }
    }

    completed = true;
  } finally {
    if (!completed) {
      // The active snapshot is detached from pendingComputed. Any failure,
      // including the execution limit, must release its remaining entries.
      for (; index < computations.length; index += 1) {
        (computations[index] as ReactiveComputation).queued = false;
      }
      for (const computation of merged) {
        computation.queued = false;
      }
      discardPendingComputed();
    }
    runtimeState.flushingComputed = false;
  }
}

function heapPush(heap: ReactiveComputation[], computation: ReactiveComputation): void {
  let child = heap.length;
  heap.push(computation);
  while (child > 0) {
    const parent = (child - 1) >> 1;
    if ((heap[parent] as ReactiveComputation).id <= computation.id) {
      break;
    }
    heap[child] = heap[parent] as ReactiveComputation;
    child = parent;
  }
  heap[child] = computation;
}

function heapPop(heap: ReactiveComputation[]): void {
  const last = heap.pop() as ReactiveComputation;
  const size = heap.length;
  if (size === 0) {
    return;
  }
  let parent = 0;
  for (;;) {
    let child = parent * 2 + 1;
    if (child >= size) {
      break;
    }
    if (
      child + 1 < size &&
      (heap[child + 1] as ReactiveComputation).id < (heap[child] as ReactiveComputation).id
    ) {
      child += 1;
    }
    if ((heap[child] as ReactiveComputation).id >= last.id) {
      break;
    }
    heap[parent] = heap[child] as ReactiveComputation;
    parent = child;
  }
  heap[parent] = last;
}

function discardPendingComputed(): void {
  for (const computation of takePendingComputed()) {
    computation.queued = false;
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
