import type { AttributeIr, DynamicAttributeIr } from "./ir.js";
import { isEventLikePropName } from "@reckona/mreact-shared";
import {
  invalidDomRefAttributeDiagnostic,
  unsupportedRefAttributeDiagnostic,
  unsupportedServerEventHandlerDiagnostic,
} from "./diagnostics.js";
import {
  getOxcLocation,
  readArray,
  readObject,
  readSource,
  unwrapOxcParentheses,
} from "./oxc-node-utils.js";
import type { CompileTarget, Diagnostic } from "./types.js";

const stableKeyedEventAttributes = new WeakSet<object>();
const dynamicAttributeExpressions = new WeakMap<DynamicAttributeIr, Record<string, unknown>>();

export function isStableOxcKeyedEventAttribute(attribute: AttributeIr): boolean {
  return attribute.kind === "event" && stableKeyedEventAttributes.has(attribute);
}

export function readOxcDynamicAttributeExpression(
  attribute: AttributeIr,
): Record<string, unknown> | undefined {
  return attribute.kind === "dynamic-attr" ? dynamicAttributeExpressions.get(attribute) : undefined;
}

export function readOxcJsxTagName(node: Record<string, unknown>): string {
  if (typeof node.name === "string") {
    return node.name;
  }

  if (node.type === "JSXNamespacedName") {
    const namespaceName = readOxcJsxTagName(readObject(node.namespace));
    const localName = readOxcJsxTagName(readObject(node.name));
    return `${namespaceName}:${localName}`;
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

  const name = readOxcJsxTagName(readObject(object.name));
  const value = readObject(object.value);
  const isEventAttribute = isEventLikePropName(name);

  if (name === "ref" && options.allowRef !== true) {
    diagnostics.push(unsupportedRefAttributeDiagnostic(getOxcLocation(code, object.name)));
  }

  if (name === "domRef") {
    if (value.type !== "JSXExpressionContainer") {
      diagnostics.push(invalidDomRefAttributeDiagnostic(getOxcLocation(code, object.name)));
      return [];
    }

    const expression = readObject(value.expression);
    return [
      {
        kind: "dom-ref",
        name: "domRef",
        code: options.resolveExpressionCode?.(expression) ?? readSource(code, expression),
      },
    ];
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
    const expressionCode =
      options.resolveExpressionCode?.(expression) ?? readSource(code, expression);
    const unwrappedExpression = unwrapOxcParentheses(expression);
    const stableForKeyedReuse =
      (unwrappedExpression.type === "ArrowFunctionExpression" ||
        unwrappedExpression.type === "FunctionExpression") &&
      readArray(unwrappedExpression.params).every(
        (parameter) => readObject(parameter).type === "Identifier",
      );
    const eventAttribute: AttributeIr = {
      kind: "event",
      name,
      eventName: name.slice(2).toLowerCase(),
      code: expressionCode,
    };
    if (stableForKeyedReuse) {
      stableKeyedEventAttributes.add(eventAttribute);
    }
    return [eventAttribute];
  }

  if (value.type === "Literal") {
    if (name === "dangerouslySetInnerHTML") {
      return [{ kind: "dynamic-attr", name, code: JSON.stringify(value.value) }];
    }

    return [{ kind: "static-attr", name, value: String(value.value) }];
  }

  if (value.type === "JSXExpressionContainer") {
    const expression = readObject(value.expression);
    const expressionCode =
      options.resolveExpressionCode?.(expression) ?? readSource(code, expression);
    const attribute: DynamicAttributeIr = {
      kind: "dynamic-attr",
      name,
      code: expressionCode,
    };
    dynamicAttributeExpressions.set(attribute, expression);

    return [attribute];
  }

  return name === "dangerouslySetInnerHTML"
    ? [{ kind: "dynamic-attr", name, code: "true" }]
    : [{ kind: "static-attr", name, value: "" }];
}

export function findOxcJsxAttributeCode(
  code: string,
  attributes: readonly unknown[],
  name: string,
): string | undefined {
  for (const attr of attributes) {
    const object = readObject(attr);

    if (object.type !== "JSXAttribute" || readOxcJsxTagName(readObject(object.name)) !== name) {
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
