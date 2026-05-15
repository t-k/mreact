export function validateTextNodes(
  nodes: readonly Text[],
  expected: string,
): void {
  for (const [index, node] of nodes.entries()) {
    if (node.data !== expected) {
      throw new Error(
        `text node ${index} expected ${expected}, received ${node.data}`,
      );
    }
  }
}
