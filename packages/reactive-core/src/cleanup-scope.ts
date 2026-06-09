import { runtimeState } from "./state.js";

/** Runs a callback with a cleanup owner that can collect disposers. */
export function withCleanupScope<T>(
  owner: (dispose: () => void) => void,
  run: () => T,
): T {
  const previousOwner = runtimeState.cleanupOwner;
  runtimeState.cleanupOwner = owner;

  try {
    return run();
  } finally {
    runtimeState.cleanupOwner = previousOwner;
  }
}

/** Registers a disposer with the currently active cleanup scope. */
export function registerCleanup(dispose: () => void): void {
  runtimeState.cleanupOwner?.(dispose);
}
