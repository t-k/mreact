import { queueComputation } from "./scheduler.js";
import {
  emitReactiveEffectRunDevtoolsEvent,
  prepareReactiveEffectRunDevtoolsEvent,
} from "./devtools.js";
import { registerReactiveDevtoolsResource } from "./devtools.js";
import { registerCleanup } from "./cleanup-scope.js";
import { runtimeState, type ReactiveComputation } from "./state.js";
import {
  cleanupDeps,
  cleanupUntrackedDeps,
  nextTrackingVersionFor,
  preserveIncrementalTracking,
} from "./tracking.js";

declare const __MREACT_CLIENT_DEVTOOLS__: boolean | undefined;

const clientDevtoolsDisabled =
  typeof __MREACT_CLIENT_DEVTOOLS__ !== "undefined" && __MREACT_CLIENT_DEVTOOLS__ === false;

type EffectFn = () => void | (() => void);

// Shared placeholder installed on disposal so a stopped effect stops retaining
// the user closure even while its stop handle or owner entry is still alive.
const disposedEffectFn: EffectFn = () => {};

interface EffectComputation extends ReactiveComputation {
  cleanup: (() => void) | undefined;
  fn: EffectFn;
  resource: { dispose(): void };
}

const EFFECT_COMPUTATION_METHODS = {
  markDirty: effectMarkDirty,
  run: effectRun,
  dispose: effectDispose,
} satisfies Pick<ReactiveComputation, "markDirty" | "run" | "dispose">;

/** Runs a reactive side effect and returns a disposer. */
export function effect(fn: () => void | (() => void)): () => void {
  return createEffect(fn);
}

/** @internal Runs a labeled effect used by development diagnostics. */
export function effectWithDebugLabel(fn: EffectFn, debugLabel: string): () => void {
  return createEffect(fn, debugLabel);
}

function createEffect(fn: EffectFn, debugLabel?: string): () => void {
  const resource = registerReactiveDevtoolsResource("effect", {
    label: debugLabel,
    ownerId: debugLabel,
  });
  const computation: EffectComputation = {
    cleanup: undefined,
    dispose: EFFECT_COMPUTATION_METHODS.dispose,
    id: runtimeState.nextComputationId,
    ...(debugLabel === undefined ? {} : { debugLabel }),
    deps: new Set(),
    disposed: false,
    fn,
    markDirty: EFFECT_COMPUTATION_METHODS.markDirty,
    queued: false,
    run: EFFECT_COMPUTATION_METHODS.run,
    resource,
  };

  runtimeState.nextComputationId += 1;

  try {
    computation.run();
  } catch (error) {
    computation.dispose();
    throw error;
  }

  // Declared before the stop handle so an owner that disposes during
  // registration never reads an uninitialized binding.
  let unregister: (() => void) | undefined;
  const dispose = (): void => {
    const currentUnregister = unregister;
    unregister = undefined;
    currentUnregister?.();
    computation.dispose();
  };
  const registration = registerCleanup(dispose);

  if (computation.disposed) {
    registration?.();
  } else {
    unregister = registration;
  }

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

  // Child reads can overwrite the shared source stamps used by the parent.
  if (previousTracker !== null && previousTracker !== computation) {
    preserveIncrementalTracking(previousTracker);
  }

  if (computation.cleanup !== undefined) {
    const currentCleanup = computation.cleanup;
    currentCleanup();
    computation.cleanup = undefined;
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
  cleanupDeps(computation);
  computation.resource.dispose();

  // Drop the user closures before running cleanup so a throwing cleanup cannot
  // leave the stopped effect holding on to what it captured.
  computation.fn = disposedEffectFn;
  const currentCleanup = computation.cleanup;

  if (currentCleanup !== undefined) {
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
  const addedDepsCount =
    addedDeps === undefined ? 0 : Array.isArray(addedDeps) ? addedDeps.length : 1;

  if (previousDepsSize > 0 && (trackedCount !== previousDepsSize || addedDepsCount > 0)) {
    cleanupUntrackedDeps(computation, trackingVersion);
  }

  computation.trackingAddedDeps = undefined;
  computation.trackingCount = undefined;
  computation.trackingTouchedDeps = undefined;
}
