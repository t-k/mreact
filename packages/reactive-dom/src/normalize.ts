import type { RenderValue } from "./types.js";

export function normalizeRenderValue(value: RenderValue): Node[] {
  if (value === null || value === undefined || typeof value === "boolean") {
    return [];
  }

  if (typeof value === "string" || typeof value === "number") {
    return [document.createTextNode(String(value))];
  }

  if (value instanceof Node) {
    return [value];
  }

  const nodes: Node[] = [];

  for (const item of value) {
    nodes.push(...normalizeRenderValue(item));
  }

  return nodes;
}
