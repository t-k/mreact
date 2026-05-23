export interface Source {
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
