import { effect } from "@reckona/mreact-reactive-core";
import { effectWithDebugLabel, registerCleanup } from "@reckona/mreact-reactive-core/internal";
import { isDynamicHydrationEnabled, markDynamicNode, markDynamicNodes } from "./dynamic-node.js";
import { normalizeRenderValue } from "./normalize.js";
import { createScopedRenderNodes } from "./render-scope.js";
import { registerDispose } from "./scope.js";
import type { Dispose, RenderValue } from "./types.js";

type BranchNodes = Element | Node[];

const emptyBranch: Node[] = [];

function normalizeBranch(value: RenderValue): BranchNodes {
  return typeof Element !== "undefined" && value instanceof Element
    ? value
    : normalizeRenderValue(value);
}

/**
 * @internal Inserts and updates a render value the compiler proved is never a list.
 *
 * This is insertDynamic without the ListRenderValue path. The compiler emits it
 * for a conditional whose branches are all native elements, static text, proven
 * primitives or empty, so a page that renders no list keeps the keyed list
 * runtime out of its module graph entirely. Branch mounting, replacement,
 * disposal order, hydration marking and error propagation match insertDynamic.
 */
export function insertBranch(
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

  let current: BranchNodes = emptyBranch;
  let disposeCurrentScope: Dispose | undefined;

  const clear = () => {
    const disposeScope = disposeCurrentScope;
    disposeCurrentScope = undefined;
    let firstError: unknown;

    try {
      disposeScope?.();
    } catch (error) {
      firstError = error;
    }

    if (Array.isArray(current)) {
      for (const node of current) {
        try {
          node.parentNode?.removeChild(node);
        } catch (error) {
          firstError ??= error;
        }
      }
    } else {
      try {
        current.parentNode?.removeChild(current);
      } catch (error) {
        firstError ??= error;
      }
    }

    current = emptyBranch;

    if (firstError !== undefined) {
      throw firstError;
    }
  };

  const run = () => {
    let firstError: unknown;
    const disposeScope = disposeCurrentScope;
    disposeCurrentScope = undefined;

    try {
      disposeScope?.();
    } catch (error) {
      firstError = error;
    }

    let next;

    try {
      next = createScopedRenderNodes(value, normalizeBranch);
    } catch (error) {
      try {
        clear();
      } catch (cleanupError) {
        firstError ??= cleanupError;
      }
      throw firstError ?? error;
    }

    if (isSameBranch(current, next.nodes)) {
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

    if (markForHydration) {
      if (Array.isArray(next.nodes)) {
        markDynamicNodes(next.nodes);
      } else {
        markDynamicNode(next.nodes);
      }
    }
    current = next.nodes;
    disposeCurrentScope = next.dispose;

    const insertionParent = marker.parentNode;

    if (insertionParent === null) {
      current = emptyBranch;
      const disposeNextScope = disposeCurrentScope;
      disposeCurrentScope = undefined;

      try {
        disposeNextScope?.();
      } catch (error) {
        firstError ??= error;
      }

      if (firstError !== undefined) {
        throw firstError;
      }
      return;
    }

    if (Array.isArray(current)) {
      for (const node of current) {
        insertionParent.insertBefore(node, marker);
      }
    } else {
      insertionParent.insertBefore(current, marker);
    }

    if (firstError !== undefined) {
      throw firstError;
    }
  };
  const dispose =
    options?.debugLabel === undefined ? effect(run) : effectWithDebugLabel(run, options.debugLabel);

  const disposeOwnedBranch = registerDispose(() => {
    dispose();
    clear();
  });
  registerCleanup(disposeOwnedBranch);
  return disposeOwnedBranch;
}

function isSameBranch(left: BranchNodes, right: BranchNodes): boolean {
  if (Array.isArray(left)) {
    return Array.isArray(right)
      ? left.length === right.length && left.every((node, index) => node === right[index])
      : left.length === 1 && left[0] === right;
  }

  return Array.isArray(right) ? right.length === 1 && right[0] === left : left === right;
}
