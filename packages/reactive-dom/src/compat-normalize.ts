import { applyDomProp } from "./dom-prop-application.js";
import { isEventLikePropName } from "@reckona/mreact-shared";
import { normalizeRenderValue, registerRenderValueNormalizer } from "./normalize.js";
import { registerDispose } from "./scope.js";
import type { RenderValue } from "./types.js";

const REACT_COMPAT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
const REACT_COMPAT_FRAGMENT_TYPE = Symbol.for("react.fragment");
const REACTIVE_DOM_BLOCK_TYPE = Symbol.for("modular.react.reactive_dom_block");

let installed = false;

/** Installs React-compatible render value normalization for reactive DOM roots. */
export function installCompatRenderValueNormalizer(): void {
  if (installed) {
    return;
  }

  installed = true;
  registerRenderValueNormalizer(normalizeCompatRenderValue);
}

interface CompatElement {
  $$typeof: symbol;
  type: unknown;
  props?: Record<string, unknown> | undefined;
}

function normalizeCompatRenderValue(value: unknown, depth: number): Node[] | undefined {
  return isCompatElement(value) ? normalizeCompatElement(value, depth) : undefined;
}

function isCompatElement(value: unknown): value is CompatElement {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === REACT_COMPAT_ELEMENT_TYPE
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

    const result = (
      render as (props: Record<string, unknown>) => {
        node?: ChildNode | undefined;
        dispose?: (() => void) | undefined;
      }
    )(props.blockProps as Record<string, unknown>);

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

function applyCompatElementProps(node: HTMLElement, props: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(props)) {
    if (
      name === "children" ||
      name === "key" ||
      name === "ref" ||
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (isEventLikePropName(name)) {
      if (typeof value === "function") {
        node.addEventListener(name.slice(2).toLowerCase(), value as EventListener);
      }
      continue;
    }

    applyDomProp(node, name, value, true);
  }
}
