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
const queue = new Set<ReactiveComputation>();
let scheduled = false;
let flushing = false;
const maxFlushIterations = 100;

export function setScheduler(nextScheduler: Scheduler): () => void {
  const previous = scheduler;
  scheduler = nextScheduler;

  return () => {
    scheduler = previous;
  };
}

export function queueComputation(computation: ReactiveComputation): void {
  if (computation.disposed) {
    return;
  }

  queue.add(computation);
  computation.queued = true;

  if (runtimeState.batchDepth > 0) {
    return;
  }

  schedulePendingFlush();
}

export function schedulePendingFlush(): void {
  if (queue.size === 0 || scheduled || flushing) {
    return;
  }

  scheduled = true;
  scheduler.schedule(flushQueuedComputations);
}

export function flushQueuedComputations(): void {
  if (flushing) {
    return;
  }

  scheduled = false;
  flushing = true;

  try {
    for (let iteration = 0; queue.size > 0; iteration += 1) {
      if (iteration >= maxFlushIterations) {
        throw new Error("Maximum reactive flush iterations exceeded");
      }

      const current = Array.from(queue).sort((a, b) => a.id - b.id);
      queue.clear();

      for (const computation of current) {
        computation.queued = false;

        if (!computation.disposed) {
          computation.run();
        }
      }
    }
  } finally {
    flushing = false;
  }
}
