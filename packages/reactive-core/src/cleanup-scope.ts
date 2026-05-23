import { runtimeState } from "./state.js";

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

export function registerCleanup(dispose: () => void): void {
  runtimeState.cleanupOwner?.(dispose);
}
