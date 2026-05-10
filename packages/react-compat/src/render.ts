import {
  Fragment,
  ERROR_BOUNDARY_TYPE,
  FORWARD_REF_TYPE,
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
  isReactCompatConsumer,
  isReactCompatProvider,
  renderWithContextProvider,
  useContext,
} from "./context.js";
import {
  createRootRuntime,
  flushSyncUpdates,
  renderWithRootRuntime,
  runWithEventPriority,
  useLayoutEffect,
  useRef,
  type RootRuntime,
} from "./hooks.js";
import { commitDevToolsRoot, unmountDevToolsRoot } from "./devtools.js";

export interface Root {
  render(element: ReactCompatNode): void;
  unmount(): void;
}

export interface HydrateRootOptions {
  onRecoverableError?: (
    error: Error,
    info: HydrationRecoverableErrorInfo,
  ) => void;
  resumeId?: string;
  consumeResumeMarkers?: boolean;
}

export interface StreamingHydrationRoot {
  hydrate(element: ReactCompatNode, options?: HydrateRootOptions): Root;
  dispose(): void;
}

export interface StreamingHydrationRootOptions {
  manifest?: EventHydrationManifest;
  manifestRoot?: ParentNode;
  fragmentRoot?: ParentNode;
  applyOutOfOrderFragments?: boolean;
  observeOutOfOrderFragments?: boolean;
  selectiveHydration?: SelectiveHydrationOptions;
}

export interface SelectiveHydrationOptions {
  element?: ReactCompatNode;
  options?: HydrateRootOptions | ((event: Event) => HydrateRootOptions);
  boundaries?: Record<string, SelectiveHydrationBoundary>;
}

export interface SelectiveHydrationBoundary {
  element: ReactCompatNode;
  options?: HydrateRootOptions | ((event: Event) => HydrateRootOptions);
}

export interface HydrationRecoverableErrorInfo {
  kind: "tag" | "text" | "attribute" | "node";
  path: string;
}

interface RenderOptions {
  hydration?: HydrationContext;
  eventRoot?: Element;
}

export interface EventHydrationManifest {
  version: 1;
  events: EventHydrationManifestEntry[];
}

export interface EventHydrationManifestEntry {
  id: string;
  event: string;
  handler: string;
}

interface HydrationContext {
  onRecoverableError?: HydrateRootOptions["onRecoverableError"];
}

interface ReconcileResult {
  nodes: Node[];
  consumed: number;
}

interface AppliedProps {
  props: Record<string, unknown>;
  listeners: Map<string, AppliedEventListener>;
}

interface AppliedEventListener {
  handler: (event: SyntheticEvent) => void;
}

const appliedProps = new WeakMap<HTMLElement, AppliedProps>();
const nodeKeys = new WeakMap<Node, string>();
const queuedHydrationEvents = new WeakMap<Element, QueuedHydrationEvent[]>();
const replayedEvents = new WeakSet<Event>();
const delegatedRootListeners = new WeakMap<Element, Set<string>>();
const legacyRoots = new WeakMap<Element, Root>();

interface QueuedHydrationEvent {
  target: EventTarget;
  event: Event;
}

interface MemoRenderState {
  props: Record<string, unknown>;
  nodeCount: number;
  instanceKeys: string[];
}

const memoRenderStates = new WeakMap<RootRuntime, Map<string, MemoRenderState>>();

export function createRoot(container: Element): Root {
  const runtime = createRootRuntime(() => {
    if (runtime.currentElement !== undefined) {
      renderIntoContainer(container, runtime.currentElement, runtime);
    }
  });

  return {
    render(element) {
      runtime.currentElement = element;
      renderIntoContainer(container, element, runtime);
    },
    unmount() {
      runtime.currentElement = undefined;
      runtime.dispose();
      runtime.instances.clear();
      unmountDevToolsRoot(container);
      container.replaceChildren();
    },
  };
}

export function render(element: ReactCompatNode, container: Element): void {
  const root = legacyRoots.get(container) ?? createRoot(container);
  legacyRoots.set(container, root);
  root.render(element);
}

export function flushSync<T>(callback: () => T): T {
  return flushSyncUpdates(callback);
}

export function hydrateRoot(
  container: Element,
  element: ReactCompatNode,
  options: HydrateRootOptions = {},
): Root {
  const renderOptions: RenderOptions & {
    resumeId?: string;
    consumeResumeMarkers?: boolean;
  } = {
    hydration:
      options.onRecoverableError === undefined
        ? {}
        : { onRecoverableError: options.onRecoverableError },
    ...(options.resumeId === undefined ? {} : { resumeId: options.resumeId }),
    ...(options.consumeResumeMarkers === undefined
      ? {}
      : { consumeResumeMarkers: options.consumeResumeMarkers }),
  };
  const runtime = createRootRuntime(() => {
    if (runtime.currentElement !== undefined) {
      renderIntoContainer(container, runtime.currentElement, runtime, renderOptions);
    }
  });

  const root: Root = {
    render(nextElement) {
      runtime.currentElement = nextElement;
      renderIntoContainer(container, nextElement, runtime);
    },
    unmount() {
      runtime.currentElement = undefined;
      runtime.dispose();
      runtime.instances.clear();
      unmountDevToolsRoot(container);
      container.replaceChildren();
    },
  };

  runtime.currentElement = element;
  renderIntoContainer(container, element, runtime, renderOptions);
  replayQueuedHydrationEvents(container);
  return root;
}

export function createStreamingHydrationRoot(
  container: Element,
  options: StreamingHydrationRootOptions = {},
): StreamingHydrationRoot {
  const fragmentRoot = options.fragmentRoot ?? container.ownerDocument;
  const manifestRoot = options.manifestRoot ?? fragmentRoot;
  const manifest = options.manifest ?? readEventHydrationManifest(manifestRoot);

  if (options.applyOutOfOrderFragments !== false) {
    applyStreamingHydrationFragments(fragmentRoot);
  }

  let hydratedRoot: Root | undefined;
  const hydrate = (
    element: ReactCompatNode,
    hydrateOptions: HydrateRootOptions = {},
  ): Root => {
    if (options.applyOutOfOrderFragments !== false) {
      applyStreamingHydrationFragments(fragmentRoot);
    }

    const root = hydrateRoot(container, element, hydrateOptions);
    hydratedRoot = root;
    disposeReplayCaptureOnce();
    return root;
  };
  const disposeReplayCapture = enableEventHydrationManifestReplay(
    container,
    manifest,
    {
      onCapturedEvent(event, target) {
        const selectiveHydration = options.selectiveHydration;
        const selectiveBoundary = resolveSelectiveHydrationBoundary(
          container,
          event,
          target,
          manifest,
          selectiveHydration,
        );

        if (selectiveBoundary === undefined || hydratedRoot !== undefined) {
          return;
        }

        hydrate(
          selectiveBoundary.element,
          resolveSelectiveHydrationOptions(event, selectiveBoundary),
        );
      },
    },
  );
  const observer =
    options.observeOutOfOrderFragments === true &&
    typeof MutationObserver !== "undefined" &&
    fragmentRoot instanceof Node
      ? new MutationObserver(() => {
          applyStreamingHydrationFragments(fragmentRoot);
        })
      : undefined;
  let replayDisposed = false;

  observer?.observe(fragmentRoot as Node, { childList: true, subtree: true });

  const disposeReplayCaptureOnce = (): void => {
    if (!replayDisposed) {
      disposeReplayCapture();
      replayDisposed = true;
    }
  };

  return {
    hydrate,
    dispose() {
      disposeReplayCaptureOnce();
      observer?.disconnect();
    },
  };
}

function resolveSelectiveHydrationBoundary(
  container: Element,
  event: Event,
  target: EventTarget,
  manifest: EventHydrationManifest | undefined,
  selectiveHydration: SelectiveHydrationOptions | undefined,
): SelectiveHydrationBoundary | undefined {
  if (selectiveHydration === undefined) {
    return undefined;
  }

  const resumeId = resolveSelectiveHydrationResumeId(
    container,
    event,
    target,
    manifest,
  );
  const boundary =
    resumeId === undefined ? undefined : selectiveHydration.boundaries?.[resumeId];

  if (boundary !== undefined && resumeId !== undefined) {
    return {
      element: boundary.element,
      options: boundary.options ?? { resumeId, consumeResumeMarkers: true },
    };
  }

  if (selectiveHydration.element === undefined) {
    return undefined;
  }

  return {
    element: selectiveHydration.element,
    ...(selectiveHydration.options === undefined
      ? {}
      : { options: selectiveHydration.options }),
  };
}

function resolveSelectiveHydrationOptions(
  event: Event,
  boundary: SelectiveHydrationBoundary,
): HydrateRootOptions {
  return typeof boundary.options === "function"
    ? boundary.options(event)
    : boundary.options ?? {};
}

function resolveSelectiveHydrationResumeId(
  container: Element,
  event: Event,
  target: EventTarget,
  manifest: EventHydrationManifest | undefined,
): string | undefined {
  if (!(target instanceof Node) || manifest === undefined) {
    return undefined;
  }

  const containingResumeId = findContainingResumeBoundaryId(container, target);

  if (containingResumeId === undefined) {
    return undefined;
  }

  return manifest.events.some(
    (entry) =>
      entry.event === event.type &&
      getManifestResumeId(entry.id) === containingResumeId,
  )
    ? containingResumeId
    : undefined;
}

function getManifestResumeId(id: string): string {
  return id.split(":")[0] ?? id;
}

export function applyStreamingHydrationFragments(
  root: ParentNode = document,
): void {
  const fragments = Array.from(
    root.querySelectorAll<HTMLTemplateElement>(
      "template[data-mreact-oob-fragment]",
    ),
  );

  for (const fragment of fragments) {
    const id = fragment.dataset.mreactOobFragment;

    if (id === undefined) {
      continue;
    }

    const placeholder = root.querySelector<HTMLTemplateElement>(
      `template[data-mreact-oob-placeholder="${escapeSelectorString(id)}"]`,
    );

    if (placeholder === null) {
      continue;
    }

    placeholder.replaceWith(fragment.content.cloneNode(true));
    fragment.remove();
  }
}

export function queueHydrationEvent(
  container: Element,
  event: Event,
  target: EventTarget,
): void {
  if (
    !allowedReplayEventTypes.has(event.type) ||
    !(target instanceof Node) ||
    !container.contains(target)
  ) {
    return;
  }

  const events = queuedHydrationEvents.get(container) ?? [];
  events.push({ event, target });
  queuedHydrationEvents.set(container, events);
}

export function enableHydrationEventReplay(container: Element): () => void {
  return enableHydrationEventReplayForTypes(container, allowedReplayEventTypes);
}

export function readEventHydrationManifest(
  root: ParentNode = document,
): EventHydrationManifest | undefined {
  const script = root.querySelector<HTMLScriptElement>(
    "script[data-mreact-event-manifest]",
  );

  if (script === null) {
    return undefined;
  }

  const value = JSON.parse(script.textContent ?? "") as EventHydrationManifest;

  if (value.version !== 1 || !Array.isArray(value.events)) {
    return undefined;
  }

  return value;
}

export function enableEventHydrationManifestReplay(
  container: Element,
  manifest: EventHydrationManifest | undefined,
  options: HydrationEventReplayOptions = {},
): () => void {
  if (manifest === undefined) {
    return () => undefined;
  }

  const eventTypes = new Set(
    manifest.events
      .map((event) => event.event)
      .filter((event) => allowedReplayEventTypes.has(event)),
  );

  return enableHydrationEventReplayForTypes(container, eventTypes, options);
}

interface HydrationEventReplayOptions {
  onCapturedEvent?: (event: Event, target: EventTarget) => void;
}

function enableHydrationEventReplayForTypes(
  container: Element,
  eventTypes: Iterable<string>,
  options: HydrationEventReplayOptions = {},
): () => void {
  const listeners = Array.from(eventTypes, (type) => {
    const listener = (event: Event): void => {
      if (replayedEvents.has(event) || !(event.target instanceof Node)) {
        return;
      }

      const replayEvent = cloneReplayableEvent(event);
      queueHydrationEvent(container, replayEvent, event.target);
      options.onCapturedEvent?.(replayEvent, event.target);
      event.stopImmediatePropagation();
      event.preventDefault();
    };

    container.addEventListener(type, listener, true);
    return { type, listener };
  });

  return () => {
    for (const { type, listener } of listeners) {
      container.removeEventListener(type, listener, true);
    }
  };
}

export function unmountComponentAtNode(container: Element): boolean {
  const root = legacyRoots.get(container);

  if (root !== undefined) {
    root.unmount();
    legacyRoots.delete(container);
    return true;
  }

  const hadChildren = container.childNodes.length > 0;
  container.replaceChildren();
  return hadChildren;
}

function renderIntoContainer(
  container: Element,
  element: unknown,
  runtime: RootRuntime,
  options: RenderOptions & {
    resumeId?: string;
    consumeResumeMarkers?: boolean;
  } = {},
): void {
  runtime.beginRender();
  let committed = false;

  try {
    for (const portalContainer of runtime.portalContainers) {
      portalContainer.replaceChildren();
    }
    runtime.portalContainers.clear();

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
}

function reconcileNodeList(
  parent: ParentNode,
  previousNodes: readonly Node[],
  node: ReactCompatNode,
  runtime: RootRuntime,
  path: string,
  options: RenderOptions = {},
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
  options: RenderOptions = {},
): ReconcileResult {
  if (node === null || node === undefined || typeof node === "boolean") {
    return { nodes: [], consumed: 0 };
  }

  if (typeof node === "string" || typeof node === "number") {
    const existing = previousNodes[0];
    const text =
      existing instanceof Text ? existing : document.createTextNode("");
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
      return reconcilePortal(node, runtime, path, options);
    }

    throw new Error("Invalid react-compat element.");
  }

  return reconcileElement(parent, previousNodes, node, runtime, path, options);
}

function reconcilePortal(
  portal: ReactCompatPortal,
  runtime: RootRuntime,
  path: string,
  options: RenderOptions = {},
): ReconcileResult {
  runtime.portalContainers.add(portal.container);
  const nodes = reconcileNodeList(
    portal.container,
    Array.from(portal.container.childNodes),
    portal.children,
    runtime,
    `${path}.portal`,
    options,
  );
  syncChildNodes(portal.container, nodes);
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
  options: RenderOptions = {},
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

    return reconcileNode(
      parent,
      previousNodes,
      element.props.children,
      runtime,
      `${path}.strict`,
      options,
    );
  }

  if (element.type === Suspense) {
    return reconcileSuspense(parent, previousNodes, element, runtime, path, options);
  }

  if (element.type === SuspenseList) {
    return reconcileSuspenseList(parent, previousNodes, element, runtime, path, options);
  }

  if (element.type === ERROR_BOUNDARY_TYPE) {
    return reconcileErrorBoundary(parent, previousNodes, element, runtime, path, options);
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
      render(useContext(elementType.context)),
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
        options,
      ),
    );
  }

  if (typeof elementType !== "string") {
    throw new Error("Invalid react-compat element type.");
  }

  const existing = previousNodes[0];
  if (
    existing instanceof HTMLElement &&
    existing.tagName.toLowerCase() !== elementType
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
    existing instanceof HTMLElement &&
    existing.tagName.toLowerCase() === elementType
      ? existing
      : document.createElement(elementType);

  applyProps(domElement, element.props, path, options);
  const previousChildNodes = Array.from(domElement.childNodes);
  const childResult = reconcileNode(
    domElement,
    previousChildNodes,
    element.props.children,
    runtime,
    `${path}.c`,
    options,
  );
  reportExtraHydrationNodes(
    options,
    `${path}.c`,
    previousChildNodes,
    childResult.consumed,
  );
  syncChildNodes(domElement, childResult.nodes);
  applyRef(element.ref, domElement);
  return { nodes: [domElement], consumed: existing === undefined ? 0 : 1 };
}

interface RuntimeSnapshot {
  instanceKeys: Set<string>;
  portalContainers: Set<Element>;
  pendingInsertionEffectsLength: number;
  pendingLayoutEffectsLength: number;
  pendingEffectsLength: number;
  idCounter: number;
}

function takeRuntimeSnapshot(runtime: RootRuntime): RuntimeSnapshot {
  return {
    instanceKeys: new Set(runtime.instances.keys()),
    portalContainers: new Set(runtime.portalContainers),
    pendingInsertionEffectsLength: runtime.pendingInsertionEffects.length,
    pendingLayoutEffectsLength: runtime.pendingLayoutEffects.length,
    pendingEffectsLength: runtime.pendingEffects.length,
    idCounter: runtime.idCounter,
  };
}

function restoreRuntimeSnapshot(
  runtime: RootRuntime,
  snapshot: RuntimeSnapshot,
): void {
  runtime.pendingInsertionEffects.length = snapshot.pendingInsertionEffectsLength;
  runtime.pendingLayoutEffects.length = snapshot.pendingLayoutEffectsLength;
  runtime.pendingEffects.length = snapshot.pendingEffectsLength;
  runtime.idCounter = snapshot.idCounter;

  for (const key of runtime.instances.keys()) {
    if (!snapshot.instanceKeys.has(key)) {
      runtime.instances.delete(key);
    }
  }

  for (const container of runtime.portalContainers) {
    if (!snapshot.portalContainers.has(container)) {
      container.replaceChildren();
    }
  }

  runtime.portalContainers.clear();
  for (const container of snapshot.portalContainers) {
    runtime.portalContainers.add(container);
  }
}

function reconcileSuspense(
  parent: ParentNode,
  previousNodes: readonly Node[],
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
  options: RenderOptions = {},
): ReconcileResult {
  const boundary = findReactSuspenseBoundary(previousNodes);
  const boundaryPreviousNodes = boundary?.previousNodes ?? previousNodes;

  try {
    return consumeReactSuspenseBoundary(
      boundary,
      parent,
      reconcileNode(
        parent,
        boundaryPreviousNodes,
        element.props.children,
        runtime,
        `${path}.s`,
        options,
      ),
    );
  } catch (error) {
    if (!isThenable(error)) {
      throw error;
    }

    error.then(runtime.rerender, runtime.rerender);
    return consumeReactSuspenseBoundary(
      boundary,
      parent,
      reconcileNode(
        parent,
        boundaryPreviousNodes,
        element.props.fallback as ReactCompatNode,
        runtime,
        `${path}.fallback`,
        options,
      ),
    );
  }
}

interface ReactSuspenseBoundary {
  start: Comment;
  end: Comment;
  previousNodes: Node[];
  consumed: number;
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

        return {
          start,
          end: node,
          previousNodes: isReactSuspensePendingStartComment(start)
            ? removeReactSuspensePendingTemplate(boundaryNodes)
            : boundaryNodes,
          consumed: index - startIndex + 1,
        };
      }
    }
  }

  return undefined;
}

function consumeReactSuspenseBoundary(
  boundary: ReactSuspenseBoundary | undefined,
  parent: ParentNode,
  result: ReconcileResult,
): ReconcileResult {
  if (boundary === undefined) {
    return result;
  }

  syncScopedChildNodes(parent, boundary.start, boundary.end, result.nodes);
  boundary.start.parentNode?.removeChild(boundary.start);
  boundary.end.parentNode?.removeChild(boundary.end);
  return { nodes: result.nodes, consumed: boundary.consumed };
}

function isReactSuspenseStartComment(node: Node | undefined): node is Comment {
  return node instanceof Comment && reactSuspenseStartComments.has(node.data);
}

function isReactSuspensePendingStartComment(node: Comment): boolean {
  return node.data === "$?" || node.data === "$!";
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

function reconcileSuspenseList(
  parent: ParentNode,
  previousNodes: readonly Node[],
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
  options: RenderOptions = {},
): ReconcileResult {
  if (
    element.props.revealOrder !== "forwards" &&
    element.props.revealOrder !== "backwards" &&
    element.props.revealOrder !== "together"
  ) {
    return reconcileNode(
      parent,
      previousNodes,
      element.props.children,
      runtime,
      `${path}.sl`,
      options,
    );
  }

  const children = Array.isArray(element.props.children)
    ? element.props.children
    : [element.props.children];

  if (element.props.revealOrder === "together") {
    return reconcileSequence(parent, previousNodes, children, runtime, `${path}.sl`, options);
  }

  const nodes: Node[] = [];
  let previousIndex = 0;

  if (element.props.revealOrder === "backwards") {
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index] as ReactCompatNode;
      const result = reconcileNode(
        parent,
        previousNodes.slice(previousIndex),
        child,
        runtime,
        `${path}.sl.${index}`,
        options,
      );
      nodes.unshift(...result.nodes);
      previousIndex += result.consumed;

      if (isSuspenseFallback(child, result.nodes)) {
        break;
      }
    }

    return { nodes, consumed: previousIndex };
  }

  for (const [index, child] of children.entries()) {
    const result = reconcileNode(
      parent,
      previousNodes.slice(previousIndex),
      child,
      runtime,
      `${path}.sl.${index}`,
      options,
    );
    nodes.push(...result.nodes);
    previousIndex += result.consumed;

    if (isSuspenseFallback(child, result.nodes)) {
      break;
    }
  }

  return { nodes, consumed: previousIndex };
}

interface ClassComponentInstance {
  props: Record<string, unknown>;
  state?: Record<string, unknown>;
  setState?: (
    partial:
      | Record<string, unknown>
      | ((
          previousState: Record<string, unknown>,
          props: Record<string, unknown>,
        ) => Record<string, unknown> | null),
    callback?: () => void,
  ) => void;
  render(): ReactCompatNode;
  componentDidMount?: () => void;
  componentDidUpdate?: (
    previousProps: Record<string, unknown>,
    previousState: Record<string, unknown>,
  ) => void;
  componentWillUnmount?: () => void;
  componentDidCatch?: (error: Error, info: { componentStack: string }) => void;
}

interface ClassComponentType {
  new (props: Record<string, unknown>): ClassComponentInstance;
  getDerivedStateFromError?: (error: Error) => Record<string, unknown> | null;
}

interface ClassLifecycleSnapshot {
  previousState?: Record<string, unknown>;
}

const classLifecycleSnapshots = new WeakMap<
  ClassComponentInstance,
  ClassLifecycleSnapshot
>();

function reconcileClassComponent(
  parent: ParentNode,
  previousNodes: readonly Node[],
  type: ClassComponentType,
  props: Record<string, unknown>,
  runtime: RootRuntime,
  path: string,
  options: RenderOptions,
): ReconcileResult {
  return renderWithRootRuntime(runtime, path, () => {
    const instanceRef = useRef<ClassComponentInstance | undefined>(undefined);
    const instance =
      instanceRef.current !== undefined && instanceRef.current instanceof type
        ? instanceRef.current
        : new type(props);
    const didCommitRef = useRef(false);
    const previousProps = instance.props;
    const snapshot = classLifecycleSnapshots.get(instance);
    const previousState = snapshot?.previousState ?? instance.state ?? {};

    instanceRef.current = instance;
    installClassSetState(instance, runtime);
    instance.props = props;
    installClassLifecycleEffects(
      instance,
      didCommitRef,
      previousProps,
      previousState,
    );

    try {
      return reconcileNode(
        parent,
        previousNodes,
        instance.render(),
        runtime,
        `${path}.class`,
        options,
      );
    } catch (error) {
      if (isThenable(error) || !isErrorBoundaryClass(type, instance)) {
        throw error;
      }

      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      const derivedState = type.getDerivedStateFromError?.(normalizedError);

      if (derivedState !== undefined && derivedState !== null) {
        instance.state = {
          ...instance.state,
          ...derivedState,
        };
      }

      instance.componentDidCatch?.(normalizedError, { componentStack: "" });

      return reconcileNode(
        parent,
        previousNodes,
        instance.render(),
        runtime,
        `${path}.class.fallback`,
        options,
      );
    }
  });
}

function installClassSetState(
  instance: ClassComponentInstance,
  runtime: RootRuntime,
): void {
  instance.setState = (partial, callback): void => {
    const previousState = instance.state ?? {};
    if (!classLifecycleSnapshots.has(instance)) {
      classLifecycleSnapshots.set(instance, { previousState });
    }
    const nextPartial =
      typeof partial === "function"
        ? partial(previousState, instance.props)
        : partial;

    if (nextPartial !== null) {
      instance.state = {
        ...previousState,
        ...nextPartial,
      };
    }

    runtime.rerender();
    callback?.call(instance);
  };
}

function installClassLifecycleEffects(
  instance: ClassComponentInstance,
  didCommitRef: { current: boolean },
  previousProps: Record<string, unknown> | undefined,
  previousState: Record<string, unknown>,
): void {
  useLayoutEffect(() => {
    if (didCommitRef.current) {
      instance.componentDidUpdate?.(previousProps ?? {}, previousState);
    } else {
      didCommitRef.current = true;
      instance.componentDidMount?.();
    }

    classLifecycleSnapshots.delete(instance);
  });

  useLayoutEffect(() => {
    return () => {
      instance.componentWillUnmount?.();
      classLifecycleSnapshots.delete(instance);
    };
  }, []);
}

function isClassComponentType(value: unknown): value is ClassComponentType {
  return (
    typeof value === "function" &&
    typeof (value as { prototype?: { render?: unknown } }).prototype?.render ===
      "function"
  );
}

function isErrorBoundaryClass(
  type: ClassComponentType,
  instance: ClassComponentInstance,
): boolean {
  return (
    typeof type.getDerivedStateFromError === "function" ||
    typeof instance.componentDidCatch === "function"
  );
}

function reconcileErrorBoundary(
  parent: ParentNode,
  previousNodes: readonly Node[],
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
  options: RenderOptions = {},
): ReconcileResult {
  try {
    return reconcileNode(
      parent,
      previousNodes,
      element.props.children,
      runtime,
      `${path}.eb`,
      options,
    );
  } catch (error) {
    if (isThenable(error)) {
      throw error;
    }

    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    const onError = element.props.onError;

    if (typeof onError === "function") {
      (onError as (error: Error) => void)(normalizedError);
    }

    const fallback = element.props.fallback;
    const fallbackNode =
      typeof fallback === "function"
        ? (fallback as (error: Error) => ReactCompatNode)(normalizedError)
        : null;

    return reconcileNode(
      parent,
      previousNodes,
      fallbackNode,
      runtime,
      `${path}.eb.fallback`,
      options,
    );
  }
}

function isSuspenseFallback(
  node: ReactCompatNode,
  renderedNodes: readonly Node[],
): boolean {
  return (
    isReactCompatElement(node) &&
    node.type === Suspense &&
    renderedNodes.some((renderedNode) =>
      renderedNode instanceof Element &&
      renderedNode.tagName.toLowerCase() === getFallbackTagName(node),
    )
  );
}

function getFallbackTagName(node: ReactCompatElement): string | undefined {
  const fallback = node.props.fallback;

  return isReactCompatElement(fallback) && typeof fallback.type === "string"
    ? fallback.type
    : undefined;
}

function syncChildNodes(parent: ParentNode, nextNodes: readonly Node[]): void {
  syncScopedChildNodes(parent, null, null, nextNodes);
}

function syncScopedChildNodes(
  parent: ParentNode,
  before: ChildNode | null,
  after: ChildNode | null,
  nextNodes: readonly Node[],
): void {
  let cursor = parent.firstChild;

  if (before !== null) {
    cursor = before.nextSibling;
  }

  for (const node of nextNodes) {
    if (node !== cursor) {
      parent.insertBefore(node, cursor === after ? after : cursor);
    }

    cursor = node.nextSibling;
  }

  const nextSet = new Set(nextNodes);

  for (const child of collectScopedNodes(parent, before, after)) {
    if (!nextSet.has(child)) {
      parent.removeChild(child);
    }
  }
}

function applyProps(
  element: HTMLElement,
  props: Record<string, unknown>,
  path: string,
  options: RenderOptions,
): void {
  const previous: AppliedProps = appliedProps.get(element) ?? {
    props: {},
    listeners: new Map<string, AppliedEventListener>(),
  };
  const nextAttributeNames = collectAttributeNames(props);

  for (const attribute of Array.from(element.attributes)) {
    if (!nextAttributeNames.has(attribute.name)) {
      reportRecoverable(
        options,
        "attribute",
        path,
        new Error(`Hydration attribute mismatch: ${attribute.name}.`),
      );
      element.removeAttribute(attribute.name);
    }
  }

  for (const [name, appliedListener] of previous.listeners) {
    const nextValue = props[name];

    if (nextValue !== appliedListener.handler) {
      previous.listeners.delete(name);
    }
  }

  for (const [name, value] of Object.entries(props)) {
    if (name === "children" || name === "ref" || name === "key") {
      continue;
    }

    if (name === "className") {
      applyAttribute(element, "class", value, path, options);
      continue;
    }

    if (name === "htmlFor") {
      applyAttribute(element, "for", value, path, options);
      continue;
    }

    if (name === "style") {
      applyStyle(element, previous.props[name], value, path, options);
      continue;
    }

    if (/^on[A-Z]/.test(name) && typeof value === "function") {
      if (previous.listeners.get(name)?.handler === value) {
        continue;
      }

      const handler = value as (event: SyntheticEvent) => void;
      for (const eventName of toEventNames(name)) {
        ensureDelegatedEventListener(options.eventRoot ?? element, eventName);
      }
      previous.listeners.set(name, { handler });
      continue;
    }

    if (typeof value === "boolean") {
      const attributeName = toDomAttributeName(name);
      if (element.hasAttribute(attributeName) !== value) {
        reportRecoverable(
          options,
          "attribute",
          path,
          new Error(`Hydration attribute mismatch: ${attributeName}.`),
        );
      }
      (element as unknown as Record<string, unknown>)[name] = value;

      if (value) {
        element.setAttribute(attributeName, "");
      } else {
        element.removeAttribute(attributeName);
      }
      continue;
    }

    applyAttribute(element, toDomAttributeName(name), value, path, options);
  }

  appliedProps.set(element, { props: { ...props }, listeners: previous.listeners });
}

function applyAttribute(
  element: HTMLElement,
  name: string,
  value: unknown,
  path: string,
  options: RenderOptions,
): void {
  if (value === null || value === undefined || value === false) {
    if (element.hasAttribute(name)) {
      reportRecoverable(
        options,
        "attribute",
        path,
        new Error(`Hydration attribute mismatch: ${name}.`),
      );
    }
    element.removeAttribute(name);
    return;
  }

  if (element.getAttribute(name) !== String(value)) {
    reportRecoverable(
      options,
      "attribute",
      path,
      new Error(`Hydration attribute mismatch: ${name}.`),
    );
  }

  element.setAttribute(name, String(value));
}

function applyStyle(
  element: HTMLElement,
  previousStyle: unknown,
  nextStyle: unknown,
  path: string,
  options: RenderOptions,
): void {
  if (isStyleObject(previousStyle)) {
    for (const name of Object.keys(previousStyle)) {
      element.style.removeProperty(name);
    }
  } else if (element.hasAttribute("style")) {
    reportRecoverable(
      options,
      "attribute",
      path,
      new Error("Hydration attribute mismatch: style."),
    );
    element.removeAttribute("style");
  }

  if (isStyleObject(nextStyle)) {
    Object.assign(element.style, nextStyle);
    return;
  }

  element.removeAttribute("style");
}

function collectAttributeNames(props: Record<string, unknown>): Set<string> {
  const names = new Set<string>();

  for (const [name, value] of Object.entries(props)) {
    if (
      name === "children" ||
      name === "ref" ||
      name === "key" ||
      /^on[A-Z]/.test(name) ||
      value === false ||
      value === null ||
      value === undefined
    ) {
      continue;
    }

    names.add(toDomAttributeName(name));
  }

  return names;
}

function toDomAttributeName(name: string): string {
  if (name === "className") {
    return "class";
  }

  if (name === "htmlFor") {
    return "for";
  }

  return name;
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

interface HydrationScope {
  parent: ParentNode;
  previousNodes: Node[];
  before: ChildNode | null;
  after: ChildNode | null;
}

const allowedReplayEventTypes = new Set(["click", "input", "change", "submit"]);

function getHydrationScope(
  container: Element,
  resumeId: string | undefined,
): HydrationScope {
  if (resumeId === undefined) {
    return {
      parent: container,
      previousNodes: Array.from(container.childNodes),
      before: null,
      after: null,
    };
  }

  const encodedId = encodeURIComponent(resumeId);
  const start = findComment(container, `mreact-h:start:${encodedId}`);
  const end =
    start === null ? null : findFollowingComment(start, `mreact-h:end:${encodedId}`);

  if (start === null || end === null || start.parentNode === null) {
    return {
      parent: container,
      previousNodes: Array.from(container.childNodes),
      before: null,
      after: null,
    };
  }

  return {
    parent: start.parentNode,
    previousNodes: collectScopedNodes(start.parentNode, start, end),
    before: start,
    after: end,
  };
}

function findContainingResumeBoundaryId(
  root: ParentNode,
  target: Node,
): string | undefined {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const stack: string[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;

    if (!(node instanceof Comment)) {
      continue;
    }

    const startId = readResumeMarkerId(node.data, "mreact-h:start:");

    if (startId !== undefined) {
      stack.push(startId);
      continue;
    }

    if (node.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_PRECEDING) {
      break;
    }

    const endId = readResumeMarkerId(node.data, "mreact-h:end:");

    if (endId !== undefined) {
      const lastIndex = stack.lastIndexOf(endId);

      if (lastIndex >= 0) {
        stack.length = lastIndex;
      }
    }
  }

  return stack.at(-1);
}

function readResumeMarkerId(
  value: string,
  prefix: "mreact-h:start:" | "mreact-h:end:",
): string | undefined {
  return value.startsWith(prefix)
    ? decodeURIComponent(value.slice(prefix.length))
    : undefined;
}

function collectScopedNodes(
  parent: ParentNode,
  before: ChildNode | null,
  after: ChildNode | null,
): Node[] {
  const nodes: Node[] = [];
  let cursor = before === null ? parent.firstChild : before.nextSibling;

  while (cursor !== null && cursor !== after) {
    nodes.push(cursor);
    cursor = cursor.nextSibling;
  }

  return nodes;
}

function findComment(root: ParentNode, value: string): Comment | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);

  while (walker.nextNode()) {
    const node = walker.currentNode;

    if (node instanceof Comment && node.data === value) {
      return node;
    }
  }

  return null;
}

function findFollowingComment(start: Comment, value: string): Comment | null {
  let cursor: Node | null = start.nextSibling;

  while (cursor !== null) {
    if (cursor instanceof Comment && cursor.data === value) {
      return cursor;
    }

    cursor = cursor.nextSibling;
  }

  return null;
}

function escapeSelectorString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function reportRecoverable(
  options: RenderOptions,
  kind: HydrationRecoverableErrorInfo["kind"],
  path: string,
  error: Error,
): void {
  options.hydration?.onRecoverableError?.(error, { kind, path });
}

function reportElementTextMismatch(
  options: RenderOptions,
  path: string,
  existing: HTMLElement,
  children: ReactCompatNode,
): void {
  if (
    (typeof children === "string" || typeof children === "number") &&
    existing.textContent !== String(children)
  ) {
    reportRecoverable(
      options,
      "text",
      path,
      new Error("Hydration text mismatch."),
    );
  }
}

function reportExtraHydrationNodes(
  options: RenderOptions,
  path: string,
  previousNodes: readonly Node[],
  consumed: number,
): void {
  if (consumed >= previousNodes.length) {
    return;
  }

  reportRecoverable(
    options,
    "node",
    path,
    new Error("Hydration extra node mismatch."),
  );
}

function replayQueuedHydrationEvents(container: Element): void {
  const events = queuedHydrationEvents.get(container) ?? [];
  queuedHydrationEvents.delete(container);

  for (const { event, target } of events) {
    replayedEvents.add(event);
    target.dispatchEvent(event);
  }
}

function cloneReplayableEvent(event: Event): Event {
  const init = {
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    composed: event.composed,
  };

  if (typeof MouseEvent !== "undefined" && event instanceof MouseEvent) {
    return new MouseEvent(event.type, {
      ...init,
      button: event.button,
      buttons: event.buttons,
      clientX: event.clientX,
      clientY: event.clientY,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    });
  }

  if (typeof InputEvent !== "undefined" && event instanceof InputEvent) {
    return new InputEvent(event.type, {
      ...init,
      data: event.data,
      inputType: event.inputType,
    });
  }

  return new Event(event.type, init);
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

function toEventNames(propName: string): string[] {
  const rawName = propName.slice(2);
  const eventName = rawName.endsWith("Capture")
    ? rawName.slice(0, -"Capture".length).toLowerCase()
    : rawName.toLowerCase();

  if (eventName === "doubleclick") {
    return ["dblclick"];
  }

  if (eventName === "focus") {
    return ["focusin"];
  }

  if (eventName === "blur") {
    return ["focusout"];
  }

  if (eventName === "mouseenter") {
    return ["mouseover"];
  }

  if (eventName === "mouseleave") {
    return ["mouseout"];
  }

  if (eventName === "change") {
    return ["change", "input"];
  }

  return [eventName];
}

function toEventPropNames(eventName: string): string[] {
  if (eventName === "dblclick") {
    return ["onDoubleClick"];
  }

  if (eventName === "focusin") {
    return ["onFocus"];
  }

  if (eventName === "focusout") {
    return ["onBlur"];
  }

  if (eventName === "input") {
    return ["onChange"];
  }

  if (eventName === "mouseover") {
    return ["onMouseOver"];
  }

  if (eventName === "mouseout") {
    return ["onMouseOut"];
  }

  if (eventName === "mousemove") {
    return ["onMouseMove"];
  }

  if (eventName === "mousedown") {
    return ["onMouseDown"];
  }

  if (eventName === "mouseup") {
    return ["onMouseUp"];
  }

  if (eventName === "pointermove") {
    return ["onPointerMove"];
  }

  if (eventName === "pointerdown") {
    return ["onPointerDown"];
  }

  if (eventName === "pointerup") {
    return ["onPointerUp"];
  }

  if (eventName === "keydown") {
    return ["onKeyDown"];
  }

  if (eventName === "keyup") {
    return ["onKeyUp"];
  }

  const propName = `on${eventName.slice(0, 1).toUpperCase()}${eventName.slice(1)}`;
  return [propName];
}

function getEventPriority(
  eventName: string,
): "discrete" | "continuous" | "default" {
  if (discreteEventNames.has(eventName)) {
    return "discrete";
  }

  if (continuousEventNames.has(eventName)) {
    return "continuous";
  }

  return "default";
}

const discreteEventNames = new Set([
  "beforeinput",
  "change",
  "click",
  "dblclick",
  "focusin",
  "focusout",
  "input",
  "keydown",
  "keyup",
  "mousedown",
  "mouseup",
  "pointerdown",
  "pointerup",
  "submit",
  "touchcancel",
  "touchend",
  "touchstart",
]);

const continuousEventNames = new Set([
  "drag",
  "dragenter",
  "dragleave",
  "dragover",
  "mousemove",
  "mouseout",
  "mouseover",
  "pointermove",
  "pointerout",
  "pointerover",
  "scroll",
  "touchmove",
  "wheel",
]);

function ensureDelegatedEventListener(root: Element, eventName: string): void {
  const listeners = delegatedRootListeners.get(root) ?? new Set<string>();

  if (listeners.has(eventName)) {
    return;
  }

  listeners.add(eventName);
  delegatedRootListeners.set(root, listeners);
  root.addEventListener(eventName, (event) => {
    runWithEventPriority(getEventPriority(eventName), () => {
      dispatchDelegatedEvent(root, eventName, event);
    });
  });
}

function dispatchDelegatedEvent(
  root: Element,
  eventName: string,
  event: Event,
): void {
  const path = getEventPath(root, event);
  const propNames = toEventPropNames(eventName);
  const state = {
    defaultPrevented: event.defaultPrevented,
    propagationStopped: false,
  };

  for (let index = path.length - 1; index >= 0; index -= 1) {
    const target = path[index] as HTMLElement;
    dispatchEventPropNames(propNames, "capture", event, target, state);

    if (state.propagationStopped) {
      return;
    }
  }

  if (eventName === "mouseover") {
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const target = path[index] as HTMLElement;
      dispatchMouseTransitionEvent("onMouseEnter", event, target, state);

      if (state.propagationStopped) {
        return;
      }
    }
  }

  if (eventName === "mouseout") {
    for (const target of path) {
      dispatchMouseTransitionEvent("onMouseLeave", event, target, state);

      if (state.propagationStopped) {
        return;
      }
    }
  }

  for (const target of path) {
    dispatchEventPropNames(propNames, "bubble", event, target, state);

    if (state.propagationStopped) {
      return;
    }
  }
}

function dispatchEventPropNames(
  propNames: readonly string[],
  phase: "capture" | "bubble",
  event: Event,
  target: HTMLElement,
  state: { defaultPrevented: boolean; propagationStopped: boolean },
): void {
  for (const propName of propNames) {
    const listenerName = phase === "capture" ? `${propName}Capture` : propName;
    const handler = appliedProps.get(target)?.listeners.get(listenerName)?.handler;

    if (handler !== undefined) {
      handler(createSyntheticEvent(event, target, state));
    }

    if (state.propagationStopped) {
      return;
    }
  }
}

function dispatchMouseTransitionEvent(
  propName: "onMouseEnter" | "onMouseLeave",
  event: Event,
  target: HTMLElement,
  state: { defaultPrevented: boolean; propagationStopped: boolean },
): void {
  if (isInternalMouseTransition(event, target)) {
    return;
  }

  const handler = appliedProps.get(target)?.listeners.get(propName)?.handler;

  if (handler !== undefined) {
    handler(createSyntheticEvent(event, target, state));
  }
}

function isInternalMouseTransition(event: Event, target: HTMLElement): boolean {
  const relatedTarget =
    event instanceof MouseEvent && event.relatedTarget instanceof Node
      ? event.relatedTarget
      : null;

  return relatedTarget !== null && target.contains(relatedTarget);
}

function getEventPath(root: Element, event: Event): HTMLElement[] {
  const path: HTMLElement[] = [];
  let cursor = event.target instanceof Node ? event.target : null;

  while (cursor !== null) {
    if (cursor instanceof HTMLElement) {
      path.push(cursor);
    }

    if (cursor === root) {
      break;
    }

    cursor = cursor.parentNode;
  }

  return path;
}

interface SyntheticEvent {
  nativeEvent: Event;
  type: string;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  preventDefault(): void;
  stopPropagation(): void;
  isDefaultPrevented(): boolean;
  isPropagationStopped(): boolean;
}

function createSyntheticEvent(
  nativeEvent: Event,
  currentTarget: EventTarget,
  state: { defaultPrevented: boolean; propagationStopped: boolean } = {
    defaultPrevented: nativeEvent.defaultPrevented,
    propagationStopped: false,
  },
): SyntheticEvent {
  return {
    nativeEvent,
    type: nativeEvent.type,
    target: nativeEvent.target,
    currentTarget,
    preventDefault() {
      state.defaultPrevented = true;
      nativeEvent.preventDefault();
    },
    stopPropagation() {
      state.propagationStopped = true;
      nativeEvent.stopPropagation();
    },
    isDefaultPrevented() {
      return state.defaultPrevented;
    },
    isPropagationStopped() {
      return state.propagationStopped;
    },
  };
}

function isStyleObject(value: unknown): value is Partial<CSSStyleDeclaration> {
  return typeof value === "object" && value !== null;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
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

  return previousKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(next, key) &&
    Object.is(previous[key], next[key]),
  );
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

function applyRef(ref: unknown, node: Node): void {
  if (typeof ref === "function") {
    ref(node);
    return;
  }

  if (typeof ref === "object" && ref !== null && "current" in ref) {
    (ref as { current: Node | null }).current = node;
  }
}
