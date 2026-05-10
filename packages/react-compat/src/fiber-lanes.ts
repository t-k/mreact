export type Lane = number;
export type Lanes = number;

export const NoLane = 0;
export const NoLanes = 0;
export const SyncLane = 1 << 0;
export const DiscreteEventLane = 1 << 1;
export const HydrationLane = 1 << 2;
export const ContinuousEventLane = 1 << 3;
export const TransitionLane = 1 << 4;

const lanePriority = [
  SyncLane,
  DiscreteEventLane,
  HydrationLane,
  ContinuousEventLane,
  TransitionLane,
] as const;

export function mergeLanes(left: Lanes, right: Lanes): Lanes {
  return left | right;
}

export function includesLane(lanes: Lanes, lane: Lane): boolean {
  return (lanes & lane) !== NoLane;
}

export function removeLanes(lanes: Lanes, lanesToRemove: Lanes): Lanes {
  return lanes & ~lanesToRemove;
}

export function getHighestPriorityLane(lanes: Lanes): Lane {
  for (const lane of lanePriority) {
    if (includesLane(lanes, lane)) {
      return lane;
    }
  }

  return NoLane;
}
