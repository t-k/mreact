import { parseSync } from "oxc-parser";
import type { ComponentIr, JsxNodeIr, ModuleIr } from "./ir.js";
import { readArray, readObject, unwrapOxcParentheses } from "./oxc-node-utils.js";

/** Proves the narrow route shape whose cell updates are fully served by direct text subscriptions. */
export function hasClosedDirectCellTextRoute(ir: ModuleIr): boolean {
  if (ir.components.length !== 1) {
    return false;
  }

  const component = ir.components[0];
  if (
    component === undefined ||
    component.exportDefault !== true ||
    component.async === true ||
    component.reassigned === true ||
    component.parameters.length !== 0 ||
    component.bodyStatements.length !== 1
  ) {
    return false;
  }

  const cellName = singleLiteralCellName(component);
  if (cellName === undefined) {
    return false;
  }

  const reads = { count: 0 };
  return hasOnlyDirectCellText(component.root, cellName, reads) && reads.count > 0;
}

function singleLiteralCellName(component: ComponentIr): string | undefined {
  const statement = component.bodyStatements[0];
  const name = component.bindingNames[0];
  if (statement === undefined || name === undefined || component.bindingNames.length !== 1) {
    return undefined;
  }

  const prefix = `const ${name} = cell(`;
  if (!statement.startsWith(prefix) || !statement.endsWith(");")) {
    return undefined;
  }

  const literal = statement.slice(prefix.length, -2);
  const value = Number(literal);
  return Number.isSafeInteger(value) && value >= 0 && String(value) === literal ? name : undefined;
}

function hasOnlyDirectCellText(
  node: JsxNodeIr,
  cellName: string,
  reads: { count: number },
): boolean {
  if (node.kind === "text") {
    return true;
  }

  if (node.kind === "expr") {
    const value = node.facts?.value;
    if (
      node.renderMode !== undefined ||
      value?.kind !== "native-cell-read" ||
      value.binding.name !== cellName
    ) {
      return false;
    }
    reads.count += 1;
    return true;
  }

  if (node.kind !== "element" || node.namespace === "svg") {
    return false;
  }

  return (
    node.attributes.every(
      (attribute) =>
        attribute.kind === "static-attr" ||
        (attribute.kind === "event" && isArrowEventHandler(attribute.code)),
    ) && node.children.every((child) => hasOnlyDirectCellText(child, cellName, reads))
  );
}

function isArrowEventHandler(code: string): boolean {
  const parsed = parseSync("closed-cell-event.tsx", `const handler = ${code};`, {
    lang: "tsx",
    sourceType: "module",
    astType: "ts",
  });
  if (parsed.errors.length !== 0) {
    return false;
  }

  const declaration = readArray(
    readObject(readArray(readObject(parsed.program).body)[0]).declarations,
  )[0];
  const initializer = unwrapOxcParentheses(readObject(readObject(declaration).init));
  return initializer.type === "ArrowFunctionExpression";
}
