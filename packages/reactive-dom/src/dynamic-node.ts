export function markDynamicNode(node: Node): void {
  (node as Node & { __mreactDynamicNode?: true }).__mreactDynamicNode = true;

  if (node.nodeType === Node.TEXT_NODE) {
    (node as Text & { __mreactReactiveText?: true }).__mreactReactiveText = true;
  }
}

export function markDynamicNodes<T extends readonly Node[]>(nodes: T): T {
  for (const node of nodes) {
    markDynamicNode(node);
  }

  return nodes;
}

export function isDynamicHydrationEnabled(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    (globalThis as typeof globalThis & { __mreactHydratingDynamicRanges?: boolean })
      .__mreactHydratingDynamicRanges === true
  );
}
