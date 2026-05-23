import { createElement, Fragment } from "./element.js";
import type {
  ElementType,
  ReactCompatElement,
  ReactCompatNode,
} from "./element.js";

export { Fragment };

export type JSXEvent<
  TCurrentTarget extends EventTarget,
  TEvent extends Event = Event,
> = TEvent & {
  readonly currentTarget: TCurrentTarget;
};

export type JSXEventHandler<
  TCurrentTarget extends EventTarget,
  TEvent extends Event = Event,
> = (event: JSXEvent<TCurrentTarget, TEvent>) => unknown;

export type FormEvent<TCurrentTarget extends EventTarget = Element> = JSXEvent<
  TCurrentTarget,
  SubmitEvent
>;

export type FormEventHandler<TCurrentTarget extends EventTarget = Element> =
  JSXEventHandler<TCurrentTarget, SubmitEvent>;

export interface JSXDOMAttributes<TElement extends EventTarget> {
  children?: ReactCompatNode;
  onClick?: JSXEventHandler<TElement, MouseEvent>;
  onChange?: JSXEventHandler<TElement, Event>;
  onInput?: JSXEventHandler<TElement, InputEvent>;
  onSubmit?: JSXEventHandler<TElement, SubmitEvent>;
}

export interface JSXHTMLAttributes<TElement extends HTMLElement>
  extends JSXDOMAttributes<TElement> {
  [attributeName: string]: unknown;
}

export interface JSXIntrinsicAttributes {
  key?: unknown;
  ref?: unknown;
}

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
  const config = { ...props } as P & {
    children?: ReactCompatNode;
    key?: unknown;
    ref?: unknown;
  };
  const hasChildren = Object.hasOwn(config, "children");
  const children = config.children;

  if (key !== undefined) {
    config.key = key;
  }

  delete config.children;

  return hasChildren
    ? createElement(type, config, children)
    : createElement(type, config);
}
