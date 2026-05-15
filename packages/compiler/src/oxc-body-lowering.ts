import type { OxcBodyStatementJsxMode } from "./oxc-analysis-types.js";
import { formatStatement } from "./oxc-bindings.js";
import { stripOxcGeneratedImports } from "./oxc-code-utils.js";
import { readArray, readObject, readSource, unwrapOxcParentheses } from "./oxc-node-utils.js";
import { containsOxcJsxSyntax } from "./oxc-render-values.js";
import { transformJsxWithOxc } from "./oxc-transform.js";
import type { AnalyzeModuleOptions, CompileTarget, Diagnostic } from "./types.js";

export interface OxcBodyLowerers {
  lowerDomNodeExpression(code: string, expression: Record<string, unknown>): string | undefined;
  lowerCompatObjectExpression(
    code: string,
    expression: Record<string, unknown>,
    componentNames: Set<string>,
    target: CompileTarget,
    diagnostics: Diagnostic[],
  ): string | undefined;
  lowerServerStringExpression(
    code: string,
    expression: Record<string, unknown>,
    componentNames: Set<string>,
    target: CompileTarget,
    diagnostics: Diagnostic[],
  ): string | undefined;
}

export function lowerOxcTopLevelStatement(
  code: string,
  statement: unknown,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  options: AnalyzeModuleOptions | undefined,
  lowerers: OxcBodyLowerers,
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
    lowerers,
  );
}

export function formatPreservedStatement(
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

export function formatOxcBodyStatement(
  code: string,
  statement: unknown,
  bodyStatementJsx: OxcBodyStatementJsxMode,
): string {
  return bodyStatementJsx === "compat-object"
    ? stripOxcGeneratedImports(transformJsxWithOxc(readSource(code, statement)))
    : formatStatement(code, statement);
}

export function lowerOxcBodyStatementJsx(
  code: string,
  statement: unknown,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  mode: OxcBodyStatementJsxMode,
  lowerers: OxcBodyLowerers,
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
      lowerers,
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
      ? lowerers.lowerDomNodeExpression(code, initializer)
      : mode === "compat-object"
        ? lowerers.lowerCompatObjectExpression(code, initializer, componentNames, target, diagnostics)
        : mode === "server-string"
          ? lowerers.lowerServerStringExpression(code, initializer, componentNames, target, diagnostics)
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
  lowerers: OxcBodyLowerers,
): string | undefined {
  const body = readObject(statement.body);

  if (body.type !== "BlockStatement") {
    return undefined;
  }

  let didLower = false;
  const loweredStatements = readArray(body.body).map((bodyStatement) => {
    const lowered =
      lowerOxcPushJsxStatement(code, bodyStatement, componentNames, target, diagnostics, mode, lowerers) ??
      lowerOxcBodyStatementJsx(code, bodyStatement, componentNames, target, diagnostics, mode, lowerers);

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
  lowerers: OxcBodyLowerers,
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
      ? lowerers.lowerDomNodeExpression(code, argument)
      : mode === "compat-object"
        ? lowerers.lowerCompatObjectExpression(code, argument, componentNames, target, diagnostics)
        : mode === "server-string"
          ? lowerers.lowerServerStringExpression(code, argument, componentNames, target, diagnostics)
          : undefined;

  if (lowered === undefined) {
    return undefined;
  }

  return `${readSource(code, callee)}(${lowered});`;
}
