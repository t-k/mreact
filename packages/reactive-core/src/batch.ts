import { runtimeState } from "./state.js";
import { invalidateDevtoolsWriteCache } from "./cell.js";
import { schedulePendingFlush } from "./scheduler.js";
import { flushPendingComputed } from "./tracking.js";

export function batch<T>(fn: () => T): T {
  invalidateDevtoolsWriteCache();
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

export async function batchAsync<T>(fn: () => Promise<T> | T): Promise<T> {
  invalidateDevtoolsWriteCache();
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
