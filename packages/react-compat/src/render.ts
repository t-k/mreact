import {
  Fragment,
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

function renderIntoContainer(
  container: Element,
  element: unknown,
  runtime: RootRuntime,
): void {
  runtime.beginRender();

  try {
    container.replaceChildren(
      ...renderNode(element as ReactCompatNode, runtime, "0"),
    );
  } finally {
    runtime.endRender();
  }

  runtime.flushEffects();
}

function renderNode(
  node: ReactCompatNode,
  runtime: RootRuntime,
  path: string,
): Node[] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return [];
  }

  if (typeof node === "string" || typeof node === "number") {
    return [document.createTextNode(String(node))];
  }

  if (Array.isArray(node)) {
    return node.flatMap((child, index) =>
      renderNode(child, runtime, `${path}.${index}`),
    );
  }

  if (!isReactCompatElement(node)) {
    throw new Error("Invalid react-compat element.");
  }

  return renderElement(node, runtime, path);
}

function renderElement(
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
): Node[] {
  if (element.type === Fragment) {
    return renderNode(element.props.children, runtime, `${path}.f`);
  }

  const elementType = element.type;

  if (isReactCompatProvider(elementType)) {
    return renderWithContextProvider(
      elementType,
      element.props.value,
      () =>
        renderNode(
          element.props.children,
          runtime,
          `${path}.p`,
        ),
    );
  }

  if (typeof elementType === "function") {
    return renderWithRootRuntime(runtime, path, () =>
      renderNode(elementType(element.props), runtime, `${path}.0`),
    );
  }

  if (typeof elementType !== "string") {
    throw new Error("Invalid react-compat element type.");
  }

  const domElement = document.createElement(elementType);
  applyProps(domElement, element.props);
  domElement.append(...renderNode(element.props.children, runtime, `${path}.c`));
  applyRef(element.ref, domElement);
  return [domElement];
}

function applyProps(element: HTMLElement, props: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(props)) {
    if (name === "children" || name === "ref" || name === "key") {
      continue;
    }

    if (name === "className") {
      element.setAttribute("class", String(value));
      continue;
    }

    if (name === "style" && isStyleObject(value)) {
      Object.assign(element.style, value);
      continue;
    }

    if (/^on[A-Z]/.test(name) && typeof value === "function") {
      element.addEventListener(
        name.slice(2).toLowerCase(),
        value as EventListener,
      );
      continue;
    }

    if (typeof value === "boolean") {
      if (value) {
        (element as unknown as Record<string, unknown>)[name] = true;
        element.setAttribute(name, "");
      }
      continue;
    }

    if (value !== null && value !== undefined) {
      element.setAttribute(name, String(value));
    }
  }
}

function isStyleObject(value: unknown): value is Partial<CSSStyleDeclaration> {
  return typeof value === "object" && value !== null;
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
