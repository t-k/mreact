import { cell, effect, type Cell } from "@reckona/mreact-reactive-core";
import {
  effectWithDebugLabel,
  registerCleanup,
} from "@reckona/mreact-reactive-core/internal";
import { bindList } from "./bind-list.js";
import { isListRenderValue } from "./create-list.js";
import { isMemoRenderValue } from "./create-memo.js";
import {
  isDynamicHydrationEnabled,
  markDynamicNode,
  markDynamicNodes,
} from "./dynamic-node.js";
import { createScopedRenderNodes } from "./render-scope.js";
import { registerDispose } from "./scope.js";
import type {
  Dispose,
  ListRenderValue,
  MemoRenderValue,
  RenderValue,
} from "./types.js";

/** Inserts and updates a dynamic render value before a marker node. */
export function insertDynamic(
  parent: ParentNode,
  marker: ChildNode,
  value: () => RenderValue,
  options?: { debugLabel?: string; memo?: boolean },
): Dispose {
  void parent;
  const markForHydration = isDynamicHydrationEnabled();

  if (markForHydration) {
    markDynamicNode(marker);
  }

  let current: Node[] = [];
  let disposeCurrentScope: Dispose | undefined;
  let currentList: BoundDynamicList | undefined;
  let currentMemo: MemoRenderValue | undefined;

  const clear = () => {
    const disposeList = currentList?.dispose;
    currentList = undefined;
    currentMemo = undefined;
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
    let preparedValue: RenderValue;

    if (options?.memo === true) {
      try {
        preparedValue = value();
        if (
          isMemoRenderValue(preparedValue) &&
          canReuseMemo(currentMemo, preparedValue)
        ) {
          currentMemo = preparedValue;
          return;
        }
      } catch (error) {
        try {
          clear();
        } catch (cleanupError) {
          firstError = cleanupError;
        }
        throw firstError ?? error;
      }
    }

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
        nextValueRef.value = options?.memo === true ? preparedValue : value();
        const nextValue = nextValueRef.value;

        if (isMemoRenderValue(nextValue)) {
          return nextValue.render(nextValue.props);
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
      currentMemo = isMemoRenderValue(nextValue) ? nextValue : undefined;
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
    currentMemo = isMemoRenderValue(nextValue) ? nextValue : undefined;

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

function canReuseMemo(
  current: MemoRenderValue | undefined,
  next: MemoRenderValue,
): boolean {
  return (
    current !== undefined &&
    current.type === next.type &&
    next.compare(current.props, next.props)
  );
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
