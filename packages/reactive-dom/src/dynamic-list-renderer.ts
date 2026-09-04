import type { Cell } from "@reckona/mreact-reactive-core";
import type { ListRenderValue, RenderValue } from "./types.js";

export function createDynamicListRenderer(
  value: Cell<ListRenderValue>,
  renderArity: number,
): (item: unknown, index: number, items: readonly unknown[]) => RenderValue {
  if (renderArity === 0) {
    return function () {
      return value.get().renderItem(arguments[0], arguments[1], arguments[2]);
    };
  }

  if (renderArity === 1) {
    return function (item) {
      return value.get().renderItem(item, arguments[1], arguments[2]);
    };
  }

  if (renderArity === 2) {
    return function (item, index) {
      return value.get().renderItem(item, index, arguments[2]);
    };
  }

  return (item, index, items) => value.get().renderItem(item, index, items);
}
