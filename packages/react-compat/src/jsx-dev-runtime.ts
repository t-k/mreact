import { Fragment, jsx } from "./jsx-runtime.js";
import type {
  ElementType,
  ReactCompatElement,
  ReactCompatNode,
} from "./element.js";

export { Fragment };

export namespace JSX {
  export type Element = ReactCompatElement;

  export interface IntrinsicAttributes {
    key?: unknown;
    ref?: unknown;
  }

  export interface IntrinsicElements {
    [elementName: string]: Record<string, unknown>;
  }
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
