import type { OxcBodyStatementJsxMode } from "./oxc-analysis-types.js";
import { type OxcBodyLowerers } from "./oxc-body-lowering.js";
import {
  analyzeOxcExpressionChild,
  type OxcChildAnalysisContext,
} from "./oxc-child-analysis.js";
import { lowerOxcDomNodeExpression } from "./oxc-dom-lowering.js";
import { readOxcJsxTagName } from "./oxc-jsx-attributes.js";
import { readArray, readObject, readSource, unwrapOxcParentheses } from "./oxc-node-utils.js";
import {
  emitOxcCompatObjectChildren,
  emitOxcServerStringChildren,
} from "./oxc-runtime-emit.js";
import type { CompileTarget, Diagnostic } from "./types.js";

const oxcNestedBodyLowerers: OxcBodyLowerers = {
  lowerDomNodeExpression: lowerOxcDomNodeExpression,
  lowerCompatObjectExpression: lowerOxcCompatObjectExpression,
  lowerServerStringExpression: lowerOxcServerStringExpression,
};

export function lowerOxcCompatObjectExpression(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): string | undefined {
  const children = analyzeOxcExpressionChild(
    code,
    expression,
    createOxcNestedChildAnalysisContext(componentNames, target, diagnostics, "compat-object"),
    "compat-object",
  );

  if (children.length === 0) {
    return "null";
  }

  return emitOxcCompatObjectChildren(children);
}

export function lowerOxcCompatReactNodeExpression(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): string | undefined {
  const unwrapped = unwrapOxcParentheses(expression);

  if (unwrapped.type === "JSXElement" || unwrapped.type === "JSXFragment") {
    return lowerOxcCompatObjectExpression(code, unwrapped, componentNames, target, diagnostics);
  }

  if (unwrapped.type === "ArrayExpression") {
    return `[${readArray(unwrapped.elements)
      .map((element) => {
        const elementObject = unwrapOxcParentheses(readObject(element));
        return (
          lowerOxcCompatReactNodeExpression(
            code,
            elementObject,
            componentNames,
            target,
            diagnostics,
          ) ?? readSource(code, elementObject)
        );
      })
      .join(", ")}]`;
  }

  return undefined;
}

export function lowerOxcNestedJsxExpression(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx: OxcBodyStatementJsxMode,
): string | undefined {
  const source = readSource(code, expression);
  const expressionStart = typeof expression.start === "number" ? expression.start : 0;
  const replacements: Array<{ start: number; end: number; value: string }> = [];

  visitOxcExpressionJsxRoots(expression, (node) => {
    const start = typeof node.start === "number" ? node.start : undefined;
    const end = typeof node.end === "number" ? node.end : undefined;

    if (start === undefined || end === undefined) {
      return;
    }

    const lowered =
      bodyStatementJsx === "compat-object"
        ? lowerOxcCompatReactNodeExpression(code, node, componentNames, target, diagnostics)
        : bodyStatementJsx === "server-string"
          ? lowerOxcServerStringExpression(code, node, componentNames, target, diagnostics)
          : lowerOxcReactiveValueExpression(code, node, componentNames);

    if (lowered !== undefined) {
      replacements.push({ start, end, value: lowered });
    }
  });

  if (replacements.length === 0) {
    return undefined;
  }

  let lowered = source;

  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    const start = replacement.start - expressionStart;
    const end = replacement.end - expressionStart;
    lowered = `${lowered.slice(0, start)}${replacement.value}${lowered.slice(end)}`;
  }

  return lowered;
}

function visitOxcExpressionJsxRoots(
  node: Record<string, unknown>,
  visit: (node: Record<string, unknown>) => void,
): void {
  const unwrapped = unwrapOxcParentheses(node);

  if (unwrapped.type === "JSXElement" || unwrapped.type === "JSXFragment") {
    visit(unwrapped);
    return;
  }

  for (const value of Object.values(unwrapped)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const object = readObject(item);
        if (Object.keys(object).length > 0) {
          visitOxcExpressionJsxRoots(object, visit);
        }
      }
      continue;
    }

    if (typeof value === "object" && value !== null) {
      const object = readObject(value);
      if (Object.keys(object).length > 0) {
        visitOxcExpressionJsxRoots(object, visit);
      }
    }
  }
}

export function lowerOxcReactiveValueExpression(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
): string | undefined {
  const unwrapped = unwrapOxcParentheses(expression);

  if (unwrapped.type === "JSXFragment") {
    const children = readArray(unwrapped.children)
      .map((child) => lowerOxcReactiveChildValue(code, readObject(child), componentNames))
      .filter((child): child is string => child !== undefined);

    return [
      "(() => {",
      "  const _fragment = document.createDocumentFragment();",
      ...children.map((child) => `  _fragment.append(${child});`),
      "  return _fragment;",
      "})()",
    ].join("\n");
  }

  if (unwrapped.type !== "JSXElement") {
    return undefined;
  }

  const openingElement = readObject(unwrapped.openingElement);
  const tagName = readOxcJsxTagName(readObject(openingElement.name));

  if (/^[a-z]/.test(tagName)) {
    return lowerOxcDomNodeExpression(code, unwrapped);
  }

  if (!componentNames.has(tagName)) {
    return undefined;
  }

  return `${tagName}(${lowerOxcReactiveComponentProps(code, unwrapped, componentNames)})`;
}

function lowerOxcReactiveComponentProps(
  code: string,
  node: Record<string, unknown>,
  componentNames: Set<string>,
): string {
  const openingElement = readObject(node.openingElement);
  const entries = readArray(openingElement.attributes).flatMap((attribute): string[] => {
    const object = readObject(attribute);

    if (object.type === "JSXSpreadAttribute") {
      return [`...(${readSource(code, readObject(object.argument))})`];
    }

    if (object.type !== "JSXAttribute") {
      return [];
    }

    const name = String(readObject(object.name).name);
    const value = readObject(object.value);

    if (Object.keys(value).length === 0) {
      return [`${JSON.stringify(name)}: true`];
    }

    if (value.type === "Literal") {
      return [`${JSON.stringify(name)}: ${JSON.stringify(value.value)}`];
    }

    if (value.type === "JSXExpressionContainer") {
      const expression = readObject(value.expression);
      return [
        `${JSON.stringify(name)}: ${
          lowerOxcNestedJsxExpression(code, expression, componentNames, "client", [], "dom-node") ??
          readSource(code, expression)
        }`,
      ];
    }

    return [];
  });
  const children = readArray(node.children)
    .map((child) => lowerOxcReactiveChildValue(code, readObject(child), componentNames))
    .filter((child): child is string => child !== undefined);

  if (children.length === 1) {
    entries.push(`"children": ${children[0]}`);
  } else if (children.length > 1) {
    entries.push(`"children": [${children.join(", ")}]`);
  }

  return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
}

function lowerOxcReactiveChildValue(
  code: string,
  child: Record<string, unknown>,
  componentNames: Set<string>,
): string | undefined {
  if (child.type === "JSXText") {
    const value = typeof child.value === "string" ? child.value.replace(/\s+/g, " ").trim() : "";
    return value === "" ? undefined : JSON.stringify(value);
  }

  if (child.type === "JSXExpressionContainer") {
    const expression = readObject(child.expression);
    return (
      lowerOxcNestedJsxExpression(code, expression, componentNames, "client", [], "dom-node") ??
      readSource(code, expression)
    );
  }

  return lowerOxcReactiveValueExpression(code, child, componentNames);
}

export function lowerOxcServerStringExpression(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): string | undefined {
  const children = analyzeOxcExpressionChild(
    code,
    expression,
    createOxcNestedChildAnalysisContext(componentNames, target, diagnostics, "server-string"),
    "server-string",
  );

  if (children.length === 0) {
    return '""';
  }

  return emitOxcServerStringChildren(children);
}

function createOxcNestedChildAnalysisContext(
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx: OxcBodyStatementJsxMode,
): OxcChildAnalysisContext {
  return {
    componentNames,
    target,
    diagnostics,
    bodyStatementJsx,
    bodyLowerers: oxcNestedBodyLowerers,
    lowerNestedJsxExpression: lowerOxcNestedJsxExpression,
  };
}
