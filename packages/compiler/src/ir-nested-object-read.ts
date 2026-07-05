import type { JsxNodeIr } from "./ir.js";
import { escapeRegExp } from "./string-utils.js";

export function listReadsNestedItemObject(
  node: Extract<JsxNodeIr, { kind: "list" }>,
  itemName: string,
): boolean {
  return node.children.some((child) => nodeReadsNestedItemObject(child, itemName));
}

function nodeReadsNestedItemObject(node: JsxNodeIr, itemName: string): boolean {
  switch (node.kind) {
    case "element":
      return (
        codeReadsNestedItemObject(node.keyCode, itemName) ||
        node.attributes.some((attribute) => {
          if (attribute.kind === "spread-attr") {
            return codeReadsNestedItemObject(attribute.code, itemName);
          }

          if (attribute.kind === "dynamic-attr" || attribute.kind === "event") {
            return codeReadsNestedItemObject(attribute.code, itemName);
          }

          return false;
        }) ||
        node.children.some((child) => nodeReadsNestedItemObject(child, itemName))
      );
    case "component":
      return (
        codeReadsNestedItemObject(node.keyCode, itemName) ||
        node.props.some((prop) => {
          if (prop.kind === "spread-prop") {
            return codeReadsNestedItemObject(prop.code, itemName);
          }

          if (prop.kind === "render-prop") {
            return prop.children.some((child) => nodeReadsNestedItemObject(child, itemName));
          }

          return codeReadsNestedItemObject(prop.code, itemName);
        }) ||
        node.children.some((child) => nodeReadsNestedItemObject(child, itemName))
      );
    case "fragment":
      return (
        node.bodyStatements?.some((statement) => codeReadsNestedItemObject(statement, itemName)) ===
          true || node.children.some((child) => nodeReadsNestedItemObject(child, itemName))
      );
    case "conditional":
      return (
        codeReadsNestedItemObject(node.conditionCode, itemName) ||
        node.whenTrue.some((child) => nodeReadsNestedItemObject(child, itemName)) ||
        node.whenFalse.some((child) => nodeReadsNestedItemObject(child, itemName))
      );
    case "list":
      return (
        codeReadsNestedItemObject(node.itemsCode, itemName) ||
        codeReadsNestedItemObject(node.keyCode, itemName) ||
        node.children.some((child) => nodeReadsNestedItemObject(child, itemName))
      );
    case "expr":
      return codeReadsNestedItemObject(node.code, itemName);
    case "async-boundary":
      return (
        codeReadsNestedItemObject(node.valueCode, itemName) ||
        node.children.some((child) => nodeReadsNestedItemObject(child, itemName)) ||
        (node.placeholderChildren?.some((child) =>
          nodeReadsNestedItemObject(child, itemName),
        ) ?? false) ||
        (node.catchChildren?.some((child) => nodeReadsNestedItemObject(child, itemName)) ?? false)
      );
    case "text":
      return false;
  }
}

function codeReadsNestedItemObject(code: string | undefined, itemName: string): boolean {
  if (code === undefined || code.length === 0) {
    return false;
  }

  return new RegExp(`\\b${escapeRegExp(itemName)}(?:\\.[A-Za-z_$][\\w$]*){2,}`).test(code);
}
