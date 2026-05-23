import { effect } from "@reckona/mreact-reactive-core";
import { createScopedRenderNodes } from "./render-scope.js";
import { registerDispose } from "./scope.js";
import type { Dispose, RenderValue } from "./types.js";

export function insertDynamic(
  parent: ParentNode,
  marker: ChildNode,
  value: () => RenderValue,
): Dispose {
  void parent;

  let current: Node[] = [];
  let disposeCurrentScope: Dispose | undefined;

  const clear = () => {
    disposeCurrentScope?.();
    disposeCurrentScope = undefined;

    for (const node of current) {
      node.parentNode?.removeChild(node);
    }

    current = [];
  };

  const dispose = effect(() => {
    const next = createScopedRenderNodes(value);

    if (isSameNodeList(current, next.nodes)) {
      next.dispose();
      return;
    }

    clear();
    current = next.nodes;
    disposeCurrentScope = next.dispose;
    markDynamicNodes(current);

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

function markDynamicNodes(nodes: readonly Node[]): void {
  for (const node of nodes) {
    (node as Node & { __mreactDynamicNode?: true }).__mreactDynamicNode = true;

    if (node.nodeType === Node.TEXT_NODE) {
      (node as Text & { __mreactReactiveText?: true }).__mreactReactiveText = true;
    }
  }
}

function isSameNodeList(left: readonly Node[], right: readonly Node[]): boolean {
  return (
    left.length === right.length &&
    left.every((node, index) => node === right[index])
  );
}
