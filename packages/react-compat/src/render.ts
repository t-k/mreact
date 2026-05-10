import {
  Fragment,
  ERROR_BOUNDARY_TYPE,
  Suspense,
  SuspenseList,
  isReactCompatElement,
  type ReactCompatElement,
  type ReactCompatNode,
} from "./element.js";
import {
  isReactCompatProvider,
  renderWithContextProvider,
} from "./context.js";
import {
  createRootRuntime,
  renderWithRootRuntime,
  type RootRuntime,
} from "./hooks.js";

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
}

export interface HydrationRecoverableErrorInfo {
  kind: "tag" | "text" | "attribute";
  path: string;
}

interface RenderOptions {
  hydration?: HydrationContext;
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
  listeners: Map<string, EventListener>;
}

const appliedProps = new WeakMap<HTMLElement, AppliedProps>();
const nodeKeys = new WeakMap<Node, string>();
const queuedHydrationEvents = new WeakMap<Element, QueuedHydrationEvent[]>();

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
      container.replaceChildren();
    },
  };
}

export function render(element: ReactCompatNode, container: Element): void {
  createRoot(container).render(element);
}

export function hydrateRoot(
  container: Element,
  element: ReactCompatNode,
  options: HydrateRootOptions = {},
): Root {
  const runtime = createRootRuntime(() => {
    if (runtime.currentElement !== undefined) {
      renderIntoContainer(container, runtime.currentElement, runtime);
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
      container.replaceChildren();
    },
  };

  runtime.currentElement = element;
  const renderOptions: RenderOptions & { resumeId?: string } = {
    hydration:
      options.onRecoverableError === undefined
        ? {}
        : { onRecoverableError: options.onRecoverableError },
    ...(options.resumeId === undefined ? {} : { resumeId: options.resumeId }),
  };
  renderIntoContainer(container, element, runtime, renderOptions);
  replayQueuedHydrationEvents(container);
  return root;
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

export function unmountComponentAtNode(container: Element): boolean {
  const hadChildren = container.childNodes.length > 0;
  container.replaceChildren();
  return hadChildren;
}

function renderIntoContainer(
  container: Element,
  element: unknown,
  runtime: RootRuntime,
  options: RenderOptions & { resumeId?: string } = {},
): void {
  runtime.beginRender();

  try {
    const scope = getHydrationScope(container, options.resumeId);
    const nodes = reconcileNodeList(
      scope.parent,
      scope.previousNodes,
      element as ReactCompatNode,
      runtime,
      "0",
      options,
    );
    syncScopedChildNodes(scope.parent, scope.before, scope.after, nodes);
  } finally {
    runtime.endRender();
  }

  runtime.flushEffects();
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
    throw new Error("Invalid react-compat element.");
  }

  return reconcileElement(parent, previousNodes, node, runtime, path, options);
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

  if (typeof elementType === "function") {
    return renderWithRootRuntime(runtime, path, () =>
      reconcileNode(
        parent,
        previousNodes,
        elementType(element.props),
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
  if (element.props.revealOrder !== "forwards") {
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
  const nodes: Node[] = [];
  let previousIndex = 0;

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
  const previous = appliedProps.get(element) ?? {
    props: {},
    listeners: new Map<string, EventListener>(),
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

  for (const [name, listener] of previous.listeners) {
    const nextValue = props[name];

    if (nextValue !== listener) {
      element.removeEventListener(toEventName(name), listener);
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
      const listener = value as EventListener;
      element.addEventListener(toEventName(name), listener);
      previous.listeners.set(name, listener);
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
    target.dispatchEvent(event);
  }
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
  return propName.slice(2).toLowerCase();
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

function applyRef(ref: unknown, node: Node): void {
  if (typeof ref === "function") {
    ref(node);
    return;
  }

  if (typeof ref === "object" && ref !== null && "current" in ref) {
    (ref as { current: Node | null }).current = node;
  }
}
