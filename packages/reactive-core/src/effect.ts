import { queueComputation } from "./scheduler.js";
import { currentDevtoolsEmitter } from "./devtools.js";
import { registerCleanup } from "./cleanup-scope.js";
import { runtimeState, type ReactiveComputation } from "./state.js";
import { cleanupDeps } from "./tracking.js";

declare const __MREACT_CLIENT_DEVTOOLS__: boolean | undefined;

export function effect(fn: () => void | (() => void)): () => void {
  let cleanup: (() => void) | undefined;

  const computation: ReactiveComputation = {
    id: runtimeState.nextComputationId,
    deps: new Set(),
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

      cleanupDeps(computation);
      runtimeState.activeTracker = computation;

      if (
        typeof __MREACT_CLIENT_DEVTOOLS__ !== "undefined" &&
        __MREACT_CLIENT_DEVTOOLS__ === false
      ) {
        try {
          const result = fn();
          cleanup = typeof result === "function" ? result : undefined;
        } finally {
          runtimeState.activeTracker = previousTracker;
        }
        return;
      }

      const emit = currentDevtoolsEmitter();
      const startedAt = emit === undefined ? 0 : performanceNow();

      try {
        const result = fn();
        cleanup = typeof result === "function" ? result : undefined;
      } finally {
        runtimeState.activeTracker = previousTracker;
        if (emit !== undefined) {
          emit({
            durationMs: performanceNow() - startedAt,
            id: computation.id,
            package: "@reckona/mreact-reactive-core",
            timestamp: Date.now(),
            type: "reactive:effect:run",
          });
        }
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

  registerCleanup(computation.dispose);
  return computation.dispose;
}

function performanceNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
