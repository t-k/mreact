import { insertDynamic } from "./insert-dynamic.js";
import type { Dispose, RenderValue } from "./types.js";

export function bindList<T>(
  parent: ParentNode,
  marker: ChildNode,
  items: () => readonly T[],
  renderItem: (item: T, index: number) => RenderValue,
): Dispose {
  return insertDynamic(parent, marker, () =>
    items().map((item, index) => renderItem(item, index)),
  );
}
