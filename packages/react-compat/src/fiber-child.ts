import {
  FORWARD_REF_TYPE,
  Fragment,
  MEMO_TYPE,
  isReactCompatElement,
  isReactCompatPortal,
  type ReactCompatElement,
  type ReactCompatNode,
} from "./element.js";
import {
  isReactCompatConsumer,
  isReactCompatProvider,
} from "./context.js";
import { ChildDeletion, Placement } from "./fiber-flags.js";
import { createFiber, createWorkInProgress, type Fiber } from "./fiber.js";

export function reconcileChildFibers(
  parent: Fiber,
  currentFirstChild: Fiber | undefined,
  newChildren: ReactCompatNode,
): Fiber | undefined {
  const children = normalizeChildren(newChildren);
  const keyed = collectKeyedChildren(currentFirstChild);
  let currentUnkeyed = currentFirstChild;
  let first: Fiber | undefined;
  let previous: Fiber | undefined;

  for (const child of children) {
    const key = getNodeKey(child);
    const matchedCurrent =
      key === undefined ? currentUnkeyed : keyed.get(key);
    const fiber = reconcileSingleChild(parent, matchedCurrent, child, key);

    if (key === undefined) {
      currentUnkeyed = currentUnkeyed?.sibling;
    }

    if (fiber === undefined) {
      if (matchedCurrent !== undefined) {
        markChildForDeletion(parent, matchedCurrent);
      }
      continue;
    }

    if (matchedCurrent !== undefined && fiber.alternate !== matchedCurrent) {
      markChildForDeletion(parent, matchedCurrent);
    }

    fiber.return = parent;
    fiber.sibling = undefined;

    if (first === undefined) {
      first = fiber;
    } else if (previous !== undefined) {
      previous.sibling = fiber;
    }

    previous = fiber;
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
      return createWorkInProgress(current, String(child));
    }

    const fiber = createFiber("host-text", String(child), key);
    fiber.flags |= Placement;
    fiber.return = parent;
    return fiber;
  }

  if (Array.isArray(child)) {
    if (current?.tag === "fragment") {
      return createWorkInProgress(current, child);
    }

    const fiber = createFiber("fragment", child, key);
    fiber.flags |= Placement;
    fiber.return = parent;
    return fiber;
  }

  if (isReactCompatPortal(child)) {
    if (current?.tag === "portal" && current.stateNode === child.container) {
      return createWorkInProgress(current, child.children);
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
    return createWorkInProgress(current, getPendingProps(child));
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
        : isReactCompatProvider(element.type)
          ? "context-provider"
          : isReactCompatConsumer(element.type)
            ? "context-consumer"
        : isForwardRefType(element.type)
          ? "forward-ref"
          : isMemoType(element.type)
            ? "memo"
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

function markChildForDeletion(parent: Fiber, child: Fiber): void {
  parent.flags |= ChildDeletion;
  parent.deletions = parent.deletions ?? [];
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

function normalizeChildren(node: ReactCompatNode): ReactCompatNode[] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return [];
  }

  return Array.isArray(node) ? node : [node];
}

function getNodeKey(node: ReactCompatNode): string | undefined {
  return isReactCompatElement(node) && node.key !== null ? node.key : undefined;
}

function getPendingProps(element: ReactCompatElement): unknown {
  return element.ref === null
    ? element.props
    : { ...element.props, ref: element.ref };
}
