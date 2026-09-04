import { cell, effect, type Cell } from "@reckona/mreact-reactive-core";
import { effectWithDebugLabel, registerCleanup } from "@reckona/mreact-reactive-core/internal";
import { isMemoRenderValue } from "./create-memo.js";
import { bindList } from "./bind-list.js";
import { isListRenderValue } from "./create-list.js";
import { isDynamicHydrationEnabled, markDynamicNode, markDynamicNodes } from "./dynamic-node.js";
import { createScopedRenderNodes } from "./render-scope.js";
import { registerDispose } from "./scope.js";
import {
  LIST_RENDER_VALUE,
  type Dispose,
  type ListRenderValue,
  type MemoRenderValue,
  type RenderValue,
} from "./types.js";

type MemoDynamicValue = RenderValue | MemoRenderValue;
type BindListWithRenderArity = (...args: [...Parameters<typeof bindList>, number]) => Dispose;

/** Inserts a compiler-owned memo render value before a marker node. */
export function insertMemoDynamic(
  parent: ParentNode,
  marker: ChildNode,
  value: () => MemoDynamicValue,
  options?: { debugLabel?: string },
): Dispose {
  void parent;
  const markForHydration = isDynamicHydrationEnabled();

  if (markForHydration) {
    markDynamicNode(marker);
  }

  let current: Node[] = [];
  let currentList: BoundMemoDynamicList | undefined;
  let currentMemo: MemoRenderValue | undefined;
  let disposeCurrentScope: Dispose | undefined;

  const clear = () => {
    currentMemo = undefined;
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
    let nextValue: MemoDynamicValue;

    try {
      nextValue = value();
      if (
        isMemoRenderValue(nextValue) &&
        currentMemo !== undefined &&
        currentMemo.type === nextValue.type &&
        nextValue.compare(currentMemo.props, nextValue.props)
      ) {
        return;
      }
    } catch (error) {
      let cleanupError: unknown;
      try {
        clear();
      } catch (caught) {
        cleanupError = caught;
      }
      throw cleanupError ?? error;
    }

    let firstError: unknown;
    if (currentList === undefined || currentMemo !== undefined) {
      const previousScope = disposeCurrentScope;
      disposeCurrentScope = undefined;

      try {
        previousScope?.();
      } catch (error) {
        firstError = error;
      }
    }

    let next;
    let renderedMemoValue: RenderValue;
    try {
      next = createScopedRenderNodes(() => {
        if (isMemoRenderValue(nextValue)) {
          renderedMemoValue = nextValue.render(nextValue.props);
          return isListRenderValue(renderedMemoValue) ? null : renderedMemoValue;
        }
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

    const resolvedValue = isMemoRenderValue(nextValue) ? renderedMemoValue : nextValue;

    if (isListRenderValue(resolvedValue)) {
      const nextMemo = isMemoRenderValue(nextValue) ? nextValue : undefined;
      const nextMemoScope = nextMemo === undefined ? undefined : next.dispose;
      if (nextMemoScope === undefined) {
        next.dispose();
      }
      const nextKeyed = !!resolvedValue.options?.key;
      const nextNestedObjectFallback = !!resolvedValue.options?.nestedObjectFallback;
      const nextListShape =
        +nextKeyed |
        (+nextNestedObjectFallback << 1) |
        ((resolvedValue[LIST_RENDER_VALUE]
          ? 3
          : (resolvedValue as unknown as { readonly a: number }).a) <<
          2);

      if (currentList !== undefined && currentList.shape === nextListShape) {
        currentList.value.set(resolvedValue);
        currentMemo = nextMemo;
        disposeCurrentScope = nextMemoScope;
        if (firstError !== undefined) throw firstError;
        return;
      }

      try {
        clear();
      } catch (error) {
        firstError ??= error;
      }

      const insertionParent = marker.parentNode;
      if (insertionParent === null) {
        try {
          nextMemoScope?.();
        } catch (error) {
          firstError ??= error;
        }
        if (firstError !== undefined) throw firstError;
        return;
      }

      const listValue = cell(resolvedValue);
      const listOptions =
        resolvedValue.options === undefined
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
      try {
        currentList = {
          value: listValue,
          shape: nextListShape,
          dispose: (bindList as BindListWithRenderArity)(
            insertionParent,
            marker,
            () => listValue.get().items(),
            (...renderArgs) =>
              (listValue.get().renderItem as (...args: unknown[]) => RenderValue)(...renderArgs),
            listOptions,
            nextListShape >> 2,
          ),
        };
      } catch (error) {
        try {
          nextMemoScope?.();
        } catch (cleanupError) {
          firstError ??= cleanupError;
        }
        throw firstError ?? error;
      }
      currentMemo = nextMemo;
      disposeCurrentScope = nextMemoScope;
      if (firstError !== undefined) throw firstError;
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
      currentMemo = isMemoRenderValue(nextValue) ? nextValue : undefined;
      if (firstError !== undefined) throw firstError;
      return;
    }

    try {
      clear();
    } catch (error) {
      firstError ??= error;
    }
    current = markForHydration ? markDynamicNodes(next.nodes) : next.nodes;
    currentMemo = isMemoRenderValue(nextValue) ? nextValue : undefined;
    disposeCurrentScope = next.dispose;

    const insertionParent = marker.parentNode;
    if (insertionParent === null) {
      current = [];
      const disposeScope = disposeCurrentScope;
      disposeCurrentScope = undefined;
      currentMemo = undefined;
      try {
        disposeScope?.();
      } catch (error) {
        firstError ??= error;
      }
      if (firstError !== undefined) throw firstError;
      return;
    }

    for (const node of current) {
      insertionParent.insertBefore(node, marker);
    }
    if (firstError !== undefined) throw firstError;
  };

  const dispose =
    options?.debugLabel === undefined ? effect(run) : effectWithDebugLabel(run, options.debugLabel);
  const disposeOwnedDynamic = registerDispose(() => {
    dispose();
    clear();
  });
  registerCleanup(disposeOwnedDynamic);
  return disposeOwnedDynamic;
}

interface BoundMemoDynamicList {
  value: Cell<ListRenderValue>;
  shape: number;
  dispose: Dispose;
}

function isSameNodeList(left: readonly Node[], right: readonly Node[]): boolean {
  return left.length === right.length && left.every((node, index) => node === right[index]);
}
