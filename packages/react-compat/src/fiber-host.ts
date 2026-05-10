import { Fragment, isReactCompatElement, type ReactCompatNode } from "./element.js";
import { applyProps } from "./dom-props.js";
import { syncChildNodes } from "./dom-children.js";
import { createFiber, createWorkInProgress, type Fiber, type FiberRoot } from "./fiber.js";

export function canRenderHostFiber(node: ReactCompatNode): boolean {
  if (
    node === null ||
    node === undefined ||
    typeof node === "boolean" ||
    typeof node === "string" ||
    typeof node === "number"
  ) {
    return true;
  }

  if (Array.isArray(node)) {
    return node.every(canRenderHostFiber);
  }

  if (!isReactCompatElement(node)) {
    return false;
  }

  if (node.type === Fragment) {
    return canRenderHostFiber(node.props.children as ReactCompatNode);
  }

  return typeof node.type === "string" &&
    canRenderHostFiber(node.props.children as ReactCompatNode);
}

export function renderHostFiberRoot(
  root: FiberRoot,
  element: ReactCompatNode,
): Fiber {
  const workInProgress = createWorkInProgress(root.current, { children: element });
  workInProgress.child = reconcileHostChild(
    workInProgress,
    root.current.child,
    element,
  );
  workInProgress.memoizedProps = { children: element };
  return workInProgress;
}

export function commitHostFiberRoot(root: FiberRoot, finishedWork: Fiber): void {
  const nodes = commitHostChildren(finishedWork.child, root.container, root.container, "0");
  syncChildNodes(root.container, nodes);
}

function reconcileHostChild(
  parent: Fiber,
  currentFirstChild: Fiber | undefined,
  node: ReactCompatNode,
): Fiber | undefined {
  const children = normalizeChildren(node);
  const existingByKey = collectExistingKeyedFibers(currentFirstChild);
  let currentUnkeyed = currentFirstChild;
  let first: Fiber | undefined;
  let previous: Fiber | undefined;

  children.forEach((child, index) => {
    const key = getNodeKey(child);
    const matchedCurrent =
      key === undefined ? currentUnkeyed : existingByKey.get(key);
    const fiber = createHostFiber(parent, matchedCurrent, child, key);

    if (fiber === undefined) {
      return;
    }

    if (key === undefined) {
      currentUnkeyed = currentUnkeyed?.sibling;
    }

    if (first === undefined) {
      first = fiber;
    } else if (previous !== undefined) {
      previous.sibling = fiber;
    }

    fiber.return = parent;
    fiber.sibling = undefined;
    fiber.pendingProps = getPendingProps(child);
    fiber.memoizedState = index;
    previous = fiber;
  });

  return first;
}

function createHostFiber(
  parent: Fiber,
  current: Fiber | undefined,
  node: ReactCompatNode,
  key: string | undefined,
): Fiber | undefined {
  if (node === null || node === undefined || typeof node === "boolean") {
    return undefined;
  }

  if (typeof node === "string" || typeof node === "number") {
    const fiber =
      current?.tag === "host-text"
        ? createWorkInProgress(current, String(node))
        : createFiber("host-text", String(node), key);
    fiber.stateNode =
      current?.tag === "host-text" && current.stateNode instanceof Text
        ? current.stateNode
        : document.createTextNode("");
    return fiber;
  }

  if (Array.isArray(node)) {
    const fiber =
      current?.tag === "fragment"
        ? createWorkInProgress(current, node)
        : createFiber("fragment", node, key);
    fiber.child = reconcileHostChild(fiber, current?.child, node);
    return fiber;
  }

  if (!isReactCompatElement(node)) {
    return undefined;
  }

  if (node.type === Fragment) {
    const fiber =
      current?.tag === "fragment"
        ? createWorkInProgress(current, node.props.children)
        : createFiber("fragment", node.props.children, key);
    fiber.child = reconcileHostChild(
      fiber,
      current?.child,
      node.props.children as ReactCompatNode,
    );
    return fiber;
  }

  if (typeof node.type !== "string") {
    return undefined;
  }

  const fiber =
    current?.tag === "host-component" && current.type === node.type
      ? createWorkInProgress(current, node.props)
      : createFiber("host-component", node.props, key);
  fiber.type = node.type;
  fiber.stateNode =
    current?.tag === "host-component" &&
    current.type === node.type &&
    current.stateNode instanceof HTMLElement
      ? current.stateNode
      : document.createElement(node.type);
  fiber.child = reconcileHostChild(
    fiber,
    current?.tag === "host-component" ? current.child : undefined,
    node.props.children as ReactCompatNode,
  );
  parent.child ??= fiber;
  return fiber;
}

function commitHostChildren(
  fiber: Fiber | undefined,
  parent: ParentNode,
  eventRoot: Element,
  path: string,
): Node[] {
  const nodes: Node[] = [];
  let cursor = fiber;
  let index = 0;

  while (cursor !== undefined) {
    nodes.push(...commitHostFiber(cursor, parent, eventRoot, `${path}.${index}`));
    cursor = cursor.sibling;
    index += 1;
  }

  return nodes;
}

function commitHostFiber(
  fiber: Fiber,
  parent: ParentNode,
  eventRoot: Element,
  path: string,
): Node[] {
  if (fiber.tag === "host-text") {
    const text = fiber.stateNode;

    if (!(text instanceof Text)) {
      return [];
    }

    text.data = String(fiber.pendingProps);
    fiber.memoizedProps = fiber.pendingProps;
    return [text];
  }

  if (fiber.tag === "host-component") {
    const element = fiber.stateNode;

    if (!(element instanceof HTMLElement)) {
      return [];
    }

    applyProps(element, fiber.pendingProps as Record<string, unknown>, path, {
      eventRoot,
    });
    const childNodes = commitHostChildren(fiber.child, element, eventRoot, `${path}.c`);
    syncChildNodes(element, childNodes);
    fiber.memoizedProps = fiber.pendingProps;
    return [element];
  }

  if (fiber.tag === "fragment") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.f`);
  }

  return [];
}

function normalizeChildren(node: ReactCompatNode): ReactCompatNode[] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return [];
  }

  return Array.isArray(node) ? node : [node];
}

function collectExistingKeyedFibers(
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

function getNodeKey(node: ReactCompatNode): string | undefined {
  return isReactCompatElement(node) && node.key !== null ? node.key : undefined;
}

function getPendingProps(node: ReactCompatNode): unknown {
  return isReactCompatElement(node) ? node.props : node;
}
