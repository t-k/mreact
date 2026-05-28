import type { Fiber, FiberRoot } from "./fiber.js";
import { commitHostFiberRoot } from "./fiber-host.js";
import { markRootFinished } from "./fiber-lanes.js";
import { runWithHostCommit } from "./hooks.js";
import type { RenderOptions } from "./hydration.js";

interface RefRecord {
  ref: unknown;
  node: unknown;
}

export function commitFiberRoot(
  root: FiberRoot,
  options: RenderOptions = {},
): void {
  const finishedWork = root.finishedWork;

  if (finishedWork === undefined) {
    return;
  }

  runWithHostCommit(() => {
    cleanupDeletedRefs(root.current, finishedWork);
  });
  commitHostFiberRoot(root, finishedWork, options);
  root.current = finishedWork;
  root.current.stateNode = root;
  markRootFinished(root, finishedWork.lanes);
  root.callbackPriority = root.pendingLanes & -root.pendingLanes;
  root.finishedWork = undefined;
  root.workInProgress = undefined;
  root.workInProgressRootRenderLanes = 0;
}

export function detachFiberRefs(fiber: Fiber): void {
  for (const record of collectRefRecords(fiber)) {
    detachRef(record.ref);
  }
}

function cleanupDeletedRefs(previous: Fiber, next: Fiber): void {
  const nextRefs = new Set<unknown>();

  collectRefRecords(next, nextRefs);

  for (const record of collectRefRecords(previous)) {
    if (!nextRefs.has(record.ref)) {
      detachRef(record.ref);
    }
  }
}

function collectRefRecords(
  fiber: Fiber | undefined,
  refs: Set<unknown> = new Set(),
): RefRecord[] {
  const records: RefRecord[] = [];
  let cursor = fiber;

  while (cursor !== undefined) {
    const ref = getFiberRef(cursor);

    if (ref !== undefined && ref !== null) {
      refs.add(ref);
      records.push({ ref, node: cursor.stateNode });
    }

    records.push(...collectRefRecords(cursor.child, refs));
    cursor = cursor.sibling;
  }

  return records;
}

function getFiberRef(fiber: Fiber): unknown {
  const props = (fiber.memoizedProps ?? fiber.pendingProps) as
    | { ref?: unknown }
    | undefined;

  return props?.ref;
}

function detachRef(ref: unknown): void {
  if (typeof ref === "function") {
    ref(null);
    return;
  }

  if (typeof ref === "object" && ref !== null && "current" in ref) {
    (ref as { current: unknown }).current = null;
  }
}
