import type { OxcBodyStatementJsxMode } from "./oxc-analysis-types.js";
import { type OxcBodyLowerers } from "./oxc-body-lowering.js";
import { allocateOxcServerRenderValuePlaceholder } from "./oxc-code-utils.js";
import { analyzeOxcExpressionChild, type OxcChildAnalysisContext } from "./oxc-child-analysis.js";
import { markOxcCompatRuntimeReferences } from "./oxc-component-references.js";
import { lowerOxcDomNodeExpression, lowerOxcNormalizedDomChildAppend } from "./oxc-dom-lowering.js";
import { readOxcJsxTagName } from "./oxc-jsx-attributes.js";
import { normalizeOxcJsxText } from "./oxc-jsx-text.js";
import { readArray, readObject, readSource, unwrapOxcParentheses } from "./oxc-node-utils.js";
import {
  emitOxcCompatObjectChildren,
  emitOxcServerStreamRenderer,
  emitOxcServerStringChildren,
} from "./oxc-runtime-emit.js";
import { stripTypeScriptExpressionWithOxc } from "./oxc-transform.js";
import type { ClientReferenceIr } from "./ir.js";
import type { CompileTarget, Diagnostic } from "./types.js";
import {
  unsupportedRenderValuePlaceholderAwaitDiagnostic,
  unsupportedRenderValueSelectSpreadDiagnostic,
  unsupportedStreamComponentCoercionDiagnostic,
} from "./diagnostics.js";

const oxcNestedBodyLowerers: OxcBodyLowerers = {
  lowerDomNodeExpression: (code, expression, componentNames) =>
    lowerOxcReactiveValueExpression(code, expression, componentNames) ??
    lowerOxcDomNodeExpression(code, expression),
  lowerCompatObjectExpression: lowerOxcCompatObjectExpression,
  lowerServerStringExpression: (code, expression, componentNames, target, diagnostics) =>
    lowerOxcServerStringExpression(code, expression, componentNames, target, diagnostics),
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
  serverRenderValueWrapper?: string,
  localJsxReturnFunctionNames: ReadonlySet<string> = new Set(),
  serverOutput?: "stream" | "string",
): string | undefined {
  const source = readSource(code, expression);
  const expressionStart = typeof expression.start === "number" ? expression.start : 0;
  const replacements: Array<{ start: number; end: number; value: string }> = [];

  visitOxcExpressionJsxRoots(
    expression,
    localJsxReturnFunctionNames,
    (node, kind, renderValueMode) => {
      const start = typeof node.start === "number" ? node.start : undefined;
      const end = typeof node.end === "number" ? node.end : undefined;

      if (start === undefined || end === undefined) {
        return;
      }

      const lowered =
        kind === "jsx" && bodyStatementJsx === "compat-object"
          ? lowerOxcCompatReactNodeExpression(code, node, componentNames, target, diagnostics)
          : kind === "jsx" && bodyStatementJsx === "server-string"
            ? serverOutput === "stream" &&
              serverRenderValueWrapper !== undefined &&
              renderValueMode !== "coerced" &&
              (containsOxcStreamComponentJsx(node, componentNames) ||
                containsOxcStreamSemanticJsx(node))
              ? lowerOxcServerStreamExpression(
                  code,
                  node,
                  componentNames,
                  target,
                  diagnostics,
                  serverRenderValueWrapper,
                  renderValueMode === "collection",
                )
              : serverOutput === "stream" &&
                  renderValueMode === "coerced" &&
                  containsNativeStreamComponent(
                    analyzeOxcExpressionChild(
                      code,
                      node,
                      createOxcNestedChildAnalysisContext(
                        componentNames,
                        target,
                        diagnostics,
                        "server-string",
                      ),
                      "server-string",
                    ),
                  )
                ? (diagnostics.push(unsupportedStreamComponentCoercionDiagnostic()), '""')
                : lowerOxcServerStringExpression(
                    code,
                    node,
                    componentNames,
                    target,
                    diagnostics,
                    new Map(),
                    serverRenderValueWrapper === undefined
                      ? undefined
                      : `${serverRenderValueWrapper}$escape`,
                  )
            : kind === "jsx"
              ? lowerOxcReactiveValueExpression(code, node, componentNames)
              : emitOxcServerRenderValueCall(
                  code,
                  node,
                  expression,
                  serverRenderValueWrapper,
                  componentNames,
                  target,
                  diagnostics,
                  localJsxReturnFunctionNames,
                  serverOutput,
                );

      if (lowered !== undefined) {
        replacements.push({
          start,
          end,
          value:
            kind === "jsx" &&
            bodyStatementJsx === "server-string" &&
            serverRenderValueWrapper !== undefined &&
            !(
              serverOutput === "stream" &&
              renderValueMode !== "coerced" &&
              (containsOxcStreamComponentJsx(node, componentNames) ||
                containsOxcStreamSemanticJsx(node))
            )
              ? `${serverRenderValueWrapper}(${lowered})`
              : lowered,
        });
      }
    },
  );

  if (replacements.length === 0) {
    return undefined;
  }

  let lowered = source;

  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    const start = replacement.start - expressionStart;
    const end = replacement.end - expressionStart;
    lowered = `${lowered.slice(0, start)}${replacement.value}${lowered.slice(end)}`;
  }

  return stripTypeScriptExpressionWithOxc(lowered);
}

function lowerOxcServerStreamExpression(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  serverRenderValueWrapper: string,
  selfThunk: boolean,
): string | undefined {
  const children = analyzeOxcExpressionChild(
    code,
    expression,
    createOxcNestedChildAnalysisContext(componentNames, target, diagnostics, "server-string"),
    "server-string",
  );
  if (children.length === 0) return undefined;
  const placeholderAwait = findPlaceholderAwait(children);
  if (placeholderAwait !== undefined) {
    diagnostics.push(unsupportedRenderValuePlaceholderAwaitDiagnostic(placeholderAwait.loc));
  }
  if (containsSpreadSelect(children)) {
    diagnostics.push(unsupportedRenderValueSelectSpreadDiagnostic());
  }

  const localBase = allocateOxcServerRenderValuePlaceholder(code, expression);
  const renderer = emitOxcServerStreamRenderer(children, {
    sink: `${localBase}$sink`,
    selectedValue: `${localBase}$selectedValue`,
    selectedMultiple: `${localBase}$selectedMultiple`,
    renderValue: `${serverRenderValueWrapper}$render`,
    renderAsyncBoundary: `${serverRenderValueWrapper}$async`,
    registerThunk: `${serverRenderValueWrapper}$thunk`,
    compatRenderToString: `${serverRenderValueWrapper}$compat`,
    escapeHtml: `${serverRenderValueWrapper}$escape`,
    localBase,
  });
  return selfThunk
    ? `${serverRenderValueWrapper}$thunk(${renderer})`
    : `${serverRenderValueWrapper}(${renderer})`;
}

function containsNativeStreamComponent(children: readonly import("./ir.js").JsxNodeIr[]): boolean {
  return children.some((child) => {
    if (child.kind === "component" && child.runtime !== "compat") return true;
    const nested =
      child.kind === "conditional"
        ? [...child.whenTrue, ...child.whenFalse]
        : child.kind === "list" || child.kind === "fragment" || child.kind === "element"
          ? child.children
          : child.kind === "async-boundary"
            ? [
                ...child.children,
                ...(child.placeholderChildren ?? []),
                ...(child.catchChildren ?? []),
              ]
            : [];
    return containsNativeStreamComponent(nested);
  });
}

function findPlaceholderAwait(
  children: readonly import("./ir.js").JsxNodeIr[],
): Extract<import("./ir.js").JsxNodeIr, { kind: "async-boundary" }> | undefined {
  for (const child of children) {
    if (child.kind === "async-boundary" && child.placeholderChildren !== undefined) return child;
    const nested =
      child.kind === "conditional"
        ? [...child.whenTrue, ...child.whenFalse]
        : child.kind === "list" || child.kind === "fragment" || child.kind === "element"
          ? child.children
          : child.kind === "async-boundary"
            ? [...child.children, ...(child.catchChildren ?? [])]
            : [];
    const found = findPlaceholderAwait(nested);
    if (found !== undefined) return found;
  }
  return undefined;
}

function containsSpreadSelect(children: readonly import("./ir.js").JsxNodeIr[]): boolean {
  return children.some((child) => {
    if (
      child.kind === "element" &&
      child.tagName === "select" &&
      child.attributes.some((attribute) => attribute.kind === "spread-attr")
    ) {
      return true;
    }
    const nested =
      child.kind === "conditional"
        ? [...child.whenTrue, ...child.whenFalse]
        : child.kind === "list" || child.kind === "fragment" || child.kind === "element"
          ? child.children
          : child.kind === "async-boundary"
            ? [
                ...child.children,
                ...(child.placeholderChildren ?? []),
                ...(child.catchChildren ?? []),
              ]
            : [];
    return containsSpreadSelect(nested);
  });
}

function visitOxcExpressionJsxRoots(
  node: Record<string, unknown>,
  localJsxReturnFunctionNames: ReadonlySet<string>,
  visit: (
    node: Record<string, unknown>,
    kind: "call" | "jsx",
    renderValueMode: "coerced" | "collection" | "value",
  ) => void,
  coercesToPrimitive = false,
  insideCollection = false,
): void {
  const unwrapped = unwrapOxcParentheses(node);

  if (unwrapped.type === "JSXElement" || unwrapped.type === "JSXFragment") {
    visit(
      unwrapped,
      "jsx",
      coercesToPrimitive ? "coerced" : insideCollection ? "collection" : "value",
    );
    return;
  }

  if (isOxcLocalJsxHelperCall(unwrapped, localJsxReturnFunctionNames)) {
    visit(
      unwrapped,
      "call",
      coercesToPrimitive ? "coerced" : insideCollection ? "collection" : "value",
    );
    return;
  }

  const childCoercesToPrimitive = coercesToPrimitive || isOxcExplicitPrimitiveCoercion(unwrapped);
  const childInsideCollection = insideCollection || unwrapped.type === "ArrayExpression";

  for (const value of Object.values(unwrapped)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const object = readObject(item);
        if (Object.keys(object).length > 0) {
          visitOxcExpressionJsxRoots(
            object,
            localJsxReturnFunctionNames,
            visit,
            childCoercesToPrimitive,
            childInsideCollection,
          );
        }
      }
      continue;
    }

    if (typeof value === "object" && value !== null) {
      const object = readObject(value);
      if (Object.keys(object).length > 0) {
        visitOxcExpressionJsxRoots(
          object,
          localJsxReturnFunctionNames,
          visit,
          childCoercesToPrimitive,
          childInsideCollection,
        );
      }
    }
  }
}

function isOxcExplicitPrimitiveCoercion(expression: Record<string, unknown>): boolean {
  if (expression.type === "TemplateLiteral") return true;
  if (expression.type === "UnaryExpression") {
    return (
      expression.operator === "+" || expression.operator === "-" || expression.operator === "~"
    );
  }
  if (expression.type === "BinaryExpression") {
    return expression.operator !== "===" && expression.operator !== "!==";
  }
  if (expression.type !== "CallExpression") return false;
  const callee = unwrapOxcParentheses(readObject(expression.callee));
  return callee.type === "Identifier" && callee.name === "String";
}

function containsOxcStreamComponentJsx(
  expression: Record<string, unknown>,
  componentNames: ReadonlySet<string>,
): boolean {
  const unwrapped = unwrapOxcParentheses(expression);
  if (unwrapped.type === "JSXElement") {
    const openingElement = readObject(unwrapped.openingElement);
    const tagName = readOxcJsxTagName(readObject(openingElement.name));
    if (/^[A-Z]/u.test(tagName) || componentNames.has(tagName)) return true;
  }
  return Object.values(unwrapped).some((value) =>
    Array.isArray(value)
      ? value.some((item) => containsOxcStreamComponentJsx(readObject(item), componentNames))
      : typeof value === "object" &&
        value !== null &&
        containsOxcStreamComponentJsx(readObject(value), componentNames),
  );
}

function containsOxcStreamSemanticJsx(expression: Record<string, unknown>): boolean {
  const unwrapped = unwrapOxcParentheses(expression);
  if (unwrapped.type === "JSXElement") {
    const openingElement = readObject(unwrapped.openingElement);
    const tagName = readOxcJsxTagName(readObject(openingElement.name));
    if (tagName === "Await" || tagName === "select" || tagName === "option") return true;
  }
  return Object.values(unwrapped).some((value) =>
    Array.isArray(value)
      ? value.some((item) => containsOxcStreamSemanticJsx(readObject(item)))
      : typeof value === "object" &&
        value !== null &&
        containsOxcStreamSemanticJsx(readObject(value)),
  );
}

function isOxcLocalJsxHelperCall(
  expression: Record<string, unknown>,
  localJsxReturnFunctionNames: ReadonlySet<string>,
): boolean {
  if (expression.type !== "CallExpression") return false;

  const callee = unwrapOxcParentheses(readObject(expression.callee));
  return (
    callee.type === "Identifier" &&
    typeof callee.name === "string" &&
    localJsxReturnFunctionNames.has(callee.name)
  );
}

function emitOxcServerRenderValueCall(
  code: string,
  expression: Record<string, unknown>,
  allocationRoot: Record<string, unknown>,
  serverRenderValueWrapper: string | undefined,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  localJsxReturnFunctionNames: ReadonlySet<string>,
  serverOutput: "stream" | "string" | undefined,
): string | undefined {
  if (serverRenderValueWrapper === undefined) return undefined;
  const args = readArray(expression.arguments).map((argument) => {
    const argumentObject = unwrapOxcParentheses(readObject(argument));
    return (
      lowerOxcNestedJsxExpression(
        code,
        argumentObject,
        componentNames,
        target,
        diagnostics,
        "server-string",
        serverRenderValueWrapper,
        localJsxReturnFunctionNames,
        serverOutput,
      ) ?? readSource(code, argument)
    );
  });
  const callee = readSource(code, readObject(expression.callee));
  if (serverOutput !== "stream") {
    return `${serverRenderValueWrapper}(${callee}(${args.join(", ")}))`;
  }

  const sinkName = `${allocateOxcServerRenderValuePlaceholder(code, allocationRoot)}$sink`;
  const callArgs = [sinkName, ...args].join(", ");
  return `${serverRenderValueWrapper}((${sinkName}) => ${callee}(${callArgs}))`;
}

export function lowerOxcReactiveValueExpression(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  resolveExpressionCode?: (expression: Record<string, unknown>) => string,
): string | undefined {
  const unwrapped = unwrapOxcParentheses(expression);

  if (unwrapped.type === "JSXFragment") {
    const children = readArray(unwrapped.children)
      .map((child, index, siblings) =>
        lowerOxcReactiveChildValue(
          code,
          readObject(child),
          componentNames,
          siblings,
          index,
          resolveExpressionCode,
        ),
      )
      .filter((child): child is string => child !== undefined);

    return [
      "(() => {",
      "  const _fragment = document.createDocumentFragment();",
      ...children.map((child) => lowerOxcNormalizedDomChildAppend("_fragment", child)),
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
    return lowerOxcDomNodeExpression(
      code,
      unwrapped,
      (expression) =>
        lowerOxcNestedJsxExpression(code, expression, componentNames, "client", [], "dom-node"),
      resolveExpressionCode,
    );
  }

  if (!/^[A-Z][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(tagName) && !componentNames.has(tagName)) {
    return undefined;
  }

  return `${tagName}(${lowerOxcReactiveComponentProps(code, unwrapped, componentNames, resolveExpressionCode)})`;
}

function lowerOxcReactiveComponentProps(
  code: string,
  node: Record<string, unknown>,
  componentNames: Set<string>,
  resolveExpressionCode?: (expression: Record<string, unknown>) => string,
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

    const name = readOxcJsxTagName(readObject(object.name));
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
          resolveExpressionCode?.(expression) ??
          readSource(code, expression)
        }`,
      ];
    }

    return [];
  });
  const children = readArray(node.children)
    .map((child, index, siblings) =>
      lowerOxcReactiveChildValue(
        code,
        readObject(child),
        componentNames,
        siblings,
        index,
        resolveExpressionCode,
      ),
    )
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
  siblings: readonly unknown[],
  index: number,
  resolveExpressionCode?: (expression: Record<string, unknown>) => string,
): string | undefined {
  if (child.type === "JSXText") {
    const value =
      typeof child.value === "string" ? normalizeOxcJsxText(child.value, siblings, index) : "";
    return value === "" ? undefined : JSON.stringify(value);
  }

  if (child.type === "JSXExpressionContainer") {
    const expression = readObject(child.expression);
    return (
      lowerOxcNestedJsxExpression(code, expression, componentNames, "client", [], "dom-node") ??
      resolveExpressionCode?.(expression) ??
      readSource(code, expression)
    );
  }

  return lowerOxcReactiveValueExpression(code, child, componentNames, resolveExpressionCode);
}

export function lowerOxcServerStringExpression(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  compatRuntimeReferences: ReadonlyMap<string, ClientReferenceIr> = new Map(),
  escapeHelperName?: string,
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

  if (compatRuntimeReferences.size > 0) {
    for (const child of children) {
      markOxcCompatRuntimeReferences(child, compatRuntimeReferences);
    }
  }

  return emitOxcServerStringChildren(children, escapeHelperName);
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
