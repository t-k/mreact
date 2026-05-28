import { collectScopedNodes } from "./hydration.js";

export function syncChildNodes(parent: ParentNode, nextNodes: readonly Node[]): void {
  syncScopedChildNodes(parent, null, null, nextNodes);
}

export function syncScopedChildNodes(
  parent: ParentNode,
  before: ChildNode | null,
  after: ChildNode | null,
  nextNodes: readonly Node[],
): void {
  let cursor = parent.firstChild;

  if (before !== null) {
    cursor = before.nextSibling;
  }

  let changed = false;

  for (const node of nextNodes) {
    if (node !== cursor) {
      parent.insertBefore(node, cursor === after ? after : cursor);
      changed = true;
    }

    cursor = node.nextSibling;
  }

  if (!changed && cursor === after) {
    return;
  }

  if (!changed && after === null && cursor === null) {
    return;
  }

  const nextSet = new Set(nextNodes);

  for (const child of collectScopedNodes(parent, before, after)) {
    if (!nextSet.has(child)) {
      parent.removeChild(child);
    }
  }
}
