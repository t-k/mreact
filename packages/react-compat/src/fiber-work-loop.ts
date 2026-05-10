import {
  createFiberRoot,
  createWorkInProgress,
  type Fiber,
  type FiberRoot,
} from "./fiber.js";
import type { Lane } from "./fiber-lanes.js";

const fiberRootsByContainer = new WeakMap<Element, FiberRoot>();

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
  performSyncWorkOnRoot(root, element, commit);
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
  root.pendingLanes &= ~lanes;
  root.callbackPriority = root.pendingLanes & -root.pendingLanes;
}
