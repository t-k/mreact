import { effect } from "@reckona/mreact-reactive-core";
import {
  effectWithDebugLabel,
  registerCleanup,
} from "@reckona/mreact-reactive-core/internal";
import { isMemoRenderValue } from "./create-memo.js";
import {
  isDynamicHydrationEnabled,
  markDynamicNode,
  markDynamicNodes,
} from "./dynamic-node.js";
import { createScopedRenderNodes } from "./render-scope.js";
import { registerDispose } from "./scope.js";
import type { Dispose, MemoRenderValue, RenderValue } from "./types.js";

/** Inserts a compiler-owned memo render value before a marker node. */
export function insertMemoDynamic(
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
  let currentMemo: MemoRenderValue | undefined;
  let disposeCurrentScope: Dispose | undefined;

  const clear = () => {
    currentMemo = undefined;
    const disposeScope = disposeCurrentScope;
    disposeCurrentScope = undefined;
    let firstError: unknown;

    try {
      disposeScope?.();
    } catch (error) {
      firstError = error;
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
    let nextValue: RenderValue;

    try {
      nextValue = value();
      if (
        isMemoRenderValue(nextValue) &&
        currentMemo !== undefined &&
        currentMemo.type === nextValue.type &&
        nextValue.compare(currentMemo.props, nextValue.props)
      ) {
        currentMemo = nextValue;
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
    const previousScope = disposeCurrentScope;
    disposeCurrentScope = undefined;

    try {
      previousScope?.();
    } catch (error) {
      firstError = error;
    }

    let next;
    try {
      next = createScopedRenderNodes(() =>
        isMemoRenderValue(nextValue) ? nextValue.render(nextValue.props) : nextValue,
      );
    } catch (error) {
      try {
        clear();
      } catch (cleanupError) {
        firstError ??= cleanupError;
      }
      throw firstError ?? error;
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

function isSameNodeList(left: readonly Node[], right: readonly Node[]): boolean {
  return left.length === right.length && left.every((node, index) => node === right[index]);
}
