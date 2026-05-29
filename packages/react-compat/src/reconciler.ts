import {
  Activity,
  Fragment,
  ERROR_BOUNDARY_TYPE,
  FORWARD_REF_TYPE,
  Profiler,
  Suspense,
  SuspenseList,
  LAZY_TYPE,
  MEMO_TYPE,
  STRICT_MODE_TYPE,
  isReactCompatElement,
  isReactCompatPortal,
  type ReactCompatElement,
  type ReactCompatNode,
  type ReactCompatPortal,
} from "./element.js";
import {
  consumerContext,
  isReactCompatConsumer,
  isReactCompatProvider,
  renderWithContextProvider,
  useContext,
} from "./context.js";
import {
  clearRuntimePortalNodes,
  hasStableExternalStores,
  restoreRuntimeSnapshot,
  renderWithProfiler,
  renderWithStrictMode,
  renderWithRootRuntime,
  takeRuntimeSnapshot,
  type RootRuntime,
} from "./hooks.js";
import { commitDevToolsRoot } from "./devtools.js";
import { applyPostChildFormProps, applyProps } from "./dom-props.js";
import { syncChildNodes, syncOwnedChildNodes, syncScopedChildNodes } from "./dom-children.js";
import { setLogicalEventParent } from "./events.js";
import {
  createHostElement,
  hostElementMatches,
  isHostElement,
  namespaceForHostChildren,
  namespaceForHostElement,
  type HostNamespace,
} from "./dom-host-rules.js";
import {
  getHydrationScope,
  reportElementTextMismatch,
  reportExtraHydrationNodes,
  reportHydrationNodeTypeMismatch,
  reportMissingHydrationNode,
  reportRecoverable,
  type RenderOptions,
  withHydrationComponentStack,
} from "./hydration.js";
import {
  isClassComponentType,
  reconcileClassComponent,
  reconcileErrorBoundary,
} from "./class-component.js";
import {
  isSuspensePrimaryRenderActive,
  reconcileSuspense,
  reconcileSuspenseList,
} from "./suspense.js";
import { areMemoPropsEqual } from "./prop-comparison.js";
import type { ReconcileResult } from "./reconcile-types.js";

const nodeKeys = new WeakMap<Node, string>();
type ReconcileOptions = RenderOptions & { namespace?: HostNamespace };

interface MemoRenderState {
  props: Record<string, unknown>;
  nodeCount: number;
  instanceKeys: string[];
}

const memoRenderStates = new WeakMap<RootRuntime, Map<string, MemoRenderState>>();

export function renderIntoContainer(
  container: Element,
  element: unknown,
  runtime: RootRuntime,
  options: RenderOptions & {
    resumeId?: string;
    consumeResumeMarkers?: boolean;
  } = {},
): void {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    runtime.beginRender();
    let committed = false;

    try {
      clearRuntimePortalNodes(runtime);

      const scope = getHydrationScope(container, options.resumeId);
      const renderOptions = { ...options, eventRoot: container };
      const nodes = reconcileNodeList(
        scope.parent,
        scope.previousNodes,
        element as ReactCompatNode,
        runtime,
        "0",
        renderOptions,
      );

      if (!hasStableExternalStores(runtime)) {
        continue;
      }

      syncScopedChildNodes(scope.parent, scope.before, scope.after, nodes);

      if (options.consumeResumeMarkers === true) {
        scope.before?.parentNode?.removeChild(scope.before);
        scope.after?.parentNode?.removeChild(scope.after);
      }
      committed = true;
    } finally {
      runtime.endRender(committed);
    }

    runtime.flushEffects();
    commitDevToolsRoot(container, element as ReactCompatNode);
    return;
  }

  throw new Error("Store unstable.");
}

function reconcileNodeList(
  parent: ParentNode,
  previousNodes: readonly Node[],
  node: ReactCompatNode,
  runtime: RootRuntime,
  path: string,
  options: ReconcileOptions = {},
): Node[] {
  const result = reconcileNode(parent, previousNodes, node, runtime, path, options);
  return result.nodes;
}

function reconcileNode(
  parent: ParentNode,
  previousNodes: readonly Node[],
  node: ReactCompatNode,
  runtime: RootRuntime,
  path: string,
  options: ReconcileOptions = {},
): ReconcileResult {
  if (node === null || node === undefined || typeof node === "boolean") {
    return { nodes: [], consumed: 0 };
  }

  if (typeof node === "string" || typeof node === "number") {
    const existing = previousNodes[0];
    const text =
      existing instanceof Text ? existing : document.createTextNode("");
    if (existing === undefined) {
      reportMissingHydrationNode(options, path);
    } else if (!(existing instanceof Text)) {
      reportHydrationNodeTypeMismatch(options, path, "text", existing);
    }
    if (existing instanceof Text && existing.data !== String(node)) {
      reportRecoverable(
        options,
        "text",
        path,
        new Error("Hydration text mismatch."),
      );
    }
    text.data = String(node);
    return { nodes: [text], consumed: existing instanceof Text ? 1 : 0 };
  }

  if (Array.isArray(node)) {
    return reconcileSequence(parent, previousNodes, node, runtime, path, options);
  }

  if (!isReactCompatElement(node)) {
    if (isReactCompatPortal(node)) {
      return reconcilePortal(node, parent, runtime, path, options);
    }

    throw new Error("Invalid react-compat element.");
  }

  return reconcileElement(parent, previousNodes, node, runtime, path, options);
}

function reconcilePortal(
  portal: ReactCompatPortal,
  parent: ParentNode,
  runtime: RootRuntime,
  path: string,
  options: ReconcileOptions = {},
): ReconcileResult {
  runtime.portalContainers.add(portal.container);
  setLogicalEventParent(portal.container, parent);
  const previousNodes = Array.from(runtime.portalNodes.get(portal.container) ?? []);
  const nodes = reconcileNodeList(
    portal.container,
    previousNodes,
    portal.children,
    runtime,
    `${path}.portal`,
    { ...options, eventRoot: portal.container },
  );
  syncOwnedChildNodes(portal.container, previousNodes, nodes);
  runtime.portalNodes.set(portal.container, new Set(nodes));
  return { nodes: [], consumed: 0 };
}

function reconcileSequence(
  parent: ParentNode,
  previousNodes: readonly Node[],
  children: readonly ReactCompatNode[],
  runtime: RootRuntime,
  path: string,
  options: RenderOptions = {},
): ReconcileResult {
  const keyedNodes = collectKeyedNodes(previousNodes);
  const nodes: Node[] = [];
  let previousIndex = 0;

  children.forEach((child, index) => {
    const key = getNodeKey(child);
    const previousForChild =
      key === undefined
        ? previousNodes.slice(previousIndex)
        : keyedNodes.size === 0
          ? previousNodes.slice(previousIndex)
          : keyedNodes.get(key) === undefined
          ? []
          : [keyedNodes.get(key) as Node];
    const result = reconcileNode(
      parent,
      previousForChild,
      child,
      runtime,
      `${path}.${getNodePathSegment(child, index)}`,
      options,
    );

    if (key === undefined || keyedNodes.size === 0) {
      previousIndex += result.consumed;
    }

    for (const childNode of result.nodes) {
      if (key !== undefined) {
        nodeKeys.set(childNode, key);
      }

      nodes.push(childNode);
    }
  });

  return { nodes, consumed: nodes.length };
}

function reconcileElement(
  parent: ParentNode,
  previousNodes: readonly Node[],
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
  options: ReconcileOptions = {},
): ReconcileResult {
  if (element.type === Fragment) {
    return reconcileNode(
      parent,
      previousNodes,
      element.props.children,
      runtime,
      `${path}.f`,
      options,
    );
  }

  if (element.type === Activity) {
    const children =
      (element.props as { mode?: unknown }).mode === "hidden"
        ? null
        : element.props.children;
    return reconcileNode(
      parent,
      previousNodes,
      children,
      runtime,
      `${path}.activity`,
      options,
    );
  }

  if (element.type === Profiler) {
    return renderWithProfiler(
      runtime,
      `${path}.profiler`,
      element.props,
      () =>
        reconcileNode(
          parent,
          previousNodes,
          element.props.children,
          runtime,
          `${path}.profiler`,
          options,
        ),
    );
  }

  if (element.type === STRICT_MODE_TYPE) {
    const snapshot = takeRuntimeSnapshot(runtime);
    try {
      reconcileNode(
        parent,
        [],
        element.props.children,
        runtime,
        `${path}.strict.preview`,
        options,
      );
    } finally {
      restoreRuntimeSnapshot(runtime, snapshot);
    }

    return renderWithStrictMode(runtime, () =>
      reconcileNode(
        parent,
        previousNodes,
        element.props.children,
        runtime,
        `${path}.strict`,
        options,
      ),
    );
  }

  if (element.type === Suspense) {
    return reconcileSuspense(
      parent,
      previousNodes,
      element,
      runtime,
      path,
      options,
      reconcileNode,
    );
  }

  if (element.type === SuspenseList) {
    return reconcileSuspenseList(
      parent,
      previousNodes,
      element,
      runtime,
      path,
      options,
      reconcileNode,
      reconcileSequence,
    );
  }

  if (element.type === ERROR_BOUNDARY_TYPE) {
    return reconcileErrorBoundary(
      parent,
      previousNodes,
      element,
      runtime,
      path,
      options,
      reconcileNode,
    );
  }

  const elementType = element.type;

  if (isReactCompatProvider(elementType)) {
    return renderWithContextProvider(
      elementType,
      element.props.value,
      () =>
        reconcileNode(
          parent,
          previousNodes,
          element.props.children,
          runtime,
          `${path}.p`,
          options,
        ),
    );
  }

  if (isReactCompatConsumer(elementType)) {
    const children = element.props.children;
    const render =
      typeof children === "function"
        ? (children as (value: unknown) => ReactCompatNode)
        : () => null;
    return reconcileNode(
      parent,
      previousNodes,
      render(useContext(consumerContext(elementType))),
      runtime,
      `${path}.consumer`,
      options,
    );
  }

  if (isForwardRefType(elementType)) {
    return renderWithRootRuntime(runtime, path, () =>
      reconcileNode(
        parent,
        previousNodes,
        elementType.render(element.props, element.ref),
        runtime,
        `${path}.forwardRef`,
        options,
      ),
      elementType,
    );
  }

  if (isMemoType(elementType)) {
    const memoPath = `${path}.memo`;
    const memoStates = getMemoRenderStates(runtime);
    const previousMemoState = memoStates.get(memoPath);

    if (
      previousMemoState !== undefined &&
      previousNodes.length >= previousMemoState.nodeCount &&
      !hasDirtyInstance(runtime, previousMemoState.instanceKeys) &&
      areMemoPropsEqual(elementType, previousMemoState.props, element.props)
    ) {
      markActiveInstanceKeys(runtime, previousMemoState.instanceKeys);
      return {
        nodes: previousNodes.slice(0, previousMemoState.nodeCount),
        consumed: previousMemoState.nodeCount,
      };
    }

    const result = reconcileElement(
      parent,
      previousNodes,
      {
        ...element,
        type: elementType.type,
      },
      runtime,
      memoPath,
      options,
    );
    memoStates.set(memoPath, {
      props: { ...element.props },
      nodeCount: result.nodes.length,
      instanceKeys: collectInstanceKeys(runtime, memoPath),
    });
    return result;
  }

  if (isLazyType(elementType)) {
    if (elementType.status === "resolved" && elementType.resolved !== undefined) {
      return reconcileElement(
        parent,
        previousNodes,
        { ...element, type: elementType.resolved },
        runtime,
        `${path}.lazy`,
        options,
      );
    }

    if (elementType.status === "rejected") {
      throw elementType.error;
    }

    if (elementType.status === "uninitialized") {
      elementType.status = "pending";
      elementType.promise = elementType
        .load()
        .then((module) => {
          elementType.status = "resolved";
          elementType.resolved = module.default;
          runtime.rerender();
        })
        .catch((error: unknown) => {
          elementType.status = "rejected";
          elementType.error = error;
          runtime.rerender();
        });
    }

    if (isSuspensePrimaryRenderActive()) {
      throw elementType.promise;
    }

    return { nodes: [], consumed: 0 };
  }

  if (isClassComponentType(elementType)) {
    return reconcileClassComponent(
      parent,
      previousNodes,
      elementType,
      element.props,
      runtime,
      path,
      options,
      reconcileNode,
      (instance) => {
        applyRef(element.ref, instance);
      },
    );
  }

  if (typeof elementType === "function") {
    const functionComponent = elementType as (
      props: Record<string, unknown>,
    ) => ReactCompatNode;
    return renderWithRootRuntime(runtime, path, () =>
      reconcileNode(
        parent,
        previousNodes,
        functionComponent(element.props),
        runtime,
        `${path}.0`,
        withHydrationComponentStack(options, getComponentName(functionComponent)),
      ),
      functionComponent,
    );
  }

  if (typeof elementType !== "string") {
    throw new Error("Invalid react-compat element type.");
  }

  const elementNamespace = namespaceForHostElement(options.namespace ?? "html", elementType);
  const childNamespace = namespaceForHostChildren(elementNamespace, elementType);
  const existing = previousNodes[0];
  if (existing === undefined) {
    reportMissingHydrationNode(options, path);
  } else if (!isHostElement(existing)) {
    reportHydrationNodeTypeMismatch(options, path, `<${elementType}>`, existing);
  }
  if (
    isHostElement(existing) &&
    !hostElementMatches(existing, elementType, elementNamespace)
  ) {
    reportRecoverable(
      options,
      "tag",
      path,
      new Error(
        `Hydration tag mismatch: expected <${elementType}> but found <${existing.tagName.toLowerCase()}>.`,
      ),
    );
    reportElementTextMismatch(options, `${path}.c`, existing, element.props.children);
  }
  const domElement =
    isHostElement(existing) &&
    hostElementMatches(existing, elementType, elementNamespace)
      ? existing
      : createHostElement(document, elementType, options.namespace ?? "html");

  applyProps(domElement, element.props, path, {
    ...options,
    preserveHydrationAttributes:
      options.hydration !== undefined &&
      isHostElement(existing) &&
      hostElementMatches(existing, elementType, elementNamespace),
  });
  const previousChildNodes = Array.from(domElement.childNodes);
  const childResult = reconcileNode(
    domElement,
    previousChildNodes,
    element.props.children,
    runtime,
    `${path}.c`,
    { ...options, namespace: childNamespace },
  );
  reportExtraHydrationNodes(
    options,
    `${path}.c`,
    previousChildNodes,
    childResult.consumed,
  );
  if (!shouldPreserveContentEditableChildren(domElement, element.props, childResult.nodes)) {
    syncChildNodes(domElement, childResult.nodes);
  }
  applyPostChildFormProps(domElement, element.props);
  applyRef(element.ref, domElement);
  return { nodes: [domElement], consumed: existing === undefined ? 0 : 1 };
}

function shouldPreserveContentEditableChildren(
  element: Element,
  props: Record<string, unknown>,
  childNodes: readonly Node[],
): boolean {
  void childNodes;

  if (
    !element.hasAttribute("contenteditable") ||
    element.getAttribute("contenteditable") === "false"
  ) {
    return false;
  }

  const children = props.children;
  return (
    children === undefined ||
    children === null ||
    children === false ||
    (Array.isArray(children) && children.length === 0)
  );
}

function collectKeyedNodes(nodes: readonly Node[]): Map<string, Node> {
  const keyedNodes = new Map<string, Node>();

  for (const node of nodes) {
    const key = nodeKeys.get(node);

    if (key !== undefined) {
      keyedNodes.set(key, node);
    }
  }

  return keyedNodes;
}

function getNodePathSegment(node: ReactCompatNode, index: number): string {
  const key = getNodeKey(node);
  return key === undefined ? String(index) : `k:${key}`;
}

function getNodeKey(node: ReactCompatNode): string | undefined {
  return isReactCompatElement(node) && node.key !== null
    ? node.key
    : undefined;
}

function getComponentName(component: Function): string {
  return component.name === "" ? "Anonymous" : component.name;
}

function isForwardRefType(
  value: unknown,
): value is { $$typeof: typeof FORWARD_REF_TYPE; render: (props: Record<string, unknown>, ref: unknown) => ReactCompatNode } {
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

function getMemoRenderStates(runtime: RootRuntime): Map<string, MemoRenderState> {
  const existing = memoRenderStates.get(runtime);

  if (existing !== undefined) {
    return existing;
  }

  const created = new Map<string, MemoRenderState>();
  memoRenderStates.set(runtime, created);
  return created;
}

function collectInstanceKeys(runtime: RootRuntime, prefix: string): string[] {
  return Array.from(runtime.instances.keys()).filter((key) =>
    key === prefix || key.startsWith(`${prefix}.`),
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

function applyRef(ref: unknown, node: unknown): void {
  if (typeof ref === "function") {
    ref(node);
    return;
  }

  if (typeof ref === "object" && ref !== null && "current" in ref) {
    (ref as { current: unknown }).current = node;
  }
}
