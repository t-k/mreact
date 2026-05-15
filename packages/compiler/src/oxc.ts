import { parseSync } from "oxc-parser";
import {
  invalidJsxExpressionDiagnostic,
  unserializableAwaitValueDiagnostic,
  unsupportedComponentReferenceDiagnostic,
  unsupportedTopLevelJsxInitializerDiagnostic,
} from "./diagnostics.js";
import { type AnalyzeToIrInput, type AnalyzeToIrOutput } from "./internal.js";
import type {
  AttributeIr,
  AsyncBoundaryIr,
  ComponentIr,
  ComponentPropIr,
  JsxElementIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";
import { transformJsxToCreateElementWithOxc, transformJsxWithOxc } from "./oxc-transform.js";
import {
  arraysEqual,
  getOxcLocation,
  readArray,
  readObject,
  readSource,
  unwrapOxcParentheses,
} from "./oxc-node-utils.js";
import { assignOxcAwaitIds } from "./oxc-await-ids.js";
import { validateOxcAwaitCompatComponents } from "./oxc-await-validation.js";
import type { OxcBodyStatementJsxMode } from "./oxc-analysis-types.js";
import {
  collectBindingNames,
  collectImportBindingNames,
  formatStatement,
  readOxcParameterName,
} from "./oxc-bindings.js";
import {
  collectOxcVariableInitializers,
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
  collectOxcAsyncComponentNames,
  collectOxcExportedComponents,
  collectOxcExportedFunctionNames,
  collectOxcPlainComponentNames,
  hasJsxReturn,
  hasOxcFunctionLikeJsxReturn,
  isOxcExportedFunctionLike,
  isJsxRoot,
  isOxcJsxComponentStatement,
  isOxcUnsupportedExportedFunction,
  readOxcPlainComponent,
  readOxcVariableComponentDeclaration,
  unwrapOxcComponentFunctionLikeInitializer,
} from "./oxc-component-detection.js";
import {
  collectOxcClientBoundaryImportComponents,
  markOxcAsyncComponentReferences,
  markOxcClientReferences,
} from "./oxc-component-references.js";
import { normalizeOxcExpressionCode, stripOxcGeneratedImports } from "./oxc-code-utils.js";
import {
  analyzeOxcAttribute,
  findOxcJsxAttributeCode,
  readOxcJsxTagName,
} from "./oxc-jsx-attributes.js";
import {
  collectOxcBodyJsxBindingNames,
  containsOxcJsxSyntax,
  isOxcRenderValueExpression,
  markOxcRenderValueExpressions,
} from "./oxc-render-values.js";
import { containsRawJsxInIr } from "./oxc-raw-jsx.js";
import { normalizeOxcJsxText } from "./oxc-jsx-text.js";
import type { AnalyzeModuleOptions, CompileTarget, Diagnostic } from "./types.js";
import { escapeHtmlAttribute } from "@reckona/mreact-shared/html-escape";

export interface OxcParityResult {
  matches: boolean;
  oxc: {
    errors: string[];
    exportedComponents: string[];
    ir?: ModuleIr;
    usedTypescriptFallback: boolean;
    rawJsxDetected: boolean;
  };
}

export function analyzeOxcParity(input: AnalyzeToIrInput): OxcParityResult {
  const oxc = parseSync(input.filename, input.code, {
    lang: "tsx",
    sourceType: "module",
    astType: "ts",
  });
  const oxcExportedComponents = collectOxcExportedComponents(oxc.program);
  const oxcOutput = analyzeOxcToIr(input.code, oxc.program, input.target, input.options);
  const rawJsxDetected = containsRawJsxInIr(oxcOutput.ir);

  return {
    matches:
      oxc.errors.length === 0 &&
      oxcOutput.diagnostics.length === 0 &&
      !rawJsxDetected &&
      arraysEqual(
        oxcExportedComponents,
        oxcOutput.ir.components
          .filter((component) => component.exported !== false)
          .map((component) => component.exportName),
      ),
    oxc: {
      errors: oxc.errors.map((error) => error.message),
      exportedComponents: oxcExportedComponents,
      ir: oxcOutput.ir,
      usedTypescriptFallback: false,
      rawJsxDetected,
    },
  };
}

export function analyzeWithOxc(input: AnalyzeToIrInput): AnalyzeToIrOutput {
  const parsed = parseSync(input.filename, input.code, {
    lang: "tsx",
    sourceType: "module",
    astType: "ts",
  });

  const analyzed = analyzeOxcToIr(input.code, parsed.program, input.target, input.options);

  return {
    ir: analyzed.ir,
    diagnostics: [
      ...parsed.errors.map((error) => ({
        level: "error" as const,
        code:
          error.message === "Unexpected token" ? "MR_INVALID_JSX_EXPRESSION" : "MR_OXC_PARSE_ERROR",
        message: error.message,
      })),
      ...analyzed.diagnostics,
    ],
    usedTypescriptFallback: false,
  };
}

function analyzeOxcToIr(
  code: string,
  program: unknown,
  target: CompileTarget,
  options?: AnalyzeModuleOptions,
): { ir: ModuleIr; diagnostics: Diagnostic[] } {
  const body = readArray(readObject(program).body);
  const userImports: string[] = [];
  const moduleStatements: string[] = [];
  const moduleBindingNames = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  const clientBoundaryImports = collectOxcClientBoundaryImportComponents(
    program,
    new Set(options?.clientBoundaryImports ?? []),
  );
  const moduleRenderValueBindings = collectOxcBodyJsxBindingNames(body);

  for (const statement of body) {
    const object = readObject(statement);

    if (object.type === "ImportDeclaration") {
      const importCode = formatStatement(code, statement);

      if (importCode !== "") {
        userImports.push(importCode);
      }
      for (const bindingName of collectImportBindingNames(statement)) {
        moduleBindingNames.add(bindingName);
      }
      continue;
    }

    if (
      isOxcJsxComponentStatement(statement) ||
      (options?.compatReactNodeReturn === true && isOxcExportedFunctionLike(statement))
    ) {
      const declaration = readObject(readObject(statement).declaration);

      if (declaration.type === "VariableDeclaration") {
        for (const bindingName of collectBindingNames(declaration)) {
          moduleBindingNames.add(bindingName);
        }
      }
      continue;
    } else {
      if (isOxcUnsupportedExportedFunction(statement, options)) {
        diagnostics.push({
          level: "error",
          code: "MR_UNSUPPORTED_COMPONENT_RETURN",
          message: "Exported component must return a JSX element or supported React node.",
        });
        continue;
      }
      const loweredTopLevel = lowerOxcTopLevelStatement(
        code,
        statement,
        componentNamesFromProgram(program, moduleBindingNames),
        target,
        diagnostics,
        options,
      );
      const formattedStatement =
        loweredTopLevel ?? formatPreservedStatement(code, statement, options);

      if (
        loweredTopLevel === undefined &&
        containsOxcJsxSyntax(object) &&
        options?.topLevelJsx !== "compat-object" &&
        options?.topLevelJsx !== "server-string"
      ) {
        diagnostics.push(
          unsupportedTopLevelJsxInitializerDiagnostic(getOxcLocation(code, statement)),
        );
      }

      if (formattedStatement !== "") {
        moduleStatements.push(formattedStatement);
      }
      for (const bindingName of collectBindingNames(statement)) {
        moduleBindingNames.add(bindingName);
      }
    }
  }

  const componentNames = componentNamesFromProgram(program, moduleBindingNames);
  const asyncComponentNames = collectOxcAsyncComponentNames(program);
  const components = body.flatMap((statement) =>
    analyzeOxcComponent(
      code,
      statement,
      componentNames,
      target,
      diagnostics,
      options?.bodyStatementJsx ?? "dom-node",
      moduleRenderValueBindings,
      options?.compatReactNodeReturn === true,
    ),
  );

  for (const component of components) {
    markOxcAsyncComponentReferences(component.root, asyncComponentNames);
    markOxcClientReferences(component.root, clientBoundaryImports);
    if (options?.awaitCompatComponents !== "lower") {
      validateOxcAwaitCompatComponents(component.root, diagnostics);
    }
  }

  const ir: ModuleIr = {
    userImports,
    moduleStatements,
    moduleBindingNames: Array.from(moduleBindingNames),
    components,
  };

  assignOxcAwaitIds(ir);

  return {
    ir,
    diagnostics,
  };
}

function componentNamesFromProgram(
  program: unknown,
  moduleBindingNames: ReadonlySet<string>,
): Set<string> {
  return new Set([
    ...collectOxcExportedComponents(program),
    ...collectOxcExportedFunctionNames(program),
    ...collectOxcPlainComponentNames(program),
    ...moduleBindingNames,
  ]);
}

function analyzeOxcComponent(
  code: string,
  statement: unknown,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx: OxcBodyStatementJsxMode,
  moduleRenderValueBindings: Set<string>,
  compatReactNodeReturn: boolean,
): ComponentIr[] {
  const object = readObject(statement);

  if (object.type === "ExportDefaultDeclaration") {
    const declaration = unwrapOxcComponentFunctionLikeInitializer(readObject(object.declaration));

    if (declaration === undefined || !hasOxcFunctionLikeJsxReturn(declaration)) {
      return [];
    }
    const id = readObject(declaration.id);
    const name = typeof id.name === "string" ? id.name : "DefaultExport";

    return [
      analyzeOxcFunctionLikeComponent(
        code,
        name,
        declaration,
        "default",
        componentNames,
        target,
        diagnostics,
        bodyStatementJsx,
        moduleRenderValueBindings,
        compatReactNodeReturn,
        true,
      ),
    ];
  }

  if (object.type !== "ExportNamedDeclaration") {
    const plainComponent = readOxcPlainComponent(statement);

    if (plainComponent === undefined) {
      return [];
    }

    return [
      {
        ...analyzeOxcFunctionLikeComponent(
          code,
          plainComponent.name,
          plainComponent.initializer,
          plainComponent.name,
          componentNames,
          target,
          diagnostics,
          bodyStatementJsx,
          moduleRenderValueBindings,
          compatReactNodeReturn,
        ),
        exported: false,
      },
    ];
  }

  const declaration = readObject(object.declaration);

  if (declaration.type === "VariableDeclaration") {
    const variableComponent = readOxcVariableComponentDeclaration(declaration);

    if (variableComponent === undefined) {
      return [];
    }

    return [
      analyzeOxcFunctionLikeComponent(
        code,
        variableComponent.name,
        variableComponent.initializer,
        variableComponent.name,
        componentNames,
        target,
        diagnostics,
        bodyStatementJsx,
        moduleRenderValueBindings,
        compatReactNodeReturn,
      ),
    ];
  }

  if (
    declaration.type !== "FunctionDeclaration" ||
    (!compatReactNodeReturn && !hasJsxReturn(declaration.body))
  ) {
    return [];
  }

  const id = readObject(declaration.id);

  if (typeof id.name !== "string") {
    return [];
  }

  return [
    analyzeOxcFunctionLikeComponent(
      code,
      id.name,
      declaration,
      id.name,
      componentNames,
      target,
      diagnostics,
      bodyStatementJsx,
      moduleRenderValueBindings,
      compatReactNodeReturn,
    ),
  ];
}

function analyzeOxcFunctionLikeComponent(
  code: string,
  name: string,
  functionLike: Record<string, unknown>,
  exportName: string,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx: OxcBodyStatementJsxMode,
  moduleRenderValueBindings: Set<string>,
  compatReactNodeReturn: boolean,
  exportDefault = false,
): ComponentIr {
  const functionBody = readObject(functionLike.body);
  const body = functionBody.type === "BlockStatement" ? readArray(functionBody.body) : [];
  const returnStatement = body.find(
    (bodyStatement) => readObject(bodyStatement).type === "ReturnStatement",
  );
  const expressionBody = unwrapOxcParentheses(readObject(functionLike.body));
  const returnExpression =
    returnStatement === undefined
      ? expressionBody
      : unwrapOxcParentheses(readObject(readObject(returnStatement).argument));
  const parameters = readArray(functionLike.params).map((param) =>
    readOxcParameterName(code, param),
  );
  const bodyStatements = body
    .filter((bodyStatement) => bodyStatement !== returnStatement)
    .map(
      (bodyStatement) =>
        lowerOxcBodyStatementJsx(
          code,
          bodyStatement,
          componentNames,
          target,
          diagnostics,
          bodyStatementJsx,
        ) ?? formatOxcBodyStatement(code, bodyStatement, bodyStatementJsx),
    );
  const componentBodyBindings = collectOxcVariableInitializers(body);
  const root =
    isJsxRoot(returnExpression.type) || returnExpression.type === "JSXFragment"
      ? analyzeOxcJsxNode(
          code,
          returnExpression,
          componentNames,
          target,
          diagnostics,
          bodyStatementJsx,
          componentBodyBindings,
        )
      : {
          kind: "expr" as const,
          code: normalizeOxcExpressionCode(
            compatReactNodeReturn
              ? (lowerOxcCompatReactNodeExpression(
                  code,
                  returnExpression,
                  componentNames,
                  target,
                  diagnostics,
                ) ??
                  stripOxcGeneratedImports(
                    transformJsxToCreateElementWithOxc(readSource(code, returnExpression)),
                  ))
              : readSource(code, returnExpression),
          ),
          ...(compatReactNodeReturn ? { renderMode: "react-node" as const } : {}),
        };
  markOxcRenderValueExpressions(
    [root],
    new Set([
      ...moduleRenderValueBindings,
      ...collectOxcBodyJsxBindingNames(
        body.filter((bodyStatement) => bodyStatement !== returnStatement),
      ),
    ]),
    bodyStatementJsx === "server-string" ? "html" : "dynamic",
  );

  return {
    name,
    exportName,
    ...(exportDefault ? { exportDefault: true } : {}),
    ...(functionLike.async === true ? { async: true } : {}),
    parameters,
    bodyStatements,
    bindingNames: [...parameters, ...body.flatMap(collectBindingNames)],
    root,
  };
}

function analyzeOxcJsxNode(
  code: string,
  node: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx: OxcBodyStatementJsxMode = target === "server" ? "server-string" : "dom-node",
  componentBodyBindings?: ReadonlyMap<string, Record<string, unknown>>,
): JsxNodeIr {
  if (node.type === "JSXFragment") {
    return {
      kind: "fragment",
      children: analyzeOxcChildren(
        code,
        readArray(node.children),
        componentNames,
        target,
        diagnostics,
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
    return analyzeOxcAsyncBoundary(
      code,
      node,
      attributes,
      componentNames,
      target,
      diagnostics,
      bodyStatementJsx,
      componentBodyBindings,
    );
  }

  if (tagName === "Slot") {
    const keyCode = findOxcJsxAttributeCode(code, attributes, "key");

    return {
      kind: "element",
      tagName: "slot",
      ...(keyCode === undefined ? {} : { keyCode }),
      attributes: attributes
        .flatMap((attr) => analyzeOxcAttribute(code, attr, target, diagnostics))
        .filter((attribute) => attribute.kind === "spread-attr" || attribute.name !== "key"),
      children: analyzeOxcChildren(
        code,
        readArray(node.children),
        componentNames,
        target,
        diagnostics,
        bodyStatementJsx,
      ),
    } satisfies JsxElementIr;
  }

  if (/^[A-Z][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(tagName) || componentNames.has(tagName)) {
    const keyCode = findOxcJsxAttributeCode(code, attributes, "key");
    const analyzeJsxNode = (
      child: Record<string, unknown>,
      childBodyStatementJsx: OxcBodyStatementJsxMode = bodyStatementJsx,
    ) => analyzeOxcJsxNode(
      code,
      child,
      componentNames,
      target,
      diagnostics,
      childBodyStatementJsx,
    );
    const consumerRenderProp = tagName.endsWith(".Consumer")
      ? readOxcConsumerRenderProp(
          code,
          readArray(node.children),
          analyzeJsxNode,
          bodyStatementJsx,
        )
      : undefined;

    return {
      kind: "component",
      name: tagName,
      ...(keyCode === undefined ? {} : { keyCode }),
      props: attributes
        .flatMap((attr) => analyzeOxcComponentProp(code, attr, analyzeJsxNode))
        .filter((prop) => prop.kind === "spread-prop" || prop.name !== "key")
        .concat(consumerRenderProp === undefined ? [] : [consumerRenderProp]),
      children:
        consumerRenderProp === undefined
          ? analyzeOxcChildren(
              code,
              readArray(node.children),
              componentNames,
              target,
              diagnostics,
              bodyStatementJsx,
            )
          : [],
    };
  }

  if (/^[A-Z]/.test(tagName)) {
    diagnostics.push(
      unsupportedComponentReferenceDiagnostic(tagName, getOxcLocation(code, openingElement.name)),
    );

    return {
      kind: "component",
      name: tagName,
      props: [],
      children: [],
    };
  }

  const keyCode = findOxcJsxAttributeCode(code, attributes, "key");

  return {
    kind: "element",
    tagName,
    ...(keyCode === undefined ? {} : { keyCode }),
    attributes: attributes
      .flatMap((attr) => analyzeOxcAttribute(code, attr, target, diagnostics))
      .filter((attribute) => attribute.kind === "spread-attr" || attribute.name !== "key"),
    children: analyzeOxcChildren(
      code,
      readArray(node.children),
      componentNames,
      target,
      diagnostics,
      bodyStatementJsx,
    ),
  } satisfies JsxElementIr;
}

function analyzeOxcAsyncBoundary(
  code: string,
  node: Record<string, unknown>,
  attributes: readonly unknown[],
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx: OxcBodyStatementJsxMode,
  componentBodyBindings?: ReadonlyMap<string, Record<string, unknown>>,
): AsyncBoundaryIr {
  const valueExpression = readOxcExpressionAttributeNode(attributes, "value");

  if (valueExpression !== undefined) {
    const unserializableReason = detectUnserializableAwaitValueReason(
      valueExpression,
      componentBodyBindings,
    );

    if (unserializableReason !== undefined) {
      diagnostics.push(unserializableAwaitValueDiagnostic(unserializableReason));
    }
  }

  const valueCode = readOxcExpressionAttribute(code, attributes, "value") ?? "undefined";
  const placeholderExpression = readOxcExpressionAttributeNode(attributes, "placeholder");
  const catchExpression = readOxcExpressionAttributeNode(attributes, "catch");
  const renderer = analyzeOxcSingleArrowJsxChild(
    code,
    readArray(node.children),
    (child, childBodyStatementJsx = bodyStatementJsx) =>
      analyzeOxcJsxNode(
        code,
        child,
        componentNames,
        target,
        diagnostics,
        childBodyStatementJsx,
      ),
    bodyStatementJsx,
  );
  const catchRenderer =
    catchExpression !== undefined && readObject(catchExpression).type === "ArrowFunctionExpression"
      ? analyzeOxcArrowJsxRenderer(
          code,
          readObject(catchExpression),
          (child, childBodyStatementJsx = bodyStatementJsx) =>
            analyzeOxcJsxNode(
              code,
              child,
              componentNames,
              target,
              diagnostics,
              childBodyStatementJsx,
            ),
          bodyStatementJsx,
        )
      : undefined;
  const placeholderChildren =
    placeholderExpression === undefined
      ? undefined
      : analyzeOxcExpressionChild(
          code,
          readObject(placeholderExpression),
          componentNames,
          target,
          diagnostics,
          bodyStatementJsx,
        );

  return {
    kind: "async-boundary",
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

function analyzeOxcChildren(
  code: string,
  children: readonly unknown[],
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx: OxcBodyStatementJsxMode,
): JsxNodeIr[] {
  return children.flatMap((child, index): JsxNodeIr[] => {
    const object = readObject(child);

    if (object.type === "JSXText") {
      const value = typeof object.value === "string" ? object.value : "";
      const normalizedValue = normalizeOxcJsxText(value, children, index);
      return normalizedValue === "" ? [] : [{ kind: "text", value: normalizedValue }];
    }

    if (object.type === "JSXElement" || object.type === "JSXFragment") {
      return [
        analyzeOxcJsxNode(code, object, componentNames, target, diagnostics, bodyStatementJsx),
      ];
    }

    if (object.type === "JSXExpressionContainer") {
      return analyzeOxcExpressionChild(
        code,
        readObject(object.expression),
        componentNames,
        target,
        diagnostics,
        bodyStatementJsx,
      );
    }

    return [];
  });
}

function analyzeOxcExpressionChild(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx: OxcBodyStatementJsxMode = target === "server" ? "server-string" : "dom-node",
): JsxNodeIr[] {
  const unwrappedExpression = unwrapOxcParentheses(expression);

  if (unwrappedExpression.type === "JSXEmptyExpression") {
    diagnostics.push(invalidJsxExpressionDiagnostic(getOxcLocation(code, expression)));
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
          componentNames,
          target,
          diagnostics,
          bodyStatementJsx,
        ),
        whenFalse: analyzeOxcDynamicBranch(
          code,
          readObject(unwrappedExpression.alternate),
          componentNames,
          target,
          diagnostics,
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
      componentNames,
      target,
      diagnostics,
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

  const list = analyzeOxcListExpression(
    code,
    unwrappedExpression,
    componentNames,
    target,
    diagnostics,
    bodyStatementJsx,
  );

  if (list !== undefined) {
    return [list];
  }

  if (unwrappedExpression.type === "JSXElement" || unwrappedExpression.type === "JSXFragment") {
    return [
      analyzeOxcJsxNode(
        code,
        unwrappedExpression,
        componentNames,
        target,
        diagnostics,
        bodyStatementJsx,
      ),
    ];
  }

  return [
    {
      kind: "expr",
      code: containsOxcJsxSyntax(unwrappedExpression)
        ? normalizeOxcExpressionCode(
            lowerOxcNestedJsxExpression(
              code,
              expression,
              componentNames,
              target,
              diagnostics,
              bodyStatementJsx,
            ) ??
              (bodyStatementJsx === "compat-object"
                ? stripOxcGeneratedImports(transformJsxWithOxc(readSource(code, expression)))
                : readSource(code, expression)),
          )
        : readSource(code, expression),
      ...(isOxcRenderValueExpression(expression) ? { renderMode: "dynamic" as const } : {}),
    },
  ];
}

function analyzeOxcDynamicBranch(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx: OxcBodyStatementJsxMode = target === "server" ? "server-string" : "dom-node",
): JsxNodeIr[] {
  if (expression.type === "Literal" && (expression.value === null || expression.value === false)) {
    return [];
  }

  return analyzeOxcExpressionChild(
    code,
    expression,
    componentNames,
    target,
    diagnostics,
    bodyStatementJsx,
  );
}

function analyzeOxcListExpression(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
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
  const rendererBody = analyzeOxcListRenderer(
    code,
    renderer,
    componentNames,
    target,
    diagnostics,
    bodyStatementJsx,
  );

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
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx: OxcBodyStatementJsxMode,
): { children: JsxNodeIr[]; bodyStatements: string[] } | undefined {
  const body = readObject(renderer.body);

  if (body.type !== "BlockStatement") {
    return analyzeOxcListReturnExpression(
      code,
      unwrapOxcParentheses(body),
      [],
      componentNames,
      target,
      diagnostics,
      bodyStatementJsx,
    );
  }

  const statements = readArray(body.body);
  const ifStatementIndex = statements.findIndex(
    (statement) => readObject(statement).type === "IfStatement",
  );

  if (ifStatementIndex >= 0) {
    return analyzeOxcListIfRenderer(
      code,
      statements,
      ifStatementIndex,
      componentNames,
      target,
      diagnostics,
      bodyStatementJsx,
    );
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
          componentNames,
          target,
          diagnostics,
          bodyStatementJsx,
        ) ?? formatOxcBodyStatement(code, statement, bodyStatementJsx),
    ),
    componentNames,
    target,
    diagnostics,
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
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx: OxcBodyStatementJsxMode,
): { children: JsxNodeIr[]; bodyStatements: string[] } | undefined {
  if (body.type !== "JSXElement" && body.type !== "JSXFragment") {
    return undefined;
  }

  return {
    children: [
      analyzeOxcJsxNode(code, body, componentNames, target, diagnostics, bodyStatementJsx),
    ],
    bodyStatements,
  };
}

function analyzeOxcListIfRenderer(
  code: string,
  statements: readonly unknown[],
  ifStatementIndex: number,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
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
      whenTrue: analyzeOxcDynamicBranch(
        code,
        whenTrueExpression,
        componentNames,
        target,
        diagnostics,
        bodyStatementJsx,
      ),
      whenFalse: analyzeOxcDynamicBranch(
        code,
        whenFalseExpression,
        componentNames,
        target,
        diagnostics,
        bodyStatementJsx,
      ),
    },
  ];

  markOxcRenderValueExpressions(children, collectOxcBodyJsxBindingNames(bodyPrefixStatements));

  return {
    bodyStatements: bodyPrefixStatements.map(
      (statement) =>
        lowerOxcBodyStatementJsx(
          code,
          statement,
          componentNames,
          target,
          diagnostics,
          bodyStatementJsx,
        ) ?? formatOxcBodyStatement(code, statement, bodyStatementJsx),
    ),
    children,
  };
}

function lowerOxcTopLevelStatement(
  code: string,
  statement: unknown,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  options?: AnalyzeModuleOptions,
): string | undefined {
  const object = readObject(statement);

  if (object.type !== "VariableDeclaration" || !containsOxcJsxSyntax(object)) {
    return undefined;
  }

  const mode =
    options?.topLevelJsx === "compat-object"
      ? "compat-object"
      : options?.topLevelJsx === "server-string"
        ? "server-string"
        : "unsupported";

  return lowerOxcBodyStatementJsx(code, statement, componentNames, target, diagnostics, mode);
}

function formatPreservedStatement(
  code: string,
  statement: unknown,
  options?: AnalyzeModuleOptions,
): string {
  const source = readSource(code, statement);

  if (options?.topLevelJsx === "compat-object" || options?.bodyStatementJsx === "compat-object") {
    return transformJsxWithOxc(source);
  }

  return formatStatement(code, statement);
}

function formatOxcBodyStatement(
  code: string,
  statement: unknown,
  bodyStatementJsx: OxcBodyStatementJsxMode,
): string {
  return bodyStatementJsx === "compat-object"
    ? stripOxcGeneratedImports(transformJsxWithOxc(readSource(code, statement)))
    : formatStatement(code, statement);
}

function lowerOxcBodyStatementJsx(
  code: string,
  statement: unknown,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  mode: OxcBodyStatementJsxMode,
): string | undefined {
  const object = readObject(statement);

  if (object.type === "ForOfStatement" || object.type === "ForStatement") {
    return lowerOxcForOfStatementJsx(code, object, componentNames, target, diagnostics, mode);
  }

  if (mode === "unsupported" || object.type !== "VariableDeclaration") {
    return undefined;
  }

  const declarations = readArray(object.declarations);

  if (declarations.length !== 1) {
    return undefined;
  }

  const declaration = readObject(declarations[0]);
  const id = readObject(declaration.id);
  const initializer = unwrapOxcParentheses(readObject(declaration.init));

  if (typeof id.name !== "string" || !containsOxcJsxSyntax(initializer)) {
    return undefined;
  }

  const lowered =
    mode === "dom-node"
      ? lowerOxcDomNodeExpression(code, initializer)
      : mode === "compat-object"
        ? lowerOxcCompatObjectExpression(code, initializer, componentNames, target, diagnostics)
        : mode === "server-string"
          ? lowerOxcServerStringExpression(code, initializer, componentNames, target, diagnostics)
          : undefined;

  if (lowered === undefined) {
    return undefined;
  }

  const kind = typeof object.kind === "string" ? object.kind : "const";
  return `${kind} ${id.name} = ${lowered};`;
}

function lowerOxcForOfStatementJsx(
  code: string,
  statement: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  mode: OxcBodyStatementJsxMode,
): string | undefined {
  const body = readObject(statement.body);

  if (body.type !== "BlockStatement") {
    return undefined;
  }

  let didLower = false;
  const loweredStatements = readArray(body.body).map((bodyStatement) => {
    const lowered =
      lowerOxcPushJsxStatement(code, bodyStatement, componentNames, target, diagnostics, mode) ??
      lowerOxcBodyStatementJsx(code, bodyStatement, componentNames, target, diagnostics, mode);

    if (lowered !== undefined) {
      didLower = true;
    }

    return lowered ?? formatStatement(code, bodyStatement);
  });

  if (!didLower) {
    return undefined;
  }

  return [
    formatOxcLoopHeader(code, statement),
    ...loweredStatements.flatMap((statementCode) =>
      statementCode.split("\n").map((line) => `  ${line}`),
    ),
    "}",
  ].join("\n");
}

function formatOxcLoopHeader(code: string, statement: Record<string, unknown>): string {
  if (statement.type === "ForStatement") {
    const init = readSource(code, statement.init);
    const test = readSource(code, statement.test);
    const update = readSource(code, statement.update);
    return `for (${init}; ${test}; ${update}) {`;
  }

  return `for (${formatOxcForLeft(code, statement.left)} of ${readSource(code, statement.right)}) {`;
}

function formatOxcForLeft(code: string, left: unknown): string {
  const object = readObject(left);

  if (object.type !== "VariableDeclaration") {
    return readSource(code, left);
  }

  const declaration = readObject(readArray(object.declarations)[0]);
  const id = readObject(declaration.id);
  const kind = typeof object.kind === "string" ? object.kind : "const";

  return typeof id.name === "string" ? `${kind} ${id.name}` : readSource(code, left);
}

function lowerOxcPushJsxStatement(
  code: string,
  statement: unknown,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  mode: OxcBodyStatementJsxMode,
): string | undefined {
  const object = readObject(statement);

  if (object.type !== "ExpressionStatement") {
    return undefined;
  }

  const expression = readObject(object.expression);

  if (expression.type !== "CallExpression") {
    return undefined;
  }

  const callee = readObject(expression.callee);
  const argument = unwrapOxcParentheses(readObject(readArray(expression.arguments)[0]));

  if (
    callee.type !== "MemberExpression" ||
    readObject(callee.property).name !== "push" ||
    !containsOxcJsxSyntax(argument)
  ) {
    return undefined;
  }

  const lowered =
    mode === "dom-node"
      ? lowerOxcDomNodeExpression(code, argument)
      : mode === "compat-object"
        ? lowerOxcCompatObjectExpression(code, argument, componentNames, target, diagnostics)
        : mode === "server-string"
          ? lowerOxcServerStringExpression(code, argument, componentNames, target, diagnostics)
          : undefined;

  if (lowered === undefined) {
    return undefined;
  }

  return `${readSource(code, callee)}(${lowered});`;
}

function lowerOxcDomNodeExpression(
  code: string,
  node: Record<string, unknown>,
): string | undefined {
  const unwrapped = unwrapOxcParentheses(node);

  if (unwrapped.type === "ConditionalExpression") {
    const whenTrue = lowerOxcDomNodeExpression(code, readObject(unwrapped.consequent));
    const whenFalse = lowerOxcDomNodeExpression(code, readObject(unwrapped.alternate));

    if (whenTrue !== undefined && whenFalse !== undefined) {
      return `((${readSource(code, readObject(unwrapped.test))}) ? ${whenTrue} : ${whenFalse})`;
    }
  }

  if (unwrapped.type === "Literal" && (unwrapped.value === null || unwrapped.value === false)) {
    return 'document.createTextNode("")';
  }

  node = unwrapped;

  if (node.type !== "JSXElement") {
    return undefined;
  }

  const openingElement = readObject(node.openingElement);
  const tagName = readOxcJsxTagName(readObject(openingElement.name));

  if (!/^[a-z]/.test(tagName)) {
    return undefined;
  }

  return [
    "(() => {",
    `  const _node = document.createElement(${JSON.stringify(tagName)});`,
    ...lowerOxcDomAttributes(code, readArray(openingElement.attributes)),
    ...lowerOxcDomChildren(code, readArray(node.children)),
    "  return _node;",
    "})()",
  ].join("\n");
}

function lowerOxcDomAttributes(code: string, attributes: readonly unknown[]): string[] {
  return attributes.flatMap((attribute): string[] => {
    const object = readObject(attribute);

    if (object.type !== "JSXAttribute") {
      return [];
    }

    const name = String(readObject(object.name).name);
    const domName = HTML_ATTRIBUTE_ALIASES[name] ?? name;
    const value = readObject(object.value);

    if (Object.keys(value).length === 0) {
      return [`  _node.setAttribute(${JSON.stringify(domName)}, "");`];
    }

    if (value.type === "Literal") {
      return [`  _node.setAttribute(${JSON.stringify(domName)}, ${JSON.stringify(value.value)});`];
    }

    if (value.type === "JSXExpressionContainer") {
      return [
        `  _node.setAttribute(${JSON.stringify(domName)}, String(${readSource(code, readObject(value.expression))}));`,
      ];
    }

    return [];
  });
}

const HTML_ATTRIBUTE_ALIASES: Record<string, string> = {
  acceptCharset: "accept-charset",
  autoFocus: "autofocus",
  autoPlay: "autoplay",
  charSet: "charset",
  className: "class",
  colSpan: "colspan",
  contentEditable: "contenteditable",
  crossOrigin: "crossorigin",
  encType: "enctype",
  formAction: "formaction",
  frameBorder: "frameborder",
  htmlFor: "for",
  httpEquiv: "http-equiv",
  maxLength: "maxlength",
  minLength: "minlength",
  noValidate: "novalidate",
  playsInline: "playsinline",
  readOnly: "readonly",
  rowSpan: "rowspan",
  spellCheck: "spellcheck",
  srcDoc: "srcdoc",
  srcSet: "srcset",
  tabIndex: "tabindex",
  useMap: "usemap",
};

function lowerOxcDomChildren(code: string, children: readonly unknown[]): string[] {
  return children.flatMap((child): string[] => {
    const object = readObject(child);

    if (object.type === "JSXText") {
      const value =
        typeof object.value === "string" ? object.value.replace(/\s+/g, " ").trim() : "";
      return value === "" ? [] : [`  _node.append(${JSON.stringify(value)});`];
    }

    if (object.type === "JSXExpressionContainer") {
      return [`  _node.append(String(${readSource(code, readObject(object.expression))}));`];
    }

    if (object.type === "JSXElement") {
      const lowered = lowerOxcDomNodeExpression(code, object);
      return lowered === undefined ? [] : [`  _node.append(${lowered});`];
    }

    return [];
  });
}

function lowerOxcCompatObjectExpression(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): string | undefined {
  const children = analyzeOxcExpressionChild(
    code,
    expression,
    componentNames,
    target,
    diagnostics,
    "compat-object",
  );

  if (children.length === 0) {
    return "null";
  }

  if (children.length === 1) {
    return emitOxcCompatObjectNode(children[0] as JsxNodeIr);
  }

  return `[${children.map(emitOxcCompatObjectNode).join(", ")}]`;
}

function lowerOxcCompatReactNodeExpression(
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

function lowerOxcNestedJsxExpression(
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

function lowerOxcReactiveValueExpression(
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

function lowerOxcServerStringExpression(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): string | undefined {
  const children = analyzeOxcExpressionChild(
    code,
    expression,
    componentNames,
    target,
    diagnostics,
    "server-string",
  );

  if (children.length === 0) {
    return '""';
  }

  return emitOxcServerStringChildren(children);
}

function emitOxcServerStringChildren(children: readonly JsxNodeIr[]): string {
  if (children.length === 0) {
    return '""';
  }

  return children.map(emitOxcServerStringNode).join(" + ");
}

function emitOxcServerStringNode(node: JsxNodeIr): string {
  if (node.kind === "text") {
    return JSON.stringify(node.value);
  }

  if (node.kind === "expr") {
    return `_escapeHtml(${node.code})`;
  }

  if (node.kind === "conditional") {
    return `((${node.conditionCode}) ? ${emitOxcServerStringChildren(node.whenTrue)} : ${emitOxcServerStringChildren(node.whenFalse)})`;
  }

  if (node.kind === "list") {
    const parameters =
      node.indexName === undefined ? node.itemName : `${node.itemName}, ${node.indexName}`;
    return `(${node.itemsCode}).map((${parameters}) => ${emitOxcServerStringChildren(node.children)}).join("")`;
  }

  if (node.kind === "fragment") {
    return emitOxcServerStringChildren(node.children);
  }

  if (node.kind === "component") {
    const props = emitOxcServerComponentProps(node.props, node.children);
    return `${node.name}(${props})`;
  }

  if (node.kind === "async-boundary") {
    return '""';
  }

  const attrs = node.attributes.map(emitOxcServerAttribute).join(" + ");
  const open =
    attrs === ""
      ? JSON.stringify(`<${node.tagName}>`)
      : `${JSON.stringify(`<${node.tagName}`)} + ${attrs} + ">"`;
  return `${open} + ${emitOxcServerStringChildren(node.children)} + ${JSON.stringify(`</${node.tagName}>`)}`;
}

function emitOxcServerComponentProps(
  props: readonly ComponentPropIr[],
  children: readonly JsxNodeIr[],
): string {
  const entries = props.map((prop) => {
    if (prop.kind === "spread-prop") {
      return `...(${prop.code})`;
    }

    if (prop.kind === "render-prop") {
      return `${emitOxcCompatObjectPropName(prop.name)}: ${emitOxcServerStringChildren(prop.children)}`;
    }

    return `${emitOxcCompatObjectPropName(prop.name)}: (${prop.code})`;
  });

  if (children.length > 0) {
    entries.push(`children: ${emitOxcServerStringChildren(children)}`);
  }

  return `{ ${entries.join(", ")} }`;
}

function emitOxcServerAttribute(attr: AttributeIr): string {
  if (attr.kind === "static-attr") {
    return JSON.stringify(` ${attr.name}="${escapeHtmlAttribute(attr.value)}"`);
  }

  if (attr.kind === "dynamic-attr") {
    return `${JSON.stringify(` ${attr.name}="`)} + _escapeHtml(${attr.code}) + ${JSON.stringify('"')}`;
  }

  return '""';
}

function emitOxcCompatObjectNode(node: JsxNodeIr): string {
  if (node.kind === "text") {
    return JSON.stringify(node.value);
  }

  if (node.kind === "expr") {
    return `(${node.code})`;
  }

  if (node.kind === "conditional") {
    return `(${node.conditionCode}) ? ${emitOxcCompatObjectChildren(node.whenTrue)} : ${emitOxcCompatObjectChildren(node.whenFalse)}`;
  }

  if (node.kind === "list") {
    const parameters =
      node.indexName === undefined ? node.itemName : `${node.itemName}, ${node.indexName}`;
    return `(${node.itemsCode}).map((${parameters}) => ${emitOxcCompatObjectChildren(node.children)})`;
  }

  if (node.kind === "fragment") {
    return emitOxcCompatObjectElement('Symbol.for("modular.react.fragment")', [], node.children);
  }

  if (node.kind === "component") {
    return emitOxcCompatObjectElement(
      node.name,
      node.props.map(emitOxcCompatObjectComponentProp),
      node.children,
      node.keyCode,
    );
  }

  if (node.kind === "async-boundary") {
    return "null";
  }

  return emitOxcCompatObjectElement(
    JSON.stringify(node.tagName),
    node.attributes.map(emitOxcCompatObjectAttribute),
    node.children,
    node.keyCode,
  );
}

function emitOxcCompatObjectChildren(children: readonly JsxNodeIr[]): string {
  if (children.length === 0) {
    return "null";
  }

  if (children.length === 1) {
    return emitOxcCompatObjectNode(children[0] as JsxNodeIr);
  }

  return `[${children.map(emitOxcCompatObjectNode).join(", ")}]`;
}

function emitOxcCompatObjectElement(
  typeCode: string,
  propEntries: readonly string[],
  children: readonly JsxNodeIr[],
  explicitKeyCode?: string,
): string {
  const entries = [...propEntries];

  if (children.length > 0) {
    entries.push(`children: ${emitOxcCompatObjectChildren(children)}`);
  }

  const keyExpression =
    explicitKeyCode === undefined
      ? "_props.key === undefined ? null : String(_props.key)"
      : `String(${explicitKeyCode})`;

  return [
    "(() => {",
    `  const _props = { ${entries.join(", ")} };`,
    `  const _key = ${keyExpression};`,
    "  const _ref = _props.ref ?? null;",
    "  delete _props.key;",
    "  delete _props.ref;",
    '  return { $$typeof: Symbol.for("modular.react.element"),',
    `    type: ${typeCode},`,
    "    key: _key,",
    "    ref: _ref,",
    "    props: _props };",
    "})()",
  ].join("\n");
}

function emitOxcCompatObjectAttribute(attr: AttributeIr): string {
  if (attr.kind === "spread-attr") {
    return `...(${attr.code})`;
  }

  if (attr.kind === "static-attr") {
    return `${emitOxcCompatObjectPropName(attr.name)}: ${JSON.stringify(attr.value)}`;
  }

  if (attr.kind === "dynamic-attr") {
    return `${emitOxcCompatObjectPropName(attr.name)}: (${attr.code})`;
  }

  return `${emitOxcCompatObjectPropName(attr.name)}: ${attr.code}`;
}

function emitOxcCompatObjectComponentProp(prop: ComponentPropIr): string {
  if (prop.kind === "spread-prop") {
    return `...(${prop.code})`;
  }

  if (prop.kind === "render-prop") {
    return `${emitOxcCompatObjectPropName(prop.name)}: ${emitOxcCompatObjectChildren(prop.children)}`;
  }

  return `${emitOxcCompatObjectPropName(prop.name)}: (${prop.code})`;
}

function emitOxcCompatObjectPropName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function readOxcReturnExpressionFromStatement(
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

function isOxcJsxBranch(expression: Record<string, unknown>): boolean {
  const unwrappedExpression = unwrapOxcParentheses(expression);
  return unwrappedExpression.type === "JSXElement" || unwrappedExpression.type === "JSXFragment";
}

function findOxcKeyCodeInChildren(children: readonly JsxNodeIr[]): string | undefined {
  if (children.length !== 1) {
    return undefined;
  }

  const child = children[0];

  if (child?.kind === "element" || child?.kind === "component") {
    return child.keyCode;
  }

  return undefined;
}
