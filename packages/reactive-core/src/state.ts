export interface Source {
  singleSubscriber?: ReactiveComputation | undefined;
  subscribers: Set<ReactiveComputation>;
}

export interface ReactiveComputation {
  readonly id: number;
  deps: Set<Source>;
  disposed: boolean;
  queued: boolean;
  markDirty(): void;
  run(): void;
  dispose(): void;
}

export type Tracker = ReactiveComputation | null;

export const runtimeState: {
  activeTracker: Tracker;
  batchDepth: number;
  flushingComputed: boolean;
  nextComputationId: number;
  notificationDepth: number;
  pendingComputed: Set<ReactiveComputation>;
} = {
  activeTracker: null,
  batchDepth: 0,
  flushingComputed: false,
  nextComputationId: 0,
  notificationDepth: 0,
  pendingComputed: new Set(),
};
