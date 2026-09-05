import { runtimeState } from "./state.js";

/** Owns cleanup callbacks for DOM-independent resources. */
export interface CleanupScope {
  readonly disposed: boolean;
  dispose(): void;
  register(dispose: () => void): () => void;
}

/** Creates an idempotent LIFO cleanup owner. */
export function createCleanupScope(): CleanupScope {
  const cleanups: Array<() => void> = [];
  let disposed = false;

  const register = (dispose: () => void): (() => void) => {
    if (disposed) {
      dispose();
      return () => {};
    }

    let active = true;
    cleanups.push(() => {
      if (!active) {
        return;
      }
      active = false;
      dispose();
    });
    return () => {
      active = false;
    };
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    let firstError: unknown;
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup === undefined) {
        continue;
      }
      try {
        cleanup();
      } catch (error) {
        firstError ??= error;
      }
    }

    if (firstError !== undefined) {
      throw firstError;
    }
  };

  return {
    get disposed() {
      return disposed;
    },
    dispose,
    register,
  };
}

/** Runs a synchronous callback with a public cleanup scope as its dynamic owner. */
export function runWithCleanupScope<T>(scope: CleanupScope, run: () => T): T {
  return withCleanupScope(
    (dispose) => {
      scope.register(dispose);
    },
    run,
  );
}

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
