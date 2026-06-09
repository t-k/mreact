/** Disposer function returned by reactive DOM bindings. */
export type Dispose = () => void;

/** Marker symbol used to distinguish list render values from plain objects. */
export const LIST_RENDER_VALUE = Symbol.for("mreact.list-render-value");

/** Declarative list render value consumed by insertDynamic and bindList. */
export interface ListRenderValue<T = unknown> {
  readonly [LIST_RENDER_VALUE]: true;
  readonly items: () => readonly T[];
  readonly renderItem: (item: T, index: number, items: readonly T[]) => RenderValue;
  readonly options?: {
    readonly key?: (item: T, index: number, items: readonly T[]) => unknown;
    readonly nestedObjectFallback?: boolean;
  };
}

/** Value that can be normalized into DOM nodes by the reactive DOM runtime. */
export type RenderValue =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | ListRenderValue
  | readonly RenderValue[];
