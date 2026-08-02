import { registerCleanup } from "./cleanup-scope.js";
import { queueComputation } from "./scheduler.js";
import { runtimeState, type ReactiveComputation, type Source } from "./state.js";
import {
  addSourceSubscriber,
  cleanupDeps,
  removeSourceSubscriber,
} from "./tracking.js";

/** Compact reactive listener that can also be invalidated by its owner. */
export interface RefreshableSubscription {
  dispose(): void;
  refresh(): void;
}

interface AdaptiveSourceSubscription extends ReactiveComputation, RefreshableSubscription {
  listener: () => void;
  source?: Source | undefined;
}

const emptyDependencies = new Set<Source>();
let deferredListener: (() => void) | undefined;
let deferredSubscription: AdaptiveSourceSubscription | undefined;
let deferredLazyListenerFactory: (() => () => void) | undefined;
let deferredLazySubscription: AdaptiveSourceSubscription | undefined;

class DeferredDependencySet extends Set<Source> {
  override add(source: Source): this {
    activateDeferredSubscription(source);
    return this;
  }
}

class DeferredLazyDependencySet extends Set<Source> {
  override add(source: Source): this {
    activateDeferredLazySubscription(source);
    return this;
  }
}

const deferredReactiveTracker: ReactiveComputation = {
  deps: new DeferredDependencySet(),
  dispose: noopDeferredTrackerMethod,
  disposed: false,
  id: -1,
  markDirty: noopDeferredTrackerMethod,
  queued: false,
  run: noopDeferredTrackerMethod,
};

const deferredLazyReactiveTracker: ReactiveComputation = {
  deps: new DeferredLazyDependencySet(),
  dispose: noopDeferredTrackerMethod,
  disposed: false,
  id: -1,
  markDirty: noopDeferredTrackerMethod,
  queued: false,
  run: noopDeferredTrackerMethod,
};

function noopDeferredTrackerMethod(): void {}

const ADAPTIVE_SOURCE_SUBSCRIPTION_METHODS = {
  dispose: adaptiveSourceSubscriptionDispose,
  markDirty: adaptiveSourceSubscriptionMarkDirty,
  refresh: adaptiveSourceSubscriptionMarkDirty,
  run: adaptiveSourceSubscriptionRun,
} satisfies Pick<
  AdaptiveSourceSubscription,
  "dispose" | "markDirty" | "refresh" | "run"
>;

/**
 * Tracks a source-backed read while retaining the compact direct-subscription
 * shape whenever that read has no additional reactive dependencies.
 */
export function subscribeAdaptiveSource(source: Source, listener: () => void): () => void {
  const subscription = createAdaptiveSourceSubscription(listener, source);
  const dispose = () => subscription.dispose();
  registerCleanup(dispose);
  return dispose;
}

/** Tracks reactive reads while allowing an owning runtime structure to request a rerun. */
export function subscribeRefreshable(listener: () => void): RefreshableSubscription {
  return createAdaptiveSourceSubscription(listener);
}

/** Runs a listener immediately and allocates a subscription only when it reads a Source. */
export function subscribeRefreshableIfTracked(
  listener: () => void,
): RefreshableSubscription | undefined {
  const previousTracker = runtimeState.activeTracker;
  const previousListener = deferredListener;
  const previousSubscription = deferredSubscription;
  deferredListener = listener;
  deferredSubscription = undefined;
  runtimeState.activeTracker = deferredReactiveTracker;

  try {
    listener();
    return deferredSubscription;
  } catch (error) {
    const subscription = deferredSubscription as AdaptiveSourceSubscription | undefined;
    if (subscription !== undefined) {
      subscription.disposed = true;
      cleanupDeps(subscription);
    }
    throw error;
  } finally {
    runtimeState.activeTracker = previousTracker;
    deferredListener = previousListener;
    deferredSubscription = previousSubscription;
  }
}

/** Runs a probe immediately and creates its retained listener only after a Source is read. */
export function subscribeRefreshableIfTrackedLazy(
  probe: () => void,
  createListener: () => () => void,
): RefreshableSubscription | undefined {
  const previousTracker = runtimeState.activeTracker;
  const previousFactory = deferredLazyListenerFactory;
  const previousSubscription = deferredLazySubscription;
  deferredLazyListenerFactory = createListener;
  deferredLazySubscription = undefined;
  runtimeState.activeTracker = deferredLazyReactiveTracker;

  try {
    probe();
    return deferredLazySubscription;
  } catch (error) {
    const subscription = deferredLazySubscription as AdaptiveSourceSubscription | undefined;
    if (subscription !== undefined) {
      subscription.disposed = true;
      cleanupDeps(subscription);
    }
    throw error;
  } finally {
    runtimeState.activeTracker = previousTracker;
    deferredLazyListenerFactory = previousFactory;
    deferredLazySubscription = previousSubscription;
  }
}

function activateDeferredSubscription(source: Source): void {
  const listener = deferredListener;

  if (listener === undefined) {
    return;
  }

  const subscription = createAdaptiveSourceSubscription(listener, undefined, false);
  deferredSubscription = subscription;
  replaceDeferredSourceSubscriber(source, subscription);
  subscription.deps.add(source);
  runtimeState.activeTracker = subscription;
}

function activateDeferredLazySubscription(source: Source): void {
  const createListener = deferredLazyListenerFactory;

  if (createListener === undefined) {
    return;
  }

  let listener: () => void;

  try {
    listener = createListener();
  } catch (error) {
    const failedTracker = runtimeState.activeTracker;
    runtimeState.activeTracker = null;

    try {
      removeSourceSubscriber(source, deferredLazyReactiveTracker);
    } catch {
      // Preserve the listener factory failure after best-effort tracker cleanup.
    } finally {
      runtimeState.activeTracker = failedTracker;
    }

    throw error;
  }

  const subscription = createAdaptiveSourceSubscription(listener, undefined, false);
  deferredLazySubscription = subscription;
  replaceDeferredLazySourceSubscriber(source, subscription);
  subscription.deps.add(source);
  runtimeState.activeTracker = subscription;
}

function replaceDeferredSourceSubscriber(
  source: Source,
  subscription: AdaptiveSourceSubscription,
): void {
  const subscribers = source.subscribers;

  if (subscribers === deferredReactiveTracker) {
    source.subscribers = subscription;
    return;
  }

  if (subscribers instanceof Set && subscribers.delete(deferredReactiveTracker)) {
    subscribers.add(subscription);
    return;
  }

  addSourceSubscriber(source, subscription);
}

function replaceDeferredLazySourceSubscriber(
  source: Source,
  subscription: AdaptiveSourceSubscription,
): void {
  const subscribers = source.subscribers;

  if (subscribers === deferredLazyReactiveTracker) {
    source.subscribers = subscription;
    return;
  }

  if (subscribers instanceof Set && subscribers.delete(deferredLazyReactiveTracker)) {
    subscribers.add(subscription);
    return;
  }

  addSourceSubscriber(source, subscription);
}

function createAdaptiveSourceSubscription(
  listener: () => void,
  source?: Source,
  runImmediately = true,
): AdaptiveSourceSubscription {
  const subscription: AdaptiveSourceSubscription = {
    deps: runImmediately ? emptyDependencies : new Set<Source>(),
    dispose: ADAPTIVE_SOURCE_SUBSCRIPTION_METHODS.dispose,
    disposed: false,
    id: runtimeState.nextComputationId,
    listener,
    markDirty: ADAPTIVE_SOURCE_SUBSCRIPTION_METHODS.markDirty,
    queued: false,
    refresh: ADAPTIVE_SOURCE_SUBSCRIPTION_METHODS.refresh,
    run: ADAPTIVE_SOURCE_SUBSCRIPTION_METHODS.run,
    ...(source === undefined ? {} : { source }),
  };

  runtimeState.nextComputationId += 1;

  if (!runImmediately) {
    return subscription;
  }

  try {
    subscription.run();
  } catch (error) {
    subscription.disposed = true;
    cleanupDeps(subscription);
    throw error;
  }

  return subscription;
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

    if (
      completed &&
      subscription.source !== undefined &&
      nextDependencies.size === 1 &&
      nextDependencies.has(subscription.source)
    ) {
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

  if (subscription.source !== undefined) {
    removeSourceSubscriber(subscription.source, subscription);
  }
}
