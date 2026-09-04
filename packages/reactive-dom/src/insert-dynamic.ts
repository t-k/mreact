import { cell, effect, type Cell } from "@reckona/mreact-reactive-core";
import {
  effectWithDebugLabel,
  registerCleanup,
} from "@reckona/mreact-reactive-core/internal";
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
  options?: { debugLabel?: string },
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
    const disposeList = currentList?.dispose;
    currentList = undefined;
    const disposeScope = disposeCurrentScope;
    disposeCurrentScope = undefined;
    let firstError: unknown;

    try {
      disposeList?.();
    } catch (error) {
      firstError = error;
    }

    try {
      disposeScope?.();
    } catch (error) {
      firstError ??= error;
    }

    for (const node of current) {
      try {
        node.parentNode?.removeChild(node);
      } catch (error) {
        firstError ??= error;
      }
    }

    current = [];

    if (firstError !== undefined) {
      throw firstError;
    }
  };

  const run = () => {
    let firstError: unknown;

    if (currentList === undefined) {
      const disposeScope = disposeCurrentScope;
      disposeCurrentScope = undefined;

      try {
        disposeScope?.();
      } catch (error) {
        firstError = error;
      }
    }

    const nextValueRef: { value: RenderValue } = { value: undefined };
    let next;

    try {
      next = createScopedRenderNodes(() => {
        nextValueRef.value = value();
        const nextValue = nextValueRef.value;
        return isListRenderValue(nextValue) ? null : nextValue;
      });
    } catch (error) {
      try {
        clear();
      } catch (cleanupError) {
        firstError ??= cleanupError;
      }
      throw firstError ?? error;
    }

    const nextValue = nextValueRef.value;

    if (isListRenderValue(nextValue)) {
      next.dispose();
      const nextKeyed = nextValue.options?.key !== undefined;
      const nextNestedObjectFallback = nextValue.options?.nestedObjectFallback === true;
      const nextRenderArity = nextValue.renderItem.length;
      const nextListShape =
        +nextKeyed +
        +nextNestedObjectFallback * 2 +
        Math.min(nextRenderArity, 3) * 4;

      if (currentList !== undefined && currentList.shape === nextListShape) {
        currentList.value.set(nextValue);
        if (firstError !== undefined) {
          throw firstError;
        }
        return;
      }

      try {
        clear();
      } catch (error) {
        firstError ??= error;
      }

      const insertionParent = marker.parentNode;

      if (insertionParent === null) {
        if (firstError !== undefined) {
          throw firstError;
        }
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
        shape: nextListShape,
        dispose: bindList(
          insertionParent,
          marker,
          () => listValue.get().items(),
          (item, index, items) => listValue.get().renderItem(item, index, items),
          options,
          nextRenderArity,
        ),
      };
      if (firstError !== undefined) {
        throw firstError;
      }
      return;
    }

    if (currentList !== undefined) {
      try {
        clear();
      } catch (error) {
        firstError ??= error;
      }
    }

    if (isSameNodeList(current, next.nodes)) {
      disposeCurrentScope = next.dispose;
      if (firstError !== undefined) {
        throw firstError;
      }
      return;
    }

    try {
      clear();
    } catch (error) {
      firstError ??= error;
    }
    current = markForHydration ? markDynamicNodes(next.nodes) : next.nodes;
    disposeCurrentScope = next.dispose;

    const insertionParent = marker.parentNode;

    if (insertionParent === null) {
      current = [];
      const disposeScope = disposeCurrentScope;
      disposeCurrentScope = undefined;

      try {
        disposeScope?.();
      } catch (error) {
        firstError ??= error;
      }

      if (firstError !== undefined) {
        throw firstError;
      }
      return;
    }

    for (const node of current) {
      insertionParent.insertBefore(node, marker);
    }

    if (firstError !== undefined) {
      throw firstError;
    }
  };
  const dispose =
    options?.debugLabel === undefined
      ? effect(run)
      : effectWithDebugLabel(run, options.debugLabel);

  const disposeOwnedDynamic = registerDispose(() => {
    dispose();
    clear();
  });
  registerCleanup(disposeOwnedDynamic);
  return disposeOwnedDynamic;
}

interface BoundDynamicList {
  value: Cell<ListRenderValue>;
  shape: number;
  dispose: Dispose;
}

function isSameNodeList(left: readonly Node[], right: readonly Node[]): boolean {
  return (
    left.length === right.length &&
    left.every((node, index) => node === right[index])
  );
}
