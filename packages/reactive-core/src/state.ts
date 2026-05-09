export interface Source {
  subscribers: Set<ReactiveComputation>;
}

export interface ReactiveComputation {
  readonly id: number;
  readonly deps: Set<Source>;
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
  nextComputationId: number;
} = {
  activeTracker: null,
  batchDepth: 0,
  nextComputationId: 0,
};
