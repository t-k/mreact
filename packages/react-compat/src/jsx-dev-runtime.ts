import {
  Fragment,
  REACTIVE_TEXT_BINDING_META,
  jsx,
} from "./jsx-runtime.js";
import type {
  ElementType,
  ReactCompatElement,
  ReactCompatNode,
} from "./element.js";
import type {
  JSXIntrinsicAttributes,
  JSXIntrinsicElements,
} from "./jsx-runtime.js";

export { Fragment };
export { REACTIVE_TEXT_BINDING_META };
export type {
  FormEvent,
  FormEventHandler,
  JSXEvent,
  JSXEventHandler,
  JSXHTMLAttributes,
  JSXIntrinsicAttributes,
  JSXIntrinsicElements,
} from "./jsx-runtime.js";

export namespace JSX {
  export interface Element extends ReactCompatElement {}

  export interface IntrinsicAttributes extends JSXIntrinsicAttributes {}

  export interface IntrinsicElements extends JSXIntrinsicElements {}
}

export function jsxDEV<P extends Record<string, unknown>>(
  type: ElementType<P>,
  props: (P & { children?: ReactCompatNode; key?: unknown; ref?: unknown }) | null,
  key: unknown,
  _isStaticChildren: boolean,
  _source: unknown,
  _self: unknown,
): ReactCompatElement<P> {
  return jsx(type, props, key);
}
