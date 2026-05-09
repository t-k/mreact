import { runtimeState } from "./state.js";

export function batch<T>(fn: () => T): T {
  runtimeState.batchDepth += 1;

  try {
    return fn();
  } finally {
    runtimeState.batchDepth -= 1;
  }
}
