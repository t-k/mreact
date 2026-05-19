import {
  invalidJsxExpressionDiagnostic,
  unserializableAwaitValueDiagnostic,
  unsupportedComponentReferenceDiagnostic,
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
  isOxcJsxBranch,
  readOxcReturnExpressionFromStatement,
} from "./oxc-expression-utils.js";
import {
  analyzeOxcAttribute,
  findOxcJsxAttributeCode,
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
} from "./oxc-render-values.js";
import { transformJsxWithOxc } from "./oxc-transform.js";
import type { CompileTarget, Diagnostic } from "./types.js";

export interface OxcChildAnalysisContext {
  componentNames: Set<string>;
  target: CompileTarget;
  diagnostics: Diagnostic[];
  bodyStatementJsx?: OxcBodyStatementJsxMode;
  componentBodyBindings?: ReadonlyMap<string, Record<string, unknown>>;
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
        context,
        bodyStatementJsx,
      ),
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
          analyzeOxcAttribute(code, attr, context.target, context.diagnostics, { allowRef }),
        )
        .filter((attribute) => attribute.kind === "spread-attr" || attribute.name !== "key"),
      children: analyzeOxcChildren(
        code,
        readArray(node.children),
        context,
        bodyStatementJsx,
      ),
    } satisfies JsxElementIr;
  }

  if (
    /^[A-Z][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(tagName) ||
    context.componentNames.has(tagName)
  ) {
    const keyCode = findOxcJsxAttributeCode(code, attributes, "key");
    const allowRef = bodyStatementJsx === "compat-object";
    const analyzeJsxNode = (
      child: Record<string, unknown>,
      childBodyStatementJsx: OxcBodyStatementJsxMode = bodyStatementJsx,
    ) => analyzeOxcJsxNode(code, child, context, childBodyStatementJsx);
    const consumerRenderProp = tagName.endsWith(".Consumer")
      ? readOxcConsumerRenderProp(
          code,
          readArray(node.children),
          analyzeJsxNode,
          bodyStatementJsx,
        )
      : undefined;
    const componentLoc = getOxcLocation(code, openingElement.name);

    return {
      kind: "component",
      name: tagName,
      ...(componentLoc === undefined ? {} : { loc: componentLoc }),
      ...(keyCode === undefined ? {} : { keyCode }),
      props: attributes
        .flatMap((attr) =>
          analyzeOxcComponentProp(code, attr, analyzeJsxNode, context.diagnostics, { allowRef }),
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
        analyzeOxcAttribute(code, attr, context.target, context.diagnostics, { allowRef }),
      )
      .filter((attribute) => attribute.kind === "spread-attr" || attribute.name !== "key"),
    children: analyzeOxcChildren(code, readArray(node.children), context, bodyStatementJsx),
  } satisfies JsxElementIr;
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
    context.diagnostics.push(invalidJsxExpressionDiagnostic(getOxcLocation(code, expression), "text"));
    return [];
  }

  if (unwrappedExpression.type === "ConditionalExpression") {
    return [
      {
        kind: "conditional",
        conditionCode: readSource(code, readObject(unwrappedExpression.test)),
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
    isOxcJsxBranch(readObject(unwrappedExpression.right))
  ) {
    const rightBranch = analyzeOxcDynamicBranch(
      code,
      readObject(unwrappedExpression.right),
      context,
      bodyStatementJsx,
    );

    if (unwrappedExpression.operator === "&&") {
      return [
        {
          kind: "conditional",
          conditionCode: readSource(code, readObject(unwrappedExpression.left)),
          whenTrue: rightBranch,
          whenFalse: [],
        },
      ];
    }

    if (unwrappedExpression.operator === "||") {
      return [
        {
          kind: "conditional",
          conditionCode: readSource(code, readObject(unwrappedExpression.left)),
          whenTrue: [
            { kind: "expr", code: readSource(code, readObject(unwrappedExpression.left)) },
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

  return [
    {
      kind: "expr",
      code: containsOxcJsxSyntax(unwrappedExpression)
        ? normalizeOxcExpressionCode(
            context.lowerNestedJsxExpression(
              code,
              expression,
              context.componentNames,
              context.target,
              context.diagnostics,
              bodyStatementJsx,
            ) ??
              (bodyStatementJsx === "compat-object"
                ? stripOxcGeneratedImports(transformJsxWithOxc(readSource(code, expression)))
                : readSource(code, expression)),
          )
        : readSource(code, expression),
      ...(isOxcRenderValueExpression(expression)
        ? {
            renderMode:
              bodyStatementJsx === "server-string" ? ("html" as const) : ("dynamic" as const),
          }
        : {}),
    },
  ];
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
  const rendererBody = analyzeOxcListRenderer(code, renderer, context, bodyStatementJsx);

  if (rendererBody === undefined) {
    return undefined;
  }

  const { children, bodyStatements } = rendererBody;
  const keyCode = findOxcKeyCodeInChildren(children);

  return {
    kind: "list",
    itemsCode:
      callee.optional === true
        ? `(${readSource(code, readObject(callee.object))} ?? [])`
        : readSource(code, readObject(callee.object)),
    itemName,
    ...(typeof indexName === "string" ? { indexName } : {}),
    ...(keyCode === undefined ? {} : { keyCode }),
    ...(bodyStatements.length === 0 ? {} : { bodyStatements }),
    children,
  };
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
      conditionCode: readSource(code, readObject(ifStatement.test)),
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
