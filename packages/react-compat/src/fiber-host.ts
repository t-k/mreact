import {
  FORWARD_REF_TYPE,
  Fragment,
  LAZY_TYPE,
  MEMO_TYPE,
  type ReactCompatElement,
  type ReactCompatPortal,
  isReactCompatElement,
  isReactCompatPortal,
  type ReactCompatNode,
} from "./element.js";
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

interface MemoFiberState {
  props: Record<string, unknown>;
  instanceKeys: string[];
}

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

  if (isReactCompatPortal(node)) {
    return canRenderHostFiber(node.children);
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

  if (isForwardRefType(node.type)) {
    return true;
  }

  if (isMemoType(node.type)) {
    return true;
  }

  if (isLazyType(node.type)) {
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
    if (fiber.tag !== "memo") {
      fiber.memoizedState = index;
    }
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
    if (isReactCompatPortal(node)) {
      return createPortalFiber(parent, current, node, key, runtime, path);
    }

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

  if (isForwardRefType(node.type)) {
    if (runtime === undefined) {
      return undefined;
    }

    const forwardRefType = node.type;
    const fiber =
      current?.tag === "forward-ref" && current.type === forwardRefType
        ? createWorkInProgress(current, node.props)
        : createFiber("forward-ref", node.props, key);
    fiber.type = forwardRefType;
    const rendered = renderWithRootRuntime(runtime, path, () =>
      forwardRefType.render(node.props, node.ref),
    );
    fiber.child = reconcileHostChild(
      fiber,
      current?.tag === "forward-ref" ? current.child : undefined,
      rendered,
      runtime,
      `${path}.forwardRef`,
    );
    return fiber;
  }

  if (isMemoType(node.type)) {
    if (runtime === undefined) {
      return undefined;
    }

    const memoType = node.type;
    const memoPath = `${path}.memo`;
    const previousMemoState =
      current?.tag === "memo"
        ? (current.memoizedState as MemoFiberState | undefined)
        : undefined;
    const fiber =
      current?.tag === "memo" && current.type === memoType
        ? createWorkInProgress(current, node.props)
        : createFiber("memo", node.props, key);
    fiber.type = memoType;

    if (
      previousMemoState !== undefined &&
      !hasDirtyInstance(runtime, previousMemoState.instanceKeys) &&
      areMemoPropsEqual(memoType, previousMemoState.props, node.props)
    ) {
      markActiveInstanceKeys(runtime, previousMemoState.instanceKeys);
      fiber.child = current?.child;
      fiber.memoizedState = previousMemoState;
      return fiber;
    }

    const renderedElement: ReactCompatElement = {
      ...node,
      type: memoType.type,
    };
    fiber.child = createHostFiber(
      fiber,
      current?.tag === "memo" ? current.child : undefined,
      renderedElement,
      key,
      runtime,
      memoPath,
    );
    fiber.memoizedState = {
      props: { ...node.props },
      instanceKeys: collectInstanceKeys(runtime, memoPath),
    };
    return fiber;
  }

  if (isLazyType(node.type)) {
    if (runtime === undefined) {
      return undefined;
    }

    const lazyType = node.type;
    const fiber =
      current?.tag === "lazy" && current.type === lazyType
        ? createWorkInProgress(current, node.props)
        : createFiber("lazy", node.props, key);
    fiber.type = lazyType;

    if (lazyType.status === "resolved" && lazyType.resolved !== undefined) {
      const renderedElement: ReactCompatElement = {
        ...node,
        type: lazyType.resolved,
      };
      fiber.child = createHostFiber(
        fiber,
        current?.tag === "lazy" ? current.child : undefined,
        renderedElement,
        key,
        runtime,
        `${path}.lazy`,
      );
      return fiber;
    }

    if (lazyType.status === "rejected") {
      throw lazyType.error;
    }

    if (lazyType.status === "uninitialized") {
      lazyType.status = "pending";
      lazyType.promise = lazyType
        .load()
        .then((module) => {
          lazyType.status = "resolved";
          lazyType.resolved = module.default;
          runtime.rerender();
        })
        .catch((error: unknown) => {
          lazyType.status = "rejected";
          lazyType.error = error;
          runtime.rerender();
        });
    }

    fiber.child = undefined;
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
    applyRef((fiber.pendingProps as { ref?: unknown }).ref, element);
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

  if (fiber.tag === "forward-ref") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.fr`);
  }

  if (fiber.tag === "memo") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.memo`);
  }

  if (fiber.tag === "lazy") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.lazy`);
  }

  if (fiber.tag === "portal") {
    const container = fiber.stateNode;

    if (!(container instanceof Element)) {
      return [];
    }

    const childNodes = commitHostChildren(
      fiber.child,
      container,
      eventRoot,
      `${path}.portal`,
    );
    syncChildNodes(container, childNodes);
    fiber.memoizedProps = fiber.pendingProps;
    return [];
  }

  return [];
}

function createPortalFiber(
  parent: Fiber,
  current: Fiber | undefined,
  portal: ReactCompatPortal,
  key: string | undefined,
  runtime: RootRuntime | undefined,
  path: string,
): Fiber | undefined {
  if (runtime === undefined) {
    return undefined;
  }

  runtime.portalContainers.add(portal.container);
  const fiber =
    current?.tag === "portal" && current.stateNode === portal.container
      ? createWorkInProgress(current, portal.children)
      : createFiber("portal", portal.children, key);
  fiber.stateNode = portal.container;
  fiber.child = reconcileHostChild(
    fiber,
    current?.tag === "portal" ? current.child : undefined,
    portal.children,
    runtime,
    `${path}.portal`,
  );
  fiber.return = parent;
  return fiber;
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
  if (!isReactCompatElement(node)) {
    return node;
  }

  return node.ref === null ? node.props : { ...node.props, ref: node.ref };
}

function isForwardRefType(
  value: unknown,
): value is {
  $$typeof: typeof FORWARD_REF_TYPE;
  render: (props: Record<string, unknown>, ref: unknown) => ReactCompatNode;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === FORWARD_REF_TYPE
  );
}

function isMemoType(
  value: unknown,
): value is {
  $$typeof: typeof MEMO_TYPE;
  type: ReactCompatElement["type"];
  compare?: (
    previous: Record<string, unknown>,
    next: Record<string, unknown>,
  ) => boolean;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === MEMO_TYPE
  );
}

function isLazyType(
  value: unknown,
): value is {
  $$typeof: typeof LAZY_TYPE;
  load: () => Promise<{ default: ReactCompatElement["type"] }>;
  status: "uninitialized" | "pending" | "resolved" | "rejected";
  promise?: Promise<void>;
  resolved?: ReactCompatElement["type"];
  error?: unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === LAZY_TYPE
  );
}

function areMemoPropsEqual(
  memoType: {
    compare?: (
      previous: Record<string, unknown>,
      next: Record<string, unknown>,
    ) => boolean;
  },
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  return memoType.compare === undefined
    ? shallowEqual(previous, next)
    : memoType.compare(previous, next);
}

function shallowEqual(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);

  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  return previousKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(next, key) &&
      Object.is(previous[key], next[key]),
  );
}

function collectInstanceKeys(runtime: RootRuntime, prefix: string): string[] {
  return Array.from(runtime.instances.keys()).filter(
    (key) => key === prefix || key.startsWith(`${prefix}.`),
  );
}

function markActiveInstanceKeys(runtime: RootRuntime, keys: readonly string[]): void {
  for (const key of keys) {
    runtime.activeInstanceKeys?.add(key);
  }
}

function hasDirtyInstance(runtime: RootRuntime, keys: readonly string[]): boolean {
  return keys.some(
    (key) =>
      (runtime.instances.get(key) as { dirty?: boolean } | undefined)?.dirty === true,
  );
}

function applyRef(ref: unknown, node: Node): void {
  if (typeof ref === "function") {
    ref(node);
    return;
  }

  if (typeof ref === "object" && ref !== null && "current" in ref) {
    (ref as { current: Node | null }).current = node;
  }
}
