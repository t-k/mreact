import { runtimeState } from "./state.js";
import { registerReactiveDevtoolsResource } from "./devtools.js";

/** Owns cleanup callbacks for DOM-independent resources. */
export interface CleanupScope {
  readonly disposed: boolean;
  dispose(): void;
  register(dispose: () => void): () => void;
}

/** Creates an idempotent LIFO cleanup owner. */
export function createCleanupScope(): CleanupScope {
  const resource = registerReactiveDevtoolsResource("scope");
  interface CleanupEntry {
    active: boolean;
    cleanup: (() => void) | undefined;
    next: CleanupEntry | undefined;
    previous: CleanupEntry | undefined;
  }

  let tail: CleanupEntry | undefined;
  let disposed = false;

  const unlink = (entry: CleanupEntry): void => {
    if (!entry.active) {
      return;
    }

    entry.active = false;
    if (entry.previous !== undefined) {
      entry.previous.next = entry.next;
    }
    if (entry.next === undefined) {
      tail = entry.previous;
    } else {
      entry.next.previous = entry.previous;
    }

    entry.cleanup = undefined;
    entry.next = undefined;
    entry.previous = undefined;
  };

  const register = (dispose: () => void): (() => void) => {
    if (disposed) {
      dispose();
      return () => {};
    }

    const entry: CleanupEntry = {
      active: true,
      cleanup: dispose,
      next: undefined,
      previous: tail,
    };
    if (tail !== undefined) {
      tail.next = entry;
    }
    tail = entry;

    return () => unlink(entry);
  };

  const dispose = (): void => {
    if (disposed) {
      return;
    }

    disposed = true;
    let firstError: unknown;
    while (tail !== undefined) {
      const entry = tail;
      const cleanup = entry.cleanup;
      unlink(entry);
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
      resource.dispose();
      throw firstError;
    }

    resource.dispose();
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
  return withCleanupScope((dispose) => {
    scope.register(dispose);
  }, run);
}

/** Runs a callback with a cleanup owner that can collect disposers. */
export function withCleanupScope<T>(owner: (dispose: () => void) => void, run: () => T): T {
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
