import { runtimeState } from "./state.js";

/** Runs a callback without recording reactive dependencies. */
export function untrack<T>(fn: () => T): T {
  const previousTracker = runtimeState.activeTracker;
  runtimeState.activeTracker = null;

  try {
    return fn();
  } finally {
    runtimeState.activeTracker = previousTracker;
  }
}
