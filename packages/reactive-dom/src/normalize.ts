import { applyDomProp } from "./dom-prop-application.js";
import { registerDispose } from "./scope.js";
import type { RenderValue } from "./types.js";

const REACT_COMPAT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
const REACT_COMPAT_FRAGMENT_TYPE = Symbol.for("react.fragment");
const REACTIVE_DOM_BLOCK_TYPE = Symbol.for("modular.react.reactive_dom_block");
const maxRenderValueDepth = 256;

export function normalizeRenderValue(value: RenderValue, depth = 0): Node[] {
  if (depth > maxRenderValueDepth) {
    throw new Error(`mreact render value is too deep: exceeded ${maxRenderValueDepth} levels`);
  }

  if (value === null || value === undefined || typeof value === "boolean") {
    return [];
  }

  if (typeof value === "string" || typeof value === "number") {
    return [document.createTextNode(String(value))];
  }

  if (typeof DocumentFragment !== "undefined" && value instanceof DocumentFragment) {
    return Array.from(value.childNodes);
  }

  if (value instanceof Node) {
    return [value];
  }

  if (isCompatElement(value)) {
    return normalizeCompatElement(value, depth + 1);
  }

  const nodes: Node[] = [];

  if (!isIterable(value)) {
    return [document.createTextNode(String(value))];
  }

  for (const item of value as Iterable<RenderValue>) {
    nodes.push(...normalizeRenderValue(item, depth + 1));
  }

  return nodes;
}

interface CompatElement {
  $$typeof: symbol;
  type: unknown;
  props?: Record<string, unknown> | undefined;
}

function isCompatElement(value: unknown): value is CompatElement {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === REACT_COMPAT_ELEMENT_TYPE
  );
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function"
  );
}

function normalizeCompatElement(element: CompatElement, depth: number): Node[] {
  const props = element.props ?? {};

  if (element.type === REACT_COMPAT_FRAGMENT_TYPE) {
    return normalizeRenderValue(props.children as RenderValue, depth + 1);
  }

  if (element.type === REACTIVE_DOM_BLOCK_TYPE) {
    const render = props.render;

    if (typeof render !== "function") {
      return [];
    }

    const result = (render as (props: Record<string, unknown>) => {
      node?: ChildNode | undefined;
      dispose?: (() => void) | undefined;
    })(props.blockProps as Record<string, unknown>);

    if (result.dispose !== undefined) {
      registerDispose(result.dispose);
    }

    return result.node === undefined ? [] : [result.node];
  }

  if (typeof element.type === "function") {
    return normalizeRenderValue(
      (element.type as (props: Record<string, unknown>) => RenderValue)(props),
      depth + 1,
    );
  }

  if (typeof element.type !== "string") {
    return [];
  }

  const node = document.createElement(element.type);

  applyCompatElementProps(node, props);

  for (const child of normalizeRenderValue(props.children as RenderValue, depth + 1)) {
    node.appendChild(child);
  }

  return [node];
}

function applyCompatElementProps(
  node: HTMLElement,
  props: Record<string, unknown>,
): void {
  for (const [name, value] of Object.entries(props)) {
    if (
      name === "children" ||
      name === "key" ||
      name === "ref" ||
      value === null ||
      value === undefined ||
      value === false
    ) {
      continue;
    }

    if (/^on[A-Z]/.test(name) && typeof value === "function") {
      node.addEventListener(name.slice(2).toLowerCase(), value as EventListener);
      continue;
    }

    applyDomProp(node, name, value, { preferProperty: true });
  }
}
