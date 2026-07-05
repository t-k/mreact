import { runtimeState } from "./state.js";
import { invalidateDevtoolsWriteCache } from "./cell.js";
import { invalidateReactiveDevtoolsCache } from "./devtools.js";
import { schedulePendingFlush } from "./scheduler.js";
import { flushPendingComputed } from "./tracking.js";

/** Groups reactive writes and flushes dependents after the callback returns. */
export function batch<T>(fn: () => T): T {
  invalidateDevtoolsWriteCache();
  invalidateReactiveDevtoolsCache();
  runtimeState.batchDepth += 1;

  try {
    return fn();
  } finally {
    runtimeState.batchDepth -= 1;

    if (runtimeState.batchDepth === 0) {
      flushPendingComputed();
      schedulePendingFlush();
    }
  }
}

/** Groups reactive writes across an async callback and flushes after it settles. */
export async function batchAsync<T>(fn: () => Promise<T> | T): Promise<T> {
  invalidateDevtoolsWriteCache();
  invalidateReactiveDevtoolsCache();
  runtimeState.batchDepth += 1;

  try {
    return await fn();
  } finally {
    runtimeState.batchDepth -= 1;

    if (runtimeState.batchDepth === 0) {
      flushPendingComputed();
      schedulePendingFlush();
    }
  }
}
