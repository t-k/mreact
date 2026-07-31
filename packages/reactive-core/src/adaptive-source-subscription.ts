import { registerCleanup } from "./cleanup-scope.js";
import { queueComputation } from "./scheduler.js";
import { runtimeState, type ReactiveComputation, type Source } from "./state.js";
import { cleanupDeps, removeSourceSubscriber } from "./tracking.js";

interface AdaptiveSourceSubscription extends ReactiveComputation {
  listener: () => void;
  source: Source;
}

const emptyDependencies = new Set<Source>();

const ADAPTIVE_SOURCE_SUBSCRIPTION_METHODS = {
  dispose: adaptiveSourceSubscriptionDispose,
  markDirty: adaptiveSourceSubscriptionMarkDirty,
  run: adaptiveSourceSubscriptionRun,
} satisfies Pick<ReactiveComputation, "dispose" | "markDirty" | "run">;

/**
 * Tracks a source-backed read while retaining the compact direct-subscription
 * shape whenever that read has no additional reactive dependencies.
 */
export function subscribeAdaptiveSource(source: Source, listener: () => void): () => void {
  const subscription: AdaptiveSourceSubscription = {
    deps: emptyDependencies,
    dispose: ADAPTIVE_SOURCE_SUBSCRIPTION_METHODS.dispose,
    disposed: false,
    id: runtimeState.nextComputationId,
    listener,
    markDirty: ADAPTIVE_SOURCE_SUBSCRIPTION_METHODS.markDirty,
    queued: false,
    run: ADAPTIVE_SOURCE_SUBSCRIPTION_METHODS.run,
    source,
  };

  runtimeState.nextComputationId += 1;

  try {
    subscription.run();
  } catch (error) {
    subscription.disposed = true;
    cleanupDeps(subscription);
    throw error;
  }

  const dispose = () => subscription.dispose();
  registerCleanup(dispose);
  return dispose;
}

function adaptiveSourceSubscriptionMarkDirty(this: ReactiveComputation): void {
  queueComputation(this);
}

function adaptiveSourceSubscriptionRun(this: ReactiveComputation): void {
  const subscription = this as AdaptiveSourceSubscription;

  if (subscription.disposed) {
    return;
  }

  if (subscription.deps.size > 0) {
    cleanupDeps(subscription);
  }

  const previousTracker = runtimeState.activeTracker;
  const nextDependencies = new Set<Source>();
  subscription.deps = nextDependencies;
  runtimeState.activeTracker = subscription;

  let completed = false;
  try {
    subscription.listener();
    completed = true;
  } finally {
    runtimeState.activeTracker = previousTracker;

    if (completed && nextDependencies.size === 1 && nextDependencies.has(subscription.source)) {
      nextDependencies.clear();
      subscription.deps = emptyDependencies;
    }
  }
}

function adaptiveSourceSubscriptionDispose(this: ReactiveComputation): void {
  const subscription = this as AdaptiveSourceSubscription;

  if (subscription.disposed) {
    return;
  }

  subscription.disposed = true;
  subscription.queued = false;

  if (subscription.deps.size > 0) {
    cleanupDeps(subscription);
    return;
  }

  removeSourceSubscriber(subscription.source, subscription);
}
