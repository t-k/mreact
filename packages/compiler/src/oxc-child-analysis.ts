import {
  invalidJsxExpressionDiagnostic,
  unsupportedCallbackLocalListKeyDiagnostic,
  unserializableAwaitValueDiagnostic,
  unsupportedComponentReferenceDiagnostic,
  unsupportedJsxNamespaceTagDiagnostic,
  unsupportedJsxSpreadChildDiagnostic,
} from "./diagnostics.js";
import {
  collectBindingNames,
  collectBindingNamesFromPattern,
  readOxcParameterName,
} from "./oxc-bindings.js";
import type {
  AsyncBoundaryIr,
  CompiledSingleNodeListIr,
  CompilerKeyedEventProgramIr,
  CompilerSelectedClassIr,
  JsxElementIr,
  JsxNodeIr,
  ListParameterBindingIr,
} from "./ir.js";
import type { OxcBodyStatementJsxMode } from "./oxc-analysis-types.js";
import {
  detectUnserializableAwaitValueReason,
  readOxcExpressionAttribute,
  readOxcExpressionAttributeNode,
} from "./oxc-await-analysis.js";
import {
  analyzeOxcArrowJsxRenderer,
  analyzeOxcComponentProp,
  analyzeOxcSingleArrowJsxChild,
  readOxcConsumerRenderProp,
} from "./oxc-component-props.js";
import {
  formatOxcBodyStatement,
  lowerOxcBodyStatementJsx,
  type OxcBodyLowerers,
} from "./oxc-body-lowering.js";
import { normalizeOxcExpressionCode, stripOxcGeneratedImports } from "./oxc-code-utils.js";
import {
  findOxcKeyCodeInChildren,
  readOxcReturnExpressionFromStatement,
} from "./oxc-expression-utils.js";
import {
  analyzeOxcAttribute,
  findOxcJsxAttributeCode,
  isStableOxcKeyedEventAttribute,
  readOxcDynamicAttributeExpression,
  readOxcJsxTagName,
} from "./oxc-jsx-attributes.js";
import { normalizeOxcJsxText } from "./oxc-jsx-text.js";
import {
  getOxcLocation,
  readArray,
  readObject,
  readSource,
  unwrapOxcParentheses,
} from "./oxc-node-utils.js";
import {
  collectOxcBodyJsxBindingNames,
  containsOxcJsxSyntax,
  isOxcRenderValueExpression,
  markOxcRenderValueExpressions,
  rewriteOxcReactiveAliasExpressionCode,
} from "./oxc-render-values.js";
import { transformJsxWithOxc } from "./oxc-transform.js";
import type { CompileTarget, Diagnostic, ServerOutputMode } from "./types.js";

export interface OxcChildAnalysisContext {
  componentNames: Set<string>;
  componentCallNames?: Set<string>;
  target: CompileTarget;
  serverOutput?: ServerOutputMode;
  diagnostics: Diagnostic[];
  bodyStatementJsx?: OxcBodyStatementJsxMode;
  componentBodyBindings?: ReadonlyMap<string, Record<string, unknown>>;
  componentConstBindings?: ReadonlySet<string>;
  compilerKeyedEventParent?: boolean;
  jsxNamespace?: "html" | "svg";
  reactiveAliasBindings?: ReadonlyMap<string, string>;
  bodyLowerers: OxcBodyLowerers;
  lowerNestedJsxExpression: (
    code: string,
    expression: Record<string, unknown>,
    componentNames: Set<string>,
    target: CompileTarget,
    diagnostics: Diagnostic[],
    bodyStatementJsx: OxcBodyStatementJsxMode,
  ) => string | undefined;
}

export function analyzeOxcJsxNode(
  code: string,
  node: Record<string, unknown>,
  context: OxcChildAnalysisContext,
  bodyStatementJsx = resolveOxcBodyStatementJsx(context),
): JsxNodeIr {
  if (node.type === "JSXFragment") {
    return {
      kind: "fragment",
      children: analyzeOxcChildren(
        code,
        readArray(node.children),
        { ...context, compilerKeyedEventParent: false },
        bodyStatementJsx,
      ),
    };
  }

  if (node.type !== "JSXElement") {
    return { kind: "expr", code: readSource(code, node) };
  }

  const openingElement = readObject(node.openingElement);
  const openingElementName = readObject(openingElement.name);
  const tagName = readOxcJsxTagName(openingElementName);
  const attributes = readArray(openingElement.attributes);

  if (openingElementName.type === "JSXNamespacedName") {
    context.diagnostics.push(
      unsupportedJsxNamespaceTagDiagnostic(tagName, getOxcLocation(code, openingElementName)),
    );
  }

  if (tagName === "Await") {
    return analyzeOxcAsyncBoundary(
      code,
      node,
      attributes,
      { ...context, compilerKeyedEventParent: false },
      bodyStatementJsx,
    );
  }

  if (tagName === "Slot") {
    const keyCode = findOxcJsxAttributeCode(code, attributes, "key");
    const allowRef = bodyStatementJsx === "compat-object";

    return {
      kind: "element",
      tagName: "slot",
      ...(keyCode === undefined ? {} : { keyCode }),
      attributes: attributes
        .flatMap((attr) =>
          analyzeOxcAttribute(code, attr, context.target, context.diagnostics, {
            allowRef,
            resolveExpressionCode: (expression) => {
              if (containsOxcJsxSyntax(expression)) {
                const lowered = context.lowerNestedJsxExpression(
                  code,
                  expression,
                  context.componentNames,
                  context.target,
                  context.diagnostics,
                  bodyStatementJsx,
                );
                if (lowered !== undefined) {
                  return normalizeOxcExpressionCode(lowered);
                }
              }
              return readOxcReactiveExpressionCode(code, expression, context);
            },
          }),
        )
        .filter((attribute) => attribute.kind === "spread-attr" || attribute.name !== "key"),
      children: analyzeOxcChildren(
        code,
        readArray(node.children),
        { ...context, compilerKeyedEventParent: true },
        bodyStatementJsx,
      ),
    } satisfies JsxElementIr;
  }

  if (
    /^[A-Z][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(tagName) ||
    context.componentNames.has(tagName) ||
    isOxcRuntimeComponentBinding(tagName, context)
  ) {
    const keyCode = findOxcJsxAttributeCode(code, attributes, "key");
    const allowRef = bodyStatementJsx === "compat-object";
    const analyzeJsxNode = (
      child: Record<string, unknown>,
      childBodyStatementJsx: OxcBodyStatementJsxMode = bodyStatementJsx,
      shadowNames: readonly string[] = [],
    ) =>
      analyzeOxcJsxNode(
        code,
        child,
        shadowOxcReactiveAliases({ ...context, compilerKeyedEventParent: false }, shadowNames),
        childBodyStatementJsx,
      );
    const consumerRenderProp = tagName.endsWith(".Consumer")
      ? readOxcConsumerRenderProp(code, readArray(node.children), analyzeJsxNode, bodyStatementJsx)
      : undefined;
    const componentLoc = getOxcLocation(code, openingElement.name);

    return {
      kind: "component",
      name: tagName,
      ...(componentLoc === undefined ? {} : { loc: componentLoc }),
      ...(keyCode === undefined ? {} : { keyCode }),
      props: attributes
        .flatMap((attr) =>
          analyzeOxcComponentProp(code, attr, analyzeJsxNode, context.diagnostics, {
            allowRef,
            resolveExpressionCode: (expression) => {
              if (containsOxcJsxSyntax(expression)) {
                const lowered = context.lowerNestedJsxExpression(
                  code,
                  expression,
                  context.componentNames,
                  context.target,
                  context.diagnostics,
                  bodyStatementJsx,
                );
                if (lowered !== undefined) {
                  return normalizeOxcExpressionCode(lowered);
                }
              }
              return readOxcReactiveExpressionCode(code, expression, context);
            },
          }),
        )
        .filter((prop) => prop.kind === "spread-prop" || prop.name !== "key")
        .concat(consumerRenderProp === undefined ? [] : [consumerRenderProp]),
      children:
        consumerRenderProp === undefined
          ? analyzeOxcChildren(
              code,
              readArray(node.children),
              { ...context, compilerKeyedEventParent: false },
              bodyStatementJsx,
            )
          : [],
    };
  }

  if (/^[A-Z]/.test(tagName)) {
    const componentLoc = getOxcLocation(code, openingElement.name);
    context.diagnostics.push(unsupportedComponentReferenceDiagnostic(tagName, componentLoc));

    return {
      kind: "component",
      name: tagName,
      ...(componentLoc === undefined ? {} : { loc: componentLoc }),
      props: [],
      children: [],
    };
  }

  const keyCode = findOxcJsxAttributeCode(code, attributes, "key");
  const allowRef = bodyStatementJsx === "compat-object";
  const namespace = tagName === "svg" || context.jsxNamespace === "svg" ? "svg" : undefined;
  const childNamespace =
    namespace === "svg" && tagName === "foreignObject"
      ? "html"
      : (namespace ?? context.jsxNamespace);

  return {
    kind: "element",
    tagName,
    ...(namespace === undefined ? {} : { namespace }),
    ...(keyCode === undefined ? {} : { keyCode }),
    attributes: attributes
      .flatMap((attr) =>
        analyzeOxcAttribute(code, attr, context.target, context.diagnostics, {
          allowRef,
          resolveExpressionCode: (expression) =>
            readOxcReactiveExpressionCode(code, expression, context),
        }),
      )
      .filter((attribute) => attribute.kind === "spread-attr" || attribute.name !== "key"),
    children: analyzeOxcChildren(
      code,
      readArray(node.children),
      {
        ...context,
        compilerKeyedEventParent: true,
        ...(childNamespace === undefined ? {} : { jsxNamespace: childNamespace }),
      },
      bodyStatementJsx,
    ),
  } satisfies JsxElementIr;
}

function isOxcRuntimeComponentBinding(tagName: string, context: OxcChildAnalysisContext): boolean {
  if (!/^[A-Z]/.test(tagName)) {
    return false;
  }

  const binding = context.componentBodyBindings?.get(tagName);
  if (binding === undefined) {
    return false;
  }

  return isOxcRuntimeComponentExpression(binding);
}

function isOxcRuntimeComponentExpression(expression: Record<string, unknown>): boolean {
  if (
    expression.type === "Identifier" ||
    expression.type === "MemberExpression" ||
    expression.type === "CallExpression" ||
    expression.type === "FunctionExpression" ||
    expression.type === "ArrowFunctionExpression"
  ) {
    return true;
  }

  if (expression.type === "ChainExpression") {
    return isOxcRuntimeComponentExpression(readObject(expression.expression));
  }

  if (expression.type === "ConditionalExpression") {
    return (
      isOxcRuntimeComponentExpression(readObject(expression.consequent)) &&
      isOxcRuntimeComponentExpression(readObject(expression.alternate))
    );
  }

  if (expression.type === "LogicalExpression") {
    return isOxcRuntimeComponentExpression(readObject(expression.right));
  }

  return false;
}

function analyzeOxcAsyncBoundary(
  code: string,
  node: Record<string, unknown>,
  attributes: readonly unknown[],
  context: OxcChildAnalysisContext,
  bodyStatementJsx: OxcBodyStatementJsxMode,
): AsyncBoundaryIr {
  const valueExpression = readOxcExpressionAttributeNode(attributes, "value");

  if (valueExpression !== undefined) {
    const unserializableReason = detectUnserializableAwaitValueReason(
      valueExpression,
      context.componentBodyBindings,
    );

    if (unserializableReason !== undefined) {
      context.diagnostics.push(unserializableAwaitValueDiagnostic(unserializableReason));
    }
  }

  const valueCode = readOxcExpressionAttribute(code, attributes, "value") ?? "undefined";
  const placeholderExpression = readOxcExpressionAttributeNode(attributes, "placeholder");
  const placeholderTagCode = findOxcJsxAttributeCode(code, attributes, "placeholderAs");
  const catchExpression = readOxcExpressionAttributeNode(attributes, "catch");
  const renderer = analyzeOxcSingleArrowJsxChild(
    code,
    readArray(node.children),
    (child, childBodyStatementJsx = bodyStatementJsx) =>
      analyzeOxcJsxNode(code, child, context, childBodyStatementJsx),
    bodyStatementJsx,
  );
  const catchRenderer =
    catchExpression !== undefined && readObject(catchExpression).type === "ArrowFunctionExpression"
      ? analyzeOxcArrowJsxRenderer(
          code,
          readObject(catchExpression),
          (child, childBodyStatementJsx = bodyStatementJsx) =>
            analyzeOxcJsxNode(code, child, context, childBodyStatementJsx),
          bodyStatementJsx,
        )
      : undefined;
  const placeholderChildren =
    placeholderExpression === undefined
      ? undefined
      : analyzeOxcExpressionChild(
          code,
          readObject(placeholderExpression),
          context,
          bodyStatementJsx,
        );
  const openingElement = readObject(node.openingElement);
  const awaitLoc = getOxcLocation(code, readObject(openingElement.name));

  return {
    kind: "async-boundary",
    ...(awaitLoc === undefined ? {} : { loc: awaitLoc }),
    valueCode,
    valueName: renderer.valueName,
    children: renderer.children,
    ...(placeholderChildren === undefined ? {} : { placeholderChildren }),
    ...(placeholderTagCode === undefined ? {} : { placeholderTagCode }),
    ...(catchRenderer === undefined
      ? {}
      : {
          catchName: catchRenderer.valueName,
          catchChildren: catchRenderer.children,
        }),
  };
}

export function analyzeOxcChildren(
  code: string,
  children: readonly unknown[],
  context: OxcChildAnalysisContext,
  bodyStatementJsx = resolveOxcBodyStatementJsx(context),
): JsxNodeIr[] {
  return children.flatMap((child, index): JsxNodeIr[] => {
    const object = readObject(child);

    if (object.type === "JSXText") {
      const value = typeof object.value === "string" ? object.value : "";
      const normalizedValue = normalizeOxcJsxText(value, children, index);
      return normalizedValue === "" ? [] : [{ kind: "text", value: normalizedValue }];
    }

    if (object.type === "JSXElement" || object.type === "JSXFragment") {
      return [analyzeOxcJsxNode(code, object, context, bodyStatementJsx)];
    }

    if (object.type === "JSXExpressionContainer") {
      return analyzeOxcExpressionChild(
        code,
        readObject(object.expression),
        context,
        bodyStatementJsx,
      );
    }

    if (object.type === "JSXSpreadChild") {
      context.diagnostics.push(unsupportedJsxSpreadChildDiagnostic(getOxcLocation(code, object)));
      return [];
    }

    return [];
  });
}

export function analyzeOxcExpressionChild(
  code: string,
  expression: Record<string, unknown>,
  context: OxcChildAnalysisContext,
  bodyStatementJsx = resolveOxcBodyStatementJsx(context),
): JsxNodeIr[] {
  const unwrappedExpression = unwrapOxcParentheses(expression);

  if (unwrappedExpression.type === "JSXEmptyExpression") {
    if (isOxcJsxCommentExpression(code, unwrappedExpression)) {
      return [];
    }

    context.diagnostics.push(
      invalidJsxExpressionDiagnostic(getOxcLocation(code, expression), "text"),
    );
    return [];
  }

  if (unwrappedExpression.type === "ConditionalExpression") {
    return [
      {
        kind: "conditional",
        conditionCode: readOxcReactiveExpressionCode(
          code,
          readObject(unwrappedExpression.test),
          context,
        ),
        whenTrue: analyzeOxcDynamicBranch(
          code,
          readObject(unwrappedExpression.consequent),
          context,
          bodyStatementJsx,
        ),
        whenFalse: analyzeOxcDynamicBranch(
          code,
          readObject(unwrappedExpression.alternate),
          context,
          bodyStatementJsx,
        ),
      },
    ];
  }

  if (
    unwrappedExpression.type === "LogicalExpression" &&
    containsOxcJsxSyntax(readObject(unwrappedExpression.right))
  ) {
    const rightBranch = analyzeOxcDynamicBranch(
      code,
      readObject(unwrappedExpression.right),
      context,
      bodyStatementJsx,
    );

    const leftExpression = readObject(unwrappedExpression.left);
    const conditionValueName = logicalConditionValueName(leftExpression);

    if (unwrappedExpression.operator === "&&") {
      return [
        {
          kind: "conditional",
          conditionCode: readOxcReactiveExpressionCode(code, leftExpression, context),
          conditionValueName,
          whenTrue: rightBranch,
          whenFalse: [
            {
              kind: "expr",
              code: renderableFalsyConditionValueCode(conditionValueName),
            },
          ],
        },
      ];
    }

    if (unwrappedExpression.operator === "||") {
      return [
        {
          kind: "conditional",
          conditionCode: readOxcReactiveExpressionCode(code, leftExpression, context),
          conditionValueName,
          whenTrue: [
            {
              kind: "expr",
              code: conditionValueName,
            },
          ],
          whenFalse: rightBranch,
        },
      ];
    }
  }

  const list = analyzeOxcListExpression(code, unwrappedExpression, context, bodyStatementJsx);

  if (list !== undefined) {
    return [list];
  }

  if (unwrappedExpression.type === "JSXElement" || unwrappedExpression.type === "JSXFragment") {
    return [analyzeOxcJsxNode(code, unwrappedExpression, context, bodyStatementJsx)];
  }

  const sameModuleComponentStreamCall =
    context.target === "server" && context.serverOutput === "stream"
      ? emitOxcSameModuleComponentStreamCall(
          code,
          expression,
          context.componentCallNames ?? context.componentNames,
        )
      : undefined;
  const componentCallNamesForRenderMode =
    context.target === "server" && context.serverOutput === "stream"
      ? (context.componentCallNames ?? context.componentNames)
      : context.componentNames;
  const sameModuleComponentCall =
    sameModuleComponentStreamCall !== undefined ||
    isOxcSameModuleComponentCallExpression(expression, componentCallNamesForRenderMode);
  const containsNestedJsx = containsOxcJsxSyntax(unwrappedExpression);
  const loweredNestedJsx = containsNestedJsx
    ? context.lowerNestedJsxExpression(
        code,
        expression,
        context.componentNames,
        context.target,
        context.diagnostics,
        bodyStatementJsx,
      )
    : undefined;
  const isKnownRenderValue = isOxcRenderValueExpression(expression) || sameModuleComponentCall;
  const renderMode =
    sameModuleComponentStreamCall !== undefined
      ? ("stream-node" as const)
      : isKnownRenderValue
        ? bodyStatementJsx === "server-string"
          ? ("html" as const)
          : ("dynamic" as const)
        : loweredNestedJsx !== undefined && bodyStatementJsx === "server-string"
          ? ("html" as const)
          : loweredNestedJsx !== undefined && bodyStatementJsx === "dom-node"
            ? ("dynamic" as const)
            : undefined;

  return [
    {
      kind: "expr",
      code:
        sameModuleComponentStreamCall ??
        (containsNestedJsx
          ? normalizeOxcExpressionCode(
              loweredNestedJsx ??
                (bodyStatementJsx === "compat-object"
                  ? stripOxcGeneratedImports(transformJsxWithOxc(readSource(code, expression)))
                  : readOxcReactiveExpressionCode(code, expression, context)),
            )
          : readOxcReactiveExpressionCode(code, expression, context)),
      ...(renderMode === undefined ? {} : { renderMode }),
    },
  ];
}

function readOxcReactiveExpressionCode(
  code: string,
  expression: Record<string, unknown>,
  context: OxcChildAnalysisContext,
): string {
  const unwrappedExpression = unwrapOxcParentheses(expression);

  if (unwrappedExpression.type === "Identifier" && typeof unwrappedExpression.name === "string") {
    return (
      context.reactiveAliasBindings?.get(unwrappedExpression.name) ?? readSource(code, expression)
    );
  }

  return (
    rewriteOxcReactiveAliasExpressionCode(code, expression, context.reactiveAliasBindings) ??
    readSource(code, expression)
  );
}

function isOxcSameModuleComponentCallExpression(
  expression: Record<string, unknown>,
  componentNames: ReadonlySet<string>,
): boolean {
  const unwrappedExpression = unwrapOxcParentheses(expression);

  if (unwrappedExpression.type !== "CallExpression") {
    return false;
  }

  const callee = readObject(unwrappedExpression.callee);

  return (
    callee.type === "Identifier" &&
    typeof callee.name === "string" &&
    componentNames.has(callee.name)
  );
}

function emitOxcSameModuleComponentStreamCall(
  code: string,
  expression: Record<string, unknown>,
  componentNames: ReadonlySet<string>,
): string | undefined {
  const unwrappedExpression = unwrapOxcParentheses(expression);

  if (unwrappedExpression.type !== "CallExpression") {
    return undefined;
  }

  const callee = readObject(unwrappedExpression.callee);

  if (
    callee.type !== "Identifier" ||
    typeof callee.name !== "string" ||
    !componentNames.has(callee.name)
  ) {
    return undefined;
  }

  const args = readArray(unwrappedExpression.arguments)
    .map((argument) => readSource(code, argument))
    .join(", ");

  return `($sink) => ${callee.name}($sink${args === "" ? "" : `, ${args}`})`;
}

function analyzeOxcDynamicBranch(
  code: string,
  expression: Record<string, unknown>,
  context: OxcChildAnalysisContext,
  bodyStatementJsx: OxcBodyStatementJsxMode,
): JsxNodeIr[] {
  if (expression.type === "Literal" && (expression.value === null || expression.value === false)) {
    return [];
  }

  return analyzeOxcExpressionChild(code, expression, context, bodyStatementJsx);
}

function analyzeOxcListExpression(
  code: string,
  expression: Record<string, unknown>,
  context: OxcChildAnalysisContext,
  bodyStatementJsx: OxcBodyStatementJsxMode,
): JsxNodeIr | undefined {
  const callExpression =
    expression.type === "ChainExpression" ? readObject(expression.expression) : expression;

  if (callExpression.type !== "CallExpression") {
    return undefined;
  }

  const callee = readObject(callExpression.callee);

  if (callee.type !== "MemberExpression" || readObject(callee.property).name !== "map") {
    return undefined;
  }

  const renderer = readObject(readArray(callExpression.arguments)[0]);

  if (renderer.type !== "ArrowFunctionExpression") {
    return undefined;
  }

  const parameters = readArray(renderer.params);
  const itemParameter = readObject(parameters[0]);
  const parameterPatterns = parameters.map((parameter) =>
    readOxcListParameterPattern(code, parameter),
  );
  const parameterBindingNames = parameters.flatMap((parameter) =>
    collectBindingNamesFromPattern(readObject(parameter)),
  );
  const sourceRendererContext = shadowOxcReactiveAliases(context, [
    ...parameterBindingNames,
    ...collectBindingNames(renderer.body),
  ]);
  const sourceRendererBody = analyzeOxcListRenderer(
    code,
    renderer,
    sourceRendererContext,
    bodyStatementJsx,
  );

  if (sourceRendererBody === undefined) {
    return undefined;
  }

  const discoveredSourceKeyCode = findOxcKeyCodeInChildren(sourceRendererBody.children);
  const callbackLocalKeyBinding =
    context.target === "client" && bodyStatementJsx !== "compat-object"
      ? findOxcCallbackLocalKeyBinding(code, renderer, discoveredSourceKeyCode)
      : undefined;
  if (callbackLocalKeyBinding !== undefined) {
    context.diagnostics.push(
      unsupportedCallbackLocalListKeyDiagnostic(
        callbackLocalKeyBinding,
        getOxcLocation(code, renderer),
      ),
    );
  }

  const parameterBinding =
    context.target === "client" &&
    bodyStatementJsx !== "compat-object" &&
    parameters.some((parameter) => readObject(parameter).type !== "Identifier") &&
    readObject(renderer.body).type !== "BlockStatement"
      ? createOxcListParameterBinding(code, parameters, parameterPatterns, parameterBindingNames)
      : undefined;
  let rendererContext = sourceRendererContext;
  if (parameterBinding !== undefined) {
    rendererContext = {
      ...rendererContext,
      reactiveAliasBindings: new Map([
        ...(rendererContext.reactiveAliasBindings ?? []),
        ...parameterBinding.bindingNames.map(
          (name, index) => [name, `${parameterBinding.cellName}.get()[${index}]`] as const,
        ),
      ]),
    };
  }
  const rendererBody =
    parameterBinding === undefined
      ? sourceRendererBody
      : analyzeOxcListRenderer(code, renderer, rendererContext, bodyStatementJsx);

  if (rendererBody === undefined) {
    return undefined;
  }

  const { children, bodyStatements } = rendererBody;
  const keyCode = callbackLocalKeyBinding === undefined ? discoveredSourceKeyCode : undefined;
  const emittedParameterPatterns = parameterBinding?.argumentNames ?? parameterPatterns;
  const itemName =
    parameterBinding?.argumentNames[0] ??
    (typeof itemParameter.name === "string" ? itemParameter.name : "_item");
  const indexName = parameterBinding?.argumentNames[1] ?? readObject(parameters[1]).name;
  const arrayName = parameterBinding?.argumentNames[2] ?? readObject(parameters[2]).name;
  const compiledSingleNode =
    itemParameter.type !== "Identifier" || parameterBinding !== undefined
      ? undefined
      : analyzeCompiledSingleNodeList(
          code,
          renderer,
          rendererContext,
          rendererBody,
          bodyStatementJsx,
          keyCode,
          itemName,
          typeof indexName === "string" ? indexName : undefined,
          typeof arrayName === "string" ? arrayName : undefined,
        );

  return {
    kind: "list",
    itemsCode:
      callee.optional === true
        ? `(${readOxcReactiveExpressionCode(code, readObject(callee.object), context)} ?? [])`
        : readOxcReactiveExpressionCode(code, readObject(callee.object), context),
    itemName,
    ...(typeof indexName === "string" ? { indexName } : {}),
    ...(typeof arrayName === "string" ? { arrayName } : {}),
    ...(emittedParameterPatterns.length === 0
      ? {}
      : { parameterPatterns: emittedParameterPatterns }),
    ...(parameterBinding === undefined ? {} : { parameterBinding }),
    ...(keyCode === undefined ? {} : { keyCode }),
    ...(bodyStatements.length === 0 ? {} : { bodyStatements }),
    children,
    ...(compiledSingleNode === undefined ? {} : { compiledSingleNode }),
  };
}

function readOxcListParameterPattern(code: string, parameter: unknown): string {
  const object = readObject(parameter);
  if (object.type === "AssignmentPattern") {
    return `${readOxcListParameterPattern(code, object.left)} = ${readSource(code, object.right)}`;
  }
  if (object.type === "RestElement") {
    return `...${readOxcListParameterPattern(code, object.argument)}`;
  }
  const typeAnnotation = readObject(object.typeAnnotation);

  if (
    typeof object.start === "number" &&
    typeof object.end === "number" &&
    typeof typeAnnotation.start === "number"
  ) {
    return code.slice(object.start, typeAnnotation.start).trim();
  }

  return readOxcParameterName(code, parameter);
}

function createOxcListParameterBinding(
  code: string,
  parameters: readonly unknown[],
  sourcePatterns: string[],
  bindingNames: string[],
): ListParameterBindingIr {
  const occupiedNames = new Set(code.match(/[A-Za-z_$][\w$]*/gu) ?? []);
  const allocate = (base: string): string => {
    let suffix = 0;
    let candidate = base;
    while (occupiedNames.has(candidate)) {
      suffix += 1;
      candidate = `${base}${suffix}`;
    }
    occupiedNames.add(candidate);
    return candidate;
  };
  return {
    argumentNames: Array.from({ length: 3 }, (_, index) => allocate(`__mreactListArg${index}`)),
    bindingNames,
    cellName: allocate("__mreactListBindings"),
    sourcePatterns,
  };
}

function findOxcCallbackLocalKeyBinding(
  code: string,
  renderer: Record<string, unknown>,
  keyCode: string | undefined,
): string | undefined {
  if (keyCode === undefined) {
    return undefined;
  }

  const body = readObject(renderer.body);
  if (body.type !== "BlockStatement") {
    return undefined;
  }

  const keyExpressions = collectOxcKeyExpressions(body).filter(
    (expression) => readSource(code, expression) === keyCode,
  );
  return collectBindingNames(body).find((name) =>
    keyExpressions.some((expression) => oxcExpressionReadsIdentifier(expression, name)),
  );
}

function collectOxcKeyExpressions(node: unknown, expressions: Record<string, unknown>[] = []) {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectOxcKeyExpressions(child, expressions);
    }
    return expressions;
  }

  const object = readObject(node);
  if (Object.keys(object).length === 0) {
    return expressions;
  }

  if (object.type === "JSXAttribute" && readObject(object.name).name === "key") {
    const value = readObject(object.value);
    const expression = readObject(value.expression);
    if (value.type === "JSXExpressionContainer" && Object.keys(expression).length > 0) {
      expressions.push(expression);
    }
    return expressions;
  }

  for (const value of Object.values(object)) {
    if (typeof value === "object" && value !== null) {
      collectOxcKeyExpressions(value, expressions);
    }
  }
  return expressions;
}

function oxcExpressionReadsIdentifier(
  node: unknown,
  name: string,
  parent?: Record<string, unknown>,
  parentField?: string,
): boolean {
  if (Array.isArray(node)) {
    return node.some((child) => oxcExpressionReadsIdentifier(child, name, parent, parentField));
  }

  const object = readObject(node);
  if (Object.keys(object).length === 0) {
    return false;
  }

  if (object.type === "Identifier" && object.name === name) {
    if (
      parent?.type === "MemberExpression" &&
      parentField === "property" &&
      parent.computed !== true
    ) {
      return false;
    }
    if (
      (parent?.type === "Property" || parent?.type === "ObjectProperty") &&
      parentField === "key" &&
      parent.computed !== true &&
      parent.shorthand !== true
    ) {
      return false;
    }
    return true;
  }

  return Object.entries(object).some(
    ([field, value]) =>
      typeof value === "object" &&
      value !== null &&
      oxcExpressionReadsIdentifier(value, name, object, field),
  );
}

function analyzeCompiledSingleNodeList(
  code: string,
  renderer: Record<string, unknown>,
  rendererContext: OxcChildAnalysisContext,
  rendererBody: { children: JsxNodeIr[]; bodyStatements: string[] },
  bodyStatementJsx: OxcBodyStatementJsxMode,
  keyCode: string | undefined,
  itemName: string,
  indexName: string | undefined,
  arrayName: string | undefined,
): CompiledSingleNodeListIr | undefined {
  if (
    keyCode === undefined ||
    rendererBody.bodyStatements.length !== 0 ||
    rendererBody.children.length !== 1 ||
    rendererBody.children[0]?.kind !== "element" ||
    !isCompiledSingleNodeTree(rendererBody.children[0])
  ) {
    return undefined;
  }

  const bindings = new Map(rendererContext.reactiveAliasBindings);
  bindings.set(itemName, `${itemName}.item`);
  if (indexName !== undefined) {
    bindings.set(indexName, `${itemName}.index`);
  }
  if (arrayName !== undefined) {
    bindings.set(arrayName, `${itemName}.items`);
  }
  const compiledBody = analyzeOxcListRenderer(
    code,
    renderer,
    { ...rendererContext, reactiveAliasBindings: bindings },
    bodyStatementJsx,
  );
  const root = compiledBody?.children[0];

  if (compiledBody?.bodyStatements.length !== 0 || root?.kind !== "element") {
    return undefined;
  }

  const sourceRoot = rendererBody.children[0] as JsxElementIr;
  const selectedClass = analyzeCompilerSelectedClass(
    code,
    sourceRoot,
    keyCode,
    rendererContext.componentConstBindings,
  );
  if (selectedClass !== undefined) {
    replaceCompilerSelectedClassAttribute(root);
  }
  const eventPrograms =
    rendererContext.compilerKeyedEventParent === true
      ? analyzeCompilerKeyedEventPrograms(root)
      : undefined;

  if (isDirectCompilerKeyText(keyCode, itemName)) {
    markCompilerKeyedInitialText(sourceRoot, root, keyCode);
  }
  markCompilerKeyedCellText(sourceRoot, root, itemName);
  markCompilerKeyedText(sourceRoot, root, keyCode, itemName);
  const ownsTextCleanup = compilerOwnsSingleNodeTextCleanup(root);

  return {
    root,
    ...(eventPrograms === undefined ? {} : { eventPrograms }),
    ...(ownsTextCleanup ? { ownsTextCleanup: true as const } : {}),
    ...(selectedClass === undefined ? {} : { selectedClass }),
  };
}

function compilerOwnsSingleNodeTextCleanup(node: JsxNodeIr): boolean {
  if (node.kind === "text") {
    return true;
  }

  if (node.kind === "expr") {
    return (
      node.renderMode === "compiler-keyed-initial-text" ||
      node.renderMode === "compiler-keyed-cell-text" ||
      node.renderMode === "compiler-keyed-text"
    );
  }

  if (node.kind !== "element") {
    return false;
  }

  for (const attribute of node.attributes) {
    if (
      attribute.kind !== "static-attr" &&
      (attribute.kind !== "event" || attribute.compilerKeyedSlot === undefined)
    ) {
      return false;
    }
  }

  return node.children.every(compilerOwnsSingleNodeTextCleanup);
}

function markCompilerKeyedCellText(
  sourceNode: JsxNodeIr,
  compiledNode: JsxNodeIr,
  itemName: string,
): void {
  if (sourceNode.kind === "expr" && compiledNode.kind === "expr") {
    const prefix = `${itemName}.`;
    const suffix = ".get()";

    if (sourceNode.code.startsWith(prefix) && sourceNode.code.endsWith(suffix)) {
      const property = sourceNode.code.slice(prefix.length, -suffix.length);

      if (/^[A-Za-z_$][\w$]*$/.test(property)) {
        compiledNode.renderMode = "compiler-keyed-cell-text";
        compiledNode.compilerKeyedProperty = property;
      }
    }
    return;
  }

  if (sourceNode.kind !== "element" || compiledNode.kind !== "element") {
    return;
  }

  const childCount = Math.min(sourceNode.children.length, compiledNode.children.length);
  for (let index = 0; index < childCount; index += 1) {
    markCompilerKeyedCellText(
      sourceNode.children[index] as JsxNodeIr,
      compiledNode.children[index] as JsxNodeIr,
      itemName,
    );
  }
}

function markCompilerKeyedText(
  sourceNode: JsxNodeIr,
  compiledNode: JsxNodeIr,
  keyCode: string,
  itemName: string,
): void {
  if (sourceNode.kind === "expr" && compiledNode.kind === "expr") {
    if (
      sourceNode.code !== keyCode &&
      sourceNode.code.startsWith(`${itemName}.`) &&
      /^[A-Za-z_$][\w$]*$/.test(sourceNode.code.slice(itemName.length + 1))
    ) {
      const property = sourceNode.code.slice(itemName.length + 1);
      compiledNode.renderMode = "compiler-keyed-text";
      compiledNode.compilerKeyedProperty = property;
    }
    return;
  }

  if (sourceNode.kind !== "element" || compiledNode.kind !== "element") {
    return;
  }

  const childCount = Math.min(sourceNode.children.length, compiledNode.children.length);
  for (let index = 0; index < childCount; index += 1) {
    markCompilerKeyedText(
      sourceNode.children[index] as JsxNodeIr,
      compiledNode.children[index] as JsxNodeIr,
      keyCode,
      itemName,
    );
  }
}

const compilerDelegatedEventTypes = new Set([
  "change",
  "click",
  "input",
  "keydown",
  "keyup",
  "pointerdown",
  "pointermove",
  "pointerup",
  "submit",
]);

function analyzeCompilerKeyedEventPrograms(
  root: JsxElementIr,
): CompilerKeyedEventProgramIr[] | undefined {
  const programs = new Map<string, CompilerKeyedEventProgramIr>();

  visitCompilerKeyedElements(root, (element) => {
    for (const attribute of element.attributes) {
      if (
        attribute.kind !== "event" ||
        !compilerDelegatedEventTypes.has(attribute.eventName) ||
        !isStableOxcKeyedEventAttribute(attribute)
      ) {
        continue;
      }

      let program = programs.get(attribute.eventName);
      if (program === undefined) {
        program = { eventName: attribute.eventName, handlers: [] };
        programs.set(attribute.eventName, program);
      }
      attribute.compilerKeyedSlot = program.handlers.length;
      program.handlers.push(attribute.code);
    }
  });

  return programs.size === 0 ? undefined : Array.from(programs.values());
}

function visitCompilerKeyedElements(
  element: JsxElementIr,
  visit: (element: JsxElementIr) => void,
): void {
  visit(element);

  for (const child of element.children) {
    if (child.kind === "element") {
      visitCompilerKeyedElements(child, visit);
    }
  }
}

function analyzeCompilerSelectedClass(
  code: string,
  root: JsxElementIr,
  keyCode: string,
  constBindings: ReadonlySet<string> | undefined,
): CompilerSelectedClassIr | undefined {
  const attribute = root.attributes.find(
    (candidate) =>
      candidate.kind === "dynamic-attr" &&
      (candidate.name === "class" || candidate.name === "className"),
  );
  if (attribute === undefined) {
    return undefined;
  }

  const expression = readOxcDynamicAttributeExpression(attribute);
  const conditional = expression === undefined ? undefined : unwrapOxcParentheses(expression);
  if (conditional?.type !== "ConditionalExpression") {
    return undefined;
  }

  const consequent = unwrapOxcParentheses(readObject(conditional.consequent));
  const alternate = unwrapOxcParentheses(readObject(conditional.alternate));
  if (
    consequent.type !== "Literal" ||
    typeof consequent.value !== "string" ||
    consequent.value === "" ||
    alternate.type !== "Literal" ||
    alternate.value !== ""
  ) {
    return undefined;
  }

  const comparison = unwrapOxcParentheses(readObject(conditional.test));
  if (comparison.type !== "BinaryExpression" || comparison.operator !== "===") {
    return undefined;
  }

  const left = unwrapOxcParentheses(readObject(comparison.left));
  const right = unwrapOxcParentheses(readObject(comparison.right));
  const leftCode = readSource(code, left);
  const rightCode = readSource(code, right);
  const selectedExpression =
    leftCode === keyCode ? right : rightCode === keyCode ? left : undefined;
  if (selectedExpression === undefined) {
    return undefined;
  }

  const sourceCode = readCompilerSelectedSource(selectedExpression, constBindings);
  return sourceCode === undefined ? undefined : { className: consequent.value, sourceCode };
}

function readCompilerSelectedSource(
  expression: Record<string, unknown>,
  constBindings: ReadonlySet<string> | undefined,
): string | undefined {
  if (expression.type !== "CallExpression" || readArray(expression.arguments).length !== 0) {
    return undefined;
  }

  const callee = readObject(expression.callee);
  if (callee.type !== "MemberExpression" || callee.computed === true || callee.optional === true) {
    return undefined;
  }

  const object = unwrapOxcParentheses(readObject(callee.object));
  const property = readObject(callee.property);
  if (
    object.type !== "Identifier" ||
    property.name !== "get" ||
    typeof object.name !== "string" ||
    constBindings?.has(object.name) !== true
  ) {
    return undefined;
  }

  return object.name;
}

function replaceCompilerSelectedClassAttribute(root: JsxElementIr): void {
  root.attributes = root.attributes.map((attribute) =>
    attribute.kind === "dynamic-attr" &&
    (attribute.name === "class" || attribute.name === "className")
      ? { kind: "static-attr", name: "class", value: "" }
      : attribute,
  );
}

function isDirectCompilerKeyText(keyCode: string, itemName: string): boolean {
  if (!keyCode.startsWith(`${itemName}.`)) {
    return false;
  }

  return /^[A-Za-z_$][\w$]*$/.test(keyCode.slice(itemName.length + 1));
}

function markCompilerKeyedInitialText(
  sourceNode: JsxNodeIr,
  compiledNode: JsxNodeIr,
  keyCode: string,
): void {
  if (sourceNode.kind === "expr" && compiledNode.kind === "expr") {
    if (sourceNode.code === keyCode) {
      compiledNode.renderMode = "compiler-keyed-initial-text";
    }
    return;
  }

  if (sourceNode.kind !== "element" || compiledNode.kind !== "element") {
    return;
  }

  const childCount = Math.min(sourceNode.children.length, compiledNode.children.length);
  for (let index = 0; index < childCount; index += 1) {
    markCompilerKeyedInitialText(
      sourceNode.children[index] as JsxNodeIr,
      compiledNode.children[index] as JsxNodeIr,
      keyCode,
    );
  }
}

function isCompiledSingleNodeTree(node: JsxNodeIr): boolean {
  if (node.kind === "text") {
    return true;
  }

  if (node.kind === "expr") {
    return node.renderMode !== "dynamic";
  }

  if (node.kind !== "element") {
    return false;
  }

  for (const attribute of node.attributes) {
    if (attribute.kind === "spread-attr" || attribute.kind === "dom-ref") {
      return false;
    }
    if (attribute.kind === "event" && !isStableOxcKeyedEventAttribute(attribute)) {
      return false;
    }
  }

  return node.children.every(isCompiledSingleNodeTree);
}

function analyzeOxcListRenderer(
  code: string,
  renderer: Record<string, unknown>,
  context: OxcChildAnalysisContext,
  bodyStatementJsx: OxcBodyStatementJsxMode,
): { children: JsxNodeIr[]; bodyStatements: string[] } | undefined {
  const body = readObject(renderer.body);

  if (body.type !== "BlockStatement") {
    return analyzeOxcListReturnExpression(
      code,
      unwrapOxcParentheses(body),
      [],
      context,
      bodyStatementJsx,
    );
  }

  const statements = readArray(body.body);
  const ifStatementIndex = statements.findIndex(
    (statement) => readObject(statement).type === "IfStatement",
  );

  if (ifStatementIndex >= 0) {
    return analyzeOxcListIfRenderer(code, statements, ifStatementIndex, context, bodyStatementJsx);
  }

  const returnStatementIndex = statements.findIndex(
    (statement) => readObject(statement).type === "ReturnStatement",
  );
  const returnStatement =
    returnStatementIndex === -1 ? undefined : readObject(statements[returnStatementIndex]);
  const returnArgument =
    returnStatement === undefined
      ? undefined
      : unwrapOxcParentheses(readObject(returnStatement.argument));

  if (returnArgument === undefined) {
    return undefined;
  }

  const bodyPrefixStatements = statements.slice(0, returnStatementIndex);
  const result = analyzeOxcListReturnExpression(
    code,
    returnArgument,
    bodyPrefixStatements.map(
      (statement) =>
        lowerOxcBodyStatementJsx(
          code,
          statement,
          context.componentNames,
          context.target,
          context.diagnostics,
          bodyStatementJsx,
          context.bodyLowerers,
        ) ?? formatOxcBodyStatement(code, statement, bodyStatementJsx),
    ),
    context,
    bodyStatementJsx,
  );

  if (result === undefined) {
    return undefined;
  }

  markOxcRenderValueExpressions(
    result.children,
    collectOxcBodyJsxBindingNames(bodyPrefixStatements),
  );
  return result;
}

function analyzeOxcListReturnExpression(
  code: string,
  body: Record<string, unknown>,
  bodyStatements: string[],
  context: OxcChildAnalysisContext,
  bodyStatementJsx: OxcBodyStatementJsxMode,
): { children: JsxNodeIr[]; bodyStatements: string[] } | undefined {
  if (body.type === "ConditionalExpression") {
    const children: JsxNodeIr[] = [
      {
        kind: "conditional",
        conditionCode: readOxcReactiveExpressionCode(code, readObject(body.test), context),
        whenTrue: analyzeOxcDynamicBranch(
          code,
          readObject(body.consequent),
          context,
          bodyStatementJsx,
        ),
        whenFalse: analyzeOxcDynamicBranch(
          code,
          readObject(body.alternate),
          context,
          bodyStatementJsx,
        ),
      },
    ];

    return {
      children,
      bodyStatements,
    };
  }

  if (body.type !== "JSXElement" && body.type !== "JSXFragment") {
    return undefined;
  }

  return {
    children: [analyzeOxcJsxNode(code, body, context, bodyStatementJsx)],
    bodyStatements,
  };
}

function analyzeOxcListIfRenderer(
  code: string,
  statements: readonly unknown[],
  ifStatementIndex: number,
  context: OxcChildAnalysisContext,
  bodyStatementJsx: OxcBodyStatementJsxMode,
): { children: JsxNodeIr[]; bodyStatements: string[] } | undefined {
  const ifStatement = readObject(statements[ifStatementIndex]);
  const whenTrueExpression = readOxcReturnExpressionFromStatement(ifStatement.consequent);
  const alternate = readOxcReturnExpressionFromStatement(ifStatement.alternate);
  const fallthrough = readOxcReturnExpressionFromStatement(statements[ifStatementIndex + 1]);
  const whenFalseExpression = alternate ?? fallthrough;

  if (whenTrueExpression === undefined || whenFalseExpression === undefined) {
    return undefined;
  }

  const bodyPrefixStatements = statements.slice(0, ifStatementIndex);
  const children: JsxNodeIr[] = [
    {
      kind: "conditional",
      conditionCode: readOxcReactiveExpressionCode(code, readObject(ifStatement.test), context),
      whenTrue: analyzeOxcDynamicBranch(code, whenTrueExpression, context, bodyStatementJsx),
      whenFalse: analyzeOxcDynamicBranch(code, whenFalseExpression, context, bodyStatementJsx),
    },
  ];

  markOxcRenderValueExpressions(children, collectOxcBodyJsxBindingNames(bodyPrefixStatements));

  return {
    bodyStatements: bodyPrefixStatements.map(
      (statement) =>
        lowerOxcBodyStatementJsx(
          code,
          statement,
          context.componentNames,
          context.target,
          context.diagnostics,
          bodyStatementJsx,
          context.bodyLowerers,
        ) ?? formatOxcBodyStatement(code, statement, bodyStatementJsx),
    ),
    children,
  };
}

function resolveOxcBodyStatementJsx(context: OxcChildAnalysisContext): OxcBodyStatementJsxMode {
  return context.bodyStatementJsx ?? (context.target === "server" ? "server-string" : "dom-node");
}

function logicalConditionValueName(expression: Record<string, unknown>): string {
  return `__mreactLogical_${typeof expression.start === "number" ? expression.start : "value"}`;
}

function renderableFalsyConditionValueCode(name: string): string {
  return `((typeof ${name} === "number" || typeof ${name} === "bigint") ? ${name} : null)`;
}

function shadowOxcReactiveAliases(
  context: OxcChildAnalysisContext,
  names: readonly string[],
): OxcChildAnalysisContext {
  if (context.reactiveAliasBindings === undefined || names.length === 0) {
    return context;
  }

  let aliases: Map<string, string> | undefined;

  for (const name of names) {
    if (!context.reactiveAliasBindings.has(name)) {
      continue;
    }

    aliases ??= new Map(context.reactiveAliasBindings);
    aliases.delete(name);
  }

  return aliases === undefined ? context : { ...context, reactiveAliasBindings: aliases };
}

function isOxcJsxCommentExpression(code: string, expression: Record<string, unknown>): boolean {
  if (typeof expression.start !== "number" || typeof expression.end !== "number") {
    return false;
  }

  const source = code.slice(expression.start, expression.end).trim();

  return source.startsWith("/*") && source.endsWith("*/");
}
