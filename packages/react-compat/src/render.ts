import {
  Fragment,
  Suspense,
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
): Root {
  const root = createRoot(container);
  root.render(element);
  return root;
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
): void {
  runtime.beginRender();

  try {
    const nodes = reconcileNodeList(
      container,
      Array.from(container.childNodes),
      element as ReactCompatNode,
      runtime,
      "0",
    );
    syncChildNodes(container, nodes);
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
): Node[] {
  const result = reconcileNode(parent, previousNodes, node, runtime, path);
  return result.nodes;
}

function reconcileNode(
  parent: ParentNode,
  previousNodes: readonly Node[],
  node: ReactCompatNode,
  runtime: RootRuntime,
  path: string,
): ReconcileResult {
  if (node === null || node === undefined || typeof node === "boolean") {
    return { nodes: [], consumed: 0 };
  }

  if (typeof node === "string" || typeof node === "number") {
    const existing = previousNodes[0];
    const text =
      existing instanceof Text ? existing : document.createTextNode("");
    text.data = String(node);
    return { nodes: [text], consumed: existing === undefined ? 0 : 1 };
  }

  if (Array.isArray(node)) {
    return reconcileSequence(parent, previousNodes, node, runtime, path);
  }

  if (!isReactCompatElement(node)) {
    throw new Error("Invalid react-compat element.");
  }

  return reconcileElement(parent, previousNodes, node, runtime, path);
}

function reconcileSequence(
  parent: ParentNode,
  previousNodes: readonly Node[],
  children: readonly ReactCompatNode[],
  runtime: RootRuntime,
  path: string,
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
): ReconcileResult {
  if (element.type === Fragment) {
    return reconcileNode(parent, previousNodes, element.props.children, runtime, `${path}.f`);
  }

  if (element.type === Suspense) {
    return reconcileSuspense(parent, previousNodes, element, runtime, path);
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
      ),
    );
  }

  if (typeof elementType !== "string") {
    throw new Error("Invalid react-compat element type.");
  }

  const existing = previousNodes[0];
  const domElement =
    existing instanceof HTMLElement &&
    existing.tagName.toLowerCase() === elementType
      ? existing
      : document.createElement(elementType);

  applyProps(domElement, element.props);
  const childNodes = reconcileNodeList(
    domElement,
    Array.from(domElement.childNodes),
    element.props.children,
    runtime,
    `${path}.c`,
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
): ReconcileResult {
  try {
    return reconcileNode(
      parent,
      previousNodes,
      element.props.children,
      runtime,
      `${path}.s`,
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
    );
  }
}

function syncChildNodes(parent: ParentNode, nextNodes: readonly Node[]): void {
  let cursor = parent.firstChild;

  for (const node of nextNodes) {
    if (node !== cursor) {
      parent.insertBefore(node, cursor);
    }

    cursor = node.nextSibling;
  }

  const nextSet = new Set(nextNodes);

  for (const child of Array.from(parent.childNodes)) {
    if (!nextSet.has(child)) {
      parent.removeChild(child);
    }
  }
}

function applyProps(element: HTMLElement, props: Record<string, unknown>): void {
  const previous = appliedProps.get(element) ?? {
    props: {},
    listeners: new Map<string, EventListener>(),
  };
  const nextAttributeNames = collectAttributeNames(props);

  for (const attribute of Array.from(element.attributes)) {
    if (!nextAttributeNames.has(attribute.name)) {
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
      applyAttribute(element, "class", value);
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

    applyAttribute(element, name, value);
  }

  appliedProps.set(element, { props: { ...props }, listeners: previous.listeners });
}

function applyAttribute(
  element: HTMLElement,
  name: string,
  value: unknown,
): void {
  if (value === null || value === undefined || value === false) {
    element.removeAttribute(name);
    return;
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
