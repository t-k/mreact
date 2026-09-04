import {
  LIST_RENDER_ARITY,
  LIST_RENDER_VALUE,
  type ListRenderValue,
  type RenderValue,
} from "./types.js";

/** Creates a list render value for dynamic insertion. */
export function createList<T>(
  items: () => readonly T[],
  renderItem: (item: T, index: number, items: readonly T[]) => RenderValue,
  options?: ListRenderValue<T>["options"],
): ListRenderValue<T> {
  return {
    [LIST_RENDER_VALUE]: true,
    [LIST_RENDER_ARITY]: inferListRenderArity(renderItem),
    items,
    renderItem,
    ...(options === undefined ? {} : { options }),
  } as ListRenderValue<T>;
}

function inferListRenderArity(renderItem: Function): number {
  const runtimeArity = renderItem.length;
  if (runtimeArity >= 3) {
    return 3;
  }

  const source = Function.prototype.toString.call(renderItem);
  const arrowIndex = source.indexOf("=>");
  const header = arrowIndex === -1 ? source.slice(0, source.indexOf("{")) : source.slice(0, arrowIndex);
  if (header.includes("...")) {
    return 3;
  }

  const commaCount = header.match(/,/g)?.length ?? 0;
  return Math.min(Math.max(runtimeArity, commaCount + 1), 3);
}

/** @internal Creates a compiler-owned list value with explicit dependency arity. */
export function createListWithRenderArity<T>(
  items: () => readonly T[],
  renderItem: (item: T, index: number, items: readonly T[]) => RenderValue,
  renderArity: number,
  options?: ListRenderValue<T>["options"],
): ListRenderValue<T> {
  return {
    [LIST_RENDER_VALUE]: true,
    [LIST_RENDER_ARITY]: renderArity,
    items,
    renderItem,
    ...(options === undefined ? {} : { options }),
  } as ListRenderValue<T>;
}

export function isListRenderValue(value: unknown): value is ListRenderValue {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [LIST_RENDER_VALUE]?: unknown })[LIST_RENDER_VALUE] === true
  );
}
