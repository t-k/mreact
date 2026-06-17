import { NoFlags, type Flags } from "./fiber-flags.js";
import { NoLanes, type Lane, type Lanes } from "./fiber-lanes.js";

export type FiberTag =
  | "host-root"
  | "host-component"
  | "host-text"
  | "reactive-dom-block"
  | "fragment"
  | "function-component"
  | "forward-ref"
  | "class-component"
  | "context-provider"
  | "context-consumer"
  | "portal"
  | "memo"
  | "lazy"
  | "profiler"
  | "strict-mode"
  | "suspense"
  | "suspense-list"
  | "error-boundary";

export interface Fiber {
  tag: FiberTag;
  type: unknown;
  key: string | undefined;
  pendingProps: unknown;
  memoizedProps: unknown;
  memoizedState: unknown;
  return: Fiber | undefined;
  child: Fiber | undefined;
  sibling: Fiber | undefined;
  alternate: Fiber | undefined;
  stateNode: unknown;
  flags: Flags;
  subtreeFlags: Flags;
  childListChanged: boolean;
  subtreeChildListChanged: boolean;
  deletions: Fiber[] | undefined;
  lanes: Lanes;
  childLanes: Lanes;
  hydrateExisting: boolean;
  hasRefSubtree: boolean;
  hostChildListChanged: boolean;
}

export interface FiberRoot {
  container: Element;
  current: Fiber;
  finishedWork: Fiber | undefined;
  pendingLanes: Lanes;
  suspendedLanes: Lanes;
  pingedLanes: Lanes;
  expiredLanes: Lanes;
  entangledLanes: Lanes;
  callbackNode: unknown;
  callbackPriority: Lane;
  workInProgress: Fiber | undefined;
  workInProgressRootRenderLanes: Lanes;
  workInProgressElement: unknown;
  hydrationState: FiberHydrationState | undefined;
  refCleanupKnown: boolean;
}

export interface FiberHydrationState {
  parent: ParentNode;
  nextHydratableNode: Node | null;
  before: ChildNode | null;
  after: ChildNode | null;
  resumeId?: string;
}

export function createFiber(
  tag: FiberTag,
  pendingProps: unknown = undefined,
  key?: string,
): Fiber {
  return {
    tag,
    type: undefined,
    key,
    pendingProps,
    memoizedProps: undefined,
    memoizedState: undefined,
    return: undefined,
    child: undefined,
    sibling: undefined,
    alternate: undefined,
    stateNode: undefined,
    flags: NoFlags,
    subtreeFlags: NoFlags,
    childListChanged: false,
    subtreeChildListChanged: false,
    deletions: undefined,
    lanes: NoLanes,
    childLanes: NoLanes,
    hydrateExisting: false,
    hasRefSubtree: false,
    hostChildListChanged: false,
  };
}

export function createHostRootFiber(): Fiber {
  return createFiber("host-root", undefined);
}

export function createFiberRoot(container: Element): FiberRoot {
  const current = createHostRootFiber();
  const root: FiberRoot = {
    container,
    current,
    finishedWork: undefined,
    pendingLanes: NoLanes,
    suspendedLanes: NoLanes,
    pingedLanes: NoLanes,
    expiredLanes: NoLanes,
    entangledLanes: NoLanes,
    callbackNode: undefined,
    callbackPriority: NoLanes,
    workInProgress: undefined,
    workInProgressRootRenderLanes: NoLanes,
    workInProgressElement: undefined,
    hydrationState: undefined,
    refCleanupKnown: false,
  };
  current.stateNode = root;
  return root;
}

export function createWorkInProgress(
  current: Fiber,
  pendingProps: unknown,
): Fiber {
  let workInProgress = current.alternate;

  if (workInProgress === undefined) {
    workInProgress = createFiber(current.tag, pendingProps, current.key);
    workInProgress.type = current.type;
    workInProgress.stateNode = current.stateNode;
    workInProgress.alternate = current;
    current.alternate = workInProgress;
  } else {
    workInProgress.pendingProps = pendingProps;
    workInProgress.flags = NoFlags;
    workInProgress.subtreeFlags = NoFlags;
    workInProgress.childListChanged = false;
    workInProgress.subtreeChildListChanged = false;
    workInProgress.deletions = undefined;
  }

  workInProgress.child = current.child;
  workInProgress.sibling = current.sibling;
  workInProgress.return = current.return;
  workInProgress.memoizedProps = current.memoizedProps;
  workInProgress.memoizedState = current.memoizedState;
  workInProgress.lanes = current.lanes;
  workInProgress.childLanes = current.childLanes;
  workInProgress.hydrateExisting = false;
  workInProgress.hasRefSubtree = current.hasRefSubtree;
  workInProgress.hostChildListChanged = current.hostChildListChanged;
  return workInProgress;
}
