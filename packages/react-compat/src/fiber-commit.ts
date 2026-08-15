import type { Fiber, FiberRoot } from "./fiber.js";
import { ChildDeletion } from "./fiber-flags.js";
import {
  commitHostFiberRoot,
  commitScopedHostFiberRoot,
  disposeUnretainedHostFiberResources,
} from "./fiber-host.js";
import { markRootFinished } from "./fiber-lanes.js";
import { runWithHostCommit } from "./hooks.js";
import type { HydrationScope, RenderOptions } from "./hydration.js";
import { detachRef } from "./ref-lifecycle.js";
import { disposeDirectEventListeners } from "./events.js";

interface RefRecord {
  ref: unknown;
  node: unknown;
}

export function commitFiberRoot(
  root: FiberRoot,
  options: RenderOptions = {},
  scope?: HydrationScope,
): void {
  const finishedWork = root.finishedWork;

  if (finishedWork === undefined) {
    return;
  }

  if (root.refCleanupKnown !== true || root.current.hasRefSubtree || finishedWork.hasRefSubtree) {
    runWithHostCommit(() => {
      cleanupDeletedRefs(root.current, finishedWork);
    });
  }
  const shouldCleanupDeletedSubtrees = mayHaveDeletedFiberSubtrees(finishedWork);
  if (scope === undefined) {
    commitHostFiberRoot(root, finishedWork, options);
  } else {
    commitScopedHostFiberRoot(root, finishedWork, scope, options);
  }
  if (shouldCleanupDeletedSubtrees) {
    const retainedFibers = collectRetainedFiberPairs(finishedWork);
    detachUnretainedFiberSubtrees(root.current.child, retainedFibers);
    detachDeletedFiberSubtrees(finishedWork, retainedFibers);
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
    detachRef(record.ref, record.node);
  }
}

export function disposeFiberEventListeners(fiber: Fiber): void {
  const stack = [fiber];
  const seen = new Set<Fiber>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) {
      continue;
    }
    seen.add(current);
    disposeHostFiberEventListeners(current);

    if (current.sibling !== undefined) {
      stack.push(current.sibling);
    }
    if (current.child !== undefined) {
      stack.push(current.child);
    }
  }
}

function mayHaveDeletedFiberSubtrees(fiber: Fiber): boolean {
  return ((fiber.flags | fiber.subtreeFlags) & ChildDeletion) !== 0;
}

function collectRetainedFiberPairs(fiber: Fiber | undefined): Set<Fiber> {
  const retained = new Set<Fiber>();
  const stack: Fiber[] = [];

  if (fiber !== undefined) {
    stack.push(fiber);
  }

  while (stack.length > 0) {
    const current = stack.pop();

    if (current === undefined || retained.has(current)) {
      continue;
    }

    retained.add(current);
    if (current.alternate !== undefined) {
      retained.add(current.alternate);
    }
    if (current.sibling !== undefined) {
      stack.push(current.sibling);
    }
    if (current.child !== undefined) {
      stack.push(current.child);
    }
  }

  return retained;
}

function detachUnretainedFiberSubtrees(
  fiber: Fiber | undefined,
  retained: ReadonlySet<Fiber>,
): void {
  let cursor = fiber;

  while (cursor !== undefined) {
    const next = cursor.sibling;
    if (retained.has(cursor)) {
      detachUnretainedFiberSubtrees(cursor.child, retained);
    } else {
      detachFiberSubtree(cursor, retained);
    }
    cursor = next;
  }
}

function detachDeletedFiberSubtrees(fiber: Fiber | undefined, retained: ReadonlySet<Fiber>): void {
  let cursor: Fiber | undefined = fiber;

  while (cursor !== undefined) {
    if (cursor.deletions !== undefined) {
      for (const deleted of cursor.deletions) {
        detachFiberSubtree(deleted, retained);
      }
      cursor.deletions = undefined;
    }

    detachDeletedFiberSubtrees(cursor.child, retained);
    cursor = cursor.sibling;
  }
}

function detachFiberSubtree(fiber: Fiber, retained: ReadonlySet<Fiber>): void {
  disposeUnretainedHostFiberResources(fiber, retained);

  const stack = [fiber];
  const seen = new Set<Fiber>();

  while (stack.length > 0) {
    const current = stack.pop();

    if (current === undefined || seen.has(current) || retained.has(current)) {
      continue;
    }

    seen.add(current);
    disposeHostFiberEventListeners(current);

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

function disposeHostFiberEventListeners(fiber: Fiber): void {
  if (
    fiber.tag === "host-component" &&
    typeof fiber.stateNode === "object" &&
    fiber.stateNode !== null
  ) {
    disposeDirectEventListeners(fiber.stateNode as Element);
  }
}

function cleanupDeletedRefs(previous: Fiber, next: Fiber): void {
  const nextRefNodes = new Map<unknown, Set<unknown>>();
  for (const record of collectRefRecords(next)) {
    const nodes = nextRefNodes.get(record.ref) ?? new Set<unknown>();
    nodes.add(record.node);
    nextRefNodes.set(record.ref, nodes);
  }

  for (const record of collectRefRecords(previous)) {
    if (nextRefNodes.get(record.ref)?.has(record.node) !== true) {
      detachRef(record.ref, record.node);
    }
  }
}

function collectRefRecords(fiber: Fiber | undefined): RefRecord[] {
  const records: RefRecord[] = [];
  let cursor = fiber;

  while (cursor !== undefined) {
    const ref = getFiberRef(cursor);

    if (ref !== undefined && ref !== null) {
      records.push({ ref, node: cursor.stateNode });
    }

    records.push(...collectRefRecords(cursor.child));
    cursor = cursor.sibling;
  }

  return records;
}

function getFiberRef(fiber: Fiber): unknown {
  const props = (fiber.memoizedProps ?? fiber.pendingProps) as { ref?: unknown } | undefined;

  return props?.ref;
}
