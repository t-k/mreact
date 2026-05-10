import { Fragment, isReactCompatElement, type ReactCompatNode } from "./element.js";
import {
  isReactCompatConsumer,
  isReactCompatProvider,
  renderWithContextProvider,
  useContext,
} from "./context.js";
import { applyProps } from "./dom-props.js";
import { syncChildNodes } from "./dom-children.js";
import { createFiber, createWorkInProgress, type Fiber, type FiberRoot } from "./fiber.js";
import { renderWithRootRuntime, type RootRuntime } from "./hooks.js";

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

  if (isReactCompatProvider(node.type)) {
    return canRenderHostFiber(node.props.children as ReactCompatNode);
  }

  if (isReactCompatConsumer(node.type)) {
    return true;
  }

  return (
    typeof node.type === "string" &&
    canRenderHostFiber(node.props.children as ReactCompatNode)
  ) || isFunctionComponentType(node.type);
}

export function renderHostFiberRoot(
  root: FiberRoot,
  element: ReactCompatNode,
  runtime?: RootRuntime,
): Fiber {
  const workInProgress = createWorkInProgress(root.current, { children: element });
  workInProgress.child = reconcileHostChild(
    workInProgress,
    root.current.child,
    element,
    runtime,
    "0",
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
  runtime: RootRuntime | undefined,
  path: string,
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
    const fiber = createHostFiber(
      parent,
      matchedCurrent,
      child,
      key,
      runtime,
      `${path}.${getNodePathSegment(child, index)}`,
    );

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
  runtime: RootRuntime | undefined,
  path: string,
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
    fiber.child = reconcileHostChild(fiber, current?.child, node, runtime, path);
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
      runtime,
      `${path}.f`,
    );
    return fiber;
  }

  if (isReactCompatProvider(node.type)) {
    const fiber =
      current?.tag === "context-provider" && current.type === node.type
        ? createWorkInProgress(current, node.props)
        : createFiber("context-provider", node.props, key);
    fiber.type = node.type;
    fiber.child = renderWithContextProvider(node.type, node.props.value, () =>
      reconcileHostChild(
        fiber,
        current?.tag === "context-provider" ? current.child : undefined,
        node.props.children as ReactCompatNode,
        runtime,
        `${path}.provider`,
      ),
    );
    return fiber;
  }

  if (isReactCompatConsumer(node.type)) {
    const fiber =
      current?.tag === "context-consumer" && current.type === node.type
        ? createWorkInProgress(current, node.props)
        : createFiber("context-consumer", node.props, key);
    fiber.type = node.type;
    const children = node.props.children;
    const render =
      typeof children === "function"
        ? (children as (value: unknown) => ReactCompatNode)
        : () => null;
    fiber.child = reconcileHostChild(
      fiber,
      current?.tag === "context-consumer" ? current.child : undefined,
      render(useContext(node.type.context)),
      runtime,
      `${path}.consumer`,
    );
    return fiber;
  }

  if (isFunctionComponentType(node.type)) {
    if (runtime === undefined) {
      return undefined;
    }

    const fiber =
      current?.tag === "function-component" && current.type === node.type
        ? createWorkInProgress(current, node.props)
        : createFiber("function-component", node.props, key);
    fiber.type = node.type;
    const rendered = renderWithRootRuntime(runtime, path, () =>
      (node.type as (props: Record<string, unknown>) => ReactCompatNode)(node.props),
    );
    fiber.child = reconcileHostChild(
      fiber,
      current?.tag === "function-component" ? current.child : undefined,
      rendered,
      runtime,
      `${path}.0`,
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
    runtime,
    `${path}.c`,
  );
  parent.child ??= fiber;
  return fiber;
}

function isFunctionComponentType(value: unknown): value is (
  props: Record<string, unknown>,
) => ReactCompatNode {
  return (
    typeof value === "function" &&
    typeof (value as { prototype?: { render?: unknown } }).prototype?.render !==
      "function"
  );
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

  if (fiber.tag === "context-provider" || fiber.tag === "context-consumer") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.ctx`);
  }

  if (fiber.tag === "function-component") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.fc`);
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

function getNodePathSegment(node: ReactCompatNode, index: number): string {
  const key = getNodeKey(node);
  return key === undefined ? String(index) : `k:${key}`;
}

function getPendingProps(node: ReactCompatNode): unknown {
  return isReactCompatElement(node) ? node.props : node;
}
