export type Lane = number;
export type Lanes = number;

export const NoLane = 0;
export const NoLanes = 0;
export const SyncLane = 1 << 0;
export const DiscreteEventLane = 1 << 1;
export const HydrationLane = 1 << 2;
export const ContinuousEventLane = 1 << 3;
export const TransitionLane = 1 << 4;
export const IdleLane = 1 << 5;

interface LaneRoot {
  pendingLanes: Lanes;
  suspendedLanes: Lanes;
  pingedLanes: Lanes;
  expiredLanes: Lanes;
  entangledLanes: Lanes;
}

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
  return lanes & -lanes;
}

export function getNextLanes(root: LaneRoot): Lanes {
  const pending = root.pendingLanes;

  if (pending === NoLanes) {
    return NoLanes;
  }

  const expired = pending & root.expiredLanes;
  if (expired !== NoLanes) {
    return includeEntangledLanes(root, getHighestPriorityLane(expired));
  }

  const pinged = pending & root.pingedLanes;
  if (pinged !== NoLanes) {
    return includeEntangledLanes(root, getHighestPriorityLane(pinged));
  }

  const unblocked = pending & ~root.suspendedLanes;
  if (unblocked !== NoLanes) {
    return includeEntangledLanes(root, getHighestPriorityLane(unblocked));
  }

  return NoLanes;
}

export function markRootUpdated(root: LaneRoot, lanes: Lanes): void {
  root.pendingLanes |= lanes;
  root.suspendedLanes &= ~lanes;
  root.pingedLanes &= ~lanes;
}

export function markRootSuspended(root: LaneRoot, lanes: Lanes): void {
  root.suspendedLanes |= lanes;
  root.pingedLanes &= ~lanes;
}

export function markRootPinged(root: LaneRoot, lanes: Lanes): void {
  root.pingedLanes |= lanes & root.suspendedLanes;
}

export function markRootExpired(root: LaneRoot, lanes: Lanes): void {
  root.expiredLanes |= lanes & root.pendingLanes;
}

export function markRootEntangled(root: LaneRoot, lanes: Lanes): void {
  root.entangledLanes |= lanes;
}

export function markRootFinished(root: LaneRoot, lanes: Lanes): void {
  root.pendingLanes &= ~lanes;
  root.suspendedLanes &= ~lanes;
  root.pingedLanes &= ~lanes;
  root.expiredLanes &= ~lanes;
  root.entangledLanes &= ~lanes;
}

function includeEntangledLanes(root: LaneRoot, lanes: Lanes): Lanes {
  if ((lanes & root.entangledLanes) === NoLanes) {
    return lanes;
  }

  return lanes | (root.entangledLanes & root.pendingLanes);
}
