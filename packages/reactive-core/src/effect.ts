import { queueComputation } from "./scheduler.js";
import {
  emitReactiveEffectRunDevtoolsEvent,
  prepareReactiveEffectRunDevtoolsEvent,
} from "./devtools.js";
import { registerCleanup } from "./cleanup-scope.js";
import { runtimeState, type ReactiveComputation } from "./state.js";
import {
  cleanupDeps,
  cleanupUntrackedDeps,
  nextTrackingVersionFor,
} from "./tracking.js";

declare const __MREACT_CLIENT_DEVTOOLS__: boolean | undefined;

const clientDevtoolsDisabled =
  typeof __MREACT_CLIENT_DEVTOOLS__ !== "undefined" &&
  __MREACT_CLIENT_DEVTOOLS__ === false;

/** Runs a reactive side effect and returns a disposer. */
export function effect(fn: () => void | (() => void)): () => void {
  return createEffect(fn);
}

/** @internal Runs a labeled effect used by development diagnostics. */
export function effectWithDebugLabel(
  fn: () => void | (() => void),
  debugLabel: string,
): () => void {
  return createEffect(fn, debugLabel);
}

function createEffect(
  fn: () => void | (() => void),
  debugLabel?: string,
): () => void {
  let cleanup: (() => void) | undefined;

  const computation: ReactiveComputation = {
    id: runtimeState.nextComputationId,
    ...(debugLabel === undefined ? {} : { debugLabel }),
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

      const previousDepsSize = computation.deps.size;
      const nextTrackingVersion = nextTrackingVersionFor(computation);

      computation.trackingAddedDeps = undefined;
      computation.trackingCount = 0;
      computation.trackingTouchedDeps = undefined;
      computation.trackingVersion = nextTrackingVersion;
      runtimeState.activeTracker = computation;

      if (clientDevtoolsDisabled) {
        try {
          const result = fn();
          cleanup = typeof result === "function" ? result : undefined;
        } finally {
          finishIncrementalTracking(computation, previousDepsSize, nextTrackingVersion);
          runtimeState.activeTracker = previousTracker;
        }
        return;
      }

      const devtoolsEvent = prepareReactiveEffectRunDevtoolsEvent();

      try {
        const result = fn();
        cleanup = typeof result === "function" ? result : undefined;
      } finally {
        finishIncrementalTracking(computation, previousDepsSize, nextTrackingVersion);
        runtimeState.activeTracker = previousTracker;
        if (devtoolsEvent !== undefined) {
          emitReactiveEffectRunDevtoolsEvent(devtoolsEvent, computation.id);
        }
      }
    },
    dispose() {
      if (computation.disposed) {
        return;
      }

      computation.disposed = true;
      computation.queued = false;
      runtimeState.pendingComputed.delete(computation);
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
    computation.queued = false;
    runtimeState.pendingComputed.delete(computation);
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

function finishIncrementalTracking(
  computation: ReactiveComputation,
  previousDepsSize: number,
  trackingVersion: number,
): void {
  const addedDeps = computation.trackingAddedDeps;
  const trackedCount = computation.trackingCount ?? 0;

  if (
    previousDepsSize > 0 &&
    (trackedCount !== previousDepsSize || (addedDeps?.length ?? 0) > 0)
  ) {
    cleanupUntrackedDeps(computation, trackingVersion);
  }

  computation.trackingAddedDeps = undefined;
  computation.trackingCount = undefined;
  computation.trackingTouchedDeps = undefined;
}
