import { effect } from "@reckona/mreact-reactive-core";
import { normalizeRenderValue } from "./normalize.js";
import { registerDispose } from "./scope.js";
import type { Dispose, RenderValue } from "./types.js";

export function insertDynamic(
  parent: ParentNode,
  marker: ChildNode,
  value: () => RenderValue,
): Dispose {
  void parent;

  let current: Node[] = [];

  const clear = () => {
    for (const node of current) {
      node.parentNode?.removeChild(node);
    }

    current = [];
  };

  const dispose = effect(() => {
    const next = normalizeRenderValue(value());

    if (isSameNodeList(current, next)) {
      return;
    }

    clear();
    current = next;
    markDynamicNodes(current);

    const insertionParent = marker.parentNode;

    if (insertionParent === null) {
      current = [];
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
