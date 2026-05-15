import type { JsxNodeIr, ModuleIr } from "./ir.js";

export function containsRawJsxInIr(ir: ModuleIr): boolean {
  return ir.components.some(
    (component) =>
      component.bodyStatements.some(containsRawJsx) || containsRawJsxInNode(component.root),
  );
}

function containsRawJsx(value: string): boolean {
  return /<[A-Za-z][\w.:-]*(?:\s|>|\/)/.test(value);
}

function containsRawJsxInNode(node: JsxNodeIr): boolean {
  if (node.kind === "list") {
    return (
      node.bodyStatements?.some(containsRawJsx) === true || node.children.some(containsRawJsxInNode)
    );
  }

  if (node.kind === "conditional") {
    return node.whenTrue.some(containsRawJsxInNode) || node.whenFalse.some(containsRawJsxInNode);
  }

  if (node.kind === "fragment") {
    return node.children.some(containsRawJsxInNode);
  }

  if (node.kind === "component") {
    return (
      node.children.some(containsRawJsxInNode) ||
      node.props.some(
        (prop) => prop.kind === "render-prop" && prop.children.some(containsRawJsxInNode),
      )
    );
  }

  if (node.kind === "async-boundary") {
    return (
      node.children.some(containsRawJsxInNode) ||
      node.placeholderChildren?.some(containsRawJsxInNode) === true ||
      node.catchChildren?.some(containsRawJsxInNode) === true
    );
  }

  return node.kind === "element" && node.children.some(containsRawJsxInNode);
}
