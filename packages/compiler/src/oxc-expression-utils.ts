import type { JsxNodeIr } from "./ir.js";
import { readArray, readObject, unwrapOxcParentheses } from "./oxc-node-utils.js";

export function readOxcReturnExpressionFromStatement(
  statement: unknown,
): Record<string, unknown> | undefined {
  const object = readObject(statement);

  if (object.type === "ReturnStatement") {
    return unwrapOxcParentheses(readObject(object.argument));
  }

  if (object.type === "BlockStatement") {
    const returnStatement = readArray(object.body)
      .map(readObject)
      .find((child) => child.type === "ReturnStatement");
    return returnStatement === undefined
      ? undefined
      : unwrapOxcParentheses(readObject(returnStatement.argument));
  }

  return undefined;
}

export function isOxcJsxBranch(expression: Record<string, unknown>): boolean {
  const unwrappedExpression = unwrapOxcParentheses(expression);
  return unwrappedExpression.type === "JSXElement" || unwrappedExpression.type === "JSXFragment";
}

export function findOxcKeyCodeInChildren(children: readonly JsxNodeIr[]): string | undefined {
  if (children.length !== 1) {
    return undefined;
  }

  const child = children[0];

  if (child?.kind === "element" || child?.kind === "component") {
    return child.keyCode;
  }

  if (child?.kind === "conditional") {
    const whenTrueKey = findOxcKeyCodeInChildren(child.whenTrue);
    const whenFalseKey = findOxcKeyCodeInChildren(child.whenFalse);
    return whenTrueKey !== undefined && whenTrueKey === whenFalseKey ? whenTrueKey : undefined;
  }

  return undefined;
}
