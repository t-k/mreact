import { collectScopedNodes } from "./hydration.js";

export function syncChildNodes(parent: ParentNode, nextNodes: readonly Node[]): void {
  syncScopedChildNodes(parent, null, null, nextNodes);
}

export function syncOwnedChildNodes(
  parent: ParentNode,
  previousNodes: readonly Node[],
  nextNodes: readonly Node[],
): void {
  const nextSet = new Set(nextNodes);

  for (const node of nextNodes) {
    if (node.parentNode !== parent || node.nextSibling !== null) {
      parent.appendChild(node);
    }
  }

  for (const child of previousNodes) {
    if (!nextSet.has(child)) {
      removeChildIfPresent(parent, child);
    }
  }
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

  for (const node of nextNodes) {
    if (node !== cursor) {
      parent.insertBefore(node, cursor === after ? after : cursor);
    }

    cursor = node.nextSibling;
  }

  const nextSet = new Set(nextNodes);

  for (const child of collectScopedNodes(parent, before, after)) {
    if (!nextSet.has(child)) {
      removeChildIfPresent(parent, child);
    }
  }
}

export function removeChildIfPresent(parent: ParentNode, child: Node): void {
  if (child.parentNode !== parent) {
    return;
  }

  try {
    parent.removeChild(child);
  } catch (error) {
    if (child.parentNode !== parent && isNotFoundError(error)) {
      return;
    }

    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  const maybeError = error as { message?: unknown; name?: unknown };

  return (
    maybeError.name === "NotFoundError" ||
    (typeof maybeError.message === "string" && maybeError.message.includes("not a child"))
  );
}
