import { createElement, Fragment } from "./element.js";
import type {
  ElementType,
  ReactCompatElement,
  ReactCompatNode,
} from "./element.js";

export { Fragment };

export function jsx<P extends Record<string, unknown>>(
  type: ElementType<P>,
  props: (P & { children?: ReactCompatNode; key?: unknown; ref?: unknown }) | null,
  key?: unknown,
): ReactCompatElement<P> {
  return createElementFromJsx(type, props, key);
}

export function jsxs<P extends Record<string, unknown>>(
  type: ElementType<P>,
  props: (P & { children?: ReactCompatNode; key?: unknown; ref?: unknown }) | null,
  key?: unknown,
): ReactCompatElement<P> {
  return createElementFromJsx(type, props, key);
}

function createElementFromJsx<P extends Record<string, unknown>>(
  type: ElementType<P>,
  props: (P & { children?: ReactCompatNode; key?: unknown; ref?: unknown }) | null,
  key: unknown,
): ReactCompatElement<P> {
  const config = { ...(props ?? {}) } as P & {
    children?: ReactCompatNode;
    key?: unknown;
    ref?: unknown;
  };
  const children = config.children;

  if (key !== undefined) {
    config.key = key;
  }

  delete config.children;

  return children === undefined
    ? createElement(type, config)
    : createElement(type, config, children);
}
