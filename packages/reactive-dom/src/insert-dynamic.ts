import { cell, effect, type Cell } from "@reckona/mreact-reactive-core";
import { bindList } from "./bind-list.js";
import { isListRenderValue } from "./create-list.js";
import {
  isDynamicHydrationEnabled,
  markDynamicNode,
  markDynamicNodes,
} from "./dynamic-node.js";
import { createScopedRenderNodes } from "./render-scope.js";
import { registerDispose } from "./scope.js";
import type { Dispose, ListRenderValue, RenderValue } from "./types.js";

/** Inserts and updates a dynamic render value before a marker node. */
export function insertDynamic(
  parent: ParentNode,
  marker: ChildNode,
  value: () => RenderValue,
): Dispose {
  void parent;
  const markForHydration = isDynamicHydrationEnabled();

  if (markForHydration) {
    markDynamicNode(marker);
  }

  let current: Node[] = [];
  let disposeCurrentScope: Dispose | undefined;
  let currentList: BoundDynamicList | undefined;

  const clear = () => {
    currentList?.dispose();
    currentList = undefined;
    disposeCurrentScope?.();
    disposeCurrentScope = undefined;

    for (const node of current) {
      node.parentNode?.removeChild(node);
    }

    current = [];
  };

  const dispose = effect(() => {
    const nextValueRef: { value: RenderValue } = { value: undefined };
    const next = createScopedRenderNodes(() => {
      nextValueRef.value = value();
      const nextValue = nextValueRef.value;
      return isListRenderValue(nextValue) ? null : nextValue;
    });
    const nextValue = nextValueRef.value;

    if (isListRenderValue(nextValue)) {
      next.dispose();
      const nextKeyed = nextValue.options?.key !== undefined;
      const nextNestedObjectFallback = nextValue.options?.nestedObjectFallback === true;

      if (
        currentList !== undefined &&
        currentList.keyed === nextKeyed &&
        currentList.nestedObjectFallback === nextNestedObjectFallback
      ) {
        currentList.value.set(nextValue);
        return;
      }

      clear();

      const insertionParent = marker.parentNode;

      if (insertionParent === null) {
        return;
      }

      const listValue = cell(nextValue);
      const options =
        nextValue.options === undefined
          ? undefined
          : {
              ...(nextKeyed
                ? {
                    key: (item: unknown, index: number, items: readonly unknown[]) =>
                      listValue.get().options?.key?.(item, index, items),
                  }
                : {}),
              ...(nextNestedObjectFallback ? { nestedObjectFallback: true } : {}),
            };
      currentList = {
        value: listValue,
        keyed: nextKeyed,
        nestedObjectFallback: nextNestedObjectFallback,
        dispose: bindList(
          insertionParent,
          marker,
          () => listValue.get().items(),
          (item, index, items) => listValue.get().renderItem(item, index, items),
          options,
        ),
      };
      return;
    }

    if (currentList !== undefined) {
      clear();
    }

    if (isSameNodeList(current, next.nodes)) {
      next.dispose();
      return;
    }

    clear();
    current = markForHydration ? markDynamicNodes(next.nodes) : next.nodes;
    disposeCurrentScope = next.dispose;

    const insertionParent = marker.parentNode;

    if (insertionParent === null) {
      current = [];
      disposeCurrentScope?.();
      disposeCurrentScope = undefined;
      return;
    }

    for (const node of current) {
      insertionParent.insertBefore(node, marker);
    }
  });

  return registerDispose(() => {
    dispose();
    clear();
  });
}

interface BoundDynamicList {
  value: Cell<ListRenderValue>;
  keyed: boolean;
  nestedObjectFallback: boolean;
  dispose: Dispose;
}

function isSameNodeList(left: readonly Node[], right: readonly Node[]): boolean {
  return (
    left.length === right.length &&
    left.every((node, index) => node === right[index])
  );
}
