import { parseSync } from "oxc-parser";
import { unsupportedTopLevelJsxInitializerDiagnostic } from "./diagnostics.js";
import {
  type AnalyzeToIrInput,
  type AnalyzeToIrOutput,
} from "./internal.js";
import {
  createCompilerModuleContextWithOxc,
  type CompilerModuleContext,
} from "./compiler-module-context.js";
import type { ComponentIr, ModuleIr } from "./ir.js";
import { transformJsxToCreateElementWithOxc } from "./oxc-transform.js";
import {
  arraysEqual,
  getOxcLocation,
  getOxcLocationFromOffset,
  readArray,
  readObject,
  readSource,
  unwrapOxcParentheses,
} from "./oxc-node-utils.js";
import { assignOxcAwaitIds } from "./oxc-await-ids.js";
import {
  validateOxcAwaitCompatComponents,
  validateOxcNestedAwait,
} from "./oxc-await-validation.js";
import type { OxcBodyStatementJsxMode } from "./oxc-analysis-types.js";
import {
  collectBindingNames,
  collectImportBindingNames,
  formatStatement,
  readOxcParameterName,
} from "./oxc-bindings.js";
import {
  formatOxcBodyStatement,
  formatPreservedStatement,
  lowerOxcBodyStatementJsx,
  lowerOxcTopLevelStatement,
  type OxcBodyLowerers,
} from "./oxc-body-lowering.js";
import { collectOxcVariableInitializers } from "./oxc-await-analysis.js";
import {
  collectOxcAsyncComponentNames,
  collectOxcExportedComponents,
  collectOxcExportedFunctionNames,
  collectOxcPlainComponentNames,
  hasComponentReturn,
  hasOxcFunctionLikeComponentReturn,
  isOxcExportedFunctionLike,
  isOxcComponentCallExpression,
  isJsxRoot,
  isOxcJsxComponentStatement,
  isOxcUnsupportedExportedFunction,
  readOxcPlainComponent,
  readOxcVariableComponentDeclaration,
  unwrapOxcComponentFunctionLikeInitializer,
} from "./oxc-component-detection.js";
import {
  collectOxcClientBoundaryImportComponents,
  collectOxcCompatRuntimeImportComponents,
  markOxcAsyncComponentReferences,
  markOxcClientReferences,
  markOxcCompatRuntimeReferences,
} from "./oxc-component-references.js";
import { normalizeOxcExpressionCode, stripOxcGeneratedImports } from "./oxc-code-utils.js";
import {
  analyzeOxcExpressionChild,
  analyzeOxcJsxNode,
  type OxcChildAnalysisContext,
} from "./oxc-child-analysis.js";
import { lowerOxcDomNodeExpression } from "./oxc-dom-lowering.js";
import {
  lowerOxcCompatObjectExpression,
  lowerOxcCompatReactNodeExpression,
  lowerOxcNestedJsxExpression,
  lowerOxcServerStringExpression,
} from "./oxc-nested-lowering.js";
import {
  isOxcJsxBranch,
  readOxcReturnExpressionFromStatement,
} from "./oxc-expression-utils.js";
import {
  collectOxcBodyJsxBindingNames,
  collectOxcReactiveReadAliases,
  containsOxcJsxSyntax,
  markOxcRenderValueExpressions,
} from "./oxc-render-values.js";
import { containsRawJsxInIr } from "./oxc-raw-jsx.js";
import type { AnalyzeModuleOptions, CompileTarget, Diagnostic } from "./types.js";

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

const oxcBodyLowerers: OxcBodyLowerers = {
  lowerDomNodeExpression: lowerOxcDomNodeExpression,
  lowerCompatObjectExpression: lowerOxcCompatObjectExpression,
  lowerServerStringExpression: lowerOxcServerStringExpression,
};

function createOxcChildAnalysisContext(
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx?: OxcBodyStatementJsxMode,
  componentBodyBindings?: ReadonlyMap<string, Record<string, unknown>>,
  reactiveAliasBindings?: ReadonlyMap<string, string>,
  serverOutput?: AnalyzeModuleOptions["serverOutput"],
  componentCallNames?: Set<string>,
): OxcChildAnalysisContext {
  return {
    componentNames,
    ...(componentCallNames === undefined ? {} : { componentCallNames }),
    target,
    ...(serverOutput === undefined ? {} : { serverOutput }),
    diagnostics,
    ...(bodyStatementJsx === undefined ? {} : { bodyStatementJsx }),
    ...(componentBodyBindings === undefined ? {} : { componentBodyBindings }),
    ...(reactiveAliasBindings === undefined ? {} : { reactiveAliasBindings }),
    bodyLowerers: oxcBodyLowerers,
    lowerNestedJsxExpression: lowerOxcNestedJsxExpression,
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
  return analyzeCompilerModuleContextWithOxc(
    createCompilerModuleContextWithOxc(input),
    {
      target: input.target,
      ...(input.options === undefined ? {} : { options: input.options }),
    },
  );
}

export function analyzeCompilerModuleContextWithOxc(
  context: CompilerModuleContext,
  input: Omit<AnalyzeToIrInput, "code" | "filename">,
): AnalyzeToIrOutput {
  const analyzed = analyzeOxcToIr(context.code, context.program, input.target, input.options);

  return {
    ir: analyzed.ir,
    diagnostics: [
      ...context.parseErrors.map((error) => oxcParseErrorDiagnostic(context.code, error)),
      ...analyzed.diagnostics,
    ],
    usedTypescriptFallback: false,
  };
}

function oxcParseErrorDiagnostic(code: string, error: unknown): Diagnostic {
  const object = readObject(error);
  const firstLabel = readObject(readArray(object.labels)[0]);
  const loc =
    typeof firstLabel.start === "number"
      ? getOxcLocationFromOffset(code, firstLabel.start)
      : undefined;

  return {
    level: "error",
    code:
      object.message === "Unexpected token" ? "MR_INVALID_JSX_EXPRESSION" : "MR_OXC_PARSE_ERROR",
    message: typeof object.message === "string" ? object.message : "Oxc parse error",
    ...(loc === undefined ? {} : { loc }),
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
  const compatRuntimeImports = collectOxcCompatRuntimeImportComponents(program);
  const moduleRenderValueBindings = collectOxcBodyJsxBindingNames(body);

  for (const statement of body) {
    const object = readObject(statement);

    if (object.type === "ImportDeclaration") {
      const importCode = formatStatement(code, statement);
      const source = readObject(object.source).value;

      if (importCode !== "" && !(target === "server" && isCssImportSource(source))) {
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
        oxcBodyLowerers,
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
  const componentCallNames =
    options?.serverOutput === "stream" ? componentCallNamesFromProgram(program) : undefined;
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
      options?.serverOutput,
      componentCallNames,
    ),
  );

  for (const component of components) {
    markOxcAsyncComponentReferences(component.root, asyncComponentNames);
    markOxcClientReferences(component.root, clientBoundaryImports);
    markOxcCompatRuntimeReferences(component.root, compatRuntimeImports);
    validateOxcNestedAwait(component.root, diagnostics);
    validateOxcAwaitCompatComponents(component.root, diagnostics, {
      allowCompatComponents: options?.awaitCompatComponents === "lower",
    });
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

function isCssImportSource(source: unknown): boolean {
  return typeof source === "string" && /\.(?:css|pcss|postcss|scss|sass|less|styl|stylus)$/u.test(source);
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

function componentCallNamesFromProgram(program: unknown): Set<string> {
  return new Set([
    ...collectOxcExportedComponents(program).filter((name) => name !== "default"),
    ...collectOxcPlainComponentNames(program),
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
  serverOutput: AnalyzeModuleOptions["serverOutput"],
  componentCallNames: Set<string> | undefined,
): ComponentIr[] {
  const object = readObject(statement);

  if (object.type === "ExportDefaultDeclaration") {
    const declaration = unwrapOxcComponentFunctionLikeInitializer(readObject(object.declaration));

    if (declaration === undefined || !hasOxcFunctionLikeComponentReturn(declaration)) {
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
        serverOutput,
        componentCallNames,
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
          serverOutput,
          componentCallNames,
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
        serverOutput,
        componentCallNames,
      ),
    ];
  }

  if (
    declaration.type !== "FunctionDeclaration" ||
    (!compatReactNodeReturn && !hasComponentReturn(declaration.body))
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
      serverOutput,
      componentCallNames,
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
  serverOutput: AnalyzeModuleOptions["serverOutput"],
  componentCallNames: Set<string> | undefined,
  exportDefault = false,
): ComponentIr {
  const functionBody = readObject(functionLike.body);
  const body = functionBody.type === "BlockStatement" ? readArray(functionBody.body) : [];
  const earlyIfRootReturn =
    bodyStatementJsx === "compat-object" ? undefined : findOxcEarlyIfRootReturn(body);
  const rootStatement =
    earlyIfRootReturn?.ifStatement ??
    (bodyStatementJsx === "compat-object"
      ? body.find((bodyStatement) => readObject(bodyStatement).type === "ReturnStatement")
      : findOxcRootStatement(body));
  const returnStatement =
    readObject(rootStatement).type === "ReturnStatement" ? rootStatement : undefined;
  const expressionBody = unwrapOxcParentheses(readObject(functionLike.body));
  const returnExpression =
    returnStatement === undefined
      ? expressionBody
      : unwrapOxcParentheses(readObject(readObject(returnStatement).argument));
  const parameters = readArray(functionLike.params).map((param) =>
    readOxcParameterName(code, param),
  );
  const bodyStatements = body
    .filter(
      (bodyStatement) =>
        bodyStatement !== rootStatement &&
        bodyStatement !== earlyIfRootReturn?.fallthroughStatement,
    )
    .map(
      (bodyStatement) =>
        lowerOxcBodyStatementJsx(
          code,
          bodyStatement,
          componentNames,
          target,
          diagnostics,
          bodyStatementJsx,
          oxcBodyLowerers,
        ) ?? formatOxcBodyStatement(code, bodyStatement, bodyStatementJsx),
    );
  const componentBodyBindings = collectOxcVariableInitializers(body);
  const reactiveAliasBindings = collectOxcReactiveReadAliases(code, body);
  const childAnalysisContext = createOxcChildAnalysisContext(
    componentNames,
    target,
    diagnostics,
    bodyStatementJsx,
    componentBodyBindings,
    reactiveAliasBindings,
    serverOutput,
    componentCallNames,
  );
  const root =
    analyzeOxcEarlyIfRootReturn(
      code,
      earlyIfRootReturn,
      childAnalysisContext,
      bodyStatementJsx,
    ) ??
    analyzeOxcSwitchRootReturn(
      code,
      rootStatement,
      childAnalysisContext,
      bodyStatementJsx,
    ) ??
    (isJsxRoot(returnExpression.type) || returnExpression.type === "JSXFragment"
      ? analyzeOxcJsxNode(code, returnExpression, childAnalysisContext)
      : isOxcComponentCallExpression(returnExpression)
        ? analyzeOxcComponentCallExpression(code, returnExpression)
        : analyzeOxcDynamicRootReturn(
            code,
            returnExpression,
            childAnalysisContext,
            bodyStatementJsx,
          ) ??
          {
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
          });
  markOxcRenderValueExpressions(
    [root],
    new Set([
      ...moduleRenderValueBindings,
      ...collectOxcBodyJsxBindingNames(
        body.filter(
          (bodyStatement) =>
            bodyStatement !== rootStatement &&
            bodyStatement !== earlyIfRootReturn?.fallthroughStatement,
        ),
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

interface OxcEarlyIfRootReturn {
  ifStatement: unknown;
  fallthroughStatement: unknown;
  test: Record<string, unknown>;
  consequent: Record<string, unknown>;
  fallthrough: Record<string, unknown>;
}

function findOxcEarlyIfRootReturn(body: readonly unknown[]): OxcEarlyIfRootReturn | undefined {
  for (let index = 0; index < body.length - 1; index += 1) {
    const statement = readObject(body[index]);

    if (statement.type !== "IfStatement" || readObject(statement.alternate).type !== undefined) {
      continue;
    }

    const consequent = readOxcReturnExpressionFromStatement(statement.consequent);
    const fallthroughStatement = body[index + 1];
    const fallthrough = readOxcReturnExpressionFromStatement(fallthroughStatement);

    if (consequent === undefined || fallthrough === undefined) {
      continue;
    }

    if (!isOxcEarlyRootReturnPair(consequent, fallthrough)) {
      continue;
    }

    return {
      ifStatement: body[index],
      fallthroughStatement,
      test: readObject(statement.test),
      consequent,
      fallthrough,
    };
  }

  return undefined;
}

function isOxcEarlyRootReturnPair(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return (
    (isOxcEmptyRootReturn(left) && isOxcRenderableRootReturn(right)) ||
    (isOxcRenderableRootReturn(left) && isOxcEmptyRootReturn(right))
  );
}

function isOxcEmptyRootReturn(expression: Record<string, unknown>): boolean {
  return (
    expression.type === "Literal" &&
    (expression.value === null || expression.value === false)
  );
}

function isOxcRenderableRootReturn(expression: Record<string, unknown>): boolean {
  return (
    isJsxRoot(expression.type) ||
    expression.type === "JSXFragment" ||
    isOxcComponentCallExpression(expression) ||
    analyzeOxcDynamicRootReturnShape(expression)
  );
}

function analyzeOxcDynamicRootReturnShape(expression: Record<string, unknown>): boolean {
  if (expression.type === "ConditionalExpression") {
    return true;
  }

  return (
    expression.type === "LogicalExpression" &&
    isOxcJsxBranch(readObject(expression.right))
  );
}

function findOxcRootStatement(body: readonly unknown[]): unknown | undefined {
  return body.find((bodyStatement) => {
    const object = readObject(bodyStatement);
    return object.type === "ReturnStatement" || isOxcSwitchRootReturnStatement(object);
  });
}

function isOxcSwitchRootReturnStatement(statement: Record<string, unknown>): boolean {
  if (statement.type !== "SwitchStatement") {
    return false;
  }

  return readArray(statement.cases).some((switchCase) =>
    readArray(readObject(switchCase).consequent).some(
      (child) => readObject(child).type === "ReturnStatement",
    ),
  );
}

function analyzeOxcSwitchRootReturn(
  code: string,
  statement: unknown,
  context: OxcChildAnalysisContext,
  bodyStatementJsx: OxcBodyStatementJsxMode,
): ComponentIr["root"] | undefined {
  const object = readObject(statement);

  if (object.type !== "SwitchStatement") {
    return undefined;
  }

  const discriminant = readSource(code, object.discriminant);
  const cases = readArray(object.cases).map((switchCase) => {
    const caseObject = readObject(switchCase);
    const returnStatement = readArray(caseObject.consequent)
      .map(readObject)
      .find((child) => child.type === "ReturnStatement");
    const argument =
      returnStatement === undefined
        ? undefined
        : unwrapOxcParentheses(readObject(returnStatement.argument));

    return {
      test: readObject(caseObject.test),
      children:
        argument === undefined
          ? undefined
          : analyzeOxcDynamicRootBranch(code, argument, context, bodyStatementJsx),
    };
  });

  if (cases.some((entry) => entry.children === undefined)) {
    return undefined;
  }

  const defaultCase = cases.find((entry) => entry.test.type === undefined);
  let fallback = defaultCase?.children ?? [];

  for (const entry of [...cases].reverse()) {
    if (entry.test.type === undefined) {
      continue;
    }

    fallback = [
      {
        kind: "conditional",
        conditionCode: `${discriminant} === ${readSource(code, entry.test)}`,
        whenTrue: entry.children ?? [],
        whenFalse: fallback,
      },
    ];
  }

  return fallback.length === 1 ? fallback[0] : { kind: "fragment", children: fallback };
}

function analyzeOxcEarlyIfRootReturn(
  code: string,
  earlyIfRootReturn: OxcEarlyIfRootReturn | undefined,
  context: OxcChildAnalysisContext,
  bodyStatementJsx: OxcBodyStatementJsxMode,
): ComponentIr["root"] | undefined {
  if (earlyIfRootReturn === undefined) {
    return undefined;
  }

  return {
    kind: "conditional",
    conditionCode: readSource(code, earlyIfRootReturn.test),
    whenTrue: analyzeOxcDynamicRootBranch(
      code,
      earlyIfRootReturn.consequent,
      context,
      bodyStatementJsx,
    ),
    whenFalse: analyzeOxcDynamicRootBranch(
      code,
      earlyIfRootReturn.fallthrough,
      context,
      bodyStatementJsx,
    ),
  };
}

function analyzeOxcDynamicRootBranch(
  code: string,
  expression: Record<string, unknown>,
  context: OxcChildAnalysisContext,
  bodyStatementJsx: OxcBodyStatementJsxMode,
): ComponentIr["root"][] {
  if (expression.type === "Literal" && (expression.value === null || expression.value === false)) {
    return [];
  }

  return analyzeOxcExpressionChild(code, expression, context, bodyStatementJsx);
}

function analyzeOxcDynamicRootReturn(
  code: string,
  returnExpression: Record<string, unknown>,
  context: OxcChildAnalysisContext,
  bodyStatementJsx: OxcBodyStatementJsxMode,
): ComponentIr["root"] | undefined {
  const nodes = analyzeOxcExpressionChild(code, returnExpression, context, bodyStatementJsx);

  if (nodes.length !== 1) {
    return undefined;
  }

  const [root] = nodes;
  return root?.kind === "conditional" ? root : undefined;
}

function analyzeOxcComponentCallExpression(
  code: string,
  expression: Record<string, unknown>,
): ComponentIr["root"] {
  const callee = readObject(expression.callee);
  const args = readArray(expression.arguments);
  const firstArg = readObject(args[0]);

  return {
    kind: "component",
    name: readSource(code, callee),
    props:
      firstArg.type === undefined
        ? []
        : [
            {
              kind: "spread-prop" as const,
              code: normalizeOxcExpressionCode(readSource(code, firstArg)),
            },
          ],
    children: [],
  };
}
