import { runtimeState, type ReactiveComputation } from "./state.js";

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
const queue: ReactiveComputation[] = [];
let scheduled = false;
let flushing = false;
let queueOrdered = true;
const maxFlushIterations = 100;

export function setScheduler(nextScheduler: Scheduler): () => void {
  const previous = scheduler;
  scheduler = nextScheduler;

  return () => {
    scheduler = previous;
  };
}

export function queueComputation(computation: ReactiveComputation): void {
  if (computation.disposed || computation.queued) {
    return;
  }

  const previous = queue[queue.length - 1];

  if (previous !== undefined && previous.id > computation.id) {
    queueOrdered = false;
  }

  queue.push(computation);
  computation.queued = true;

  if (runtimeState.batchDepth > 0) {
    return;
  }

  schedulePendingFlush();
}

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
    queue.length = 0;
    queueOrdered = true;
    throw error;
  }
}

export function flushQueuedComputations(): void {
  if (flushing) {
    return;
  }

  scheduled = false;
  flushing = true;
  let firstError: unknown;

  try {
    for (let iteration = 0; queue.length > 0; iteration += 1) {
      if (iteration >= maxFlushIterations) {
        throw new Error("Maximum reactive flush iterations exceeded");
      }

      const current = queueOrdered
        ? queue.splice(0, queue.length)
        : queue.splice(0, queue.length).sort((a, b) => a.id - b.id);
      queueOrdered = true;

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
