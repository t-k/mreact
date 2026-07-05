import { invalidateDevtoolsWriteCache } from "./cell.js";
import { invalidateReactiveDevtoolsCache } from "./devtools.js";
import { runtimeState, type ReactiveComputation } from "./state.js";

/** Scheduler used to enqueue pending reactive computations. */
export interface Scheduler {
  schedule(flush: () => void): void;
}

const defaultScheduler: Scheduler = {
  schedule(flush) {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(flush);
      return;
    }

    void Promise.resolve().then(flush);
  },
};

let scheduler = defaultScheduler;
let queue: ReactiveComputation[] = [];
let lastQueuedComputationId = -1;
let queueRequiresSort = false;
let scheduled = false;
let flushing = false;
const maxFlushIterations = 100;

/** Replaces the reactive scheduler and returns a restore function. */
export function setScheduler(nextScheduler: Scheduler): () => void {
  const previous = scheduler;
  scheduler = nextScheduler;

  return () => {
    scheduler = previous;
  };
}

export function resetSchedulerStateForTesting(): void {
  for (const computation of queue) {
    computation.queued = false;
  }

  clearQueue();
  scheduled = false;
  flushing = false;
}

export function queueComputation(computation: ReactiveComputation): void {
  if (computation.disposed || computation.queued) {
    return;
  }

  if (computation.id < lastQueuedComputationId) {
    queueRequiresSort = true;
  }

  lastQueuedComputationId = computation.id;
  queue.push(computation);
  computation.queued = true;

  if (runtimeState.batchDepth > 0) {
    return;
  }

  schedulePendingFlush();
}

/** Requests a flush of queued reactive computations. */
export function schedulePendingFlush(): void {
  if (queue.length === 0 || scheduled || flushing) {
    return;
  }

  scheduled = true;

  try {
    scheduler.schedule(flushQueuedComputations);
  } catch (error) {
    scheduled = false;
    for (const computation of queue) {
      computation.queued = false;
    }
    clearQueue();
    throw error;
  }
}

/** Immediately flushes queued reactive computations. */
export function flushQueuedComputations(): void {
  if (flushing) {
    return;
  }

  invalidateDevtoolsWriteCache();
  invalidateReactiveDevtoolsCache();
  scheduled = false;
  flushing = true;
  let firstError: unknown;

  try {
    for (let iteration = 0; queue.length > 0; iteration += 1) {
      if (iteration >= maxFlushIterations) {
        throw new Error(
          `Reactive flush limit exceeded after ${maxFlushIterations} iterations; an effect or computed likely writes a value it also reads. Check for cell.set() inside a computation that reads the same cell. Queued computations: ${queue.length}.`,
        );
      }

      const current = takeQueuedComputations();

      for (const computation of current) {
        computation.queued = false;

        if (!computation.disposed) {
          try {
            computation.run();
          } catch (error) {
            firstError ??= error;
          }
        }
      }
    }

    if (firstError !== undefined) {
      throw firstError;
    }
  } finally {
    flushing = false;
  }
}

function clearQueue(): void {
  queue = [];
  lastQueuedComputationId = -1;
  queueRequiresSort = false;
}

function takeQueuedComputations(): ReactiveComputation[] {
  if (queueRequiresSort) {
    const current = queue.sort((a, b) => a.id - b.id);
    clearQueue();
    return current;
  }

  const current = queue;
  queue = [];
  lastQueuedComputationId = -1;
  queueRequiresSort = false;
  return current;
}
