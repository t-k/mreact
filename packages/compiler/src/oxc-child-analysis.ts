import {
  invalidJsxExpressionDiagnostic,
  unserializableAwaitValueDiagnostic,
  unsupportedComponentReferenceDiagnostic,
  unsupportedJsxSpreadChildDiagnostic,
} from "./diagnostics.js";
import type { AsyncBoundaryIr, JsxElementIr, JsxNodeIr } from "./ir.js";
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
      children: analyzeOxcChildren(code, readArray(node.children), context, bodyStatementJsx),
    };
  }

  if (node.type !== "JSXElement") {
    return { kind: "expr", code: readSource(code, node) };
  }

  const openingElement = readObject(node.openingElement);
  const tagName = readOxcJsxTagName(readObject(openingElement.name));
  const attributes = readArray(openingElement.attributes);

  if (tagName === "Await") {
    return analyzeOxcAsyncBoundary(code, node, attributes, context, bodyStatementJsx);
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
            resolveExpressionCode: (expression) =>
              readOxcReactiveExpressionCode(code, expression, context),
          }),
        )
        .filter((attribute) => attribute.kind === "spread-attr" || attribute.name !== "key"),
      children: analyzeOxcChildren(code, readArray(node.children), context, bodyStatementJsx),
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
        shadowOxcReactiveAliases(context, shadowNames),
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
            resolveExpressionCode: (expression) =>
              readOxcReactiveExpressionCode(code, expression, context),
          }),
        )
        .filter((prop) => prop.kind === "spread-prop" || prop.name !== "key")
        .concat(consumerRenderProp === undefined ? [] : [consumerRenderProp]),
      children:
        consumerRenderProp === undefined
          ? analyzeOxcChildren(code, readArray(node.children), context, bodyStatementJsx)
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

  return {
    kind: "element",
    tagName,
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
    children: analyzeOxcChildren(code, readArray(node.children), context, bodyStatementJsx),
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

  const itemName = String(readObject(readArray(renderer.params)[0]).name ?? "_item");
  const indexName = readObject(readArray(renderer.params)[1]).name;
  const arrayName = readObject(readArray(renderer.params)[2]).name;
  const rendererContext = shadowOxcReactiveAliases(
    context,
    [itemName, indexName, arrayName].filter((name): name is string => typeof name === "string"),
  );
  const rendererBody = analyzeOxcListRenderer(code, renderer, rendererContext, bodyStatementJsx);

  if (rendererBody === undefined) {
    return undefined;
  }

  const { children, bodyStatements } = rendererBody;
  const keyCode = findOxcKeyCodeInChildren(children);
  const compiledSingleNode = analyzeCompiledSingleNodeList(
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
    ...(keyCode === undefined ? {} : { keyCode }),
    ...(bodyStatements.length === 0 ? {} : { bodyStatements }),
    children,
    ...(compiledSingleNode === undefined ? {} : { compiledSingleNode }),
  };
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
): { root: JsxElementIr } | undefined {
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

  return compiledBody?.bodyStatements.length === 0 && root?.kind === "element"
    ? { root }
    : undefined;
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
