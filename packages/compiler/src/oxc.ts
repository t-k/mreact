import { parseSync } from "oxc-parser";
import {
  invalidJsxExpressionDiagnostic,
  unserializableAwaitValueDiagnostic,
  unsupportedAwaitInnerComponentDiagnostic,
  unsupportedComponentReferenceDiagnostic,
  unsupportedTopLevelJsxInitializerDiagnostic,
} from "./diagnostics.js";
import {
  type AnalyzeToIrInput,
  type AnalyzeToIrOutput,
} from "./internal.js";
import type {
  AttributeIr,
  AsyncBoundaryIr,
  ComponentIr,
  ComponentPropIr,
  ClientReferenceIr,
  JsxElementIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";
import {
  stripTypeScriptWithOxc,
  transformJsxToCreateElementWithOxc,
  transformJsxWithOxc,
} from "./oxc-transform.js";
import type {
  AnalyzeModuleOptions,
  CompileTarget,
  Diagnostic,
  SourceLocation,
} from "./types.js";

type OxcBodyStatementJsxMode = "dom-node" | "compat-object" | "server-string" | "unsupported";

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
        code: error.message === "Unexpected token"
          ? "MR_INVALID_JSX_EXPRESSION"
          : "MR_OXC_PARSE_ERROR",
        message: error.message,
      })),
      ...analyzed.diagnostics,
    ],
    usedTypescriptFallback: false,
  };
}

function containsRawJsxInIr(ir: ModuleIr): boolean {
  return ir.components.some(
    (component) =>
      component.bodyStatements.some(containsRawJsx) ||
      containsRawJsxInNode(component.root),
  );
}

function containsRawJsx(value: string): boolean {
  return /<[A-Za-z][\w.:-]*(?:\s|>|\/)/.test(value);
}

function containsRawJsxInNode(node: JsxNodeIr): boolean {
  if (node.kind === "list") {
    return (
      node.bodyStatements?.some(containsRawJsx) === true ||
      node.children.some(containsRawJsxInNode)
    );
  }

  if (node.kind === "conditional") {
    return (
      node.whenTrue.some(containsRawJsxInNode) ||
      node.whenFalse.some(containsRawJsxInNode)
    );
  }

  if (node.kind === "fragment") {
    return node.children.some(containsRawJsxInNode);
  }

  if (node.kind === "component") {
    return (
      node.children.some(containsRawJsxInNode) ||
      node.props.some(
        (prop) => prop.kind === "render-prop" && prop.children.some(containsRawJsxInNode),
      )
    );
  }

  if (node.kind === "async-boundary") {
    return (
      node.children.some(containsRawJsxInNode) ||
      node.placeholderChildren?.some(containsRawJsxInNode) === true ||
      node.catchChildren?.some(containsRawJsxInNode) === true
    );
  }

  return node.kind === "element" && node.children.some(containsRawJsxInNode);
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
  const clientBoundaryImports = collectOxcClientBoundaryImportComponents(program);
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
        loweredTopLevel ??
        formatPreservedStatement(code, statement, options);

      if (
        loweredTopLevel === undefined &&
        containsOxcJsxSyntax(object) &&
        options?.topLevelJsx !== "compat-object" &&
        options?.topLevelJsx !== "server-string"
      ) {
        diagnostics.push(unsupportedTopLevelJsxInitializerDiagnostic(getOxcLocation(code, statement)));
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

  assignAwaitIds(ir);

  return {
    ir,
    diagnostics,
  };
}

function assignAwaitIds(ir: ModuleIr): void {
  let counter = 0;

  for (const component of ir.components) {
    counter = walkForAwaitIds(component.root, counter);
  }
}

function walkForAwaitIds(node: JsxNodeIr, counter: number): number {
  let next = counter;

  if (node.kind === "async-boundary") {
    node.awaitId = `await${next.toString(36)}`;
    next += 1;

    for (const child of node.children) {
      next = walkForAwaitIds(child, next);
    }

    if (node.placeholderChildren !== undefined) {
      for (const child of node.placeholderChildren) {
        next = walkForAwaitIds(child, next);
      }
    }

    if (node.catchChildren !== undefined) {
      for (const child of node.catchChildren) {
        next = walkForAwaitIds(child, next);
      }
    }

    return next;
  }

  if (node.kind === "element" || node.kind === "fragment" || node.kind === "component") {
    for (const child of node.children) {
      next = walkForAwaitIds(child, next);
    }
    return next;
  }

  if (node.kind === "conditional") {
    for (const child of node.whenTrue) {
      next = walkForAwaitIds(child, next);
    }
    for (const child of node.whenFalse) {
      next = walkForAwaitIds(child, next);
    }
    return next;
  }

  if (node.kind === "list") {
    for (const child of node.children) {
      next = walkForAwaitIds(child, next);
    }
    return next;
  }

  return next;
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

function collectOxcExportedFunctionNames(program: unknown): string[] {
  return readArray(readObject(program).body).flatMap((statement) => {
    const object = readObject(statement);

    if (object.type === "ExportDefaultDeclaration") {
      const declaration = unwrapOxcComponentFunctionLikeInitializer(
        readObject(object.declaration),
      );
      const id = readObject(declaration?.id);
      return [typeof id.name === "string" ? id.name : "DefaultExport"];
    }

    if (object.type !== "ExportNamedDeclaration") {
      return [];
    }

    const declaration = readObject(object.declaration);

    if (declaration.type === "FunctionDeclaration") {
      const id = readObject(declaration.id);
      return typeof id.name === "string" ? [id.name] : [];
    }

    const variableComponent = readOxcVariableComponentDeclaration(declaration);
    return variableComponent === undefined ? [] : [variableComponent.name];
  });
}

function collectOxcPlainComponentNames(program: unknown): string[] {
  return readArray(readObject(program).body).flatMap((statement) => {
    const component = readOxcPlainComponent(statement);
    return component === undefined ? [] : [component.name];
  });
}

function isOxcExportedJsxComponent(statement: unknown): boolean {
  const object = readObject(statement);

  if (object.type === "ExportDefaultDeclaration") {
    const declaration = unwrapOxcComponentFunctionLikeInitializer(
      readObject(object.declaration),
    );
    return declaration !== undefined && hasOxcFunctionLikeJsxReturn(declaration);
  }

  if (object.type !== "ExportNamedDeclaration") {
    return false;
  }

  const declaration = readObject(object.declaration);
  return (
    (declaration.type === "FunctionDeclaration" && hasJsxReturn(declaration.body)) ||
    readOxcVariableComponentDeclaration(declaration) !== undefined
  );
}

function isOxcJsxComponentStatement(statement: unknown): boolean {
  return isOxcExportedJsxComponent(statement) || readOxcPlainComponent(statement) !== undefined;
}

function isOxcExportedFunctionLike(statement: unknown): boolean {
  const object = readObject(statement);

  if (object.type === "ExportDefaultDeclaration") {
    return unwrapOxcComponentFunctionLikeInitializer(readObject(object.declaration)) !== undefined;
  }

  if (object.type !== "ExportNamedDeclaration") {
    return false;
  }

  const declaration = readObject(object.declaration);

  return (
    declaration.type === "FunctionDeclaration" ||
    unwrapOxcComponentFunctionLikeInitializer(declaration) !== undefined
  );
}

function isOxcUnsupportedExportedFunction(
  statement: unknown,
  options?: AnalyzeModuleOptions,
): boolean {
  if (options?.compatReactNodeReturn === true) {
    return false;
  }

  const object = readObject(statement);

  if (object.type !== "ExportNamedDeclaration") {
    return false;
  }

  const declaration = readObject(object.declaration);
  return declaration.type === "FunctionDeclaration" && !hasJsxReturn(declaration.body);
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
    const declaration = unwrapOxcComponentFunctionLikeInitializer(
      readObject(object.declaration),
    );

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
    .map((bodyStatement) =>
      lowerOxcBodyStatementJsx(
        code,
        bodyStatement,
        componentNames,
        target,
        diagnostics,
        bodyStatementJsx,
      ) ?? formatOxcBodyStatement(code, bodyStatement, bodyStatementJsx)
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

  if (tagName === "await") {
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

  if (
    /^[A-Z][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(tagName) ||
    componentNames.has(tagName)
  ) {
    const keyCode = findOxcJsxAttributeCode(code, attributes, "key");
    const consumerRenderProp = tagName.endsWith(".Consumer")
      ? readOxcConsumerRenderProp(
          code,
          readArray(node.children),
          componentNames,
          target,
          diagnostics,
          bodyStatementJsx,
        )
      : undefined;

    return {
      kind: "component",
      name: tagName,
      ...(keyCode === undefined ? {} : { keyCode }),
      props: attributes.flatMap((attr) =>
        analyzeOxcComponentProp(code, attr, componentNames, target, diagnostics),
      ).filter((prop) => prop.kind === "spread-prop" || prop.name !== "key")
        .concat(consumerRenderProp === undefined ? [] : [consumerRenderProp]),
      children: consumerRenderProp === undefined
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
    diagnostics.push(unsupportedComponentReferenceDiagnostic(tagName, getOxcLocation(code, openingElement.name)));

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
    attributes: attributes.flatMap((attr) =>
      analyzeOxcAttribute(code, attr, target, diagnostics),
    ).filter(
      (attribute) =>
        attribute.kind === "spread-attr" || attribute.name !== "key",
    ),
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
  const placeholderExpression = readOxcExpressionAttributeNode(
    attributes,
    "placeholder",
  );
  const catchExpression = readOxcExpressionAttributeNode(attributes, "catch");
  const renderer = analyzeOxcSingleArrowJsxChild(
    code,
    readArray(node.children),
    componentNames,
    target,
    diagnostics,
    bodyStatementJsx,
  );
  const catchRenderer =
    catchExpression !== undefined &&
    readObject(catchExpression).type === "ArrowFunctionExpression"
      ? analyzeOxcArrowJsxRenderer(
          code,
          readObject(catchExpression),
          componentNames,
          target,
          diagnostics,
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

// Static detection of non-JSON-serializable `<await value={...}>` shapes
// (issue 051 / part C). Returns a short reason when the expression is a
// constructor call whose result cannot survive `JSON.stringify`, or
// `undefined` when the shape is unknown / safe.
//
// Conservative — only flags obvious shapes:
//   - `new Date()` / `new Map()` / `new Set()` / `new RegExp()` / `new WeakMap()`
//   - `Symbol(...)` / `BigInt(...)`
//   - direct function / arrow expression
//   - `Promise.resolve(<non-serializable>)`, recursively
//
// Anything indirected through a variable, `fetch()`, or named function call
// is left to the runtime warning in `serializeAwaitHydrationValue`.
const UNSERIALIZABLE_CONSTRUCTORS = new Set([
  "Date",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "RegExp",
  "Error",
]);

const UNSERIALIZABLE_CALLEES = new Set(["Symbol", "BigInt"]);

function detectUnserializableAwaitValueReason(
  expression: Record<string, unknown>,
  bindings: ReadonlyMap<string, Record<string, unknown>> | undefined = undefined,
  visited: Set<string> = new Set(),
): string | undefined {
  const type = String(expression.type ?? "");

  if (type === "Identifier") {
    if (bindings === undefined) {
      return undefined;
    }

    const name = String(expression.name ?? "");

    if (name === "" || visited.has(name)) {
      return undefined;
    }

    const initializer = bindings.get(name);

    if (initializer === undefined) {
      return undefined;
    }

    visited.add(name);
    return detectUnserializableAwaitValueReason(initializer, bindings, visited);
  }

  if (type === "NewExpression") {
    const callee = readObject(expression.callee);
    const calleeName = String(callee.name ?? "");

    if (UNSERIALIZABLE_CONSTRUCTORS.has(calleeName)) {
      return `new ${calleeName}() is not JSON-serializable`;
    }
  }

  if (type === "CallExpression") {
    const callee = readObject(expression.callee);

    if (callee.type === "Identifier" && UNSERIALIZABLE_CALLEES.has(String(callee.name ?? ""))) {
      return `${String(callee.name)}(...) returns a non-JSON-serializable primitive`;
    }

    if (
      callee.type === "MemberExpression" &&
      String(readObject(callee.object).name ?? "") === "Promise"
    ) {
      const property = readObject(callee.property);
      const propertyName = String(property.name ?? "");

      if (propertyName === "resolve" || propertyName === "all" || propertyName === "allSettled") {
        const args = readArray(expression.arguments);
        const firstArg = args[0];

        if (firstArg !== undefined) {
          const reason = detectUnserializableAwaitValueReason(
            readObject(firstArg),
            bindings,
            visited,
          );

          if (reason !== undefined) {
            return reason;
          }
        }
      }
    }
  }

  if (
    type === "FunctionExpression" ||
    type === "ArrowFunctionExpression"
  ) {
    return "function expressions cannot be JSON-serialized";
  }

  return undefined;
}

/**
 * Collects `const X = init;` / `let Y = init;` declarations at the top of a
 * component body so subsequent diagnostic passes can resolve variables back
 * to their initializer expression. Only single-declarator simple bindings
 * are tracked — destructuring / multi-declarator forms are skipped because
 * resolving them adds noise without much value for the `<await>` use case.
 */
function collectOxcVariableInitializers(
  bodyStatements: readonly unknown[],
): Map<string, Record<string, unknown>> {
  const bindings = new Map<string, Record<string, unknown>>();

  for (const statement of bodyStatements) {
    const stmt = readObject(statement);

    if (stmt.type !== "VariableDeclaration") {
      continue;
    }

    for (const declarator of readArray(stmt.declarations)) {
      const decl = readObject(declarator);

      if (decl.type !== "VariableDeclarator") {
        continue;
      }

      const id = readObject(decl.id);

      if (id.type !== "Identifier") {
        continue;
      }

      const init = decl.init;

      if (init === null || init === undefined) {
        continue;
      }

      const initObject = unwrapOxcParentheses(readObject(init));
      const name = String(id.name ?? "");

      if (name === "") {
        continue;
      }

      bindings.set(name, initObject);
    }
  }

  return bindings;
}

function readOxcExpressionAttribute(
  code: string,
  attributes: readonly unknown[],
  name: string,
): string | undefined {
  const expression = readOxcExpressionAttributeNode(attributes, name);
  return expression === undefined ? undefined : readSource(code, expression);
}

function readOxcExpressionAttributeNode(
  attributes: readonly unknown[],
  name: string,
): Record<string, unknown> | undefined {
  for (const attr of attributes) {
    const object = readObject(attr);

    if (
      object.type !== "JSXAttribute" ||
      String(readObject(object.name).name) !== name
    ) {
      continue;
    }

    const value = readObject(object.value);

    if (value.type === "JSXExpressionContainer") {
      return unwrapOxcParentheses(readObject(value.expression));
    }
  }

  return undefined;
}

function analyzeOxcSingleArrowJsxChild(
  code: string,
  children: readonly unknown[],
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx: OxcBodyStatementJsxMode,
): {
  valueName: string;
  children: JsxNodeIr[];
} {
  for (const child of children) {
    const object = readObject(child);

    if (object.type !== "JSXExpressionContainer") {
      continue;
    }

    const expression = unwrapOxcParentheses(readObject(object.expression));

    if (expression.type === "ArrowFunctionExpression") {
      return analyzeOxcArrowJsxRenderer(
        code,
        expression,
        componentNames,
        target,
        diagnostics,
        bodyStatementJsx,
      );
    }
  }

  return {
    valueName: "_value",
    children: [],
  };
}

function analyzeOxcArrowJsxRenderer(
  code: string,
  arrow: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx: OxcBodyStatementJsxMode,
): {
  valueName: string;
  children: JsxNodeIr[];
} {
  const firstParameter = readObject(readArray(arrow.params)[0]);
  const valueName = typeof firstParameter.name === "string" ? firstParameter.name : "_value";
  const body = unwrapOxcParentheses(readObject(arrow.body));

  if (body.type === "JSXElement" || body.type === "JSXFragment") {
    return {
      valueName,
      children: [analyzeOxcJsxNode(code, body, componentNames, target, diagnostics, bodyStatementJsx)],
    };
  }

  return {
    valueName,
    children: [{ kind: "expr", code: readSource(code, body) }],
  };
}

function unwrapOxcParentheses(
  expression: Record<string, unknown>,
): Record<string, unknown> {
  let current = expression;

  while (current.type === "ParenthesizedExpression") {
    current = readObject(current.expression);
  }

  return current;
}

function readOxcJsxTagName(node: Record<string, unknown>): string {
  if (typeof node.name === "string") {
    return node.name;
  }

  if (node.type === "JSXMemberExpression") {
    const objectName = readOxcJsxTagName(readObject(node.object));
    const propertyName = readOxcJsxTagName(readObject(node.property));
    return `${objectName}.${propertyName}`;
  }

  return "";
}

function analyzeOxcAttribute(
  code: string,
  attr: unknown,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): AttributeIr[] {
  const object = readObject(attr);

  if (object.type === "JSXSpreadAttribute") {
    if (target === "server") {
      const loc = getOxcLocation(code, object);
      diagnostics.push({
        level: "error",
        code: "MR_UNSUPPORTED_SPREAD_ATTRIBUTE",
        message: "Server target does not support JSX spread attributes.",
        ...(loc === undefined ? {} : { loc }),
      });
    }

    return [{ kind: "spread-attr", code: readSource(code, readObject(object.argument)) }];
  }

  if (object.type !== "JSXAttribute") {
    return [];
  }

  const name = String(readObject(object.name).name);
  const value = readObject(object.value);

  if (value.type === "Literal") {
    return [{ kind: "static-attr", name, value: String(value.value) }];
  }

  if (value.type === "JSXExpressionContainer") {
    const expressionCode = readSource(code, readObject(value.expression));

    if (/^on[A-Z]/.test(name)) {
      if (target === "server") {
        const loc = getOxcLocation(code, object.name);
        diagnostics.push({
          level: "error",
          code: "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
          message: `Server target does not support event handler '${name}'.`,
          ...(loc === undefined ? {} : { loc }),
        });
      }

      return [
        {
          kind: "event",
          name,
          eventName: name.slice(2).toLowerCase(),
          code: expressionCode,
        },
      ];
    }

    if (target === "server" && name === "dangerouslySetInnerHTML") {
      const loc = getOxcLocation(code, object.name);
      diagnostics.push({
        level: "error",
        code: "MR_UNSUPPORTED_SERVER_DYNAMIC_ATTRIBUTE",
        message: `Server target does not support dynamic attribute '${name}'.`,
        ...(loc === undefined ? {} : { loc }),
      });
    }

    return [{ kind: "dynamic-attr", name, code: expressionCode }];
  }

  return [{ kind: "static-attr", name, value: "" }];
}

function findOxcJsxAttributeCode(
  code: string,
  attributes: readonly unknown[],
  name: string,
): string | undefined {
  for (const attr of attributes) {
    const object = readObject(attr);

    if (
      object.type !== "JSXAttribute" ||
      String(readObject(object.name).name) !== name
    ) {
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

function analyzeOxcComponentProp(
  code: string,
  attr: unknown,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
): ComponentPropIr[] {
  const object = readObject(attr);

  if (object.type === "JSXSpreadAttribute") {
    return [{ kind: "spread-prop", code: readSource(code, readObject(object.argument)) }];
  }

  if (object.type !== "JSXAttribute") {
    return [];
  }

  const name = String(readObject(object.name).name);
  const value = readObject(object.value);

  if (value.type === "Literal") {
    return [{ kind: "prop", name, code: JSON.stringify(value.value) }];
  }

  if (value.type === "JSXExpressionContainer") {
      const expression = unwrapOxcParentheses(readObject(value.expression));

    if (expression.type === "JSXElement" || expression.type === "JSXFragment") {
      return [
        {
          kind: "render-prop",
          name,
          children: [
            analyzeOxcJsxNode(
              code,
              expression,
              componentNames,
              target,
              diagnostics,
            ),
          ],
        },
      ];
    }

    return [
      {
        kind: "prop",
        name,
        code:
          expression.type === "ArrowFunctionExpression" && containsOxcJsxSyntax(expression)
            ? stripOxcGeneratedImports(transformJsxWithOxc(readSource(code, expression)))
            : readSource(code, expression),
      },
    ];
  }

  return [{ kind: "prop", name, code: "true" }];
}

function readOxcConsumerRenderProp(
  code: string,
  children: readonly unknown[],
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  bodyStatementJsx: OxcBodyStatementJsxMode,
): ComponentPropIr | undefined {
  for (const child of children) {
    const object = readObject(child);

    if (object.type !== "JSXExpressionContainer") {
      continue;
    }

    const expression = unwrapOxcParentheses(readObject(object.expression));

    if (expression.type !== "ArrowFunctionExpression") {
      continue;
    }

    const renderer = analyzeOxcArrowJsxRenderer(
      code,
      expression,
      componentNames,
      target,
      diagnostics,
      bodyStatementJsx,
    );

    return {
      kind: "render-prop",
      name: "children",
      valueName: renderer.valueName,
      children: renderer.children,
    };
  }

  return undefined;
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
      analyzeOxcJsxNode(code, unwrappedExpression, componentNames, target, diagnostics, bodyStatementJsx),
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
      ...(isOxcRenderValueExpression(expression)
        ? { renderMode: "dynamic" as const }
        : {}),
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
  if (
    expression.type === "Literal" &&
    (expression.value === null || expression.value === false)
  ) {
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
  if (expression.type !== "CallExpression") {
    return undefined;
  }

  const callee = readObject(expression.callee);

  if (
    callee.type !== "MemberExpression" ||
    readObject(callee.property).name !== "map"
  ) {
    return undefined;
  }

  const renderer = readObject(readArray(expression.arguments)[0]);

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
    itemsCode: readSource(code, readObject(callee.object)),
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
    returnStatementIndex === -1
      ? undefined
      : readObject(statements[returnStatementIndex]);
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
    bodyPrefixStatements
      .map((statement) =>
        lowerOxcBodyStatementJsx(
          code,
          statement,
          componentNames,
          target,
          diagnostics,
          bodyStatementJsx,
        ) ?? formatOxcBodyStatement(code, statement, bodyStatementJsx)
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
    children: [analyzeOxcJsxNode(code, body, componentNames, target, diagnostics, bodyStatementJsx)],
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
  const whenTrueExpression = readOxcReturnExpressionFromStatement(
    ifStatement.consequent,
  );
  const alternate = readOxcReturnExpressionFromStatement(ifStatement.alternate);
  const fallthrough = readOxcReturnExpressionFromStatement(
    statements[ifStatementIndex + 1],
  );
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

  markOxcRenderValueExpressions(
    children,
    collectOxcBodyJsxBindingNames(bodyPrefixStatements),
  );

  return {
    bodyStatements: bodyPrefixStatements
      .map((statement) =>
        lowerOxcBodyStatementJsx(
          code,
          statement,
          componentNames,
          target,
          diagnostics,
          bodyStatementJsx,
        ) ?? formatOxcBodyStatement(code, statement, bodyStatementJsx)
      ),
    children,
  };
}

function collectOxcBodyJsxBindingNames(statements: readonly unknown[]): Set<string> {
  const names = new Set<string>();

  for (const statement of statements) {
    const object = readObject(statement);

    if (object.type === "ForOfStatement" || object.type === "ForStatement") {
      collectOxcPushJsxBindingNames(readArray(readObject(object.body).body), names);
      continue;
    }

    if (object.type !== "VariableDeclaration") {
      continue;
    }

    for (const declarationValue of readArray(object.declarations)) {
      const declaration = readObject(declarationValue);
      const id = readObject(declaration.id);
      const initializer = unwrapOxcParentheses(readObject(declaration.init));

      if (typeof id.name === "string" && containsOxcJsxSyntax(initializer)) {
        names.add(id.name);
      }
    }
  }

  return names;
}

function collectOxcPushJsxBindingNames(statements: readonly unknown[], names: Set<string>): void {
  for (const statement of statements) {
    const object = readObject(statement);

    if (object.type === "ForOfStatement" || object.type === "ForStatement") {
      collectOxcPushJsxBindingNames(readArray(readObject(object.body).body), names);
      continue;
    }

    const expression = readObject(object.expression);

    if (object.type !== "ExpressionStatement" || expression.type !== "CallExpression") {
      continue;
    }

    const callee = readObject(expression.callee);
    const argument = unwrapOxcParentheses(readObject(readArray(expression.arguments)[0]));

    if (
      callee.type !== "MemberExpression" ||
      readObject(callee.property).name !== "push" ||
      !containsOxcJsxSyntax(argument)
    ) {
      continue;
    }

    const target = readObject(callee.object);

    if (typeof target.name === "string") {
      names.add(target.name);
    }
  }
}

function markOxcRenderValueExpressions(
  nodes: readonly JsxNodeIr[],
  names: Set<string>,
  renderMode: "dynamic" | "html" = "dynamic",
): void {
  if (names.size === 0) {
    return;
  }

  for (const node of nodes) {
    if (node.kind === "expr" && names.has(node.code)) {
      node.renderMode = renderMode;
      continue;
    }

    if (node.kind === "conditional") {
      markOxcRenderValueExpressions(node.whenTrue, names, renderMode);
      markOxcRenderValueExpressions(node.whenFalse, names, renderMode);
      continue;
    }

    if (node.kind === "list") {
      markOxcRenderValueExpressions(node.children, names, renderMode);
      continue;
    }

    if (node.kind === "fragment" || node.kind === "element" || node.kind === "component") {
      markOxcRenderValueExpressions(node.children, names, renderMode);
    }
  }
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

  return lowerOxcBodyStatementJsx(
    code,
    statement,
    componentNames,
    target,
    diagnostics,
    mode,
  );
}

function formatPreservedStatement(
  code: string,
  statement: unknown,
  options?: AnalyzeModuleOptions,
): string {
  const source = readSource(code, statement);

  if (
    options?.topLevelJsx === "compat-object" ||
    options?.bodyStatementJsx === "compat-object"
  ) {
    return transformJsxWithOxc(source);
  }

  return stripTypeScriptWithOxc(source).replace("() => {}", "() => { }");
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

function stripOxcGeneratedImports(code: string): string {
  return code
    .split("\n")
    .filter((line) => !/^\s*import\s+\{.*\}\s+from\s+["@']@modular-react\/react-compat\/jsx-runtime/.test(line))
    .join("\n");
}

function normalizeOxcExpressionCode(code: string): string {
  return code
    .trim()
    .replace(/;$/, "")
    .replace(/\/\* @__PURE__ \*\/\s*/g, "")
    .replace(/children: \(\(([^()]+)\) =>/g, "children: ($1) =>")
    .replace(/\(\(([^()]+)\) =>/g, "($1) =>")
    .replace(/children: ([A-Za-z_$][\w$.]*)/g, "children: ($1)");
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
    return lowerOxcForOfStatementJsx(
      code,
      object,
      componentNames,
      target,
      diagnostics,
      mode,
    );
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
        ? lowerOxcCompatObjectExpression(
            code,
            initializer,
            componentNames,
            target,
            diagnostics,
          )
        : mode === "server-string"
          ? lowerOxcServerStringExpression(
              code,
              initializer,
              componentNames,
              target,
              diagnostics,
            )
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
      lowerOxcPushJsxStatement(
        code,
        bodyStatement,
        componentNames,
        target,
        diagnostics,
        mode,
      ) ??
      lowerOxcBodyStatementJsx(
        code,
        bodyStatement,
        componentNames,
        target,
        diagnostics,
        mode,
      );

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
      statementCode.split("\n").map((line) => `  ${line}`)
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
        ? lowerOxcCompatObjectExpression(
            code,
            argument,
            componentNames,
            target,
            diagnostics,
          )
        : mode === "server-string"
          ? lowerOxcServerStringExpression(
              code,
              argument,
              componentNames,
              target,
              diagnostics,
            )
          : undefined;

  if (lowered === undefined) {
    return undefined;
  }

  return `${readSource(code, callee)}(${lowered});`;
}

function containsOxcJsxSyntax(node: Record<string, unknown>): boolean {
  if (node.type === "JSXElement" || node.type === "JSXFragment") {
    return true;
  }

  return Object.values(node).some((value) =>
    Array.isArray(value)
      ? value.some((item) => containsOxcJsxSyntax(readObject(item)))
      : typeof value === "object" && value !== null && containsOxcJsxSyntax(readObject(value))
  );
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
    const domName = name === "className" ? "class" : name;
    const value = readObject(object.value);

    if (Object.keys(value).length === 0) {
      return [`  _node.setAttribute(${JSON.stringify(domName)}, "");`];
    }

    if (value.type === "Literal") {
      return [`  _node.setAttribute(${JSON.stringify(domName)}, ${JSON.stringify(value.value)});`];
    }

    if (value.type === "JSXExpressionContainer") {
      return [`  _node.setAttribute(${JSON.stringify(domName)}, String(${readSource(code, readObject(value.expression))}));`];
    }

    return [];
  });
}

function lowerOxcDomChildren(code: string, children: readonly unknown[]): string[] {
  return children.flatMap((child): string[] => {
    const object = readObject(child);

    if (object.type === "JSXText") {
      const value = typeof object.value === "string" ? object.value.replace(/\s+/g, " ").trim() : "";
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
    return lowerOxcCompatObjectExpression(
      code,
      unwrapped,
      componentNames,
      target,
      diagnostics,
    );
  }

  if (unwrapped.type === "ArrayExpression") {
    return `[${readArray(unwrapped.elements).map((element) => {
      const elementObject = unwrapOxcParentheses(readObject(element));
      return lowerOxcCompatReactNodeExpression(
        code,
        elementObject,
        componentNames,
        target,
        diagnostics,
      ) ?? readSource(code, elementObject);
    }).join(", ")}]`;
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
        ? lowerOxcCompatReactNodeExpression(
            code,
            node,
            componentNames,
            target,
            diagnostics,
          )
        : bodyStatementJsx === "server-string"
          ? lowerOxcServerStringExpression(
              code,
              node,
              componentNames,
              target,
              diagnostics,
            )
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
          lowerOxcNestedJsxExpression(
            code,
            expression,
            componentNames,
            "client",
            [],
            "dom-node",
          ) ?? readSource(code, expression)
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
    return lowerOxcNestedJsxExpression(
      code,
      expression,
      componentNames,
      "client",
      [],
      "dom-node",
    ) ?? readSource(code, expression);
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
    const parameters = node.indexName === undefined ? node.itemName : `${node.itemName}, ${node.indexName}`;
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

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
    const parameters = node.indexName === undefined ? node.itemName : `${node.itemName}, ${node.indexName}`;
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

function isOxcRenderValueExpression(expression: Record<string, unknown>): boolean {
  if (expression.type !== "MemberExpression") {
    return false;
  }

  const object = readObject(expression.object);
  const property = readObject(expression.property);

  return (
    object.type === "Identifier" &&
    object.name === "props" &&
    typeof property.name === "string" &&
    ["children", "fallback", "header", "sidebar", "element"].includes(property.name)
  );
}

function collectOxcExportedComponents(program: unknown): string[] {
  const body = readArray(readObject(program).body);
  const components: string[] = [];

  for (const statement of body) {
    const object = readObject(statement);

    if (object.type === "ExportDefaultDeclaration") {
      const declaration = unwrapOxcComponentFunctionLikeInitializer(
        readObject(object.declaration),
      );

      if (declaration !== undefined && hasOxcFunctionLikeJsxReturn(declaration)) {
        components.push("default");
      }
      continue;
    }

    if (object.type !== "ExportNamedDeclaration") {
      continue;
    }

    const declaration = readObject(object.declaration);

    if (declaration.type === "FunctionDeclaration" && hasJsxReturn(declaration.body)) {
      const id = readObject(declaration.id);

      if (typeof id.name === "string") {
        components.push(id.name);
      }
      continue;
    }

    const variableComponent = readOxcVariableComponentDeclaration(declaration);

    if (variableComponent !== undefined) {
      components.push(variableComponent.name);
    }
  }

  return components;
}

function collectOxcAsyncComponentNames(program: unknown): Set<string> {
  const names = new Set<string>();
  const body = readArray(readObject(program).body);

  for (const statement of body) {
    const object = readObject(statement);
    const declaration =
      object.type === "ExportDefaultDeclaration" ||
      object.type === "ExportNamedDeclaration"
        ? readObject(object.declaration)
        : object;
    const functionLike =
      declaration.type === "VariableDeclaration"
        ? readOxcVariableComponentDeclaration(declaration)?.initializer
        : unwrapOxcComponentFunctionLikeInitializer(declaration);

    if (
      functionLike === undefined ||
      functionLike.async !== true ||
      !hasOxcFunctionLikeJsxReturn(functionLike)
    ) {
      continue;
    }

    if (object.type === "ExportDefaultDeclaration") {
      const id = readObject(functionLike.id);
      names.add(typeof id.name === "string" ? id.name : "DefaultExport");
      continue;
    }

    const id = readObject(functionLike.id);

    if (typeof id.name === "string") {
      names.add(id.name);
    }
  }

  return names;
}

function collectOxcClientBoundaryImportComponents(program: unknown): Map<string, ClientReferenceIr> {
  const names = new Map<string, ClientReferenceIr>();

  for (const statement of readArray(readObject(program).body)) {
    const object = readObject(statement);

    if (object.type !== "ImportDeclaration" || !isOxcClientBoundaryImport(object)) {
      continue;
    }

    const moduleId = String(readObject(object.source).value ?? "");

    for (const specifier of readArray(object.specifiers)) {
      const specifierObject = readObject(specifier);
      const local = readObject(specifierObject.local);
      const localName = typeof local.name === "string" ? local.name : undefined;

      if (localName === undefined || !/^[A-Z]/.test(localName)) {
        continue;
      }

      if (specifierObject.type === "ImportDefaultSpecifier") {
        names.set(localName, { moduleId, exportName: "default" });
        continue;
      }

      if (specifierObject.type === "ImportNamespaceSpecifier") {
        names.set(localName, { moduleId, exportName: "*" });
        continue;
      }

      if (
        specifierObject.type === "ImportSpecifier" &&
        specifierObject.importKind !== "type"
      ) {
        const imported = readObject(specifierObject.imported);
        names.set(localName, {
          moduleId,
          exportName: String(imported.name ?? localName),
        });
      }
    }
  }

  return names;
}

function isOxcClientBoundaryImport(statement: Record<string, unknown>): boolean {
  const moduleId = String(readObject(statement.source).value ?? "");
  return /\.(?:client|compat)\.[cm]?[jt]sx?$/.test(moduleId);
}

function markOxcAsyncComponentReferences(
  node: JsxNodeIr,
  asyncComponentNames: Set<string>,
): void {
  visitOxcNode(node, (child) => {
    if (child.kind === "component" && asyncComponentNames.has(child.name)) {
      child.async = true;
    }
  });
}

function markOxcClientReferences(
  node: JsxNodeIr,
  clientReferences: Map<string, ClientReferenceIr>,
): void {
  visitOxcNode(node, (child) => {
    if (child.kind !== "component") {
      return;
    }

    const clientReference = findOxcClientReference(child.name, clientReferences);

    if (clientReference !== undefined) {
      child.runtime = "compat";
      child.clientReference = clientReference;
    }
  });
}

function findOxcClientReference(
  name: string,
  clientReferences: Map<string, ClientReferenceIr>,
): ClientReferenceIr | undefined {
  const direct = clientReferences.get(name);

  if (direct !== undefined) {
    return direct;
  }

  const [rootName, ...memberNames] = name.split(".");
  const rootReference =
    rootName === undefined ? undefined : clientReferences.get(rootName);

  if (
    rootReference === undefined ||
    rootReference.exportName !== "*" ||
    memberNames.length === 0
  ) {
    return rootReference;
  }

  return {
    moduleId: rootReference.moduleId,
    exportName: memberNames.join("."),
  };
}

function visitOxcNode(node: JsxNodeIr, visitor: (node: JsxNodeIr) => void): void {
  visitor(node);

  if (node.kind === "component") {
    for (const prop of node.props) {
      if (prop.kind === "render-prop") {
        for (const child of prop.children) {
          visitOxcNode(child, visitor);
        }
      }
    }
    for (const child of node.children) {
      visitOxcNode(child, visitor);
    }
    return;
  }

  if (node.kind === "conditional") {
    for (const child of [...node.whenTrue, ...node.whenFalse]) {
      visitOxcNode(child, visitor);
    }
    return;
  }

  if (node.kind === "list") {
    for (const child of node.children) {
      visitOxcNode(child, visitor);
    }
    return;
  }

  if (node.kind === "async-boundary") {
    for (const child of [
      ...node.children,
      ...(node.placeholderChildren ?? []),
      ...(node.catchChildren ?? []),
    ]) {
      visitOxcNode(child, visitor);
    }
    return;
  }

  if (node.kind === "element" || node.kind === "fragment") {
    for (const child of node.children) {
      visitOxcNode(child, visitor);
    }
  }
}

function validateOxcAwaitCompatComponents(
  node: JsxNodeIr,
  diagnostics: Diagnostic[],
  insideAwait = false,
): void {
  if (node.kind === "component") {
    if (insideAwait && node.clientReference !== undefined) {
      diagnostics.push(unsupportedAwaitInnerComponentDiagnostic(node.name));
    }

    for (const prop of node.props) {
      if (prop.kind === "render-prop") {
        for (const child of prop.children) {
          validateOxcAwaitCompatComponents(child, diagnostics, insideAwait);
        }
      }
    }
    for (const child of node.children) {
      validateOxcAwaitCompatComponents(child, diagnostics, insideAwait);
    }
    return;
  }

  if (node.kind === "async-boundary") {
    for (const child of [
      ...node.children,
      ...(node.placeholderChildren ?? []),
      ...(node.catchChildren ?? []),
    ]) {
      validateOxcAwaitCompatComponents(child, diagnostics, true);
    }
    return;
  }

  if (node.kind === "conditional") {
    for (const child of [...node.whenTrue, ...node.whenFalse]) {
      validateOxcAwaitCompatComponents(child, diagnostics, insideAwait);
    }
    return;
  }

  if (node.kind === "list") {
    for (const child of node.children) {
      validateOxcAwaitCompatComponents(child, diagnostics, insideAwait);
    }
    return;
  }

  if (node.kind === "element" || node.kind === "fragment") {
    for (const child of node.children) {
      validateOxcAwaitCompatComponents(child, diagnostics, insideAwait);
    }
  }
}

function readOxcVariableComponentDeclaration(
  declaration: Record<string, unknown>,
): { name: string; initializer: Record<string, unknown> } | undefined {
  if (declaration.type !== "VariableDeclaration") {
    return undefined;
  }

  for (const declarator of readArray(declaration.declarations)) {
    const object = readObject(declarator);
    const id = readObject(object.id);

    if (typeof id.name !== "string" || !/^[A-Z]/.test(id.name)) {
      continue;
    }

    const initializer = unwrapOxcComponentFunctionLikeInitializer(readObject(object.init));

    if (initializer !== undefined && hasOxcFunctionLikeJsxReturn(initializer)) {
      return { name: id.name, initializer };
    }
  }

  return undefined;
}

function readOxcPlainComponent(
  statement: unknown,
): { name: string; initializer: Record<string, unknown> } | undefined {
  const object = readObject(statement);

  if (object.type === "FunctionDeclaration" && hasJsxReturn(object.body)) {
    const id = readObject(object.id);
    return typeof id.name === "string"
      ? { name: id.name, initializer: object }
      : undefined;
  }

  return readOxcVariableComponentDeclaration(object);
}

function unwrapOxcComponentFunctionLikeInitializer(
  expression: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const unwrapped = unwrapOxcParentheses(expression);

  if (
    unwrapped.type === "ArrowFunctionExpression" ||
    unwrapped.type === "FunctionExpression" ||
    unwrapped.type === "FunctionDeclaration"
  ) {
    return unwrapped;
  }

  if (unwrapped.type !== "CallExpression") {
    return undefined;
  }

  const callee = readObject(unwrapped.callee);

  if (callee.type !== "Identifier" || (callee.name !== "memo" && callee.name !== "forwardRef")) {
    return undefined;
  }

  const firstArg = readObject(readArray(unwrapped.arguments)[0]);

  return unwrapOxcComponentFunctionLikeInitializer(firstArg);
}

function hasOxcFunctionLikeJsxReturn(functionLike: Record<string, unknown>): boolean {
  const body = unwrapOxcParentheses(readObject(functionLike.body));

  if (isJsxRoot(body.type)) {
    return true;
  }

  return hasJsxReturn(body);
}

function hasJsxReturn(body: unknown): boolean {
  return readArray(readObject(body).body).some((statement) => {
    const object = readObject(statement);

    if (object.type !== "ReturnStatement") {
      return false;
    }

    return isJsxRoot(unwrapOxcParentheses(readObject(object.argument)).type);
  });
}

function isJsxRoot(type: unknown): boolean {
  return (
    type === "JSXElement" ||
    type === "JSXFragment" ||
    type === "JSXSelfClosingElement"
  );
}

function formatStatement(code: string, statement: unknown): string {
  const source = readSource(code, statement);
  return stripTypeScriptWithOxc(source).replace("() => {}", "() => { }");
}

function collectBindingNames(statement: unknown): string[] {
  const object = readObject(statement);

  if (object.type === "ExportNamedDeclaration") {
    return collectBindingNames(object.declaration);
  }

  if (object.type === "ExportDefaultDeclaration") {
    return collectBindingNames(object.declaration);
  }

  if (
    object.type === "FunctionDeclaration" ||
    object.type === "ClassDeclaration"
  ) {
    const id = readObject(object.id);
    return typeof id.name === "string" ? [id.name] : [];
  }

  if (object.type === "ForStatement") {
    return collectBindingNames(object.init);
  }

  if (object.type === "IfStatement") {
    return [
      ...collectBindingNames(object.consequent),
      ...collectBindingNames(object.alternate),
    ];
  }

  if (object.type === "BlockStatement") {
    return readArray(object.body).flatMap(collectBindingNames);
  }

  if (object.type !== "VariableDeclaration") {
    return readArray(object.body).flatMap(collectBindingNames);
  }

  return readArray(object.declarations).flatMap((declaration) => {
    const id = readObject(readObject(declaration).id);
    return typeof id.name === "string" ? [id.name] : [];
  });
}

function collectImportBindingNames(statement: unknown): string[] {
  return readArray(readObject(statement).specifiers).flatMap((specifier) => {
    const local = readObject(readObject(specifier).local);
    return typeof local.name === "string" ? [local.name] : [];
  });
}

function readOxcParameterName(code: string, parameter: unknown): string {
  const object = readObject(parameter);

  if (typeof object.name === "string") {
    return object.name;
  }

  if (object.type === "AssignmentPattern") {
    return readOxcParameterName(code, object.left);
  }

  if (object.type === "RestElement") {
    return `...${readOxcParameterName(code, object.argument)}`;
  }

  return readSource(code, parameter);
}

function readSource(code: string, node: unknown): string {
  const object = readObject(node);
  return typeof object.start === "number" && typeof object.end === "number"
    ? code.slice(object.start, object.end)
    : "";
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getOxcLocation(
  code: string,
  node: unknown,
): SourceLocation | undefined {
  const start = readObject(node).start;

  if (typeof start !== "number") {
    return undefined;
  }

  let line = 1;
  let column = 1;

  for (let index = 0; index < start; index += 1) {
    if (code[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return { line, column };
}

function normalizeOxcJsxText(
  rawValue: string,
  siblings: readonly unknown[],
  index: number,
): string {
  const value = rawValue.replace(/\s+/g, " ");

  if (value.trim() === "") {
    const isSameLineSeparator = !/[\r\n]/.test(rawValue);
    return isSameLineSeparator &&
      siblings[index - 1] !== undefined &&
      siblings[index + 1] !== undefined
      ? " "
      : "";
  }

  const previousSibling = siblings[index - 1];
  const nextSibling = siblings[index + 1];
  const leadingWhitespace = rawValue.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = rawValue.match(/\s*$/)?.[0] ?? "";
  const preserveLeadingSpace =
    previousSibling !== undefined && !/[\r\n]/.test(leadingWhitespace);
  const preserveTrailingSpace =
    nextSibling !== undefined && !/[\r\n]/.test(trailingWhitespace);

  return value
    .replace(/^\s+/, preserveLeadingSpace ? " " : "")
    .replace(/\s+$/, preserveTrailingSpace ? " " : "")
    .replace(htmlEntityPattern, decodeHtmlEntity);
}

const htmlEntityPattern = /&(#\d+|#x[\da-fA-F]+|[A-Za-z][A-Za-z\d]+);/g;

const namedHtmlEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  copy: "\u00a9",
  gt: ">",
  lt: "<",
  mdash: "\u2014",
  middot: "\u00b7",
  nbsp: "\u00a0",
  quot: "\"",
};

function decodeHtmlEntity(entity: string, body: string): string {
  if (body.startsWith("#x") || body.startsWith("#X")) {
    return decodeNumericHtmlEntity(entity, body.slice(2), 16);
  }

  if (body.startsWith("#")) {
    return decodeNumericHtmlEntity(entity, body.slice(1), 10);
  }

  return namedHtmlEntities[body] ?? entity;
}

function decodeNumericHtmlEntity(
  entity: string,
  value: string,
  radix: number,
): string {
  const codePoint = Number.parseInt(value, radix);

  if (
    !Number.isFinite(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff
  ) {
    return entity;
  }

  return String.fromCodePoint(codePoint);
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
