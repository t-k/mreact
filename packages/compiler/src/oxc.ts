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
  collectOxcCompatRuntimeImportComponents,
  markOxcAsyncComponentReferences,
  markOxcClientReferences,
  markOxcCompatRuntimeReferences,
} from "./oxc-component-references.js";
import { normalizeOxcExpressionCode, stripOxcGeneratedImports } from "./oxc-code-utils.js";
import { analyzeOxcJsxNode, type OxcChildAnalysisContext } from "./oxc-child-analysis.js";
import { lowerOxcDomNodeExpression } from "./oxc-dom-lowering.js";
import {
  lowerOxcCompatObjectExpression,
  lowerOxcCompatReactNodeExpression,
  lowerOxcNestedJsxExpression,
  lowerOxcServerStringExpression,
} from "./oxc-nested-lowering.js";
import {
  collectOxcBodyJsxBindingNames,
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
): OxcChildAnalysisContext {
  return {
    componentNames,
    target,
    diagnostics,
    ...(bodyStatementJsx === undefined ? {} : { bodyStatementJsx }),
    ...(componentBodyBindings === undefined ? {} : { componentBodyBindings }),
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
          oxcBodyLowerers,
        ) ?? formatOxcBodyStatement(code, bodyStatement, bodyStatementJsx),
    );
  const componentBodyBindings = collectOxcVariableInitializers(body);
  const root =
    isJsxRoot(returnExpression.type) || returnExpression.type === "JSXFragment"
      ? analyzeOxcJsxNode(
          code,
          returnExpression,
          createOxcChildAnalysisContext(
            componentNames,
            target,
            diagnostics,
            bodyStatementJsx,
            componentBodyBindings,
          ),
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
