export * from "@reckona/mreact-compat";
/** Default React-compatible namespace export for @reckona/mreact. */
export { default } from "./react-default.js";

import type {
  ElementType,
  ReactCompatElement,
  ReactCompatNode,
} from "@reckona/mreact-compat";
import type { JSX as ReactCompatJSX } from "@reckona/mreact-compat/jsx-runtime";

/** Values that can be rendered by the React-compatible runtime. */
export type ReactNode = ReactCompatNode;
/** React-compatible element object with typed props and element type. */
export type ReactElement<
  P = unknown,
  T extends ElementType = ElementType,
> = ReactCompatElement & {
  props: P;
  type: T;
};
/** Function component signature accepted by the React-compatible runtime. */
export type FunctionComponent<P = object> = (props: P) => ReactElement | null;
/** Alias for FunctionComponent. */
export type FC<P = object> = FunctionComponent<P>;
/** Component type accepted by JSX and createElement. */
export type ComponentType<P = object> = FunctionComponent<P>;

/** JSX namespace types used by the React-compatible entrypoint. */
export namespace JSX {
  /** JSX expression result for the React-compatible entrypoint. */
  export type Element = ReactCompatJSX.Element;
  /** Attributes accepted on every JSX element. */
  export interface IntrinsicAttributes extends ReactCompatJSX.IntrinsicAttributes {}
  /** Built-in JSX element attributes. */
  export interface IntrinsicElements extends ReactCompatJSX.IntrinsicElements {}
}
