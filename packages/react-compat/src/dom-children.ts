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
  if (replaceDisjointFullChildList(parent, before, after, nextNodes)) {
    return;
  }

  if (
    nextNodes.length > 16 &&
    hasSingleExtraScopedChild(parent, before, after, nextNodes.length) &&
    removeSingleMissingChild(parent, before, after, nextNodes)
  ) {
    return;
  }

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
      removeChildIfPresent(parent, child);
    }
  }
}

function replaceDisjointFullChildList(
  parent: ParentNode,
  before: ChildNode | null,
  after: ChildNode | null,
  nextNodes: readonly Node[],
): boolean {
  if (before !== null || after !== null || nextNodes.length <= 16) {
    return false;
  }

  const currentNodes = parent.childNodes;

  if (currentNodes.length <= 16 || currentNodes.length !== nextNodes.length) {
    return false;
  }

  const nextSet = new Set(nextNodes);

  for (let index = 0; index < currentNodes.length; index += 1) {
    if (nextSet.has(currentNodes[index]!)) {
      return false;
    }
  }

  parent.replaceChildren(...nextNodes);
  return true;
}

function hasSingleExtraScopedChild(
  parent: ParentNode,
  before: ChildNode | null,
  after: ChildNode | null,
  nextCount: number,
): boolean {
  if (before === null && after === null) {
    return parent.childNodes.length === nextCount + 1;
  }

  let cursor = before === null ? parent.firstChild : before.nextSibling;
  let currentCount = 0;

  while (cursor !== null && cursor !== after && currentCount <= nextCount + 1) {
    currentCount += 1;
    cursor = cursor.nextSibling;
  }

  return currentCount === nextCount + 1 && (cursor === null || cursor === after);
}

function removeSingleMissingChild(
  parent: ParentNode,
  before: ChildNode | null,
  after: ChildNode | null,
  nextNodes: readonly Node[],
): boolean {
  let cursor = before === null ? parent.firstChild : before.nextSibling;
  let removed = false;

  for (const nextNode of nextNodes) {
    if (cursor === nextNode) {
      cursor = cursor.nextSibling;
      continue;
    }

    if (removed || cursor === null || cursor === after || cursor.nextSibling !== nextNode) {
      return false;
    }

    const missing = cursor;
    cursor = nextNode.nextSibling;
    removeChildIfPresent(parent, missing);
    removed = true;
  }

  if (cursor === after || cursor === null) {
    return removed;
  }

  if (removed || cursor.nextSibling !== after) {
    return false;
  }

  removeChildIfPresent(parent, cursor);
  return true;
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
