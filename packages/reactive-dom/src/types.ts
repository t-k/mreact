/** Disposer function returned by reactive DOM bindings. */
export type Dispose = () => void;

/** Marker symbol used to distinguish list render values from plain objects. */
export const LIST_RENDER_VALUE = Symbol.for("mreact.list-render-value");

/** Marker symbol used to distinguish memo render values from plain objects. */
export const MEMO_RENDER_VALUE = Symbol.for("mreact.memo-render-value");

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

/** A component render deferred until its dynamic insertion owner accepts new props. */
export interface MemoRenderValue<P = unknown> {
  readonly [MEMO_RENDER_VALUE]: true;
  readonly type: unknown;
  readonly props: P;
  readonly render: (props: P) => RenderValue;
  readonly compare: (previous: P, next: P) => boolean;
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
