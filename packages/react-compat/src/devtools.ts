import {
  Fragment,
  Suspense,
  SuspenseList,
  isReactCompatElement,
  isReactCompatPortal,
  type ReactCompatNode,
} from "./element.js";

interface DevToolsHook {
  inject?: (renderer: DevToolsRenderer) => number;
  onCommitFiberRoot?: (
    rendererId: number,
    root: DevToolsRoot,
    priorityLevel?: number,
    didError?: boolean,
  ) => void;
  onCommitFiberUnmount?: (rendererId: number, root: DevToolsRoot) => void;
}

interface DevToolsRenderer {
  bundleType: 0 | 1;
  version: string;
  rendererPackageName: string;
  findFiberByHostInstance(hostInstance: unknown): null;
}

interface DevToolsRoot {
  containerInfo: Element;
  current: DevToolsNode;
}

interface DevToolsNode {
  elementType: string;
  key: string | null;
  children: DevToolsNode[];
}

const roots = new WeakMap<Element, DevToolsRoot>();
let rendererId: number | undefined;
let injectedHook: DevToolsHook | undefined;

export function commitDevToolsRoot(
  container: Element,
  element: ReactCompatNode,
): void {
  const hook = getDevToolsHook();
  const id = injectDevToolsRenderer(hook);

  if (hook === undefined || id === undefined) {
    return;
  }

  const root = {
    containerInfo: container,
    current: toDevToolsNode(element),
  };
  roots.set(container, root);
  hook.onCommitFiberRoot?.(id, root);
}

export function unmountDevToolsRoot(container: Element): void {
  const hook = getDevToolsHook();
  const id = injectDevToolsRenderer(hook);
  const root = roots.get(container);

  if (hook === undefined || id === undefined || root === undefined) {
    return;
  }

  hook.onCommitFiberUnmount?.(id, root);
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
  rendererId = hook.inject({
    bundleType: 1,
    version: "0.0.0",
    rendererPackageName: "@modular-react/react-compat",
    findFiberByHostInstance() {
      return null;
    },
  });
  return rendererId;
}

function getDevToolsHook(): DevToolsHook | undefined {
  return (globalThis as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: DevToolsHook })
    .__REACT_DEVTOOLS_GLOBAL_HOOK__;
}

function toDevToolsNode(node: ReactCompatNode): DevToolsNode {
  if (Array.isArray(node)) {
    return {
      elementType: "Fragment",
      key: null,
      children: node.map(toDevToolsNode),
    };
  }

  if (!isReactCompatElement(node)) {
    if (isReactCompatPortal(node)) {
      return {
        elementType: "Portal",
        key: node.key,
        children: [toDevToolsNode(node.children)],
      };
    }

    return {
      elementType: "#text",
      key: null,
      children: [],
    };
  }

  return {
    elementType: getElementTypeName(node.type),
    key: node.key,
    children: getChildren(node.props.children).map(toDevToolsNode),
  };
}

function getChildren(children: ReactCompatNode | undefined): ReactCompatNode[] {
  if (children === undefined || children === null || typeof children === "boolean") {
    return [];
  }

  return Array.isArray(children) ? children : [children];
}

function getElementTypeName(type: unknown): string {
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

  return "Unknown";
}
