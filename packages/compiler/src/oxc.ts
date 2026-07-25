import { parseSync } from "oxc-parser";
import { unsupportedTopLevelJsxInitializerDiagnostic } from "./diagnostics.js";
import { type AnalyzeToIrInput, type AnalyzeToIrOutput } from "./internal.js";
import { setCompatInlineMemo } from "./compat-inline-memo.js";
import {
  createCompilerModuleContextWithOxc,
  type CompilerModuleContext,
} from "./compiler-module-context.js";
import type { ClientReferenceIr, ComponentIr, ModuleIr, PropAliasIr } from "./ir.js";
import {
  stripTypeScriptExpressionWithOxc,
  transformJsxToCreateElementWithOxc,
} from "./oxc-transform.js";
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
  collectOxcLocalJsxReturnFunctionNames,
  collectOxcPlainComponentNames,
  hasComponentReturn,
  hasLocalJsxHelperCallReturn,
  hasOxcFunctionLikeComponentReturn,
  isOxcExportedFunctionLike,
  isOxcComponentCallExpression,
  isOxcLocalJsxHelperCallExpression,
  isJsxRoot,
  isOxcJsxComponentStatement,
  isOxcUnsupportedExportedFunction,
  readOxcListMapComponent,
  readOxcPlainComponent,
  readOxcVariableComponentDeclaration,
  unwrapOxcComponentFunctionLikeInitializer,
} from "./oxc-component-detection.js";
import {
  collectOxcClientBoundaryImportComponents,
  collectOxcCompatReactNodeComponentReferences,
  collectOxcCompatRuntimeImportComponents,
  markOxcAsyncComponentReferences,
  markOxcClientReferences,
  markOxcCompatReactNodeReferences,
  markOxcCompatRuntimeReferences,
} from "./oxc-component-references.js";
import { normalizeOxcExpressionCode, stripOxcGeneratedImports } from "./oxc-code-utils.js";
import {
  analyzeOxcExpressionChild,
  analyzeOxcJsxNode,
  type OxcChildAnalysisContext,
} from "./oxc-child-analysis.js";
import {
  analyzeCompatCreateElementFunctionRoot,
  analyzeCompatCreateElementRoot,
  collectCompatCreateElementNames,
  collectCompatRenderToStringNames,
  collectFunctionShadowedNames,
  hasLowerableCompatCreateElementReturn,
} from "./oxc-compat-create-element.js";
import { lowerOxcDomNodeExpression } from "./oxc-dom-lowering.js";
import {
  lowerOxcCompatObjectExpression,
  lowerOxcCompatReactNodeExpression,
  lowerOxcNestedJsxExpression,
  lowerOxcReactiveValueExpression,
  lowerOxcServerStringExpression,
} from "./oxc-nested-lowering.js";
import { isOxcJsxBranch, readOxcReturnExpressionFromStatement } from "./oxc-expression-utils.js";
import {
  collectOxcBodyJsxBindingNames,
  collectOxcReactiveDerivedFunctionNames,
  collectOxcReactiveReadAliases,
  containsOxcJsxSyntax,
  markOxcRenderValueExpressions,
  rewriteOxcReactiveAliasExpressionCode,
} from "./oxc-render-values.js";
import { containsRawJsxInIr } from "./oxc-raw-jsx.js";
import type { AnalyzeModuleOptions, CompileTarget, Diagnostic } from "./types.js";

export type { AnalyzeToIrInput, AnalyzeToIrOutput } from "./internal.js";
export type { CompilerModuleContext } from "./compiler-module-context.js";
export type {
  AsyncBoundaryIr,
  AttributeIr,
  ClientReferenceIr,
  ComponentIr,
  ComponentNamedPropIr,
  ComponentPropIr,
  ComponentRefIr,
  ComponentRenderPropIr,
  ComponentSpreadPropIr,
  ConditionalIr,
  DomRefAttributeIr,
  DynamicAttributeIr,
  EventAttributeIr,
  ExprIr,
  JsxElementIr,
  JsxFragmentIr,
  JsxNodeIr,
  ListIr,
  ModuleIr,
  PropAliasIr,
  SpreadAttributeIr,
  StaticAttributeIr,
  TextIr,
} from "./ir.js";
export type {
  AnalyzeModuleOptions,
  BodyStatementJsxMode,
  CompileTarget,
  Diagnostic,
  ServerOutputMode,
  SourceLocation,
} from "./types.js";

/** Reports OXC analysis parity data used by compiler migration and diagnostics tests. */
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

const oxcBodyLowerers: OxcBodyLowerers = createOxcBodyLowerers();

function createOxcBodyLowerers(
  compatRuntimeImports: ReadonlyMap<string, ClientReferenceIr> = new Map(),
): OxcBodyLowerers {
  return {
    lowerDomNodeExpression: (code, expression, componentNames) =>
      lowerOxcReactiveValueExpression(code, expression, componentNames) ??
      lowerOxcDomNodeExpression(code, expression),
    lowerCompatObjectExpression: lowerOxcCompatObjectExpression,
    lowerServerStringExpression: (code, expression, componentNames, target, diagnostics) =>
      lowerOxcServerStringExpression(
        code,
        expression,
        componentNames,
        target,
        diagnostics,
        compatRuntimeImports,
      ),
  };
}

function createOxcChildAnalysisContext(
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx?: OxcBodyStatementJsxMode,
  componentBodyBindings?: ReadonlyMap<string, Record<string, unknown>>,
  reactiveAliasBindings?: ReadonlyMap<string, string>,
  serverOutput?: AnalyzeModuleOptions["serverOutput"],
  componentCallNames?: Set<string>,
  bodyLowerers: OxcBodyLowerers = oxcBodyLowerers,
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
    bodyLowerers,
    lowerNestedJsxExpression: lowerOxcNestedJsxExpression,
  };
}

/** Compares OXC component discovery and IR output against parity expectations for one module. */
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

/** Analyzes source code into compiler IR using OXC parsing and lowering. */
export function analyzeWithOxc(input: AnalyzeToIrInput): AnalyzeToIrOutput {
  return analyzeCompilerModuleContextWithOxc(createCompilerModuleContextWithOxc(input), {
    target: input.target,
    ...(input.options === undefined ? {} : { options: input.options }),
  });
}

/** Analyzes a cached OXC compiler module context into compiler IR. */
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
  const labelMessage = typeof firstLabel.message === "string" ? firstLabel.message : undefined;
  const message = typeof object.message === "string" ? object.message : "Oxc parse error";
  const helpMessage = typeof object.helpMessage === "string" ? object.helpMessage : undefined;
  const codeframe = typeof object.codeframe === "string" ? object.codeframe.trimEnd() : undefined;
  const loc =
    typeof firstLabel.start === "number"
      ? getOxcLocationFromOffset(code, firstLabel.start)
      : undefined;

  return {
    level: "error",
    code:
      typeof firstLabel.start === "number" && isLikelyInvalidJsxExpression(code, firstLabel.start)
        ? "MR_INVALID_JSX_EXPRESSION"
        : "MR_OXC_PARSE_ERROR",
    message: [labelMessage ?? message, helpMessage, codeframe].filter(isPresentString).join("\n"),
    ...(loc === undefined ? {} : { loc }),
  };
}

function isLikelyInvalidJsxExpression(code: string, offset: number): boolean {
  const before = code.slice(0, offset);
  const lastOpenExpression = before.lastIndexOf("{");

  if (lastOpenExpression < 0 || before.lastIndexOf("}") > lastOpenExpression) {
    return false;
  }

  const beforeExpression = before.slice(0, lastOpenExpression);
  const lastTagOpen = beforeExpression.lastIndexOf("<");
  const lastTagClose = beforeExpression.lastIndexOf(">");
  if (lastTagOpen < 0 || lastTagClose < lastTagOpen) {
    return false;
  }

  const expressionPrefix = before.slice(lastOpenExpression + 1);
  const trimmedExpressionPrefix = expressionPrefix.trim();
  return trimmedExpressionPrefix === "" || trimmedExpressionPrefix.startsWith("<");
}

function isPresentString(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function readUnsupportedExportName(statement: unknown): string | undefined {
  const object = readObject(statement);
  const declaration = readObject(object.declaration);

  if (declaration.type === "FunctionDeclaration") {
    const name = readObject(declaration.id).name;
    return typeof name === "string" && name !== "" ? name : "default";
  }

  if (declaration.type === "VariableDeclaration") {
    return collectBindingNames(declaration)[0];
  }

  return undefined;
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
    new Set(options?.clientBoundaryFallbackImports ?? []),
  );
  const compatRuntimeImports = collectOxcCompatRuntimeImportComponents(program);
  const compatReactNodeReferences =
    options?.compatReactNodeReturnRenderMode === "react-node"
      ? collectOxcCompatReactNodeComponentReferences(program)
      : undefined;
  const localJsxReturnFunctionNames =
    target === "server" ? collectOxcLocalJsxReturnFunctionNames(program) : new Set<string>();
  const compatCreateElementNames =
    target === "server" ? collectCompatCreateElementNames(program) : new Set<string>();
  const compatRenderToStringNames =
    target === "server" ? collectCompatRenderToStringNames(program) : new Set<string>();
  const compatCreateElementLocalFunctionLikes =
    target === "server"
      ? collectCompatCreateElementLocalFunctionLikes(program)
      : new Map<string, Record<string, unknown>>();
  const compatRenderToStringLowerableTargets =
    target === "server"
      ? collectCompatRenderToStringLowerableTargets(
          code,
          body,
          compatCreateElementNames,
          compatRenderToStringNames,
          compatCreateElementLocalFunctionLikes,
        )
      : new Set<string>();
  const localJsxHelperHtmlParameters =
    target === "server"
      ? collectLocalJsxHelperHtmlParameters(program, localJsxReturnFunctionNames)
      : new Map<string, Set<number>>();
  const bodyLowerers = createOxcBodyLowerers(compatRuntimeImports);
  const moduleRenderValueBindings = collectOxcBodyJsxBindingNames(body);
  const reactiveDerivedFunctionNames = collectOxcReactiveDerivedFunctionNames(body);

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
      isOxcJsxComponentStatement(statement, localJsxReturnFunctionNames) ||
      isCompatCreateElementComponentStatement(
        code,
        statement,
        compatCreateElementNames,
        compatRenderToStringNames,
        compatCreateElementLocalFunctionLikes,
        compatRenderToStringLowerableTargets,
        options?.serverOutput,
      ) ||
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
      if (isOxcUnsupportedExportedFunction(statement, options, localJsxReturnFunctionNames)) {
        const componentName = readUnsupportedExportName(statement);
        const loc = getOxcLocation(code, statement);
        diagnostics.push({
          level: "error",
          code: "MR_UNSUPPORTED_COMPONENT_RETURN",
          message:
            componentName === undefined
              ? "Exported component must return a JSX element or supported React node."
              : `Exported component '${componentName}' must return a JSX element or supported React node.`,
          ...(loc === undefined ? {} : { loc }),
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
        bodyLowerers,
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
      compatCreateElementNames,
      compatRenderToStringNames,
      compatCreateElementLocalFunctionLikes,
      compatRenderToStringLowerableTargets,
      moduleRenderValueBindings,
      options?.compatReactNodeReturn === true,
      options?.serverOutput,
      componentCallNames,
      bodyLowerers,
      reactiveDerivedFunctionNames,
      localJsxReturnFunctionNames,
      localJsxHelperHtmlParameters,
    ),
  );

  for (const component of components) {
    markOxcAsyncComponentReferences(component.root, asyncComponentNames);
    markOxcClientReferences(component.root, clientBoundaryImports);
    markOxcCompatRuntimeReferences(component.root, compatRuntimeImports);
    if (compatReactNodeReferences !== undefined) {
      markOxcCompatReactNodeReferences(component.root, compatReactNodeReferences);
    }
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
  return (
    typeof source === "string" && /\.(?:css|pcss|postcss|scss|sass|less|styl|stylus)$/u.test(source)
  );
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

function collectLocalJsxHelperHtmlParameters(
  program: unknown,
  localJsxReturnFunctionNames: ReadonlySet<string>,
): Map<string, Set<number>> {
  const parameters = new Map<string, Set<number>>();

  if (localJsxReturnFunctionNames.size === 0) {
    return parameters;
  }

  for (const statement of readArray(readObject(program).body)) {
    const object = readObject(statement);
    const declaration =
      object.type === "ExportNamedDeclaration" || object.type === "ExportDefaultDeclaration"
        ? readObject(object.declaration)
        : object;
    const body = readObject(declaration.body);

    if (body.type !== "BlockStatement") {
      continue;
    }

    for (const returnExpression of collectOxcReturnExpressions(body)) {
      const callExpression = unwrapOxcParentheses(returnExpression);
      if (callExpression.type !== "CallExpression") {
        continue;
      }

      const callee = unwrapOxcParentheses(readObject(callExpression.callee));
      if (
        callee.type !== "Identifier" ||
        typeof callee.name !== "string" ||
        !localJsxReturnFunctionNames.has(callee.name)
      ) {
        continue;
      }
      const calleeName = callee.name;

      readArray(callExpression.arguments).forEach((argument, index) => {
        if (!containsOxcJsxSyntax(readObject(argument))) {
          return;
        }

        const indexes = parameters.get(calleeName) ?? new Set<number>();
        indexes.add(index);
        parameters.set(calleeName, indexes);
      });
    }
  }

  return parameters;
}

function collectOxcReturnExpressions(
  statement: Record<string, unknown>,
): Record<string, unknown>[] {
  if (statement.type === "ReturnStatement") {
    return [unwrapOxcParentheses(readObject(statement.argument))];
  }

  if (statement.type === "BlockStatement") {
    return readArray(statement.body).flatMap((child) =>
      collectOxcReturnExpressions(readObject(child)),
    );
  }

  if (statement.type === "IfStatement") {
    return [
      ...collectOxcReturnExpressions(readObject(statement.consequent)),
      ...collectOxcReturnExpressions(readObject(statement.alternate)),
    ];
  }

  if (statement.type === "SwitchStatement") {
    return readArray(statement.cases).flatMap((switchCase) =>
      readArray(readObject(switchCase).consequent).flatMap((child) =>
        collectOxcReturnExpressions(readObject(child)),
      ),
    );
  }

  return [];
}

interface CompatCreateElementComponent {
  name: string;
  initializer: Record<string, unknown>;
}

function readCompatCreateElementFunctionLike(
  code: string,
  expression: Record<string, unknown>,
  names: ReadonlySet<string>,
  localFunctionLikes: ReadonlyMap<string, Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const functionLike = unwrapOxcComponentFunctionLikeInitializer(expression);

  return functionLike !== undefined &&
    hasLowerableCompatCreateElementReturn(code, functionLike, names, localFunctionLikes)
    ? functionLike
    : undefined;
}

function readCompatCreateElementPlainComponent(
  code: string,
  statement: unknown,
  names: ReadonlySet<string>,
  localFunctionLikes: ReadonlyMap<string, Record<string, unknown>>,
): CompatCreateElementComponent | undefined {
  if (names.size === 0) {
    return undefined;
  }

  const object = readObject(statement);

  if (
    object.type === "FunctionDeclaration" &&
    hasLowerableCompatCreateElementReturn(code, object, names, localFunctionLikes)
  ) {
    const id = readObject(object.id);
    return typeof id.name === "string" ? { name: id.name, initializer: object } : undefined;
  }

  if (object.type !== "VariableDeclaration") {
    return undefined;
  }

  for (const declarator of readArray(object.declarations)) {
    const declaratorObject = readObject(declarator);
    const id = readObject(declaratorObject.id);

    if (typeof id.name !== "string" || !/^[A-Z]/.test(id.name)) {
      continue;
    }

    const initializer = readCompatCreateElementFunctionLike(
      code,
      readObject(declaratorObject.init),
      names,
      localFunctionLikes,
    );

    if (initializer !== undefined) {
      return { name: id.name, initializer };
    }
  }

  return undefined;
}

function collectCompatCreateElementLocalFunctionLikes(
  program: unknown,
): Map<string, Record<string, unknown>> {
  const functionLikes = new Map<string, Record<string, unknown>>();

  for (const statement of readArray(readObject(program).body)) {
    const object = readObject(statement);
    const declaration =
      object.type === "ExportNamedDeclaration" ? readObject(object.declaration) : object;

    if (declaration.type === "FunctionDeclaration") {
      const id = readObject(declaration.id);

      if (typeof id.name === "string") {
        functionLikes.set(id.name, declaration);
      }
      continue;
    }

    if (declaration.type !== "VariableDeclaration") {
      continue;
    }

    for (const declarator of readArray(declaration.declarations)) {
      const declaratorObject = readObject(declarator);
      const id = readObject(declaratorObject.id);
      const initializer = unwrapOxcComponentFunctionLikeInitializer(
        readObject(declaratorObject.init),
      );

      if (typeof id.name === "string" && initializer !== undefined) {
        functionLikes.set(id.name, initializer);
      }
    }
  }

  return functionLikes;
}

function collectCompatRenderToStringLowerableTargets(
  code: string,
  body: readonly unknown[],
  createElementNames: ReadonlySet<string>,
  renderToStringNames: ReadonlySet<string>,
  localFunctionLikes: ReadonlyMap<string, Record<string, unknown>>,
): Set<string> {
  const targets = new Set<string>();

  if (createElementNames.size === 0 || renderToStringNames.size === 0) {
    return targets;
  }

  for (const statement of body) {
    const functionLike = unwrapOxcStatementFunctionLike(statement);

    if (functionLike === undefined) {
      continue;
    }

    const targetName = readCompatRenderToStringWrapperTargetName(
      code,
      functionLike,
      renderToStringNames,
    );
    const targetFunctionLike =
      targetName === undefined ? undefined : localFunctionLikes.get(targetName);

    if (
      targetName !== undefined &&
      targetFunctionLike !== undefined &&
      analyzeCompatCreateElementFunctionRoot(
        code,
        targetFunctionLike,
        createElementNames,
        localFunctionLikes,
      ) !== undefined
    ) {
      targets.add(targetName);
    }
  }

  return targets;
}

function unwrapOxcStatementFunctionLike(statement: unknown): Record<string, unknown> | undefined {
  const object = readObject(statement);
  const declaration =
    object.type === "ExportNamedDeclaration" || object.type === "ExportDefaultDeclaration"
      ? readObject(object.declaration)
      : object;

  if (declaration.type === "FunctionDeclaration") {
    return declaration;
  }

  if (declaration.type !== "VariableDeclaration") {
    return unwrapOxcComponentFunctionLikeInitializer(declaration);
  }

  for (const declarator of readArray(declaration.declarations)) {
    const initializer = unwrapOxcComponentFunctionLikeInitializer(
      readObject(readObject(declarator).init),
    );

    if (initializer !== undefined) {
      return initializer;
    }
  }

  return undefined;
}

function readCompatRenderToStringWrapperTargetName(
  code: string,
  functionLike: Record<string, unknown>,
  renderToStringNames: ReadonlySet<string>,
): string | undefined {
  const expression = readCompatRenderToStringWrapperReturnExpression(functionLike);

  if (expression === undefined) {
    return undefined;
  }

  return readCompatRenderToStringTargetName(
    expression,
    renderToStringNames,
    collectFunctionShadowedNames(functionLike, renderToStringNames),
  );
}

function readCompatRenderToStringWrapperReturnExpression(
  functionLike: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const body = unwrapOxcParentheses(readObject(functionLike.body));

  if (body.type !== "BlockStatement") {
    return body;
  }

  for (const statement of readArray(body.body)) {
    const statementObject = readObject(statement);

    if (statementObject.type === "ReturnStatement") {
      return unwrapOxcParentheses(readObject(statementObject.argument));
    }
  }

  return undefined;
}

function readCompatRenderToStringTargetName(
  expression: Record<string, unknown>,
  renderToStringNames: ReadonlySet<string>,
  shadowedNames: ReadonlySet<string>,
): string | undefined {
  if (
    renderToStringNames.size === 0 ||
    expression.type !== "CallExpression" ||
    expression.optional === true
  ) {
    return undefined;
  }

  const callee = unwrapOxcParentheses(readObject(expression.callee));

  if (
    callee.type !== "Identifier" ||
    typeof callee.name !== "string" ||
    !renderToStringNames.has(callee.name) ||
    shadowedNames.has(callee.name)
  ) {
    return undefined;
  }

  const args = readArray(expression.arguments);

  if (args.length !== 1) {
    return undefined;
  }

  const target = unwrapOxcParentheses(readObject(args[0]));

  return target.type === "Identifier" && typeof target.name === "string" ? target.name : undefined;
}

function hasCompatRenderToStringWrapperReturn(
  code: string,
  functionLike: Record<string, unknown>,
  renderToStringNames: ReadonlySet<string>,
): boolean {
  return (
    readCompatRenderToStringWrapperTargetName(code, functionLike, renderToStringNames) !== undefined
  );
}

function analyzeCompatRenderToStringWrapperRoot(
  code: string,
  functionLike: Record<string, unknown>,
  returnExpression: Record<string, unknown>,
  createElementNames: ReadonlySet<string>,
  renderToStringNames: ReadonlySet<string>,
  localFunctionLikes: ReadonlyMap<string, Record<string, unknown>>,
): ComponentIr["root"] | undefined {
  const targetName = readCompatRenderToStringTargetName(
    returnExpression,
    renderToStringNames,
    collectFunctionShadowedNames(functionLike, renderToStringNames),
  );

  if (targetName === undefined) {
    return undefined;
  }

  const targetFunctionLike = localFunctionLikes.get(targetName);
  const lowered =
    targetFunctionLike === undefined
      ? undefined
      : analyzeCompatCreateElementFunctionRoot(
          code,
          targetFunctionLike,
          createElementNames,
          localFunctionLikes,
        );

  if (lowered !== undefined) {
    return lowered;
  }

  return {
    kind: "expr",
    code: normalizeOxcExpressionCode(readSource(code, returnExpression)),
    renderMode: "html",
  };
}

function isCompatCreateElementComponentStatement(
  code: string,
  statement: unknown,
  names: ReadonlySet<string>,
  renderToStringNames: ReadonlySet<string>,
  localFunctionLikes: ReadonlyMap<string, Record<string, unknown>>,
  renderToStringLowerableTargets: ReadonlySet<string>,
  serverOutput?: AnalyzeModuleOptions["serverOutput"],
): boolean {
  if (names.size === 0 && renderToStringNames.size === 0) {
    return false;
  }

  const object = readObject(statement);

  if (object.type === "ExportDefaultDeclaration") {
    const functionLike = unwrapOxcComponentFunctionLikeInitializer(readObject(object.declaration));

    return (
      readCompatCreateElementFunctionLike(
        code,
        readObject(object.declaration),
        names,
        localFunctionLikes,
      ) !== undefined ||
      (functionLike !== undefined &&
        hasCompatRenderToStringWrapperReturn(code, functionLike, renderToStringNames))
    );
  }

  if (object.type === "ExportNamedDeclaration") {
    const declaration = readObject(object.declaration);

    if (declaration.type === "FunctionDeclaration") {
      return (
        hasLowerableCompatCreateElementReturn(code, declaration, names, localFunctionLikes) ||
        hasCompatRenderToStringWrapperReturn(code, declaration, renderToStringNames)
      );
    }

    return (
      readCompatCreateElementPlainComponent(code, declaration, names, localFunctionLikes) !==
      undefined
    );
  }

  const plainComponent = readCompatCreateElementPlainComponent(
    code,
    statement,
    names,
    localFunctionLikes,
  );

  if (serverOutput === "stream") {
    return (
      plainComponent !== undefined &&
      renderToStringLowerableTargets.has(plainComponent.name) &&
      localFunctionLikes.get(plainComponent.name) === plainComponent.initializer
    );
  }

  if (plainComponent !== undefined) {
    return true;
  }

  const functionLike = unwrapOxcStatementFunctionLike(statement);

  if (functionLike === undefined) {
    return false;
  }

  return hasCompatRenderToStringWrapperReturn(code, functionLike, renderToStringNames);
}

function analyzeOxcComponent(
  code: string,
  statement: unknown,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx: OxcBodyStatementJsxMode,
  compatCreateElementNames: ReadonlySet<string>,
  compatRenderToStringNames: ReadonlySet<string>,
  compatCreateElementLocalFunctionLikes: ReadonlyMap<string, Record<string, unknown>>,
  compatRenderToStringLowerableTargets: ReadonlySet<string>,
  moduleRenderValueBindings: Set<string>,
  compatReactNodeReturn: boolean,
  serverOutput: AnalyzeModuleOptions["serverOutput"],
  componentCallNames: Set<string> | undefined,
  bodyLowerers: OxcBodyLowerers,
  reactiveDerivedFunctionNames: ReadonlySet<string>,
  localJsxReturnFunctionNames: ReadonlySet<string>,
  localJsxHelperHtmlParameters: ReadonlyMap<string, ReadonlySet<number>>,
): ComponentIr[] {
  const object = readObject(statement);

  if (object.type === "ExportDefaultDeclaration") {
    const declaration = unwrapOxcComponentFunctionLikeInitializer(readObject(object.declaration));

    if (
      declaration === undefined ||
      (!hasOxcFunctionLikeComponentReturn(declaration) &&
        !hasLowerableCompatCreateElementReturn(
          code,
          declaration,
          compatCreateElementNames,
          compatCreateElementLocalFunctionLikes,
        ) &&
        !hasCompatRenderToStringWrapperReturn(code, declaration, compatRenderToStringNames))
    ) {
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
        compatCreateElementNames,
        compatRenderToStringNames,
        compatCreateElementLocalFunctionLikes,
        moduleRenderValueBindings,
        compatReactNodeReturn,
        serverOutput,
        componentCallNames,
        bodyLowerers,
        reactiveDerivedFunctionNames,
        localJsxReturnFunctionNames,
        localJsxHelperHtmlParameters,
        true,
      ),
    ];
  }

  if (object.type !== "ExportNamedDeclaration") {
    const plainComponent =
      readOxcPlainComponent(statement) ??
      (compatReactNodeReturn ? readOxcListMapComponent(statement) : undefined) ??
      (serverOutput === "stream"
        ? undefined
        : readCompatCreateElementPlainComponent(
            code,
            statement,
            compatCreateElementNames,
            compatCreateElementLocalFunctionLikes,
          ));

    if (plainComponent === undefined) {
      return [];
    }

    if (compatRenderToStringLowerableTargets.has(plainComponent.name)) {
      return [];
    }

    return [
      attachOxcInlineMemo(
        code,
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
            compatCreateElementNames,
            compatRenderToStringNames,
            compatCreateElementLocalFunctionLikes,
            moduleRenderValueBindings,
            compatReactNodeReturn,
            serverOutput,
            componentCallNames,
            bodyLowerers,
            reactiveDerivedFunctionNames,
            localJsxReturnFunctionNames,
            localJsxHelperHtmlParameters,
          ),
          exported: false,
        },
        plainComponent,
      ),
    ];
  }

  const declaration = readObject(object.declaration);

  if (declaration.type === "VariableDeclaration") {
    const variableComponent =
      readOxcVariableComponentDeclaration(declaration) ??
      readCompatCreateElementPlainComponent(
        code,
        declaration,
        compatCreateElementNames,
        compatCreateElementLocalFunctionLikes,
      );

    if (variableComponent === undefined) {
      return [];
    }

    return [
      attachOxcInlineMemo(
        code,
        analyzeOxcFunctionLikeComponent(
          code,
          variableComponent.name,
          variableComponent.initializer,
          variableComponent.name,
          componentNames,
          target,
          diagnostics,
          bodyStatementJsx,
          compatCreateElementNames,
          compatRenderToStringNames,
          compatCreateElementLocalFunctionLikes,
          moduleRenderValueBindings,
          compatReactNodeReturn,
          serverOutput,
          componentCallNames,
          bodyLowerers,
          reactiveDerivedFunctionNames,
          localJsxReturnFunctionNames,
          localJsxHelperHtmlParameters,
        ),
        variableComponent,
      ),
    ];
  }

  if (
    declaration.type !== "FunctionDeclaration" ||
    (!compatReactNodeReturn &&
      !hasComponentReturn(declaration.body) &&
      !hasLocalJsxHelperCallReturn(declaration.body, localJsxReturnFunctionNames) &&
      !hasLowerableCompatCreateElementReturn(
        code,
        declaration,
        compatCreateElementNames,
        compatCreateElementLocalFunctionLikes,
      ) &&
      !hasCompatRenderToStringWrapperReturn(code, declaration, compatRenderToStringNames))
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
      compatCreateElementNames,
      compatRenderToStringNames,
      compatCreateElementLocalFunctionLikes,
      moduleRenderValueBindings,
      compatReactNodeReturn,
      serverOutput,
      componentCallNames,
      bodyLowerers,
      reactiveDerivedFunctionNames,
      localJsxReturnFunctionNames,
      localJsxHelperHtmlParameters,
    ),
  ];
}

function lowerOxcLocalJsxHelperCallExpressionCode(
  code: string,
  expression: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyLowerers: OxcBodyLowerers,
): string {
  if (expression.type !== "CallExpression") {
    return readSource(code, expression);
  }

  const args = readArray(expression.arguments).map((argument) => {
    const object = unwrapOxcParentheses(readObject(argument));
    return containsOxcJsxSyntax(object)
      ? (bodyLowerers.lowerServerStringExpression(
          code,
          object,
          componentNames,
          target,
          diagnostics,
        ) ?? readSource(code, argument))
      : readSource(code, argument);
  });

  return `${readSource(code, readObject(expression.callee))}(${args.join(", ")})`;
}

function attachOxcInlineMemo(
  code: string,
  component: ComponentIr,
  declaration: unknown,
): ComponentIr {
  const inlineMemo = (
    declaration as {
      inlineMemo?: {
        bindingKind: "const" | "let" | "var";
        functionName?: string;
        compareExpression?: Record<string, unknown>;
        compareReservedNames?: string[];
      };
    }
  ).inlineMemo;

  if (inlineMemo === undefined) {
    return component;
  }

  return setCompatInlineMemo(component, {
    bindingKind: inlineMemo.bindingKind,
    ...(inlineMemo.functionName === undefined ? {} : { functionName: inlineMemo.functionName }),
    ...(inlineMemo.compareExpression === undefined
      ? {}
      : {
          compareCode: stripTypeScriptExpressionWithOxc(
            `(${readSource(code, inlineMemo.compareExpression)})`,
          ),
          compareHasJsx: containsOxcJsxSyntax(inlineMemo.compareExpression),
          compareReservedNames: inlineMemo.compareReservedNames ?? [],
        }),
  });
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
  compatCreateElementNames: ReadonlySet<string>,
  compatRenderToStringNames: ReadonlySet<string>,
  compatCreateElementLocalFunctionLikes: ReadonlyMap<string, Record<string, unknown>>,
  moduleRenderValueBindings: Set<string>,
  compatReactNodeReturn: boolean,
  serverOutput: AnalyzeModuleOptions["serverOutput"],
  componentCallNames: Set<string> | undefined,
  bodyLowerers: OxcBodyLowerers,
  reactiveDerivedFunctionNames: ReadonlySet<string>,
  localJsxReturnFunctionNames: ReadonlySet<string>,
  localJsxHelperHtmlParameters: ReadonlyMap<string, ReadonlySet<number>>,
  exportDefault = false,
): ComponentIr {
  const functionBody = readObject(functionLike.body);
  const body = functionBody.type === "BlockStatement" ? readArray(functionBody.body) : [];
  const earlyIfRootReturn =
    bodyStatementJsx === "compat-object"
      ? undefined
      : findOxcEarlyIfRootReturn(body, target === "client");
  const rootStatement =
    earlyIfRootReturn?.branchStatements[0] ??
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
  const parameterPropAliases = readPlainObjectParameterPropAliases(functionLike.params);
  const htmlParameterNames = new Set(
    [...(localJsxHelperHtmlParameters.get(name) ?? [])]
      .map((index) => parameters[index])
      .filter((parameter): parameter is string => parameter !== undefined),
  );
  const bodyComponentNames =
    /^[a-z]/.test(name) && componentNames.has(name)
      ? new Set([...componentNames].filter((componentName) => componentName !== name))
      : componentNames;
  const bodyStatements = body
    .filter(
      (bodyStatement) =>
        bodyStatement !== rootStatement &&
        earlyIfRootReturn?.branchStatements.includes(bodyStatement) !== true &&
        earlyIfRootReturn?.fallthroughBodyStatements.includes(bodyStatement) !== true &&
        bodyStatement !== earlyIfRootReturn?.fallthroughStatement,
    )
    .map(
      (bodyStatement) =>
        lowerOxcBodyStatementJsx(
          code,
          bodyStatement,
          bodyComponentNames,
          target,
          diagnostics,
          bodyStatementJsx,
          bodyLowerers,
        ) ?? formatOxcBodyStatement(code, bodyStatement, bodyStatementJsx),
    );
  const componentBodyBindings = collectOxcVariableInitializers(body);
  const reactiveAliasBindings = collectOxcReactiveReadAliases(
    code,
    body,
    reactiveDerivedFunctionNames,
  );
  const childAnalysisContext = createOxcChildAnalysisContext(
    bodyComponentNames,
    target,
    diagnostics,
    bodyStatementJsx,
    componentBodyBindings,
    reactiveAliasBindings,
    serverOutput,
    componentCallNames,
    bodyLowerers,
  );
  const root =
    analyzeOxcEarlyIfRootReturn(code, earlyIfRootReturn, childAnalysisContext, bodyStatementJsx) ??
    analyzeOxcSwitchRootReturn(code, rootStatement, childAnalysisContext, bodyStatementJsx) ??
    (compatCreateElementNames.size === 0
      ? undefined
      : analyzeCompatCreateElementRoot(code, returnExpression, {
          names: compatCreateElementNames,
          shadowed: collectFunctionShadowedNames(functionLike, compatCreateElementNames),
          localFunctionLikes: compatCreateElementLocalFunctionLikes,
        })) ??
    analyzeCompatRenderToStringWrapperRoot(
      code,
      functionLike,
      returnExpression,
      compatCreateElementNames,
      compatRenderToStringNames,
      compatCreateElementLocalFunctionLikes,
    ) ??
    (isJsxRoot(returnExpression.type) || returnExpression.type === "JSXFragment"
      ? analyzeOxcJsxNode(code, returnExpression, childAnalysisContext)
      : isOxcComponentCallExpression(returnExpression)
        ? analyzeOxcComponentCallExpression(code, returnExpression)
        : isOxcLocalJsxHelperCallExpression(returnExpression, localJsxReturnFunctionNames)
          ? {
              kind: "expr" as const,
              code: normalizeOxcExpressionCode(
                bodyStatementJsx === "server-string"
                  ? lowerOxcLocalJsxHelperCallExpressionCode(
                      code,
                      returnExpression,
                      bodyComponentNames,
                      target,
                      diagnostics,
                      bodyLowerers,
                    )
                  : readSource(code, returnExpression),
              ),
              renderMode: "html" as const,
            }
          : (analyzeOxcDynamicRootReturn(
              code,
              returnExpression,
              childAnalysisContext,
              bodyStatementJsx,
            ) ?? {
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
            }));
  markOxcRenderValueExpressions(
    [root],
    new Set([
      ...moduleRenderValueBindings,
      ...collectOxcBodyJsxBindingNames(
        body.filter(
          (bodyStatement) =>
            bodyStatement !== rootStatement &&
            earlyIfRootReturn?.branchStatements.includes(bodyStatement) !== true &&
            earlyIfRootReturn?.fallthroughBodyStatements.includes(bodyStatement) !== true &&
            bodyStatement !== earlyIfRootReturn?.fallthroughStatement,
        ),
      ),
      ...htmlParameterNames,
    ]),
    bodyStatementJsx === "server-string" ? "html" : "dynamic",
  );

  return {
    name,
    exportName,
    ...(exportDefault ? { exportDefault: true } : {}),
    ...(functionLike.async === true ? { async: true } : {}),
    parameters,
    ...(parameterPropAliases === undefined ? {} : { parameterPropAliases }),
    bodyStatements,
    bindingNames: [
      ...parameters,
      ...(parameterPropAliases?.map((alias) => alias.localName) ?? []),
      ...body.flatMap(collectBindingNames),
    ],
    root,
  };
}

function readPlainObjectParameterPropAliases(params: unknown): PropAliasIr[] | undefined {
  const [firstParam, ...restParams] = readArray(params).map(readObject);

  if (firstParam === undefined || restParams.length > 0 || firstParam.type !== "ObjectPattern") {
    return undefined;
  }

  const aliases: PropAliasIr[] = [];
  for (const property of readArray(firstParam.properties)) {
    const object = readObject(property);

    if (object.type !== "Property" || object.computed === true) {
      return undefined;
    }

    const key = readObject(object.key);
    const value = readObject(object.value);
    const propName = typeof key.name === "string" ? key.name : undefined;
    const localName = typeof value.name === "string" ? value.name : undefined;

    if (propName === undefined || localName === undefined) {
      return undefined;
    }

    aliases.push({ propName, localName });
  }

  return aliases.length === 0 ? undefined : aliases;
}

interface OxcEarlyIfRootReturn {
  branchStatements: unknown[];
  fallthroughStatement: unknown;
  fallthroughBodyStatements: unknown[];
  branches: Array<{
    test: Record<string, unknown>;
    consequent: Record<string, unknown>;
  }>;
  fallthrough: Record<string, unknown>;
}

function findOxcEarlyIfRootReturn(
  body: readonly unknown[],
  allowFallthroughBodyStatements: boolean,
): OxcEarlyIfRootReturn | undefined {
  for (let index = 0; index < body.length - 1; index += 1) {
    const branches: OxcEarlyIfRootReturn["branches"] = [];
    const branchStatements: unknown[] = [];
    let cursor = index;

    while (cursor < body.length - 1) {
      const statement = readObject(body[cursor]);

      if (statement.type !== "IfStatement" || readObject(statement.alternate).type !== undefined) {
        break;
      }

      const consequent = readOxcPureReturnExpressionFromStatement(statement.consequent);

      if (consequent === undefined || !isOxcRootReturnExpression(consequent)) {
        break;
      }

      branches.push({
        test: readObject(statement.test),
        consequent,
      });
      branchStatements.push(body[cursor]);
      cursor += 1;
    }

    if (branches.length === 0) {
      continue;
    }

    const fallthroughStart = cursor;
    let fallthroughStatement = body[cursor];
    const fallthrough = readOxcReturnExpressionFromStatement(fallthroughStatement);

    if (fallthrough === undefined && allowFallthroughBodyStatements) {
      while (cursor < body.length) {
        fallthroughStatement = body[cursor];
        const candidate = readOxcReturnExpressionFromStatement(fallthroughStatement);

        if (candidate !== undefined) {
          if (!isOxcRootReturnExpression(candidate)) {
            break;
          }

          return {
            branchStatements,
            fallthroughBodyStatements: body.slice(fallthroughStart, cursor),
            fallthroughStatement,
            branches,
            fallthrough: candidate,
          };
        }

        cursor += 1;
      }
    }

    if (fallthrough === undefined || !isOxcRootReturnExpression(fallthrough)) {
      continue;
    }

    return {
      branchStatements,
      fallthroughBodyStatements: [],
      fallthroughStatement,
      branches,
      fallthrough,
    };
  }

  return undefined;
}

function readOxcPureReturnExpressionFromStatement(
  statement: unknown,
): Record<string, unknown> | undefined {
  const object = readObject(statement);

  if (object.type === "ReturnStatement") {
    return readOxcReturnExpressionFromStatement(statement);
  }

  if (object.type !== "BlockStatement") {
    return undefined;
  }

  const statements = readArray(object.body);
  if (statements.length !== 1) {
    return undefined;
  }

  return readOxcReturnExpressionFromStatement(statements[0]);
}

function isOxcRootReturnExpression(expression: Record<string, unknown>): boolean {
  return isOxcEmptyRootReturn(expression) || isOxcRenderableRootReturn(expression);
}

function isOxcEmptyRootReturn(expression: Record<string, unknown>): boolean {
  return expression.type === "Literal" && (expression.value === null || expression.value === false);
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

  return expression.type === "LogicalExpression" && isOxcJsxBranch(readObject(expression.right));
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

  let fallback = analyzeOxcDynamicRootBranch(
    code,
    earlyIfRootReturn.fallthrough,
    context,
    bodyStatementJsx,
  );

  if (earlyIfRootReturn.fallthroughBodyStatements.length > 0) {
    fallback = [
      {
        kind: "fragment",
        bodyStatements: earlyIfRootReturn.fallthroughBodyStatements.map(
          (bodyStatement) =>
            lowerOxcBodyStatementJsx(
              code,
              bodyStatement,
              context.componentNames,
              context.target,
              context.diagnostics,
              bodyStatementJsx,
              context.bodyLowerers,
            ) ?? formatOxcBodyStatement(code, bodyStatement, bodyStatementJsx),
        ),
        children: fallback,
      },
    ];
  }

  for (const branch of [...earlyIfRootReturn.branches].reverse()) {
    fallback = [
      {
        kind: "conditional",
        conditionCode: readOxcReactiveRootConditionCode(code, branch.test, context),
        whenTrue: analyzeOxcDynamicRootBranch(code, branch.consequent, context, bodyStatementJsx),
        whenFalse: fallback,
      },
    ];
  }

  return fallback.length === 1 ? fallback[0] : { kind: "fragment", children: fallback };
}

function readOxcReactiveRootConditionCode(
  code: string,
  expression: Record<string, unknown>,
  context: OxcChildAnalysisContext,
): string {
  return (
    rewriteOxcReactiveAliasExpressionCode(code, expression, context.reactiveAliasBindings) ??
    readSource(code, expression)
  );
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
