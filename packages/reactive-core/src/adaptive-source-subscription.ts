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

interface AdaptiveValueSubscription extends ReactiveComputation, RefreshableSubscription {
  listener: (value: unknown) => void;
  value: unknown;
}

const emptyDependencies = new Set<Source>();
let deferredListener: (() => void) | undefined;
let deferredValueListener: ((value: unknown) => void) | undefined;
let deferredValue: unknown;
let deferredSubscription:
  | AdaptiveSourceSubscription
  | AdaptiveValueSubscription
  | undefined;

class DeferredDependencySet extends Set<Source> {
  override add(source: Source): this {
    activateDeferredSubscription(source);
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
const ADAPTIVE_VALUE_SUBSCRIPTION_METHODS = {
  dispose: adaptiveSourceSubscriptionDispose,
  markDirty: adaptiveSourceSubscriptionMarkDirty,
  refresh: adaptiveSourceSubscriptionMarkDirty,
  run: adaptiveValueSubscriptionRun,
} satisfies Pick<
  AdaptiveValueSubscription,
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
  const previousValueListener = deferredValueListener;
  const previousValue = deferredValue;
  const previousSubscription = deferredSubscription;
  deferredListener = listener;
  deferredValueListener = undefined;
  deferredValue = undefined;
  deferredSubscription = undefined;
  runtimeState.activeTracker = deferredReactiveTracker;

  try {
    listener();
    return deferredSubscription;
  } catch (error) {
    const subscription = deferredSubscription as ReactiveComputation | undefined;
    if (subscription !== undefined) {
      subscription.disposed = true;
      cleanupDeps(subscription);
    }
    throw error;
  } finally {
    runtimeState.activeTracker = previousTracker;
    deferredListener = previousListener;
    deferredValueListener = previousValueListener;
    deferredValue = previousValue;
    deferredSubscription = previousSubscription;
  }
}

/** Runs a shared listener with a value and subscribes only when it reads a Source. */
export function subscribeRefreshableValueIfTracked<T>(
  listener: (value: T) => void,
  value: T,
): RefreshableSubscription | undefined {
  const previousTracker = runtimeState.activeTracker;
  const previousListener = deferredListener;
  const previousValueListener = deferredValueListener;
  const previousValue = deferredValue;
  const previousSubscription = deferredSubscription;
  deferredListener = undefined;
  deferredValueListener = listener as (value: unknown) => void;
  deferredValue = value;
  deferredSubscription = undefined;
  runtimeState.activeTracker = deferredReactiveTracker;

  try {
    listener(value);
    return deferredSubscription;
  } catch (error) {
    const subscription = deferredSubscription as ReactiveComputation | undefined;
    if (subscription !== undefined) {
      subscription.disposed = true;
      cleanupDeps(subscription);
    }
    throw error;
  } finally {
    runtimeState.activeTracker = previousTracker;
    deferredListener = previousListener;
    deferredValueListener = previousValueListener;
    deferredValue = previousValue;
    deferredSubscription = previousSubscription;
  }
}

function activateDeferredSubscription(source: Source): void {
  const listener = deferredListener;
  const valueListener = deferredValueListener;
  let subscription: AdaptiveSourceSubscription | AdaptiveValueSubscription;

  if (listener !== undefined) {
    subscription = createAdaptiveSourceSubscription(listener, undefined, false);
  } else if (valueListener !== undefined) {
    subscription = createAdaptiveValueSubscription(valueListener, deferredValue);
  } else {
    return;
  }

  deferredSubscription = subscription;
  replaceDeferredSourceSubscriber(source, subscription);
  subscription.deps.add(source);
  runtimeState.activeTracker = subscription;
}

function replaceDeferredSourceSubscriber(
  source: Source,
  subscription: ReactiveComputation,
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

function createAdaptiveValueSubscription(
  listener: (value: unknown) => void,
  value: unknown,
): AdaptiveValueSubscription {
  const subscription: AdaptiveValueSubscription = {
    deps: new Set<Source>(),
    dispose: ADAPTIVE_VALUE_SUBSCRIPTION_METHODS.dispose,
    disposed: false,
    id: runtimeState.nextComputationId,
    listener,
    markDirty: ADAPTIVE_VALUE_SUBSCRIPTION_METHODS.markDirty,
    queued: false,
    refresh: ADAPTIVE_VALUE_SUBSCRIPTION_METHODS.refresh,
    run: ADAPTIVE_VALUE_SUBSCRIPTION_METHODS.run,
    value,
  };
  runtimeState.nextComputationId += 1;
  return subscription;
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

function adaptiveValueSubscriptionRun(this: ReactiveComputation): void {
  const subscription = this as AdaptiveValueSubscription;

  if (subscription.disposed) {
    return;
  }

  if (subscription.deps.size > 0) {
    cleanupDeps(subscription);
  }

  const previousTracker = runtimeState.activeTracker;
  subscription.deps = new Set<Source>();
  runtimeState.activeTracker = subscription;

  try {
    subscription.listener(subscription.value);
  } finally {
    runtimeState.activeTracker = previousTracker;
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
