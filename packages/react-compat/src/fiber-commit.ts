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

  if (
    root.refCleanupKnown !== true ||
    root.current.hasRefSubtree ||
    finishedWork.hasRefSubtree
  ) {
    runWithHostCommit(() => {
      cleanupDeletedRefs(root.current, finishedWork);
    });
  }
  commitHostFiberRoot(root, finishedWork, options);
  if (hasRemovedAlternateChildren(finishedWork)) {
    detachRemovedAlternateChildren(finishedWork);
  }
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

function detachRemovedAlternateChildren(fiber: Fiber | undefined): void {
  let cursor: Fiber | undefined = fiber;

  while (cursor !== undefined) {
    const retained = collectRetainedAlternateChildren(cursor.child);
    let alternateChild = cursor.alternate?.child;

    while (alternateChild !== undefined) {
      const nextAlternateChild = alternateChild.sibling;

      if (!retained.has(alternateChild)) {
        detachFiberSubtree(alternateChild, retained);
      }

      alternateChild = nextAlternateChild;
    }

    if (cursor.deletions !== undefined) {
      for (const deleted of cursor.deletions) {
        detachFiberSubtree(deleted, retained);
      }
      cursor.deletions = undefined;
    }

    detachRemovedAlternateChildren(cursor.child);
    cursor = cursor.sibling;
  }
}

function hasRemovedAlternateChildren(fiber: Fiber): boolean {
  return (
    fiber.childListChanged ||
    fiber.subtreeChildListChanged ||
    fiber.deletions !== undefined
  );
}

function collectRetainedAlternateChildren(fiber: Fiber | undefined): Set<Fiber> {
  const retained = new Set<Fiber>();
  let cursor = fiber;

  while (cursor !== undefined) {
    retained.add(cursor);

    if (cursor.alternate !== undefined) {
      retained.add(cursor.alternate);
    }

    cursor = cursor.sibling;
  }

  return retained;
}

function detachFiberSubtree(fiber: Fiber, preserve: ReadonlySet<Fiber>): void {
  const stack = [fiber];
  const seen = new Set<Fiber>();

  while (stack.length > 0) {
    const current = stack.pop();

    if (current === undefined || seen.has(current) || preserve.has(current)) {
      continue;
    }

    seen.add(current);

    let child = current.child;
    while (child !== undefined) {
      stack.push(child);
      child = child.sibling;
    }

    if (current.alternate !== undefined) {
      stack.push(current.alternate);
    }

    current.return = undefined;
    current.child = undefined;
    current.sibling = undefined;
    current.alternate = undefined;
    current.pendingProps = undefined;
    current.memoizedProps = undefined;
    current.memoizedState = undefined;
    current.stateNode = undefined;
    current.deletions = undefined;
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
