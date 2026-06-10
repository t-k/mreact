import { warnOnDuplicateReactiveCoreCopy } from "./duplicate-guard.js";

// This module holds the per-copy reactive runtime identity, so a second
// evaluation in the same browser page is exactly the duplication that breaks
// cross-package cell tracking.
warnOnDuplicateReactiveCoreCopy(import.meta.url);

export interface Source {
  // Mirrors subscribers.size > 0 so hot write sites can skip the notify call
  // (and its Set.size accessor) entirely for unobserved sources. Maintained
  // at every subscribers.add/delete/clear site.
  hasSubscribers?: boolean | undefined;
  singleSubscriber?: ReactiveComputation | undefined;
  subscribers: Set<ReactiveComputation>;
  trackedBy?: ReactiveComputation | undefined;
  trackedVersion?: number | undefined;
}

export interface ReactiveComputation {
  readonly id: number;
  deps: Set<Source>;
  trackingAddedDeps?: Source[] | undefined;
  trackingCount?: number | undefined;
  trackingTouchedDeps?: Source[] | undefined;
  trackingVersion?: number | undefined;
  disposed: boolean;
  queued: boolean;
  markDirty(): void;
  run(): void;
  dispose(): void;
  trackSource?(source: Source): void;
}

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
