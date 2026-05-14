import { queueComputation } from "./scheduler.js";
import { runtimeState, type ReactiveComputation } from "./state.js";
import { cleanupDeps } from "./tracking.js";

export function effect(fn: () => void | (() => void)): () => void {
  let cleanup: (() => void) | undefined;

  const computation: ReactiveComputation = {
    id: runtimeState.nextComputationId,
    deps: [],
    disposed: false,
    queued: false,
    markDirty() {
      queueComputation(computation);
    },
    run() {
      if (computation.disposed) {
        return;
      }

      const previousTracker = runtimeState.activeTracker;

      if (cleanup !== undefined) {
        const currentCleanup = cleanup;
        currentCleanup();
        cleanup = undefined;
      }

      const previousDeps = computation.deps;
      const nextDeps: typeof computation.deps = [];

      computation.deps = nextDeps;
      runtimeState.activeTracker = computation;

      try {
        const result = fn();

        for (const dep of previousDeps) {
          if (!nextDeps.includes(dep)) {
            dep.subscribers.delete(computation);
          }
        }

        cleanup = typeof result === "function" ? result : undefined;
      } catch (error) {
        for (const dep of nextDeps) {
          if (!previousDeps.includes(dep)) {
            dep.subscribers.delete(computation);
          }
        }

        computation.deps = previousDeps;
        throw error;
      } finally {
        runtimeState.activeTracker = previousTracker;
      }
    },
    dispose() {
      if (computation.disposed) {
        return;
      }

      computation.disposed = true;
      cleanupDeps(computation);

      if (cleanup !== undefined) {
        const currentCleanup = cleanup;
        cleanup = undefined;
        currentCleanup();
      }
    },
  };

  runtimeState.nextComputationId += 1;

  try {
    computation.run();
  } catch (error) {
    computation.disposed = true;
    cleanupDeps(computation);

    if (cleanup !== undefined) {
      const currentCleanup = cleanup;
      cleanup = undefined;
      currentCleanup();
    }

    throw error;
  }

  return computation.dispose;
}
