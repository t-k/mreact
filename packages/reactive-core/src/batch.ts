import { runtimeState } from "./state.js";
import { schedulePendingFlush } from "./scheduler.js";

export function batch<T>(fn: () => T): T {
  runtimeState.batchDepth += 1;

  try {
    return fn();
  } finally {
    runtimeState.batchDepth -= 1;

    if (runtimeState.batchDepth === 0) {
      schedulePendingFlush();
    }
  }
}
