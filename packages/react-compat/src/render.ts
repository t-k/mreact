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
  renderWithRootRuntime,
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
}

export interface HydrationRecoverableErrorInfo {
  kind: "tag" | "text" | "attribute";
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

interface QueuedHydrationEvent {
  target: EventTarget;
  event: Event;
}

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
  createRoot(container).render(element);
}

export function flushSync<T>(callback: () => T): T {
  return callback();
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

  if (options.applyOutOfOrderFragments !== false) {
    applyStreamingHydrationFragments(fragmentRoot);
  }

  const disposeReplayCapture = enableEventHydrationManifestReplay(
    container,
    options.manifest ?? readEventHydrationManifest(manifestRoot),
  );
  let disposed = false;

  return {
    hydrate(element, hydrateOptions = {}) {
      if (options.applyOutOfOrderFragments !== false) {
        applyStreamingHydrationFragments(fragmentRoot);
      }

      const root = hydrateRoot(container, element, hydrateOptions);
      disposeReplayCapture();
      disposed = true;
      return root;
    },
    dispose() {
      if (!disposed) {
        disposeReplayCapture();
        disposed = true;
      }
    },
  };
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
): () => void {
  if (manifest === undefined) {
    return () => undefined;
  }

  const eventTypes = new Set(
    manifest.events
      .map((event) => event.event)
      .filter((event) => allowedReplayEventTypes.has(event)),
  );

  return enableHydrationEventReplayForTypes(container, eventTypes);
}

function enableHydrationEventReplayForTypes(
  container: Element,
  eventTypes: Iterable<string>,
): () => void {
  const listeners = Array.from(eventTypes, (type) => {
    const listener = (event: Event): void => {
      if (replayedEvents.has(event) || !(event.target instanceof Node)) {
        return;
      }

      queueHydrationEvent(container, cloneReplayableEvent(event), event.target);
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
  } finally {
    runtime.endRender();
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
    return { nodes: [text], consumed: existing === undefined ? 0 : 1 };
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

    if (key === undefined) {
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
    return reconcileElement(
      parent,
      previousNodes,
      {
        ...element,
        type: elementType.type,
      },
      runtime,
      `${path}.memo`,
      options,
    );
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
  const childNodes = reconcileNodeList(
    domElement,
    Array.from(domElement.childNodes),
    element.props.children,
    runtime,
    `${path}.c`,
    options,
  );
  syncChildNodes(domElement, childNodes);
  applyRef(element.ref, domElement);
  return { nodes: [domElement], consumed: existing === undefined ? 0 : 1 };
}

interface RuntimeSnapshot {
  instanceKeys: Set<string>;
  portalContainers: Set<Element>;
  pendingInsertionEffectsLength: number;
  pendingLayoutEffectsLength: number;
  pendingEffectsLength: number;
}

function takeRuntimeSnapshot(runtime: RootRuntime): RuntimeSnapshot {
  return {
    instanceKeys: new Set(runtime.instances.keys()),
    portalContainers: new Set(runtime.portalContainers),
    pendingInsertionEffectsLength: runtime.pendingInsertionEffects.length,
    pendingLayoutEffectsLength: runtime.pendingLayoutEffects.length,
    pendingEffectsLength: runtime.pendingEffects.length,
  };
}

function restoreRuntimeSnapshot(
  runtime: RootRuntime,
  snapshot: RuntimeSnapshot,
): void {
  runtime.pendingInsertionEffects.length = snapshot.pendingInsertionEffectsLength;
  runtime.pendingLayoutEffects.length = snapshot.pendingLayoutEffectsLength;
  runtime.pendingEffects.length = snapshot.pendingEffectsLength;

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
  try {
    return reconcileNode(
      parent,
      previousNodes,
      element.props.children,
      runtime,
      `${path}.s`,
      options,
    );
  } catch (error) {
    if (!isThenable(error)) {
      throw error;
    }

    error.then(runtime.rerender, runtime.rerender);
    return reconcileNode(
      parent,
      previousNodes,
      element.props.fallback as ReactCompatNode,
      runtime,
      `${path}.fallback`,
      options,
    );
  }
}

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
  render(): ReactCompatNode;
  componentDidCatch?: (error: Error, info: { componentStack: string }) => void;
}

interface ClassComponentType {
  new (props: Record<string, unknown>): ClassComponentInstance;
  getDerivedStateFromError?: (error: Error) => Record<string, unknown> | null;
}

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
    const instance = new type(props);
    instance.props = props;

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

    if (name === "style") {
      applyStyle(element, previous.props[name], value);
      continue;
    }

    if (/^on[A-Z]/.test(name) && typeof value === "function") {
      if (previous.listeners.get(name)?.handler === value) {
        continue;
      }

      const handler = value as (event: SyntheticEvent) => void;
      ensureDelegatedEventListener(options.eventRoot ?? element, toEventName(name));
      previous.listeners.set(name, { handler });
      continue;
    }

    if (typeof value === "boolean") {
      (element as unknown as Record<string, unknown>)[name] = value;

      if (value) {
        element.setAttribute(name, "");
      } else {
        element.removeAttribute(name);
      }
      continue;
    }

    applyAttribute(element, name, value, path, options);
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
): void {
  if (isStyleObject(previousStyle)) {
    for (const name of Object.keys(previousStyle)) {
      element.style.removeProperty(name);
    }
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

    names.add(name === "className" ? "class" : name);
  }

  return names;
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

function toEventName(propName: string): string {
  const rawName = propName.slice(2);
  return rawName.endsWith("Capture")
    ? rawName.slice(0, -"Capture".length).toLowerCase()
    : rawName.toLowerCase();
}

function toEventPropName(eventName: string): string {
  const propName = `on${eventName.slice(0, 1).toUpperCase()}${eventName.slice(1)}`;
  return propName;
}

function ensureDelegatedEventListener(root: Element, eventName: string): void {
  const listeners = delegatedRootListeners.get(root) ?? new Set<string>();

  if (listeners.has(eventName)) {
    return;
  }

  listeners.add(eventName);
  delegatedRootListeners.set(root, listeners);
  root.addEventListener(eventName, (event) => {
    dispatchDelegatedEvent(root, eventName, event);
  });
}

function dispatchDelegatedEvent(
  root: Element,
  eventName: string,
  event: Event,
): void {
  const path = getEventPath(root, event);
  const propName = toEventPropName(eventName);
  const capturePropName = `${propName}Capture`;
  const state = {
    defaultPrevented: event.defaultPrevented,
    propagationStopped: false,
  };

  for (let index = path.length - 1; index >= 0; index -= 1) {
    const target = path[index] as HTMLElement;
    const handler = appliedProps.get(target)?.listeners.get(capturePropName)?.handler;

    if (handler !== undefined) {
      handler(createSyntheticEvent(event, target, state));
    }

    if (state.propagationStopped) {
      return;
    }
  }

  for (const target of path) {
    const handler = appliedProps.get(target)?.listeners.get(propName)?.handler;

    if (handler !== undefined) {
      handler(createSyntheticEvent(event, target, state));
    }

    if (state.propagationStopped) {
      return;
    }
  }
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
): value is { $$typeof: typeof MEMO_TYPE; type: ReactCompatElement["type"] } {
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

function applyRef(ref: unknown, node: Node): void {
  if (typeof ref === "function") {
    ref(node);
    return;
  }

  if (typeof ref === "object" && ref !== null && "current" in ref) {
    (ref as { current: Node | null }).current = node;
  }
}
