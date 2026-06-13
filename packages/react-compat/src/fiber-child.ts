import {
  ERROR_BOUNDARY_TYPE,
  FORWARD_REF_TYPE,
  Fragment,
  LAZY_TYPE,
  MEMO_TYPE,
  STRICT_MODE_TYPE,
  Suspense,
  SuspenseList,
  isReactCompatElement,
  isReactCompatPortal,
  type ReactCompatElement,
  type ReactCompatNode,
} from "./element.js";
import {
  isReactCompatConsumer,
  isReactCompatProvider,
} from "./context.js";
import { isClassComponentType } from "./class-component.js";
import { ChildDeletion, Placement, Ref, Update } from "./fiber-flags.js";
import { createFiber, createWorkInProgress, type Fiber } from "./fiber.js";
import { getPendingProps } from "./prop-comparison.js";

export function reconcileChildFibers(
  parent: Fiber,
  currentFirstChild: Fiber | undefined,
  newChildren: ReactCompatNode,
): Fiber | undefined {
  const children = normalizeChildren(newChildren);
  const orderedKeyedChildren = reconcileSameKeyOrderChildren(
    parent,
    currentFirstChild,
    children,
  );

  if (orderedKeyedChildren !== undefined) {
    return orderedKeyedChildren;
  }

  const keyed = collectKeyedChildren(currentFirstChild);
  const oldIndexes = collectChildIndexes(currentFirstChild);
  const used = new Set<Fiber>();
  let currentUnkeyed = currentFirstChild;
  let lastPlacedIndex = 0;
  let first: Fiber | undefined;
  let previous: Fiber | undefined;

  for (const child of children) {
    const key = getNodeKey(child);
    const matchedCurrent =
      key === undefined ? findNextUnkeyedChild(currentUnkeyed) : keyed.get(key);
    const fiber = reconcileSingleChild(parent, matchedCurrent, child, key);

    if (key === undefined) {
      currentUnkeyed = matchedCurrent?.sibling ?? currentUnkeyed?.sibling;
    }

    if (fiber === undefined) {
      if (matchedCurrent !== undefined) {
        used.add(matchedCurrent);
        markChildForDeletion(parent, matchedCurrent);
      }
      continue;
    }

    if (matchedCurrent !== undefined) {
      used.add(matchedCurrent);

      if (fiber.alternate === matchedCurrent) {
        const oldIndex = oldIndexes.get(matchedCurrent) ?? 0;
        if (oldIndex < lastPlacedIndex) {
          fiber.flags |= Placement;
        } else {
          lastPlacedIndex = oldIndex;
        }
      } else {
        markChildForDeletion(parent, matchedCurrent);
      }
    }

    fiber.lanes |= parent.lanes;
    fiber.return = parent;
    fiber.sibling = undefined;

    if (first === undefined) {
      first = fiber;
    } else if (previous !== undefined) {
      previous.sibling = fiber;
    }

    previous = fiber;
  }

  markRemainingChildrenForDeletion(parent, currentFirstChild, used);
  parent.child = first;
  return first;
}

function reconcileSameKeyOrderChildren(
  parent: Fiber,
  currentFirstChild: Fiber | undefined,
  children: readonly ReactCompatNode[],
): Fiber | undefined {
  if (currentFirstChild === undefined || children.length === 0) {
    return undefined;
  }

  let cursor: Fiber | undefined = currentFirstChild;
  let matchedCount = 0;

  for (const child of children) {
    if (cursor === undefined) {
      break;
    }

    const key = getNodeKey(child);

    if (
      key === undefined ||
      cursor.key !== key ||
      !isReactCompatElement(child) ||
      !canReuseElementFiber(cursor, child)
    ) {
      return undefined;
    }

    cursor = cursor.sibling;
    matchedCount += 1;
  }

  if (matchedCount === 0 || cursor !== undefined) {
    return undefined;
  }

  cursor = currentFirstChild;
  let first: Fiber | undefined;
  let previous: Fiber | undefined;

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index] as ReactCompatNode;
    const key = getNodeKey(child) as string;
    const matchedCurrent: Fiber | undefined = index < matchedCount ? cursor : undefined;
    const fiber = reconcileSingleChild(parent, matchedCurrent, child, key) as Fiber;

    fiber.lanes |= parent.lanes;
    fiber.return = parent;
    fiber.sibling = undefined;

    if (first === undefined) {
      first = fiber;
    } else if (previous !== undefined) {
      previous.sibling = fiber;
    }

    previous = fiber;
    cursor = matchedCurrent?.sibling;
  }

  parent.child = first;
  return first;
}

function reconcileSingleChild(
  parent: Fiber,
  current: Fiber | undefined,
  child: ReactCompatNode,
  key: string | undefined,
): Fiber | undefined {
  if (child === null || child === undefined || typeof child === "boolean") {
    return undefined;
  }

  if (typeof child === "string" || typeof child === "number") {
    if (current?.tag === "host-text") {
      const fiber = createWorkInProgress(current, String(child));
      markUpdateEffectIfChanged(fiber, current);
      return fiber;
    }

    const fiber = createFiber("host-text", String(child), key);
    fiber.flags |= Placement;
    fiber.return = parent;
    return fiber;
  }

  if (Array.isArray(child)) {
    if (current?.tag === "fragment") {
      const fiber = createWorkInProgress(current, child);
      markUpdateEffectIfChanged(fiber, current);
      return fiber;
    }

    const fiber = createFiber("fragment", child, key);
    fiber.flags |= Placement;
    fiber.return = parent;
    return fiber;
  }

  if (isReactCompatPortal(child)) {
    if (current?.tag === "portal" && current.stateNode === child.container) {
      const fiber = createWorkInProgress(current, child.children);
      markUpdateEffectIfChanged(fiber, current);
      return fiber;
    }

    const fiber = createFiber("portal", child.children, key);
    fiber.stateNode = child.container;
    fiber.flags |= Placement;
    fiber.return = parent;
    return fiber;
  }

  if (!isReactCompatElement(child)) {
    return undefined;
  }

  if (current !== undefined && canReuseElementFiber(current, child)) {
    const fiber = createWorkInProgress(current, getPendingProps(child));
    markUpdateEffectIfChanged(fiber, current);
    markRefEffectIfChanged(fiber, current);
    return fiber;
  }

  const fiber = createElementFiber(child, key);
  fiber.flags |= Placement;
  fiber.return = parent;
  return fiber;
}

function canReuseElementFiber(
  current: Fiber,
  element: ReactCompatElement,
): boolean {
  if (current.type !== element.type) {
    return false;
  }

  if (typeof element.type === "string") {
    return current.tag === "host-component";
  }

  if (element.type === Fragment) {
    return current.tag === "fragment";
  }

  return current.tag !== "host-component" && current.tag !== "host-text";
}

function createElementFiber(
  element: ReactCompatElement,
  key: string | undefined,
): Fiber {
  const tag =
    typeof element.type === "string"
      ? "host-component"
      : element.type === Fragment
        ? "fragment"
        : element.type === Suspense
          ? "suspense"
          : element.type === SuspenseList
            ? "suspense-list"
            : element.type === STRICT_MODE_TYPE
              ? "strict-mode"
              : element.type === ERROR_BOUNDARY_TYPE
                ? "error-boundary"
                : isLazyType(element.type)
                  ? "lazy"
        : isReactCompatProvider(element.type)
          ? "context-provider"
          : isReactCompatConsumer(element.type)
            ? "context-consumer"
        : isForwardRefType(element.type)
          ? "forward-ref"
          : isMemoType(element.type)
            ? "memo"
            : isClassComponentType(element.type)
              ? "class-component"
              : "function-component";
  const fiber = createFiber(tag, getPendingProps(element), key);
  fiber.type = element.type;
  return fiber;
}

function isForwardRefType(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === FORWARD_REF_TYPE
  );
}

function isMemoType(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === MEMO_TYPE
  );
}

function isLazyType(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === LAZY_TYPE
  );
}

function markChildForDeletion(parent: Fiber, child: Fiber): void {
  parent.flags |= ChildDeletion;
  parent.deletions = parent.deletions ?? [];
  if (parent.deletions.includes(child)) {
    return;
  }
  parent.deletions.push(child);
}

function collectKeyedChildren(
  firstChild: Fiber | undefined,
): Map<string, Fiber> {
  const keyed = new Map<string, Fiber>();
  let cursor = firstChild;

  while (cursor !== undefined) {
    if (cursor.key !== undefined) {
      keyed.set(cursor.key, cursor);
    }

    cursor = cursor.sibling;
  }

  return keyed;
}

function collectChildIndexes(
  firstChild: Fiber | undefined,
): Map<Fiber, number> {
  const indexes = new Map<Fiber, number>();
  let cursor = firstChild;
  let index = 0;

  while (cursor !== undefined) {
    indexes.set(cursor, index);
    cursor = cursor.sibling;
    index += 1;
  }

  return indexes;
}

function findNextUnkeyedChild(firstChild: Fiber | undefined): Fiber | undefined {
  let cursor = firstChild;

  while (cursor !== undefined && cursor.key !== undefined) {
    cursor = cursor.sibling;
  }

  return cursor;
}

function markRemainingChildrenForDeletion(
  parent: Fiber,
  firstChild: Fiber | undefined,
  used: Set<Fiber>,
): void {
  let cursor = firstChild;

  while (cursor !== undefined) {
    if (!used.has(cursor)) {
      markChildForDeletion(parent, cursor);
    }

    cursor = cursor.sibling;
  }
}

function normalizeChildren(node: ReactCompatNode): ReactCompatNode[] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return [];
  }

  return Array.isArray(node) ? node : [node];
}

function getNodeKey(node: ReactCompatNode): string | undefined {
  return isReactCompatElement(node) && node.key !== null ? node.key : undefined;
}

function markUpdateEffectIfChanged(fiber: Fiber, current: Fiber): void {
  const previousProps =
    current.memoizedProps === undefined
      ? current.pendingProps
      : current.memoizedProps;

  if (!arePropsEqual(previousProps, fiber.pendingProps)) {
    fiber.flags |= Update;
  }
}

function markRefEffectIfChanged(fiber: Fiber, current: Fiber): void {
  if (
    getRef(current.memoizedProps ?? current.pendingProps) !==
    getRef(fiber.pendingProps)
  ) {
    fiber.flags |= Ref;
  }
}

function getRef(props: unknown): unknown {
  return typeof props === "object" && props !== null
    ? (props as { ref?: unknown }).ref
    : undefined;
}

function arePropsEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (
    typeof left !== "object" ||
    left === null ||
    typeof right !== "object" ||
    right === null
  ) {
    return false;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => Object.is(leftRecord[key], rightRecord[key]));
}
