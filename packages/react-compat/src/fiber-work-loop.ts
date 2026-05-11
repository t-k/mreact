import {
  createFiberRoot,
  createWorkInProgress,
  type Fiber,
  type FiberRoot,
} from "./fiber.js";
import {
  getHighestPriorityLane,
  type Lane,
  type Lanes,
} from "./fiber-lanes.js";
import type { ReactCompatNode } from "./element.js";
import { performUnitOfWork } from "./fiber-reconciler.js";

const fiberRootsByContainer = new WeakMap<Element, FiberRoot>();

export interface ConcurrentRenderOptions {
  shouldYield?: () => boolean;
}

export type ConcurrentRenderResult =
  | { status: "completed"; finishedWork: Fiber }
  | { status: "yielded" };

export function createContainerFiberRoot(container: Element): FiberRoot {
  const existing = fiberRootsByContainer.get(container);

  if (existing !== undefined) {
    return existing;
  }

  const root = createFiberRoot(container);
  fiberRootsByContainer.set(container, root);
  return root;
}

export function getFiberRootForContainer(
  container: Element,
): FiberRoot | undefined {
  return fiberRootsByContainer.get(container);
}

export function enqueueRootRender(
  root: FiberRoot,
  element: unknown,
  lane: Lane,
  commit: () => Fiber | void,
): void {
  root.pendingLanes |= lane;
  root.workInProgressElement = element;
  performSyncWorkOnRoot(root, element, commit);
}

export function shouldYieldAfterUnits(limit: number): () => boolean {
  let units = 0;

  return () => {
    units += 1;
    return units > limit;
  };
}

export function prepareFreshStack(
  root: FiberRoot,
  element: unknown,
  lanes: Lanes,
): void {
  const workInProgress = createWorkInProgress(root.current, {
    children: element,
  });

  workInProgress.lanes = lanes;
  workInProgress.memoizedProps = { children: element };
  root.workInProgress = workInProgress;
  root.workInProgressRootRenderLanes = lanes;
  root.workInProgressElement = element;
  root.finishedWork = undefined;
  root.pendingLanes |= lanes;
}

export function renderRootConcurrent(
  root: FiberRoot,
  lanes: Lanes,
  options: ConcurrentRenderOptions = {},
): ConcurrentRenderResult {
  if (
    shouldPreemptWorkInProgress(root.workInProgressRootRenderLanes, lanes)
  ) {
    discardWorkInProgress(root);
  }

  if (root.workInProgress === undefined) {
    prepareFreshStack(
      root,
      root.workInProgressElement ??
        (root.current.memoizedProps as { children?: unknown } | undefined)?.children,
      lanes,
    );
  }

  while (root.workInProgress !== undefined) {
    if (options.shouldYield?.() === true) {
      return { status: "yielded" };
    }

    root.workInProgress = performUnitOfWork(root, root.workInProgress);
  }

  const finishedWork = root.finishedWork;

  if (finishedWork === undefined) {
    throw new Error("Fiber concurrent render completed without finished work.");
  }

  finishedWork.lanes = lanes;
  root.workInProgressRootRenderLanes = 0;
  return { status: "completed", finishedWork };
}

export function performConcurrentWorkOnRoot(
  root: FiberRoot,
  options: ConcurrentRenderOptions = {},
): ConcurrentRenderResult {
  const lanes = getHighestPriorityLane(root.pendingLanes);
  return renderRootConcurrent(root, lanes, options);
}

export function performSyncWorkOnRoot(
  root: FiberRoot,
  element: unknown,
  commit: () => Fiber | void,
): void {
  const lanes = root.pendingLanes;
  const fallbackFinishedWork = createWorkInProgress(root.current, { children: element });

  fallbackFinishedWork.lanes = lanes;
  fallbackFinishedWork.memoizedProps = { children: element };
  const committedWork = commit();
  const finishedWork = committedWork ?? fallbackFinishedWork;
  root.current = finishedWork;
  root.current.stateNode = root;
  root.finishedWork = undefined;
  root.workInProgress = undefined;
  root.workInProgressRootRenderLanes = 0;
  root.pendingLanes &= ~lanes;
  root.callbackPriority = root.pendingLanes & -root.pendingLanes;
}

function shouldPreemptWorkInProgress(
  currentLanes: Lanes,
  nextLanes: Lanes,
): boolean {
  return currentLanes !== 0 && nextLanes !== 0 && nextLanes < currentLanes;
}

function discardWorkInProgress(root: FiberRoot): void {
  if (root.current.alternate === root.workInProgress) {
    root.current.alternate = undefined;
  }

  root.workInProgress = undefined;
  root.workInProgressRootRenderLanes = 0;
}
