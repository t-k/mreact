export function hasJsxSyntax(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(hasJsxSyntax);
  }

  if (node === null || typeof node !== "object") {
    return false;
  }

  const object = node as Record<string, unknown>;
  if (
    object.type === "JSXElement" ||
    object.type === "JSXFragment" ||
    object.type === "JSXExpressionContainer"
  ) {
    return true;
  }

  for (const [key, value] of Object.entries(object)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }

    if (hasJsxSyntax(value)) {
      return true;
    }
  }

  return false;
}
