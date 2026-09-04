import { LIST_RENDER_VALUE, type ListRenderValue, type RenderValue } from "./types.js";

/** Creates a list render value for dynamic insertion. */
export function createList<T>(
  items: () => readonly T[],
  renderItem: (item: T, index: number, items: readonly T[]) => RenderValue,
  options?: ListRenderValue<T>["options"],
): ListRenderValue<T> {
  return {
    [LIST_RENDER_VALUE]: true,
    items,
    renderItem,
    ...(options === undefined ? {} : { options }),
  } as ListRenderValue<T>;
}

/** @internal Creates a compiler-owned list value with explicit dependency arity. */
export function createListWithRenderArity<T>(
  items: () => readonly T[],
  renderItem: (item: T, index: number, items: readonly T[]) => RenderValue,
  renderArity: number,
  options?: ListRenderValue<T>["options"],
): ListRenderValue<T> {
  return {
    [LIST_RENDER_VALUE]: false,
    a: renderArity,
    items,
    renderItem,
    ...(options === undefined ? {} : { options }),
  } as unknown as ListRenderValue<T>;
}

export function isListRenderValue(value: unknown): value is ListRenderValue {
  return (
    (value as { [LIST_RENDER_VALUE]?: boolean } | null | undefined)?.[LIST_RENDER_VALUE] !==
    undefined
  );
}
