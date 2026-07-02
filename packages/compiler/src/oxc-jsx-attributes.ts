import type { AttributeIr } from "./ir.js";
import {
  unsupportedRefAttributeDiagnostic,
  unsupportedServerEventHandlerDiagnostic,
} from "./diagnostics.js";
import { getOxcLocation, readObject, readSource, unwrapOxcParentheses } from "./oxc-node-utils.js";
import type { CompileTarget, Diagnostic } from "./types.js";

export function readOxcJsxTagName(node: Record<string, unknown>): string {
  if (typeof node.name === "string") {
    return node.name;
  }

  if (node.type === "JSXMemberExpression") {
    const objectName = readOxcJsxTagName(readObject(node.object));
    const propertyName = readOxcJsxTagName(readObject(node.property));
    return `${objectName}.${propertyName}`;
  }

  return "";
}

export function analyzeOxcAttribute(
  code: string,
  attr: unknown,
  target: CompileTarget,
  diagnostics: Pick<Diagnostic, "level" | "code" | "message" | "loc">[],
  options: {
    allowRef?: boolean;
    resolveExpressionCode?: (expression: Record<string, unknown>) => string;
  } = {},
): AttributeIr[] {
  const object = readObject(attr);

  if (object.type === "JSXSpreadAttribute") {
    return [{ kind: "spread-attr", code: readSource(code, readObject(object.argument)) }];
  }

  if (object.type !== "JSXAttribute") {
    return [];
  }

  const name = String(readObject(object.name).name);
  const value = readObject(object.value);
  const isEventAttribute = /^on[A-Za-z]/.test(name);

  if (name === "ref" && options.allowRef !== true) {
    diagnostics.push(unsupportedRefAttributeDiagnostic(getOxcLocation(code, object.name)));
  }

  if (isEventAttribute) {
    if (target === "server") {
      const loc = getOxcLocation(code, object.name);
      diagnostics.push(unsupportedServerEventHandlerDiagnostic(name, loc));
    }

    if (value.type !== "JSXExpressionContainer") {
      return [];
    }

    const expression = readObject(value.expression);
    const expressionCode = options.resolveExpressionCode?.(expression) ?? readSource(code, expression);
    return [
      {
        kind: "event",
        name,
        eventName: name.slice(2).toLowerCase(),
        code: expressionCode,
      },
    ];
  }

  if (value.type === "Literal") {
    return [{ kind: "static-attr", name, value: String(value.value) }];
  }

  if (value.type === "JSXExpressionContainer") {
    const expression = readObject(value.expression);
    const expressionCode = options.resolveExpressionCode?.(expression) ?? readSource(code, expression);

    return [{ kind: "dynamic-attr", name, code: expressionCode }];
  }

  return [{ kind: "static-attr", name, value: "" }];
}

export function findOxcJsxAttributeCode(
  code: string,
  attributes: readonly unknown[],
  name: string,
): string | undefined {
  for (const attr of attributes) {
    const object = readObject(attr);

    if (object.type !== "JSXAttribute" || String(readObject(object.name).name) !== name) {
      continue;
    }

    const value = readObject(object.value);

    if (Object.keys(value).length === 0) {
      return "true";
    }

    if (value.type === "Literal") {
      return JSON.stringify(value.value);
    }

    if (value.type === "JSXExpressionContainer") {
      return readSource(code, unwrapOxcParentheses(readObject(value.expression)));
    }
  }

  return undefined;
}
