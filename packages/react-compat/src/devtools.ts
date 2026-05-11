import {
  Fragment,
  Suspense,
  SuspenseList,
  isReactCompatElement,
  isReactCompatPortal,
  type ReactCompatNode,
} from "./element.js";
import type { Fiber, FiberRoot, FiberTag } from "./fiber.js";

interface DevToolsHook {
  inject?: (renderer: DevToolsRenderer) => number;
  onCommitFiberRoot?: (
    rendererId: number,
    root: DevToolsRoot,
    priorityLevel?: number,
    didError?: boolean,
  ) => void;
  onCommitFiberUnmount?: (rendererId: number, fiber: DevToolsFiber) => void;
}

interface DevToolsRenderer {
  bundleType: 0 | 1;
  version: string;
  rendererPackageName: string;
  supportsFiber: true;
  findFiberByHostInstance(hostInstance: unknown): DevToolsFiber | null;
  findHostInstanceByFiber(fiber: DevToolsFiber): object | null;
  findNativeNodesForFiber(fiber: DevToolsFiber): Set<object>;
  getFiberRoots(): Set<DevToolsRoot>;
  getDisplayNameForFiber(fiber: DevToolsFiber): string | null;
  getFiberCurrentPropsFromNode(hostInstance: unknown): unknown;
  getInstanceByFiber(fiber: DevToolsFiber): unknown;
}

interface DevToolsRoot {
  containerInfo: Element;
  current: DevToolsFiber;
  pendingChildren: null;
  hydrate: boolean;
}

interface DevToolsFiber {
  tag: number;
  key: string | null;
  elementType: unknown;
  type: unknown;
  stateNode: unknown;
  return: DevToolsFiber | null;
  child: DevToolsFiber | null;
  sibling: DevToolsFiber | null;
  index: number;
  ref: unknown;
  pendingProps: unknown;
  memoizedProps: unknown;
  memoizedState: unknown;
  updateQueue: null;
  dependencies: null;
  mode: number;
  flags: number;
  subtreeFlags: number;
  deletions: DevToolsFiber[] | null;
  lanes: number;
  childLanes: number;
  alternate: DevToolsFiber | null;
  actualDuration: number;
  actualStartTime: number;
  selfBaseDuration: number;
  treeBaseDuration: number;
  _debugOwner: null;
  _debugSource: null;
  _debugHookTypes: null;
}

const roots = new WeakMap<Element, DevToolsRoot>();
const hostInstanceFibers = new WeakMap<object, DevToolsFiber>();
const rootHostInstances = new WeakMap<DevToolsRoot, object[]>();
let rendererRoots = new Set<DevToolsRoot>();
let rendererId: number | undefined;
let injectedHook: DevToolsHook | undefined;

export function commitDevToolsRoot(
  container: Element,
  source: FiberRoot | ReactCompatNode,
  didError = false,
): void {
  const hook = getDevToolsHook();
  const id = injectDevToolsRenderer(hook);

  if (hook === undefined || id === undefined) {
    return;
  }

  const previousRoot = roots.get(container);

  if (previousRoot !== undefined) {
    rendererRoots.delete(previousRoot);
    clearHostInstanceFibers(previousRoot);
  }

  const root = isFiberRoot(source)
    ? createDevToolsFiberRoot(container, source)
    : createFallbackDevToolsRoot(container, source);
  roots.set(container, root);
  rendererRoots.add(root);
  hook.onCommitFiberRoot?.(id, root, undefined, didError);
}

export function unmountDevToolsRoot(container: Element): void {
  const hook = getDevToolsHook();
  const id = injectDevToolsRenderer(hook);
  const root = roots.get(container);

  if (hook === undefined || id === undefined || root === undefined) {
    return;
  }

  notifyFiberUnmounts(hook, id, root.current.child);
  rendererRoots.delete(root);
  clearHostInstanceFibers(root);
  roots.delete(container);
}

function injectDevToolsRenderer(hook: DevToolsHook | undefined): number | undefined {
  if (rendererId !== undefined && injectedHook === hook) {
    return rendererId;
  }

  if (hook?.inject === undefined) {
    return undefined;
  }

  injectedHook = hook;
  rendererRoots = new Set();
  rendererId = hook.inject({
    bundleType: 1,
    version: "0.0.0",
    rendererPackageName: "@modular-react/react-compat",
    supportsFiber: true,
    findFiberByHostInstance(hostInstance) {
      return typeof hostInstance === "object" && hostInstance !== null
        ? (hostInstanceFibers.get(hostInstance) ?? null)
        : null;
    },
    findHostInstanceByFiber(fiber) {
      return findFirstHostInstance(fiber);
    },
    findNativeNodesForFiber(fiber) {
      const hostInstances = new Set<object>();
      collectHostInstances(fiber, hostInstances);
      return hostInstances;
    },
    getFiberRoots() {
      return new Set(rendererRoots);
    },
    getDisplayNameForFiber(fiber) {
      return getDisplayNameForDevToolsFiber(fiber);
    },
    getFiberCurrentPropsFromNode(hostInstance) {
      const fiber =
        typeof hostInstance === "object" && hostInstance !== null
          ? hostInstanceFibers.get(hostInstance)
          : undefined;

      return fiber?.memoizedProps ?? null;
    },
    getInstanceByFiber(fiber) {
      return fiber.stateNode;
    },
  });
  return rendererId;
}

function getDevToolsHook(): DevToolsHook | undefined {
  return (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevToolsHook })
    .__REACT_DEVTOOLS_GLOBAL_HOOK__;
}

function isFiberRoot(value: FiberRoot | ReactCompatNode): value is FiberRoot {
  return (
    typeof value === "object" &&
    value !== null &&
    "current" in value &&
    "container" in value
  );
}

function createDevToolsFiberRoot(
  container: Element,
  fiberRoot: FiberRoot,
): DevToolsRoot {
  const hostInstances: object[] = [];
  const root = {
    containerInfo: container,
    current: undefined as unknown as DevToolsFiber,
    pendingChildren: null,
    hydrate: fiberRoot.hydrationState !== undefined,
  } satisfies DevToolsRoot;
  root.current = toDevToolsFiber(fiberRoot.current, null, 0, root, hostInstances);
  root.current.stateNode = root;
  rootHostInstances.set(root, hostInstances);
  return root;
}

function toDevToolsFiber(
  fiber: Fiber,
  parent: DevToolsFiber | null,
  index: number,
  root: DevToolsRoot,
  hostInstances: object[],
): DevToolsFiber {
  const devToolsFiber = createDevToolsFiberShell(fiber, parent, index, root);

  if (isHostInstance(devToolsFiber.stateNode)) {
    hostInstanceFibers.set(devToolsFiber.stateNode, devToolsFiber);
    hostInstances.push(devToolsFiber.stateNode);
  }

  let previousChild: DevToolsFiber | undefined;
  let childIndex = 0;
  let child = fiber.child;

  while (child !== undefined) {
    const devToolsChild = toDevToolsFiber(
      child,
      devToolsFiber,
      childIndex,
      root,
      hostInstances,
    );

    if (previousChild === undefined) {
      devToolsFiber.child = devToolsChild;
    } else {
      previousChild.sibling = devToolsChild;
    }

    previousChild = devToolsChild;
    child = child.sibling;
    childIndex += 1;
  }

  devToolsFiber.deletions =
    fiber.deletions?.map((deletedFiber, deletedIndex) =>
      toDevToolsFiber(deletedFiber, devToolsFiber, deletedIndex, root, hostInstances),
    ) ?? null;
  return devToolsFiber;
}

function createDevToolsFiberShell(
  fiber: Fiber,
  parent: DevToolsFiber | null,
  index: number,
  root: DevToolsRoot,
): DevToolsFiber {
  const pendingProps =
    fiber.tag === "host-root" ? fiber.pendingProps : fiber.pendingProps;
  const memoizedProps =
    fiber.tag === "host-root" ? fiber.memoizedProps : fiber.memoizedProps;

  return {
    tag: getReactFiberTag(fiber.tag),
    key: fiber.key ?? null,
    elementType: getElementType(fiber),
    type: getFiberType(fiber),
    stateNode: fiber.tag === "host-root" ? root : fiber.stateNode,
    return: parent,
    child: null,
    sibling: null,
    index,
    ref: getFiberRef(fiber),
    pendingProps,
    memoizedProps,
    memoizedState: fiber.memoizedState,
    updateQueue: null,
    dependencies: null,
    mode: 0,
    flags: fiber.flags,
    subtreeFlags: fiber.subtreeFlags,
    deletions: null,
    lanes: fiber.lanes,
    childLanes: fiber.childLanes,
    alternate: null,
    actualDuration: 0,
    actualStartTime: -1,
    selfBaseDuration: 0,
    treeBaseDuration: 0,
    _debugOwner: null,
    _debugSource: null,
    _debugHookTypes: null,
  };
}

function createFallbackDevToolsRoot(
  container: Element,
  element: ReactCompatNode,
): DevToolsRoot {
  const hostInstances: object[] = [];
  const root = {
    containerInfo: container,
    current: undefined as unknown as DevToolsFiber,
    pendingChildren: null,
    hydrate: false,
  } satisfies DevToolsRoot;
  root.current = {
    ...createFallbackDevToolsFiber("host-root", { children: element }, null, 0),
    tag: 3,
    stateNode: root,
  };
  root.current.child = toFallbackDevToolsFiber(
    element,
    root.current,
    0,
    hostInstances,
  );
  rootHostInstances.set(root, hostInstances);
  return root;
}

function toFallbackDevToolsFiber(
  node: ReactCompatNode,
  parent: DevToolsFiber | null,
  index: number,
  hostInstances: object[],
): DevToolsFiber | null {
  if (Array.isArray(node)) {
    const fragment = createFallbackDevToolsFiber(Fragment, {}, parent, index);
    linkFallbackChildren(fragment, node, hostInstances);
    return fragment;
  }

  if (!isReactCompatElement(node)) {
    if (isReactCompatPortal(node)) {
      const portal = createFallbackDevToolsFiber("portal", {}, parent, index);
      portal.stateNode = node.container;
      portal.child = toFallbackDevToolsFiber(node.children, portal, 0, hostInstances);
      return portal;
    }

    return createFallbackDevToolsFiber("#text", node, parent, index);
  }

  const fiber = createFallbackDevToolsFiber(node.type, node.props, parent, index);
  fiber.key = node.key;
  fiber.ref = node.ref;
  linkFallbackChildren(fiber, getChildren(node.props.children), hostInstances);
  return fiber;
}

function linkFallbackChildren(
  parent: DevToolsFiber,
  children: readonly ReactCompatNode[],
  hostInstances: object[],
): void {
  let previous: DevToolsFiber | undefined;

  for (const [index, child] of children.entries()) {
    const childFiber = toFallbackDevToolsFiber(child, parent, index, hostInstances);

    if (childFiber === null) {
      continue;
    }

    if (previous === undefined) {
      parent.child = childFiber;
    } else {
      previous.sibling = childFiber;
    }

    previous = childFiber;
  }
}

function createFallbackDevToolsFiber(
  type: unknown,
  props: unknown,
  parent: DevToolsFiber | null,
  index: number,
): DevToolsFiber {
  const tag = type === "#text"
    ? 6
    : type === "host-root"
      ? 3
      : type === "portal"
        ? 4
        : typeof type === "string"
          ? 5
          : type === Fragment
            ? 7
            : type === Suspense
              ? 13
              : type === SuspenseList
                ? 19
                : typeof type === "function"
                  ? 0
                  : 0;

  return {
    tag,
    key: null,
    elementType: type,
    type,
    stateNode: null,
    return: parent,
    child: null,
    sibling: null,
    index,
    ref: null,
    pendingProps: props,
    memoizedProps: props,
    memoizedState: null,
    updateQueue: null,
    dependencies: null,
    mode: 0,
    flags: 0,
    subtreeFlags: 0,
    deletions: null,
    lanes: 0,
    childLanes: 0,
    alternate: null,
    actualDuration: 0,
    actualStartTime: -1,
    selfBaseDuration: 0,
    treeBaseDuration: 0,
    _debugOwner: null,
    _debugSource: null,
    _debugHookTypes: null,
  };
}

function notifyFiberUnmounts(
  hook: DevToolsHook,
  id: number,
  fiber: DevToolsFiber | null,
): void {
  let cursor = fiber;

  while (cursor !== null) {
    hook.onCommitFiberUnmount?.(id, cursor);
    notifyFiberUnmounts(hook, id, cursor.child);
    cursor = cursor.sibling;
  }
}

function clearHostInstanceFibers(root: DevToolsRoot): void {
  for (const hostInstance of rootHostInstances.get(root) ?? []) {
    hostInstanceFibers.delete(hostInstance);
  }

  rootHostInstances.delete(root);
}

function findFirstHostInstance(fiber: DevToolsFiber | null): object | null {
  if (fiber === null) {
    return null;
  }

  if (isHostInstance(fiber.stateNode)) {
    return fiber.stateNode;
  }

  let child = fiber.child;

  while (child !== null) {
    const hostInstance = findFirstHostInstance(child);

    if (hostInstance !== null) {
      return hostInstance;
    }

    child = child.sibling;
  }

  return null;
}

function collectHostInstances(
  fiber: DevToolsFiber | null,
  hostInstances: Set<object>,
): void {
  if (fiber === null) {
    return;
  }

  if (isHostInstance(fiber.stateNode)) {
    hostInstances.add(fiber.stateNode);
  }

  let child = fiber.child;

  while (child !== null) {
    collectHostInstances(child, hostInstances);
    child = child.sibling;
  }
}

function getReactFiberTag(tag: FiberTag): number {
  switch (tag) {
    case "function-component":
      return 0;
    case "class-component":
      return 1;
    case "host-root":
      return 3;
    case "portal":
      return 4;
    case "host-component":
      return 5;
    case "host-text":
      return 6;
    case "fragment":
      return 7;
    case "context-consumer":
      return 9;
    case "context-provider":
      return 10;
    case "forward-ref":
      return 11;
    case "suspense":
      return 13;
    case "memo":
      return 14;
    case "lazy":
      return 16;
    case "suspense-list":
      return 19;
    case "error-boundary":
      return 1;
  }
}

function getElementType(fiber: Fiber): unknown {
  return fiber.tag === "host-root" || fiber.tag === "host-text"
    ? null
    : fiber.type;
}

function getFiberType(fiber: Fiber): unknown {
  return fiber.tag === "host-root" || fiber.tag === "host-text"
    ? null
    : fiber.type;
}

function getFiberRef(fiber: Fiber): unknown {
  const props = (fiber.memoizedProps ?? fiber.pendingProps) as
    | { ref?: unknown }
    | undefined;

  return props?.ref ?? null;
}

function getDisplayNameForDevToolsFiber(fiber: DevToolsFiber): string | null {
  if (fiber.tag === 3) {
    return "Root";
  }

  if (fiber.tag === 6) {
    return "Text";
  }

  return getElementTypeName(fiber.elementType ?? fiber.type);
}

function isHostInstance(value: unknown): value is object {
  return (
    (typeof Element !== "undefined" && value instanceof Element) ||
    (typeof Text !== "undefined" && value instanceof Text)
  );
}

function getChildren(children: ReactCompatNode | undefined): ReactCompatNode[] {
  if (children === undefined || children === null || typeof children === "boolean") {
    return [];
  }

  return Array.isArray(children) ? children : [children];
}

function getElementTypeName(type: unknown): string | null {
  if (typeof type === "string") {
    return type;
  }

  if (typeof type === "function") {
    return type.name === "" ? "Anonymous" : type.name;
  }

  if (type === Fragment) {
    return "Fragment";
  }

  if (type === Suspense) {
    return "Suspense";
  }

  if (type === SuspenseList) {
    return "SuspenseList";
  }

  if (
    typeof type === "object" &&
    type !== null &&
    "render" in type &&
    typeof (type as { render?: unknown }).render === "function"
  ) {
    return getElementTypeName((type as { render: Function }).render);
  }

  if (
    typeof type === "object" &&
    type !== null &&
    "type" in type
  ) {
    return getElementTypeName((type as { type?: unknown }).type);
  }

  return null;
}
