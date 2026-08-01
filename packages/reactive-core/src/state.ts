import { warnOnDuplicateReactiveCoreCopy } from "./duplicate-guard.js";

// This module holds the per-copy reactive runtime identity, so a second
// evaluation in the same browser page is exactly the duplication that breaks
// cross-package cell tracking.
warnOnDuplicateReactiveCoreCopy(import.meta.url);

export interface Source {
  // null while nothing subscribes, the computation itself while exactly one
  // does, and a Set from the second subscriber on (kept as a Set until it
  // empties back to null). Most sources never allocate a Set at all, and hot
  // write sites can gate on a null check instead of a Set.size accessor.
  subscribers: ReactiveComputation | Set<ReactiveComputation> | null;
  onNoSubscribers?: (() => void) | undefined;
  trackedBy?: ReactiveComputation | undefined;
  trackedVersion?: number | undefined;
  debugWriters?: Map<number, string> | undefined;
}

export interface ReactiveComputation {
  readonly id: number;
  readonly debugLabel?: string | undefined;
  deps: Set<Source>;
  orderedDeps?: Source[] | undefined;
  trackingAddedDeps?: Source | Source[] | undefined;
  trackingCount?: number | undefined;
  trackingOrderedIndex?: number | undefined;
  trackingOrderedMismatch?: boolean | undefined;
  trackingTouchedDeps?: Source[] | undefined;
  trackingVersion?: number | undefined;
  disposed: boolean;
  queued: boolean;
  markDirty(): void;
  run(): void;
  dispose(): void;
}

export interface DeferredReactiveTracker extends ReactiveComputation {
  activate: ((source: Source) => void) | undefined;
}

const deferredTrackerDependencies = new Set<Source>();
const noopDeferredTrackerMethod = (): void => {};

export const deferredReactiveTracker: DeferredReactiveTracker = {
  activate: undefined,
  deps: deferredTrackerDependencies,
  dispose: noopDeferredTrackerMethod,
  disposed: false,
  id: -1,
  markDirty: noopDeferredTrackerMethod,
  queued: false,
  run: noopDeferredTrackerMethod,
};

export type Tracker = ReactiveComputation | null;

export const runtimeState: {
  activeTracker: Tracker;
  batchDepth: number;
  cleanupOwner: ((dispose: () => void) => void) | undefined;
  flushingComputed: boolean;
  nextComputationId: number;
  notificationDepth: number;
  pendingComputed: Set<ReactiveComputation>;
} = {
  activeTracker: null,
  batchDepth: 0,
  cleanupOwner: undefined,
  flushingComputed: false,
  nextComputationId: 0,
  notificationDepth: 0,
  pendingComputed: new Set(),
};
