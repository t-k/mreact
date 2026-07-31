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
  computationDependencyCount,
  nextTrackingVersionFor,
} from "./tracking.js";

declare const __MREACT_CLIENT_DEVTOOLS__: boolean | undefined;

const clientDevtoolsDisabled =
  typeof __MREACT_CLIENT_DEVTOOLS__ !== "undefined" && __MREACT_CLIENT_DEVTOOLS__ === false;

type EffectFn = () => void | (() => void);

interface EffectComputation extends ReactiveComputation {
  cleanup: (() => void) | undefined;
  fn: EffectFn;
}

const EFFECT_COMPUTATION_METHODS = {
  markDirty: effectMarkDirty,
  run: effectRun,
  dispose: effectDispose,
} satisfies Pick<ReactiveComputation, "markDirty" | "run" | "dispose">;

/** Runs a reactive side effect and returns a disposer. */
export function effect(fn: EffectFn): () => void {
  return createEffect(fn);
}

/** @internal Runs a labeled effect used by development diagnostics. */
export function effectWithDebugLabel(fn: EffectFn, debugLabel: string): () => void {
  return createEffect(fn, debugLabel);
}

function createEffect(fn: EffectFn, debugLabel?: string): () => void {
  const computation: EffectComputation = {
    cleanup: undefined,
    dispose: EFFECT_COMPUTATION_METHODS.dispose,
    id: runtimeState.nextComputationId,
    ...(debugLabel === undefined ? {} : { debugLabel }),
    deps: null,
    disposed: false,
    fn,
    markDirty: EFFECT_COMPUTATION_METHODS.markDirty,
    queued: false,
    run: EFFECT_COMPUTATION_METHODS.run,
  };

  runtimeState.nextComputationId += 1;

  try {
    computation.run();
  } catch (error) {
    computation.disposed = true;
    computation.queued = false;
    runtimeState.pendingComputed.delete(computation);
    cleanupDeps(computation);

    if (computation.cleanup !== undefined) {
      const currentCleanup = computation.cleanup;
      computation.cleanup = undefined;
      currentCleanup();
    }

    throw error;
  }

  const dispose = () => computation.dispose();
  registerCleanup(dispose);
  return dispose;
}

function effectMarkDirty(this: ReactiveComputation): void {
  queueComputation(this);
}

function effectRun(this: ReactiveComputation): void {
  const computation = this as EffectComputation;

  if (computation.disposed) {
    return;
  }

  const previousTracker = runtimeState.activeTracker;

  if (computation.cleanup !== undefined) {
    const currentCleanup = computation.cleanup;
    currentCleanup();
    computation.cleanup = undefined;
  }

  const previousDepsSize = computationDependencyCount(computation);
  const nextTrackingVersion = nextTrackingVersionFor(computation);

  computation.trackingAddedDeps = undefined;
  computation.trackingCount = 0;
  computation.trackingTouchedDeps = undefined;
  computation.trackingVersion = nextTrackingVersion;
  runtimeState.activeTracker = computation;

  if (clientDevtoolsDisabled) {
    try {
      const result = computation.fn();
      computation.cleanup = typeof result === "function" ? result : undefined;
    } finally {
      finishIncrementalTracking(computation, previousDepsSize, nextTrackingVersion);
      runtimeState.activeTracker = previousTracker;
    }
    return;
  }

  const devtoolsEvent = prepareReactiveEffectRunDevtoolsEvent();

  try {
    const result = computation.fn();
    computation.cleanup = typeof result === "function" ? result : undefined;
  } finally {
    finishIncrementalTracking(computation, previousDepsSize, nextTrackingVersion);
    runtimeState.activeTracker = previousTracker;
    if (devtoolsEvent !== undefined) {
      emitReactiveEffectRunDevtoolsEvent(devtoolsEvent, computation.id);
    }
  }
}

function effectDispose(this: ReactiveComputation): void {
  const computation = this as EffectComputation;

  if (computation.disposed) {
    return;
  }

  computation.disposed = true;
  computation.queued = false;
  runtimeState.pendingComputed.delete(computation);
  cleanupDeps(computation);

  if (computation.cleanup !== undefined) {
    const currentCleanup = computation.cleanup;
    computation.cleanup = undefined;
    currentCleanup();
  }
}

function finishIncrementalTracking(
  computation: ReactiveComputation,
  previousDepsSize: number,
  trackingVersion: number,
): void {
  const addedDeps = computation.trackingAddedDeps;
  const trackedCount = computation.trackingCount ?? 0;

  if (previousDepsSize > 0 && (trackedCount !== previousDepsSize || (addedDeps?.length ?? 0) > 0)) {
    cleanupUntrackedDeps(computation, trackingVersion);
  }

  computation.trackingAddedDeps = undefined;
  computation.trackingCount = undefined;
  computation.trackingTouchedDeps = undefined;
}
