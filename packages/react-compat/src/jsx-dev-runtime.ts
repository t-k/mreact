import {
  createReactiveDomBlock,
  Fragment,
  REACTIVE_STATE_BINDING_META,
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

/** Fragment marker used by the development JSX runtime. */
export { Fragment };
/** Metadata key used by compiled JSX for reactive text bindings. */
export { REACTIVE_TEXT_BINDING_META };
export { REACTIVE_STATE_BINDING_META };
export { createReactiveDomBlock };
/** JSX event and attribute types re-exported by the development JSX runtime. */
export type {
  FormEvent,
  FormEventHandler,
  JSXDOMAttributes,
  JSXEvent,
  JSXEventHandler,
  JSXHTMLAttributes,
  JSXIntrinsicAttributes,
  JSXIntrinsicElements,
} from "./jsx-runtime.js";
export type {
  ElementType,
  ForwardRefType,
  LazyType,
  MemoType,
  ReactiveDomBlockResult,
  ReactiveDomBlockProps,
  ReactiveDomBlockRender,
  ReactCompatContextProviderShorthand,
  ReactCompatElement,
  ReactCompatNode,
  ReactCompatPortal,
  ReactCompatProviderType,
  ReactCompatRenderableElement,
} from "./element.js";

/** JSX namespace exported by the development JSX runtime. */
export namespace JSX {
  export interface Element extends ReactCompatElement {}

  export interface IntrinsicAttributes extends JSXIntrinsicAttributes {}

  export interface IntrinsicElements extends JSXIntrinsicElements {}
}

/** Creates a JSX element with development metadata arguments. */
export function jsxDEV<P extends object>(
  type: ElementType<P>,
  props: (P & { children?: ReactCompatNode; key?: unknown; ref?: unknown }) | null,
  key: unknown,
  _isStaticChildren: boolean,
  _source: unknown,
  _self: unknown,
): ReactCompatElement<P> {
  return jsx(type, props, key);
}
