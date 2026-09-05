import type { OxcBodyStatementJsxMode } from "./oxc-analysis-types.js";
import { formatStatement } from "./oxc-bindings.js";
import { stripOxcGeneratedImports } from "./oxc-code-utils.js";
import { readArray, readObject, readSource, unwrapOxcParentheses } from "./oxc-node-utils.js";
import { containsOxcJsxSyntax } from "./oxc-render-values.js";
import { transformJsxWithOxc } from "./oxc-transform.js";
import type { AnalyzeModuleOptions, CompileTarget, Diagnostic } from "./types.js";

export interface OxcBodyLowerers {
  lowerDomNodeExpression(
    code: string,
    expression: Record<string, unknown>,
    componentNames: Set<string>,
  ): string | undefined;
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
    serverRenderValueWrapper?: string,
    serverRenderValueCallNames?: ReadonlySet<string>,
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
  serverRenderValueWrapper?: string,
  serverRenderValueBindingNames?: ReadonlySet<string>,
  serverRenderValueCallNames?: ReadonlySet<string>,
): string | undefined {
  const object = readObject(statement);

  if (
    object.type !== "VariableDeclaration" ||
    (!containsOxcJsxSyntax(object) &&
      !hasOxcServerRenderValueDeclaration(object, serverRenderValueBindingNames))
  ) {
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
    serverRenderValueWrapper,
    serverRenderValueBindingNames,
    serverRenderValueCallNames,
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
  serverRenderValueWrapper?: string,
  serverRenderValueBindingNames?: ReadonlySet<string>,
  serverRenderValueCallNames?: ReadonlySet<string>,
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
      serverRenderValueWrapper,
      serverRenderValueBindingNames,
      serverRenderValueCallNames,
    );
  }

  if (mode === "unsupported") {
    return undefined;
  }

  if (object.type === "IfStatement") {
    return lowerOxcIfStatementJsx(
      code,
      object,
      componentNames,
      target,
      diagnostics,
      mode,
      lowerers,
      serverRenderValueWrapper,
      serverRenderValueBindingNames,
      serverRenderValueCallNames,
    );
  }

  if (object.type === "ReturnStatement") {
    return lowerOxcReturnStatementJsx(
      code,
      object,
      componentNames,
      target,
      diagnostics,
      mode,
      lowerers,
    );
  }

  if (object.type !== "VariableDeclaration") {
    return undefined;
  }

  const declarations = readArray(object.declarations);
  const kind = typeof object.kind === "string" ? object.kind : "const";
  let didLower = false;
  const loweredDeclarations = declarations.map((declarationValue) => {
    const declaration = readObject(declarationValue);
    const id = readObject(declaration.id);
    const initializer = unwrapOxcParentheses(readObject(declaration.init));
    if (
      typeof id.name !== "string" ||
      (!containsOxcJsxSyntax(initializer) &&
        serverRenderValueBindingNames?.has(id.name) !== true)
    ) {
      return readSource(code, declaration);
    }

    const renderValueWrapper =
      kind === "const" || serverRenderValueBindingNames?.has(id.name) === true
        ? serverRenderValueWrapper
        : undefined;
    const lowered =
      mode === "dom-node"
        ? lowerers.lowerDomNodeExpression(code, initializer, componentNames)
        : mode === "compat-object"
          ? lowerers.lowerCompatObjectExpression(code, initializer, componentNames, target, diagnostics)
          : mode === "server-string"
            ? lowerers.lowerServerStringExpression(
                code,
                initializer,
                componentNames,
                target,
                diagnostics,
                renderValueWrapper,
                serverRenderValueCallNames,
              )
            : undefined;
    if (lowered === undefined) return readSource(code, declaration);
    didLower = true;
    return `${id.name} = ${lowered}`;
  });

  return didLower ? `${kind} ${loweredDeclarations.join(", ")};` : undefined;
}

function hasOxcServerRenderValueDeclaration(
  declaration: Record<string, unknown>,
  serverRenderValueBindingNames: ReadonlySet<string> | undefined,
): boolean {
  if (serverRenderValueBindingNames === undefined) return false;

  return readArray(declaration.declarations).some((value) => {
    const id = readObject(readObject(value).id);
    return typeof id.name === "string" && serverRenderValueBindingNames.has(id.name);
  });
}

function lowerOxcIfStatementJsx(
  code: string,
  statement: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  mode: OxcBodyStatementJsxMode,
  lowerers: OxcBodyLowerers,
  serverRenderValueWrapper?: string,
  serverRenderValueBindingNames?: ReadonlySet<string>,
  serverRenderValueCallNames?: ReadonlySet<string>,
): string | undefined {
  const consequent = lowerOxcStatementBlockJsx(
    code,
    statement.consequent,
    componentNames,
    target,
    diagnostics,
    mode,
    lowerers,
    serverRenderValueWrapper,
    serverRenderValueBindingNames,
    serverRenderValueCallNames,
  );
  const alternate =
    statement.alternate === undefined || statement.alternate === null
      ? undefined
      : lowerOxcStatementBlockJsx(
          code,
          statement.alternate,
          componentNames,
          target,
          diagnostics,
          mode,
          lowerers,
          serverRenderValueWrapper,
          serverRenderValueBindingNames,
          serverRenderValueCallNames,
        );

  if (consequent === undefined && alternate === undefined) {
    return undefined;
  }

  const test = readSource(code, statement.test);
  const formattedConsequent =
    consequent ?? formatOxcStatementBlock(code, statement.consequent, mode);

  if (statement.alternate === undefined || statement.alternate === null) {
    return `if (${test}) ${formattedConsequent}`;
  }

  const formattedAlternate = alternate ?? formatOxcStatementBlock(code, statement.alternate, mode);
  return `if (${test}) ${formattedConsequent} else ${formattedAlternate}`;
}

function lowerOxcStatementBlockJsx(
  code: string,
  statement: unknown,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  mode: OxcBodyStatementJsxMode,
  lowerers: OxcBodyLowerers,
  serverRenderValueWrapper?: string,
  serverRenderValueBindingNames?: ReadonlySet<string>,
  serverRenderValueCallNames?: ReadonlySet<string>,
): string | undefined {
  const object = readObject(statement);

  if (object.type !== "BlockStatement") {
    const lowered = lowerOxcBodyStatementJsx(
      code,
      object,
      componentNames,
      target,
      diagnostics,
      mode,
      lowerers,
      serverRenderValueWrapper,
      serverRenderValueBindingNames,
      serverRenderValueCallNames,
    );

    return lowered === undefined ? undefined : lowered;
  }

  let didLower = false;
  const statements = readArray(object.body).map((bodyStatement) => {
    const lowered = lowerOxcBodyStatementJsx(
      code,
      bodyStatement,
      componentNames,
      target,
      diagnostics,
      mode,
      lowerers,
      serverRenderValueWrapper,
      serverRenderValueBindingNames,
      serverRenderValueCallNames,
    );

    if (lowered !== undefined) {
      didLower = true;
    }

    return lowered ?? formatStatement(code, bodyStatement);
  });

  if (!didLower) {
    return undefined;
  }

  return `{\n${statements.map((statementCode) => indentOxcStatement(statementCode)).join("\n")}\n}`;
}

function formatOxcStatementBlock(
  code: string,
  statement: unknown,
  mode: OxcBodyStatementJsxMode,
): string {
  const object = readObject(statement);

  if (object.type !== "BlockStatement") {
    return formatOxcBodyStatement(code, statement, mode);
  }

  return `{\n${readArray(object.body)
    .map((bodyStatement) => indentOxcStatement(formatOxcBodyStatement(code, bodyStatement, mode)))
    .join("\n")}\n}`;
}

function lowerOxcReturnStatementJsx(
  code: string,
  statement: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  mode: OxcBodyStatementJsxMode,
  lowerers: OxcBodyLowerers,
): string | undefined {
  const argument = unwrapOxcParentheses(readObject(statement.argument));

  if (!containsOxcJsxSyntax(argument)) {
    return undefined;
  }

  const lowered =
    mode === "dom-node"
      ? lowerers.lowerDomNodeExpression(code, argument, componentNames)
      : mode === "compat-object"
        ? lowerers.lowerCompatObjectExpression(code, argument, componentNames, target, diagnostics)
        : mode === "server-string"
          ? lowerers.lowerServerStringExpression(
              code,
              argument,
              componentNames,
              target,
              diagnostics,
            )
          : undefined;

  return lowered === undefined ? undefined : `return ${lowered};`;
}

function indentOxcStatement(statementCode: string): string {
  return statementCode
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function lowerOxcForOfStatementJsx(
  code: string,
  statement: Record<string, unknown>,
  componentNames: Set<string>,
  target: CompileTarget,
  diagnostics: Diagnostic[],
  mode: OxcBodyStatementJsxMode,
  lowerers: OxcBodyLowerers,
  serverRenderValueWrapper?: string,
  serverRenderValueBindingNames?: ReadonlySet<string>,
  serverRenderValueCallNames?: ReadonlySet<string>,
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
        lowerers,
        serverRenderValueWrapper,
        serverRenderValueBindingNames,
      ) ??
      lowerOxcBodyStatementJsx(
        code,
        bodyStatement,
        componentNames,
        target,
        diagnostics,
        mode,
        lowerers,
        serverRenderValueWrapper,
        serverRenderValueBindingNames,
        serverRenderValueCallNames,
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
  serverRenderValueWrapper?: string,
  serverRenderValueBindingNames?: ReadonlySet<string>,
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
  const pushTarget = readObject(callee.object);
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
      ? lowerers.lowerDomNodeExpression(code, argument, componentNames)
      : mode === "compat-object"
        ? lowerers.lowerCompatObjectExpression(code, argument, componentNames, target, diagnostics)
        : mode === "server-string"
          ? lowerers.lowerServerStringExpression(
              code,
              argument,
              componentNames,
              target,
              diagnostics,
              typeof pushTarget.name === "string" &&
                serverRenderValueBindingNames?.has(pushTarget.name) === true
                ? serverRenderValueWrapper
                : undefined,
            )
          : undefined;

  if (lowered === undefined) {
    return undefined;
  }

  return `${readSource(code, callee)}(${lowered});`;
}
