export * from "@reckona/mreact-compat";
export { default } from "./react-default.js";

import type {
  ElementType,
  ReactCompatElement,
  ReactCompatNode,
} from "@reckona/mreact-compat";
import type { JSX as ReactCompatJSX } from "@reckona/mreact-compat/jsx-runtime";

export type ReactNode = ReactCompatNode;
export type ReactElement<
  P = unknown,
  T extends ElementType = ElementType,
> = ReactCompatElement & {
  props: P;
  type: T;
};
export type FunctionComponent<P = object> = (props: P) => ReactElement | null;
export type FC<P = object> = FunctionComponent<P>;
export type ComponentType<P = object> = FunctionComponent<P>;

export namespace JSX {
  export type Element = ReactCompatJSX.Element;
  export interface IntrinsicAttributes extends ReactCompatJSX.IntrinsicAttributes {}
  export interface IntrinsicElements extends ReactCompatJSX.IntrinsicElements {}
}
