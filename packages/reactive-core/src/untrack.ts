import { runtimeState } from "./state.js";

export function untrack<T>(fn: () => T): T {
  const previousTracker = runtimeState.activeTracker;
  runtimeState.activeTracker = null;

  try {
    return fn();
  } finally {
    runtimeState.activeTracker = previousTracker;
  }
}
