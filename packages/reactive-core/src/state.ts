export interface Source {
  subscribers: Set<Computation>;
}

export interface Computation {
  markDirty(): void;
}

export type Tracker = Computation | null;

export const runtimeState: {
  activeTracker: Tracker;
} = {
  activeTracker: null,
};
