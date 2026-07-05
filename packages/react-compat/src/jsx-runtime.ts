import { installCompatRenderValueNormalizer } from "@reckona/mreact-reactive-dom/compat-normalize";
import {
  createElementFromJsxConfig,
  Fragment,
  REACTIVE_DOM_BLOCK_TYPE,
  REACTIVE_STATE_BINDING_META,
  REACTIVE_TEXT_BINDING_META,
} from "./element.js";
import type {
  ElementType,
  ReactiveDomBlockProps,
  ReactiveDomBlockRender,
  ReactCompatElement,
  ReactCompatNode,
} from "./element.js";

installCompatRenderValueNormalizer();

/** Fragment marker used by the automatic JSX runtime. */
export { Fragment };
/** Metadata key used by compiled JSX for reactive text bindings. */
export { REACTIVE_TEXT_BINDING_META };
export { REACTIVE_STATE_BINDING_META };

export function createReactiveDomBlock<P extends object = Record<string, unknown>>(
  render: ReactiveDomBlockRender<P>,
  blockProps?: P,
): ReactCompatElement<ReactiveDomBlockProps> {
  const props: ReactiveDomBlockProps = { render: render as ReactiveDomBlockRender };
  if (blockProps !== undefined) {
    props.blockProps = blockProps as Record<string, unknown>;
  }
  return createElementFromJsxConfig(REACTIVE_DOM_BLOCK_TYPE, props);
}

/** DOM event type with a narrowed currentTarget. */
export type JSXEvent<
  TCurrentTarget extends EventTarget,
  TEvent extends Event = Event,
> = TEvent & {
  readonly currentTarget: TCurrentTarget;
};

/** Event handler type used by JSX DOM attributes. */
export type JSXEventHandler<
  TCurrentTarget extends EventTarget,
  TEvent extends Event = Event,
> = (event: JSXEvent<TCurrentTarget, TEvent>) => unknown;

/** Submit event type used by form-related JSX attributes. */
export type FormEvent<TCurrentTarget extends EventTarget = Element> = JSXEvent<
  TCurrentTarget,
  SubmitEvent
>;

/** Submit event handler type used by form-related JSX attributes. */
export type FormEventHandler<TCurrentTarget extends EventTarget = Element> =
  JSXEventHandler<TCurrentTarget, SubmitEvent>;

/** DOM event attributes accepted by JSX elements. */
export interface JSXDOMAttributes<TElement extends EventTarget> {
  children?: ReactCompatNode;
  onClick?: JSXEventHandler<TElement, MouseEvent>;
  onChange?: JSXEventHandler<TElement, Event>;
  onInput?: JSXEventHandler<TElement, InputEvent>;
  onSubmit?: JSXEventHandler<TElement, SubmitEvent>;
}

/** HTML attributes accepted by JSX host elements. */
export interface JSXHTMLAttributes<TElement extends HTMLElement>
  extends JSXDOMAttributes<TElement> {
  [attributeName: string]: unknown;
}

/** Attributes accepted by every JSX element. */
export interface JSXIntrinsicAttributes {
  key?: unknown;
  ref?: unknown;
}

/** Built-in JSX element names and their attribute types. */
export interface JSXIntrinsicElements {
  form: JSXHTMLAttributes<HTMLFormElement> & {
    onSubmit?: JSXEventHandler<HTMLFormElement, SubmitEvent>;
  };
  input: JSXHTMLAttributes<HTMLInputElement>;
  button: JSXHTMLAttributes<HTMLButtonElement>;
  textarea: JSXHTMLAttributes<HTMLTextAreaElement>;
  select: JSXHTMLAttributes<HTMLSelectElement>;
  option: JSXHTMLAttributes<HTMLOptionElement>;
  a: JSXHTMLAttributes<HTMLAnchorElement>;
  img: JSXHTMLAttributes<HTMLImageElement>;
  main: JSXHTMLAttributes<HTMLElement>;
  div: JSXHTMLAttributes<HTMLDivElement>;
  span: JSXHTMLAttributes<HTMLSpanElement>;
  [elementName: string]: Record<string, unknown>;
}

/** JSX namespace exported by the automatic JSX runtime. */
export namespace JSX {
  export interface Element extends ReactCompatElement {}

  export interface IntrinsicAttributes extends JSXIntrinsicAttributes {}

  export interface IntrinsicElements extends JSXIntrinsicElements {}
}

declare global {
  namespace JSX {
    interface Element extends ReactCompatElement {}
    interface IntrinsicAttributes extends JSXIntrinsicAttributes {}
    interface IntrinsicElements extends JSXIntrinsicElements {}
  }
}

/** Creates a single-child JSX element for the automatic JSX runtime. */
export function jsx<P extends object>(
  type: ElementType<P>,
  props: (P & { children?: ReactCompatNode; key?: unknown; ref?: unknown }) | null,
  key?: unknown,
): ReactCompatElement<P> {
  return createElementFromJsx(type, props, key);
}

/** Creates a multi-child JSX element for the automatic JSX runtime. */
export function jsxs<P extends object>(
  type: ElementType<P>,
  props: (P & { children?: ReactCompatNode; key?: unknown; ref?: unknown }) | null,
  key?: unknown,
): ReactCompatElement<P> {
  return createElementFromJsx(type, props, key);
}

function createElementFromJsx<P extends object>(
  type: ElementType<P>,
  props: (P & { children?: ReactCompatNode; key?: unknown; ref?: unknown }) | null,
  key: unknown,
): ReactCompatElement<P> {
  return createElementFromJsxConfig(type, props, key);
}
