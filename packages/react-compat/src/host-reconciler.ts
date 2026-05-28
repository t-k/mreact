import {
  Activity,
  ERROR_BOUNDARY_TYPE,
  FORWARD_REF_TYPE,
  Fragment,
  LAZY_TYPE,
  MEMO_TYPE,
  Profiler,
  STRICT_MODE_TYPE,
  Suspense,
  SuspenseList,
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
import { applyPostChildFormProps, applyProps } from "./dom-props.js";
import { syncChildNodes, syncScopedChildNodes } from "./dom-children.js";
import { setLogicalEventParent } from "./host-event-binder.js";
import {
  createHostElement,
  hostElementMatches,
  isHostElement,
  namespaceForHostChildren,
  namespaceForHostElement,
  type HostNamespace,
} from "./dom-host-rules.js";
import { createFiber, createWorkInProgress, type Fiber, type FiberRoot } from "./fiber.js";
import {
  renderWithRootRuntime,
  renderWithProfiler,
  renderWithStrictMode,
  runWithHostCommit,
  restoreRuntimeSnapshot,
  takeRuntimeSnapshot,
  getDevToolsHookState,
  type RootRuntime,
} from "./hooks.js";
import { isThenable } from "./thenable.js";
import {
  isClassComponentType,
  recoverClassComponentError,
  renderClassComponentWithRuntime,
} from "./class-component.js";
import { areMemoPropsEqual, getPendingProps, shallowEqual } from "./prop-comparison.js";
import {
  reportElementTextMismatch,
  reportExtraHydrationNodes,
  reportHydrationNodeTypeMismatch,
  reportMissingHydrationNode,
  reportReactSuspenseServerError,
  reportRecoverable,
  type HydrationScope,
  type RenderOptions,
  withHydrationComponentStack,
} from "./hydration.js";

interface MemoFiberState {
  props: Record<string, unknown>;
  instanceKeys: string[];
}

interface SuspenseFiberState {
  didSuspend: boolean;
}

const committedPortalContainers = new Set<Element>();

interface FiberHydrationOptions extends RenderOptions {
  previousNodes?: readonly Node[];
  resumeId?: string;
  consumeResumeMarkers?: boolean;
  namespace?: HostNamespace;
  documentRef?: Document;
}

interface FiberReconcileResult {
  fiber: Fiber | undefined;
  consumed: number;
}

interface ReactSuspenseBoundary {
  previousNodes?: Node[];
  consumed: number;
  serverError?: {
    message: string;
    componentStack?: string;
  };
}

let suspensePrimaryRenderDepth = 0;

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

  if (
    node.type === Fragment ||
    node.type === Profiler ||
    node.type === STRICT_MODE_TYPE
  ) {
    return canRenderHostFiber(node.props.children as ReactCompatNode);
  }

  if (node.type === Activity) {
    return (node.props as { mode?: unknown }).mode === "hidden"
      ? true
      : canRenderHostFiber(node.props.children as ReactCompatNode);
  }

  if (node.type === Suspense || node.type === SuspenseList) {
    return true;
  }

  if (node.type === ERROR_BOUNDARY_TYPE) {
    return true;
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

  if (isClassComponentType(node.type)) {
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
  options: FiberHydrationOptions = {},
): Fiber {
  const workInProgress = createWorkInProgress(root.current, { children: element });
  const rootDocument = root.container.ownerDocument;
  const result = reconcileHostChild(
    workInProgress,
    root.current.child,
    element,
    runtime,
    options.previousNodes === undefined ? "0" : "",
    { ...options, documentRef: options.documentRef ?? rootDocument },
  );
  workInProgress.child = result.fiber;
  workInProgress.memoizedProps = { children: element };
  return workInProgress;
}

export function renderHydratingHostFiberRoot(
  root: FiberRoot,
  element: ReactCompatNode,
  runtime: RootRuntime,
  scope: HydrationScope,
  options: FiberHydrationOptions = {},
): Fiber {
  root.hydrationState = {
    parent: scope.parent,
    nextHydratableNode: scope.previousNodes[0] ?? null,
    before: scope.before,
    after: scope.after,
    ...(options.resumeId === undefined ? {} : { resumeId: options.resumeId }),
  };
  return renderHostFiberRoot(root, element, runtime, {
    ...options,
    previousNodes: scope.previousNodes,
  });
}

export function commitHostFiberRoot(
  root: FiberRoot,
  finishedWork: Fiber,
  options: RenderOptions = {},
): void {
  runWithHostCommit(() => {
    try {
      committedPortalContainers.clear();
      const nodes = commitHostChildren(finishedWork.child, root.container, root.container, "0", options);
      syncChildNodes(root.container, nodes);
    } finally {
      committedPortalContainers.clear();
    }
  });
}

export function commitHydratingHostFiberRoot(
  root: FiberRoot,
  finishedWork: Fiber,
  scope: HydrationScope,
  options: FiberHydrationOptions = {},
): void {
  runWithHostCommit(() => {
    try {
      committedPortalContainers.clear();
      const eventRoot = root.container;
      const nodes = commitHostChildren(finishedWork.child, scope.parent, eventRoot, "", options);
      syncScopedChildNodes(scope.parent, scope.before, scope.after, nodes);
    } finally {
      committedPortalContainers.clear();
    }
  });

  if (options.consumeResumeMarkers === true) {
    scope.before?.parentNode?.removeChild(scope.before);
    scope.after?.parentNode?.removeChild(scope.after);
  }
}

function reconcileHostChild(
  parent: Fiber,
  currentFirstChild: Fiber | undefined,
  node: ReactCompatNode,
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions = {},
): FiberReconcileResult {
  const children = normalizeChildren(node);
  const existingByKey = collectExistingKeyedFibers(currentFirstChild);
  let currentUnkeyed = currentFirstChild;
  let first: Fiber | undefined;
  let previous: Fiber | undefined;
  let consumed = 0;

  children.forEach((child, index) => {
    const key = getNodeKey(child);
    const matchedCurrent =
      key === undefined ? currentUnkeyed : existingByKey.get(key);
    const previousNodes =
      options.previousNodes === undefined
        ? undefined
        : options.previousNodes.slice(consumed);
    const result = createHostFiber(
      parent,
      matchedCurrent,
      child,
      key,
      runtime,
      joinPath(path, getNodePathSegment(child, index)),
      previousNodes === undefined ? options : { ...options, previousNodes },
    );
    const fiber = result.fiber;

    if (fiber === undefined) {
      return;
    }

    if (key === undefined) {
      currentUnkeyed = currentUnkeyed?.sibling;
    }
    consumed += result.consumed;

    if (first === undefined) {
      first = fiber;
    } else if (previous !== undefined) {
      previous.sibling = fiber;
    }

    fiber.return = parent;
    fiber.sibling = undefined;
    fiber.pendingProps = getPendingProps(child);
    if (
      fiber.tag !== "memo" &&
      fiber.tag !== "function-component" &&
      fiber.tag !== "forward-ref" &&
      fiber.tag !== "profiler" &&
      fiber.tag !== "suspense" &&
      fiber.tag !== "suspense-list"
      && fiber.memoizedState === undefined
    ) {
      fiber.memoizedState = index;
    }
    previous = fiber;
  });

  return { fiber: first, consumed };
}

function createHostFiber(
  parent: Fiber,
  current: Fiber | undefined,
  node: ReactCompatNode,
  key: string | undefined,
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions = {},
): FiberReconcileResult {
  if (node === null || node === undefined || typeof node === "boolean") {
    return { fiber: undefined, consumed: 0 };
  }

  if (typeof node === "string" || typeof node === "number") {
    const existing = options.previousNodes?.[0];
    const fiber =
      current?.tag === "host-text"
        ? createWorkInProgress(current, String(node))
        : createFiber("host-text", String(node), key);
    if (existing === undefined && options.previousNodes !== undefined) {
      reportMissingHydrationNode(options, path);
    } else if (existing !== undefined && !(existing instanceof Text)) {
      reportHydrationNodeTypeMismatch(options, path, "text", existing);
    }
    fiber.stateNode =
      existing instanceof Text
        ? existing
        : current?.tag === "host-text" && current.stateNode instanceof Text
          ? current.stateNode
          : getDocumentRef(options).createTextNode("");

    if (existing instanceof Text && existing.data !== String(node)) {
      reportRecoverable(
        options,
        "text",
        path,
        new Error("Hydration text mismatch."),
      );
    }

    return { fiber, consumed: existing instanceof Text ? 1 : 0 };
  }

  if (Array.isArray(node)) {
    const fiber =
      current?.tag === "fragment"
        ? createWorkInProgress(current, node)
        : createFiber("fragment", node, key);
    const childResult = reconcileHostChild(
      fiber,
      current?.child,
      node,
      runtime,
      path,
      options,
    );
    fiber.child = childResult.fiber;
    return { fiber, consumed: childResult.consumed };
  }

  if (!isReactCompatElement(node)) {
    if (isReactCompatPortal(node)) {
      return createPortalFiber(parent, current, node, key, runtime, path, options);
    }

    return { fiber: undefined, consumed: 0 };
  }

  if (node.type === Fragment) {
    const fiber =
      current?.tag === "fragment"
        ? createWorkInProgress(current, node.props.children)
        : createFiber("fragment", node.props.children, key);
    const childResult = reconcileHostChild(
      fiber,
      current?.child,
      node.props.children as ReactCompatNode,
      runtime,
      `${path}.f`,
      options,
    );
    fiber.child = childResult.fiber;
    return { fiber, consumed: childResult.consumed };
  }

  if (node.type === Activity) {
    const children =
      (node.props as { mode?: unknown }).mode === "hidden"
        ? null
        : node.props.children;
    const fiber =
      current?.tag === "fragment"
        ? createWorkInProgress(current, children)
        : createFiber("fragment", children, key);
    fiber.type = node.type;
    const childResult = reconcileHostChild(
      fiber,
      current?.tag === "fragment" ? current.child : undefined,
      children as ReactCompatNode,
      runtime,
      `${path}.activity`,
      options,
    );
    fiber.child = childResult.fiber;
    return { fiber, consumed: childResult.consumed };
  }

  if (node.type === Profiler) {
    if (runtime === undefined) {
      return { fiber: undefined, consumed: 0 };
    }

    const fiber =
      current?.tag === "profiler" && current.type === node.type
        ? createWorkInProgress(current, node.props)
        : createFiber("profiler", node.props, key);
    fiber.type = node.type;
    const childResult = renderWithProfiler(
      runtime,
      `${path}.profiler`,
      node.props,
      () =>
        reconcileHostChild(
          fiber,
          current?.tag === "profiler" ? current.child : undefined,
          node.props.children as ReactCompatNode,
          runtime,
          `${path}.profiler`,
          options,
        ),
    );
    fiber.child = childResult.fiber;
    return { fiber, consumed: childResult.consumed };
  }

  if (node.type === STRICT_MODE_TYPE) {
    return createStrictModeFiber(current, node, key, runtime, path, options);
  }

  if (node.type === Suspense) {
    return createSuspenseFiber(current, node, key, runtime, path, options);
  }

  if (node.type === SuspenseList) {
    return createSuspenseListFiber(current, node, key, runtime, path, options);
  }

  if (node.type === ERROR_BOUNDARY_TYPE) {
    const fiber =
      current?.tag === "error-boundary"
        ? createWorkInProgress(current, node.props)
        : createFiber("error-boundary", node.props, key);
    fiber.type = node.type;

    try {
      const childResult = reconcileHostChild(
        fiber,
        current?.tag === "error-boundary" ? current.child : undefined,
        node.props.children as ReactCompatNode,
        runtime,
        `${path}.eb`,
        options,
      );
      fiber.child = childResult.fiber;
    } catch (error) {
      if (isThenable(error)) {
        throw error;
      }

      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      const onError = node.props.onError;

      if (typeof onError === "function") {
        (onError as (error: Error) => void)(normalizedError);
      }

      const fallback = node.props.fallback;
      const fallbackNode =
        typeof fallback === "function"
          ? (fallback as (error: Error) => ReactCompatNode)(normalizedError)
          : null;
      const fallbackResult = reconcileHostChild(
        fiber,
        current?.tag === "error-boundary" ? current.child : undefined,
        fallbackNode,
        runtime,
        `${path}.eb.fallback`,
        options,
      );
      fiber.child = fallbackResult.fiber;
    }
    return { fiber, consumed: options.previousNodes?.length ?? 0 };
  }

  if (isReactCompatProvider(node.type)) {
    const fiber =
      current?.tag === "context-provider" && current.type === node.type
        ? createWorkInProgress(current, node.props)
        : createFiber("context-provider", node.props, key);
    fiber.type = node.type;
    const childResult = renderWithContextProvider(node.type, node.props.value, () =>
      reconcileHostChild(
        fiber,
        current?.tag === "context-provider" ? current.child : undefined,
        node.props.children as ReactCompatNode,
        runtime,
        `${path}.provider`,
        options,
      ),
    );
    fiber.child = childResult.fiber;
    return { fiber, consumed: childResult.consumed };
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
    const childResult = reconcileHostChild(
      fiber,
      current?.tag === "context-consumer" ? current.child : undefined,
      render(useContext(node.type.context)),
      runtime,
      `${path}.consumer`,
      options,
    );
    fiber.child = childResult.fiber;
    return { fiber, consumed: childResult.consumed };
  }

  if (isForwardRefType(node.type)) {
    if (runtime === undefined) {
      return { fiber: undefined, consumed: 0 };
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
    fiber.memoizedState = getDevToolsHookState(runtime, path);
    const childOptions = withHydrationComponentStack(
      options,
      getComponentName(forwardRefType.render),
    );
    const childResult = reconcileHostChild(
      fiber,
      current?.tag === "forward-ref" ? current.child : undefined,
      rendered,
      runtime,
      `${path}.forwardRef`,
      childOptions,
    );
    fiber.child = childResult.fiber;
    return { fiber, consumed: childResult.consumed };
  }

  if (isMemoType(node.type)) {
    if (runtime === undefined) {
      return { fiber: undefined, consumed: 0 };
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
      !hasUnflushedMountEffectInstance(runtime, previousMemoState.instanceKeys) &&
      areMemoPropsEqual(memoType, previousMemoState.props, node.props)
    ) {
      markActiveInstanceKeys(runtime, previousMemoState.instanceKeys);
      fiber.child = current?.child;
      fiber.memoizedState = previousMemoState;
      return { fiber, consumed: options.previousNodes?.length ?? 0 };
    }

    const renderedElement: ReactCompatElement = {
      ...node,
      type: memoType.type,
    };
    const childResult = createHostFiber(
      fiber,
      current?.tag === "memo" ? current.child : undefined,
      renderedElement,
      key,
      runtime,
      memoPath,
      options,
    );
    fiber.child = childResult.fiber;
    fiber.memoizedState = {
      props: { ...node.props },
      instanceKeys: collectInstanceKeys(runtime, memoPath),
    };
    return { fiber, consumed: childResult.consumed };
  }

  if (isLazyType(node.type)) {
    if (runtime === undefined) {
      return { fiber: undefined, consumed: 0 };
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
      const childResult = createHostFiber(
        fiber,
        current?.tag === "lazy" ? current.child : undefined,
        renderedElement,
        key,
        runtime,
        `${path}.lazy`,
        options,
      );
      fiber.child = childResult.fiber;
      return { fiber, consumed: childResult.consumed };
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

    if (suspensePrimaryRenderDepth > 0) {
      throw lazyType.promise;
    }

    fiber.child = undefined;
    return { fiber, consumed: 0 };
  }

  if (isClassComponentType(node.type)) {
    if (runtime === undefined) {
      return { fiber: undefined, consumed: 0 };
    }

    const classType = node.type;
    const fiber =
      current?.tag === "class-component" && current.type === classType
        ? createWorkInProgress(current, node.props)
        : createFiber("class-component", node.props, key);
    fiber.type = classType;
    const previousClassChildKeys = collectInstanceKeys(runtime, `${path}.class`);
    const rendered = renderClassComponentWithRuntime(
      classType,
      node.props,
      runtime,
      path,
      { hasDirtyDescendant: hasDirtyInstance(runtime, previousClassChildKeys) },
    );
    applyRef(node.ref, rendered.kind === "skip" ? current?.stateNode : rendered.instance);

    if (rendered.kind === "skip") {
      fiber.child = current?.child;
      return { fiber, consumed: options.previousNodes?.length ?? 0 };
    }

    const childOptions = withHydrationComponentStack(
      options,
      getComponentName(classType),
    );

    try {
      const childResult = reconcileHostChild(
        fiber,
        current?.tag === "class-component" ? current.child : undefined,
        rendered.node,
        runtime,
        `${path}.class`,
        childOptions,
      );
      fiber.child = childResult.fiber;
      fiber.stateNode = rendered.instance;
    } catch (error) {
      const fallbackNode = recoverClassComponentError(
        rendered.type,
        rendered.instance,
        error,
      );

      if (fallbackNode === undefined) {
        throw error;
      }

      const fallbackResult = reconcileHostChild(
        fiber,
        current?.tag === "class-component" ? current.child : undefined,
        fallbackNode,
        runtime,
        `${path}.class.fallback`,
        childOptions,
      );
      fiber.child = fallbackResult.fiber;
    }
    return { fiber, consumed: options.previousNodes?.length ?? 0 };
  }

  if (isFunctionComponentType(node.type)) {
    if (runtime === undefined) {
      return { fiber: undefined, consumed: 0 };
    }

    const previousFunctionState =
      current?.tag === "function-component"
        ? (current.stateNode as
            | { props: Record<string, unknown>; instanceKeys: string[] }
            | undefined)
        : undefined;
    const fiber =
      current?.tag === "function-component" && current.type === node.type
        ? createWorkInProgress(current, node.props)
        : createFiber("function-component", node.props, key);
    fiber.type = node.type;

    if (
      runtime.externalStoreUpdate &&
      previousFunctionState !== undefined &&
      !hasDirtyInstance(runtime, previousFunctionState.instanceKeys) &&
      !hasUnflushedMountEffectInstance(runtime, previousFunctionState.instanceKeys) &&
      shallowEqual(previousFunctionState.props, node.props)
    ) {
      markActiveInstanceKeys(runtime, previousFunctionState.instanceKeys);
      fiber.child = current?.child;
      fiber.memoizedState = current?.memoizedState;
      fiber.stateNode = previousFunctionState;
      return { fiber, consumed: options.previousNodes?.length ?? 0 };
    }

    const rendered = renderWithRootRuntime(runtime, path, () =>
      (node.type as (props: Record<string, unknown>) => ReactCompatNode)(node.props),
    );
    fiber.memoizedState = getDevToolsHookState(runtime, path);
    const childOptions = withHydrationComponentStack(
      options,
      getComponentName(node.type as Function),
    );
    const childResult = reconcileHostChild(
      fiber,
      current?.tag === "function-component" ? current.child : undefined,
      rendered,
      runtime,
      `${path}.0`,
      childOptions,
    );
    fiber.child = childResult.fiber;
    fiber.stateNode = {
      props: { ...node.props },
      instanceKeys: collectInstanceKeys(runtime, path),
    };
    return { fiber, consumed: childResult.consumed };
  }

  if (typeof node.type !== "string") {
    return { fiber: undefined, consumed: 0 };
  }

  const elementNamespace = namespaceForHostElement(options.namespace ?? "html", node.type);
  const childNamespace = namespaceForHostChildren(elementNamespace, node.type);
  const fiber =
    current?.tag === "host-component" && current.type === node.type
      ? createWorkInProgress(current, node.props)
      : createFiber("host-component", node.props, key);
  const existing = options.previousNodes?.[0];
  const existingElement = isHostElement(existing) ? existing : undefined;
  const tagMatches =
    existingElement !== undefined &&
    hostElementMatches(existingElement, node.type, elementNamespace);

  if (existing === undefined && options.previousNodes !== undefined) {
    reportMissingHydrationNode(options, path);
  } else if (existing !== undefined && !isHostElement(existing)) {
    reportHydrationNodeTypeMismatch(options, path, `<${node.type}>`, existing);
  }

  if (existingElement !== undefined && !tagMatches) {
    reportRecoverable(
      options,
      "tag",
      path,
      new Error(
        `Hydration tag mismatch: expected <${node.type}> but found <${existingElement.tagName.toLowerCase()}>.`,
      ),
    );
    reportElementTextMismatch(options, `${path}.c`, existingElement, node.props.children);
  }

  fiber.type = node.type;
  fiber.stateNode =
    tagMatches
      ? existingElement
      : current?.tag === "host-component" &&
          current.type === node.type &&
          isHostElement(current.stateNode) &&
          hostElementMatches(current.stateNode, node.type, elementNamespace)
        ? current.stateNode
        : createHostElement(getDocumentRef(options), node.type, options.namespace ?? "html");
  fiber.hydrateExisting = tagMatches && options.previousNodes !== undefined;
  const previousChildNodes =
    tagMatches && existingElement !== undefined
      ? Array.from(existingElement.childNodes)
      : undefined;
  const childResult = reconcileHostChild(
    fiber,
    current?.tag === "host-component" ? current.child : undefined,
    node.props.children as ReactCompatNode,
    runtime,
    `${path}.c`,
    {
      ...options,
      namespace: childNamespace,
      ...(previousChildNodes === undefined ? {} : { previousNodes: previousChildNodes }),
    },
  );
  fiber.child = childResult.fiber;
  if (previousChildNodes !== undefined) {
    reportExtraHydrationNodes(options, `${path}.c`, previousChildNodes, childResult.consumed);
  }
  parent.child ??= fiber;
  return { fiber, consumed: existing === undefined ? 0 : 1 };
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
  options: RenderOptions = {},
): Node[] {
  const nodes: Node[] = [];
  let cursor = fiber;
  let index = 0;

  while (cursor !== undefined) {
    nodes.push(...commitHostFiber(cursor, parent, eventRoot, joinPath(path, String(index)), options));
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
  options: RenderOptions = {},
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

    if (!isHostElement(element)) {
      return [];
    }

    applyProps(element, fiber.pendingProps as Record<string, unknown>, path, {
      ...options,
      eventRoot,
      preserveHydrationAttributes: fiber.hydrateExisting,
    });
    applyRef((fiber.pendingProps as { ref?: unknown }).ref, element);
    const childNodes = commitHostChildren(fiber.child, element, eventRoot, `${path}.c`, options);
    if (!(childNodes.length === 0 && committedPortalContainers.has(element))) {
      syncChildNodes(element, childNodes);
    }
    applyPostChildFormProps(element, fiber.pendingProps as Record<string, unknown>);
    fiber.memoizedProps = fiber.pendingProps;
    return [element];
  }

  if (fiber.tag === "fragment") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.f`, options);
  }

  if (fiber.tag === "profiler") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.profiler`, options);
  }

  if (fiber.tag === "strict-mode") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.strict`, options);
  }

  if (fiber.tag === "suspense") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.s`, options);
  }

  if (fiber.tag === "suspense-list") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.sl`, options);
  }

  if (fiber.tag === "context-provider" || fiber.tag === "context-consumer") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.ctx`, options);
  }

  if (fiber.tag === "function-component") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.fc`, options);
  }

  if (fiber.tag === "forward-ref") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.fr`, options);
  }

  if (fiber.tag === "memo") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.memo`, options);
  }

  if (fiber.tag === "lazy") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.lazy`, options);
  }

  if (fiber.tag === "error-boundary") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.eb`, options);
  }

  if (fiber.tag === "class-component") {
    fiber.memoizedProps = fiber.pendingProps;
    return commitHostChildren(fiber.child, parent, eventRoot, `${path}.class`, options);
  }

  if (fiber.tag === "portal") {
    const container = fiber.stateNode;

    if (!(container instanceof Element)) {
      return [];
    }

    setLogicalEventParent(container, parent);
    committedPortalContainers.add(container);
    const portalEventRoot =
      eventRoot !== container && eventRoot.contains(container) ? eventRoot : container;
    const childNodes = commitHostChildren(
      fiber.child,
      container,
      portalEventRoot,
      `${path}.portal`,
      options,
    );
    syncChildNodes(container, childNodes);
    fiber.memoizedProps = fiber.pendingProps;
    return [];
  }

  return [];
}

function createSuspenseFiber(
  current: Fiber | undefined,
  element: ReactCompatElement,
  key: string | undefined,
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions = {},
): FiberReconcileResult {
  if (runtime === undefined) {
    return { fiber: undefined, consumed: 0 };
  }

  const boundary = findReactSuspenseBoundary(options.previousNodes ?? []);
  if (boundary?.serverError !== undefined) {
    reportReactSuspenseServerError(
      options,
      path,
      boundary.serverError.message,
      boundary.serverError.componentStack,
    );
  }
  const { previousNodes: _previousNodes, ...optionsWithoutPreviousNodes } = options;
  const boundaryOptions =
    boundary === undefined
      ? options
      : boundary.serverError === undefined
        ? boundary.previousNodes === undefined
          ? optionsWithoutPreviousNodes
          : { ...options, previousNodes: boundary.previousNodes }
        : optionsWithoutPreviousNodes;
  const fiber =
    current?.tag === "suspense" && current.type === element.type
      ? createWorkInProgress(current, element.props)
      : createFiber("suspense", element.props, key);
  fiber.type = element.type;

  try {
    suspensePrimaryRenderDepth += 1;
    let childResult: FiberReconcileResult;

    try {
      childResult = reconcileHostChild(
        fiber,
        current?.tag === "suspense" ? current.child : undefined,
        element.props.children as ReactCompatNode,
        runtime,
        `${path}.s`,
        boundaryOptions,
      );
    } finally {
      suspensePrimaryRenderDepth -= 1;
    }

    fiber.child = childResult.fiber;
    fiber.memoizedState = { didSuspend: false } satisfies SuspenseFiberState;
  } catch (error) {
    if (!isThenable(error)) {
      throw error;
    }

    error.then(
      () => runtime.rerender(),
      () => runtime.rerender(),
    );
    const fallbackResult = reconcileHostChild(
      fiber,
      current?.tag === "suspense" ? current.child : undefined,
      element.props.fallback as ReactCompatNode,
      runtime,
      `${path}.fallback`,
      boundaryOptions,
    );
    fiber.child = fallbackResult.fiber;
    fiber.memoizedState = { didSuspend: true } satisfies SuspenseFiberState;
  }

  return {
    fiber,
    consumed: boundary?.consumed ?? options.previousNodes?.length ?? 0,
  };
}

function createStrictModeFiber(
  current: Fiber | undefined,
  element: ReactCompatElement,
  key: string | undefined,
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions = {},
): FiberReconcileResult {
  if (runtime === undefined) {
    return { fiber: undefined, consumed: 0 };
  }

  const fiber =
    current?.tag === "strict-mode" && current.type === element.type
      ? createWorkInProgress(current, element.props)
      : createFiber("strict-mode", element.props, key);
  fiber.type = element.type;
  const snapshot = takeRuntimeSnapshot(runtime);

  try {
    createHostFiber(
      fiber,
      undefined,
      element.props.children as ReactCompatNode,
      undefined,
      runtime,
      `${path}.strict.preview`,
      options.previousNodes === undefined
        ? options
        : { ...options, previousNodes: [] },
    );
  } finally {
    restoreRuntimeSnapshot(runtime, snapshot);
  }

  const childResult = renderWithStrictMode(
    runtime,
    () =>
      reconcileHostChild(
        fiber,
        current?.tag === "strict-mode" ? current.child : undefined,
        element.props.children as ReactCompatNode,
        runtime,
        `${path}.strict`,
        options,
      ),
  );
  fiber.child = childResult.fiber;
  return { fiber, consumed: childResult.consumed };
}

function createSuspenseListFiber(
  current: Fiber | undefined,
  element: ReactCompatElement,
  key: string | undefined,
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions = {},
): FiberReconcileResult {
  if (runtime === undefined) {
    return { fiber: undefined, consumed: 0 };
  }

  const fiber =
    current?.tag === "suspense-list" && current.type === element.type
      ? createWorkInProgress(current, element.props)
      : createFiber("suspense-list", element.props, key);
  fiber.type = element.type;
  const children = normalizeChildren(element.props.children as ReactCompatNode);
  const revealOrder = element.props.revealOrder;

  if (revealOrder === "forwards") {
    const childResult = reconcileSuspenseListForwards(
      fiber,
      current?.tag === "suspense-list" ? current.child : undefined,
      children,
      runtime,
      path,
      options,
    );
    fiber.child = childResult.fiber;
    fiber.memoizedState = {
      didSuspend: hasSuspendedChild(fiber.child),
    } satisfies SuspenseFiberState;
    return { fiber, consumed: childResult.consumed };
  } else if (revealOrder === "backwards") {
    const childResult = reconcileSuspenseListBackwards(
      fiber,
      current?.tag === "suspense-list" ? current.child : undefined,
      children,
      runtime,
      path,
      options,
    );
    fiber.child = childResult.fiber;
    fiber.memoizedState = {
      didSuspend: hasSuspendedChild(fiber.child),
    } satisfies SuspenseFiberState;
    return { fiber, consumed: childResult.consumed };
  } else {
    const childResult = reconcileHostChild(
      fiber,
      current?.tag === "suspense-list" ? current.child : undefined,
      children,
      runtime,
      `${path}.sl`,
      options,
    );
    fiber.child = childResult.fiber;
    fiber.memoizedState = {
      didSuspend: hasSuspendedChild(fiber.child),
    } satisfies SuspenseFiberState;
    return { fiber, consumed: childResult.consumed };
  }
}

function reconcileSuspenseListForwards(
  parent: Fiber,
  currentFirstChild: Fiber | undefined,
  children: readonly ReactCompatNode[],
  runtime: RootRuntime,
  path: string,
  options: FiberHydrationOptions = {},
): FiberReconcileResult {
  let first: Fiber | undefined;
  let previous: Fiber | undefined;
  let consumed = 0;
  const currentByKey = collectExistingKeyedFibers(currentFirstChild);
  let currentUnkeyed = currentFirstChild;

  for (const [index, child] of children.entries()) {
    const key = getNodeKey(child);
    const current = key === undefined ? currentUnkeyed : currentByKey.get(key);
    const childOptions =
      options.previousNodes === undefined
        ? options
        : { ...options, previousNodes: options.previousNodes.slice(consumed) };
    const result = createHostFiber(
      parent,
      current,
      child,
      key,
      runtime,
      `${path}.sl.${getNodePathSegment(child, index)}`,
      childOptions,
    );
    const fiber = result.fiber;

    if (key === undefined) {
      currentUnkeyed = currentUnkeyed?.sibling;
    }
    consumed += result.consumed;

    if (fiber === undefined) {
      continue;
    }

    fiber.return = parent;
    fiber.sibling = undefined;

    if (first === undefined) {
      first = fiber;
    } else if (previous !== undefined) {
      previous.sibling = fiber;
    }

    previous = fiber;

    if (isSuspendedSuspenseFiber(fiber)) {
      break;
    }
  }

  return { fiber: first, consumed };
}

function reconcileSuspenseListBackwards(
  parent: Fiber,
  currentFirstChild: Fiber | undefined,
  children: readonly ReactCompatNode[],
  runtime: RootRuntime,
  path: string,
  options: FiberHydrationOptions = {},
): FiberReconcileResult {
  const fibers: Fiber[] = [];
  const currentByKey = collectExistingKeyedFibers(currentFirstChild);
  let consumed = 0;

  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index] as ReactCompatNode;
    const key = getNodeKey(child);
    const result = createHostFiber(
      parent,
      key === undefined ? undefined : currentByKey.get(key),
      child,
      key,
      runtime,
      `${path}.sl.${getNodePathSegment(child, index)}`,
      options.previousNodes === undefined
        ? options
        : { ...options, previousNodes: options.previousNodes.slice(consumed) },
    );
    const fiber = result.fiber;
    consumed += result.consumed;

    if (fiber === undefined) {
      continue;
    }

    fiber.return = parent;
    fiber.sibling = undefined;
    fibers.unshift(fiber);

    if (isSuspendedSuspenseFiber(fiber)) {
      break;
    }
  }

  return { fiber: linkFiberSiblings(fibers), consumed };
}

function linkFiberSiblings(fibers: readonly Fiber[]): Fiber | undefined {
  let previous: Fiber | undefined;

  for (const fiber of fibers) {
    if (previous !== undefined) {
      previous.sibling = fiber;
    }
    previous = fiber;
  }

  return fibers[0];
}

function hasSuspendedChild(fiber: Fiber | undefined): boolean {
  let cursor = fiber;

  while (cursor !== undefined) {
    if (isSuspendedSuspenseFiber(cursor)) {
      return true;
    }

    cursor = cursor.sibling;
  }

  return false;
}

function isSuspendedSuspenseFiber(fiber: Fiber): boolean {
  return (
    fiber.tag === "suspense" &&
    (fiber.memoizedState as SuspenseFiberState | undefined)?.didSuspend === true
  );
}

function findReactSuspenseBoundary(
  previousNodes: readonly Node[],
): ReactSuspenseBoundary | undefined {
  const startIndex = previousNodes.findIndex(isReactSuspenseStartComment);

  if (startIndex < 0) {
    return undefined;
  }

  let depth = 0;

  for (let index = startIndex; index < previousNodes.length; index += 1) {
    const node = previousNodes[index];

    if (isReactSuspenseStartComment(node)) {
      depth += 1;
      continue;
    }

    if (isReactSuspenseEndComment(node)) {
      depth -= 1;

      if (depth === 0) {
        const start = previousNodes[startIndex] as Comment;
        const boundaryNodes = previousNodes.slice(startIndex + 1, index);
        const boundary: ReactSuspenseBoundary = {
          consumed: index - startIndex + 1,
          ...readReactSuspenseServerError(start, boundaryNodes),
        };

        if (!isReactSuspenseErrorStartComment(start)) {
          boundary.previousNodes = isReactSuspensePendingStartComment(start)
            ? removeReactSuspensePendingTemplate(boundaryNodes)
            : boundaryNodes;
        }

        return boundary;
      }
    }
  }

  return undefined;
}

function isReactSuspenseStartComment(node: Node | undefined): node is Comment {
  return node instanceof Comment && reactSuspenseStartComments.has(node.data);
}

function isReactSuspensePendingStartComment(node: Comment): boolean {
  return node.data === "$?" || node.data === "$!";
}

function isReactSuspenseErrorStartComment(node: Comment): boolean {
  return node.data === "$!";
}

function isReactSuspenseEndComment(node: Node | undefined): node is Comment {
  return node instanceof Comment && node.data === "/$";
}

function removeReactSuspensePendingTemplate(nodes: readonly Node[]): Node[] {
  const [firstNode, ...remainingNodes] = nodes;

  return firstNode instanceof HTMLTemplateElement
    ? remainingNodes
    : [...nodes];
}

const reactSuspenseStartComments = new Set(["$", "$?", "$!"]);

function readReactSuspenseServerError(
  start: Comment,
  boundaryNodes: readonly Node[],
): { serverError: { message: string; componentStack?: string } } | {} {
  if (start.data !== "$!") {
    return {};
  }

  const template = boundaryNodes[0];
  const message =
    template instanceof HTMLTemplateElement
      ? template.getAttribute("data-msg")
      : null;
  const componentStack =
    template instanceof HTMLTemplateElement
      ? template.getAttribute("data-stck")
      : null;

  return {
    serverError: {
      message: message ?? "React Suspense server rendering error.",
      ...(componentStack === null ? {} : { componentStack }),
    },
  };
}

function createPortalFiber(
  parent: Fiber,
  current: Fiber | undefined,
  portal: ReactCompatPortal,
  key: string | undefined,
  runtime: RootRuntime | undefined,
  path: string,
  options: FiberHydrationOptions = {},
): FiberReconcileResult {
  if (runtime === undefined) {
    return { fiber: undefined, consumed: 0 };
  }

  runtime.portalContainers.add(portal.container);
  const fiber =
    current?.tag === "portal" && current.stateNode === portal.container
      ? createWorkInProgress(current, portal.children)
      : createFiber("portal", portal.children, key);
  fiber.stateNode = portal.container;
  const childResult = reconcileHostChild(
    fiber,
    current?.tag === "portal" ? current.child : undefined,
    portal.children,
    runtime,
    `${path}.portal`,
    { ...options, documentRef: portal.container.ownerDocument },
  );
  fiber.child = childResult.fiber;
  fiber.return = parent;
  return { fiber, consumed: childResult.consumed };
}

function normalizeChildren(node: ReactCompatNode): ReactCompatNode[] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return [];
  }

  return Array.isArray(node) ? node : [node];
}

function getDocumentRef(options: FiberHydrationOptions): Document {
  return options.documentRef ?? document;
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

function getComponentName(component: Function): string {
  return component.name === "" ? "Anonymous" : component.name;
}

function joinPath(path: string, segment: string): string {
  return path === "" ? segment : `${path}.${segment}`;
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

function hasUnflushedMountEffectInstance(runtime: RootRuntime, keys: readonly string[]): boolean {
  return keys.some((key) => {
    const instance = runtime.instances.get(key) as
      | { hooks?: readonly ({ kind?: string; mounted?: boolean; disposed?: boolean } | undefined)[] }
      | undefined;

    return instance?.hooks?.some(
      (slot) =>
        slot?.kind === "effect" &&
        slot.disposed !== true &&
        slot.mounted !== true,
    ) === true;
  });
}

function applyRef(ref: unknown, node: unknown): void {
  if (typeof ref === "function") {
    ref(node);
    return;
  }

  if (typeof ref === "object" && ref !== null && "current" in ref) {
    (ref as { current: unknown }).current = node;
  }
}
