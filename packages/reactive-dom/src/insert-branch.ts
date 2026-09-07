import { effect } from "@reckona/mreact-reactive-core";
import { effectWithDebugLabel, registerCleanup } from "@reckona/mreact-reactive-core/internal";
import { isDynamicHydrationEnabled, markDynamicNode, markDynamicNodes } from "./dynamic-node.js";
import { createScopedRenderNodes } from "./render-scope.js";
import { registerDispose } from "./scope.js";
import type { Dispose, RenderValue } from "./types.js";

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

  let current: Node[] = [];
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
    const disposeScope = disposeCurrentScope;
    disposeCurrentScope = undefined;

    try {
      disposeScope?.();
    } catch (error) {
      firstError = error;
    }

    let next;

    try {
      next = createScopedRenderNodes(value);
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

    for (const node of current) {
      insertionParent.insertBefore(node, marker);
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

function isSameNodeList(left: readonly Node[], right: readonly Node[]): boolean {
  return left.length === right.length && left.every((node, index) => node === right[index]);
}
