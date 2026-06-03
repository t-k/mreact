export type Dispose = () => void;

export const LIST_RENDER_VALUE = Symbol.for("mreact.list-render-value");

export interface ListRenderValue<T = unknown> {
  readonly [LIST_RENDER_VALUE]: true;
  readonly items: () => readonly T[];
  readonly renderItem: (item: T, index: number, items: readonly T[]) => RenderValue;
  readonly options?: {
    readonly key?: (item: T, index: number, items: readonly T[]) => unknown;
    readonly nestedObjectFallback?: boolean;
  };
}

export type RenderValue =
  | Node
  | string
  | number
  | boolean
  | null
  | undefined
  | ListRenderValue
  | readonly RenderValue[];
