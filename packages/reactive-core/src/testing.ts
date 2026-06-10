import { flushQueuedComputations, resetSchedulerStateForTesting } from "./scheduler.js";
import { setScheduler, type Scheduler } from "./scheduler.js";

/** Waits for one queued microtask turn. */
export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
}

/** Flushes queued reactive effects around a microtask turn. */
export async function flushEffects(): Promise<void> {
  flushQueuedComputations();
  await Promise.resolve();
  flushQueuedComputations();
}

/** Test scheduler handle for deterministic reactive flush control. */
export interface ReactiveTestRuntime {
  dispose(): void;
  flushAll(): void;
  flushNext(): boolean;
  scheduledFlushCount(): number;
}

/** Creates a deterministic reactive scheduler for tests. */
export function createReactiveTestRuntime(): ReactiveTestRuntime {
  const scheduled: Array<() => void> = [];
  const scheduler: Scheduler = {
    schedule(flush) {
      scheduled.push(flush);
    },
  };
  const restore = setScheduler(scheduler);
  let disposed = false;

  const assertActive = () => {
    if (disposed) {
      throw new Error("Reactive test runtime has already been disposed");
    }
  };

  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      scheduled.length = 0;
      resetSchedulerStateForTesting();
      restore();
    },
    flushAll() {
      assertActive();
      while (this.flushNext()) {}
    },
    flushNext() {
      assertActive();
      const flush = scheduled.shift();
      if (flush === undefined) {
        return false;
      }
      flush();
      return true;
    },
    scheduledFlushCount() {
      return scheduled.length;
    },
  };
}
