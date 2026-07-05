import { readArray, readObject, unwrapOxcParentheses } from "./oxc-node-utils.js";
import type { AnalyzeModuleOptions } from "./types.js";

export function collectOxcExportedFunctionNames(program: unknown): string[] {
  return readArray(readObject(program).body).flatMap((statement) => {
    const object = readObject(statement);

    if (object.type === "ExportDefaultDeclaration") {
      const declaration = unwrapOxcComponentFunctionLikeInitializer(readObject(object.declaration));
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

export function collectOxcPlainComponentNames(program: unknown): string[] {
  return readArray(readObject(program).body).flatMap((statement) => {
    const component = readOxcPlainComponent(statement);
    return component === undefined ? [] : [component.name];
  });
}

export function collectOxcLocalJsxReturnFunctionNames(program: unknown): Set<string> {
  const names = new Set<string>();

  for (const statement of readArray(readObject(program).body)) {
    const object = readObject(statement);

    if (object.type === "FunctionDeclaration" && hasOxcFunctionLikeJsxReturn(object)) {
      const id = readObject(object.id);
      if (typeof id.name === "string") {
        names.add(id.name);
      }
      continue;
    }

    if (object.type !== "VariableDeclaration") {
      continue;
    }

    for (const declarator of readArray(object.declarations)) {
      const declaratorObject = readObject(declarator);
      const id = readObject(declaratorObject.id);
      const initializer = unwrapOxcComponentFunctionLikeInitializer(
        readObject(declaratorObject.init),
      );

      if (
        typeof id.name === "string" &&
        initializer !== undefined &&
        hasOxcFunctionLikeJsxReturn(initializer)
      ) {
        names.add(id.name);
      }
    }
  }

  return names;
}

export function collectOxcExportedComponents(program: unknown): string[] {
  const body = readArray(readObject(program).body);
  const components: string[] = [];

  for (const statement of body) {
    const object = readObject(statement);

    if (object.type === "ExportDefaultDeclaration") {
      const declaration = unwrapOxcComponentFunctionLikeInitializer(readObject(object.declaration));

      if (declaration !== undefined && hasOxcFunctionLikeComponentReturn(declaration)) {
        components.push("default");
      }
      continue;
    }

    if (object.type !== "ExportNamedDeclaration") {
      continue;
    }

    const declaration = readObject(object.declaration);

    if (declaration.type === "FunctionDeclaration" && hasComponentReturn(declaration.body)) {
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

export function collectOxcAsyncComponentNames(program: unknown): Set<string> {
  const names = new Set<string>();
  const body = readArray(readObject(program).body);

  for (const statement of body) {
    const object = readObject(statement);
    const declaration =
      object.type === "ExportDefaultDeclaration" || object.type === "ExportNamedDeclaration"
        ? readObject(object.declaration)
        : object;
    const functionLike =
      declaration.type === "VariableDeclaration"
        ? readOxcVariableComponentDeclaration(declaration)?.initializer
        : unwrapOxcComponentFunctionLikeInitializer(declaration);

    if (
      functionLike === undefined ||
      functionLike.async !== true ||
      !hasOxcFunctionLikeComponentReturn(functionLike)
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

export function isOxcExportedJsxComponent(statement: unknown): boolean {
  const object = readObject(statement);

  if (object.type === "ExportDefaultDeclaration") {
    const declaration = unwrapOxcComponentFunctionLikeInitializer(readObject(object.declaration));
    return declaration !== undefined && hasOxcFunctionLikeComponentReturn(declaration);
  }

  if (object.type !== "ExportNamedDeclaration") {
    return false;
  }

  const declaration = readObject(object.declaration);
  return (
    (declaration.type === "FunctionDeclaration" && hasComponentReturn(declaration.body)) ||
    readOxcVariableComponentDeclaration(declaration) !== undefined
  );
}

export function isOxcJsxComponentStatement(
  statement: unknown,
  localJsxReturnFunctionNames: ReadonlySet<string> = new Set(),
): boolean {
  return (
    isOxcExportedJsxComponent(statement) ||
    isOxcExportedFunctionReturningLocalJsxHelper(statement, localJsxReturnFunctionNames) ||
    readOxcPlainComponent(statement) !== undefined
  );
}

export function isOxcExportedFunctionLike(statement: unknown): boolean {
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

export function isOxcUnsupportedExportedFunction(
  statement: unknown,
  options?: AnalyzeModuleOptions,
  localJsxReturnFunctionNames: ReadonlySet<string> = new Set(),
): boolean {
  if (options?.compatReactNodeReturn === true) {
    return false;
  }

  const object = readObject(statement);

  if (object.type !== "ExportNamedDeclaration") {
    return false;
  }

  const declaration = readObject(object.declaration);
  const id = readObject(declaration.id);

  return (
    declaration.type === "FunctionDeclaration" &&
    typeof id.name === "string" &&
    /^[A-Z]/.test(id.name) &&
    !hasComponentReturn(declaration.body) &&
    !hasLocalJsxHelperCallReturn(declaration.body, localJsxReturnFunctionNames) &&
    !hasOnlyNullReturns(declaration.body)
  );
}

function isOxcExportedFunctionReturningLocalJsxHelper(
  statement: unknown,
  localJsxReturnFunctionNames: ReadonlySet<string>,
): boolean {
  const object = readObject(statement);

  if (object.type !== "ExportNamedDeclaration") {
    return false;
  }

  const declaration = readObject(object.declaration);

  return (
    declaration.type === "FunctionDeclaration" &&
    hasLocalJsxHelperCallReturn(declaration.body, localJsxReturnFunctionNames)
  );
}

export function readOxcVariableComponentDeclaration(
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

    if (initializer !== undefined && hasOxcFunctionLikeComponentReturn(initializer)) {
      return { name: id.name, initializer };
    }
  }

  return undefined;
}

export function readOxcPlainComponent(
  statement: unknown,
): { name: string; initializer: Record<string, unknown> } | undefined {
  const object = readObject(statement);

  if (object.type === "FunctionDeclaration" && hasComponentReturn(object.body)) {
    const id = readObject(object.id);
    return typeof id.name === "string" ? { name: id.name, initializer: object } : undefined;
  }

  return readOxcVariableComponentDeclaration(object);
}

export function unwrapOxcComponentFunctionLikeInitializer(
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

export function hasOxcFunctionLikeJsxReturn(functionLike: Record<string, unknown>): boolean {
  const body = unwrapOxcParentheses(readObject(functionLike.body));

  if (isOxcJsxReturnExpression(body)) {
    return true;
  }

  return hasJsxReturn(body);
}

export function hasOxcFunctionLikeComponentReturn(functionLike: Record<string, unknown>): boolean {
  const body = unwrapOxcParentheses(readObject(functionLike.body));

  if (hasOxcFunctionLikeJsxReturn(functionLike)) {
    return true;
  }

  if (isOxcComponentCallExpression(body)) {
    return true;
  }

  return hasComponentCallReturn(body);
}

export function hasJsxReturn(body: unknown): boolean {
  return readArray(readObject(body).body).some((statement) => {
    const object = readObject(statement);

    if (object.type === "ReturnStatement") {
      return isOxcJsxReturnExpression(readObject(object.argument));
    }

    return hasNestedJsxReturn(object);
  });
}

export function hasComponentReturn(body: unknown): boolean {
  return hasJsxReturn(body) || hasComponentCallReturn(body);
}

export function hasOnlyNullReturns(body: unknown): boolean {
  const returns = collectReturnArguments(readObject(body));
  return returns.length > 0 && returns.every(isNullReturnArgument);
}

export function hasComponentCallReturn(body: unknown): boolean {
  return readArray(readObject(body).body).some((statement) => {
    const object = readObject(statement);

    if (object.type === "ReturnStatement") {
      return isOxcComponentCallExpression(unwrapOxcParentheses(readObject(object.argument)));
    }

    return hasNestedComponentCallReturn(object);
  });
}

export function readOxcListMapComponent(
  statement: unknown,
): { name: string; initializer: Record<string, unknown> } | undefined {
  const object = readObject(statement);

  if (object.type !== "FunctionDeclaration" || !isOxcListMapReturnExpression(readObject(object.body))) {
    return undefined;
  }

  const id = readObject(object.id);
  return typeof id.name === "string" && /^[A-Z]/.test(id.name)
    ? { name: id.name, initializer: object }
    : undefined;
}

function isOxcListMapReturnExpression(expression: Record<string, unknown>): boolean {
  if (expression.type === "BlockStatement") {
    return readArray(expression.body).some((statement) => {
      const object = readObject(statement);
      return (
        object.type === "ReturnStatement" &&
        isOxcListMapReturnExpression(unwrapOxcParentheses(readObject(object.argument)))
      );
    });
  }

  if (expression.type !== "CallExpression") {
    return false;
  }

  const callee = readObject(expression.callee);

  if (callee.type !== "MemberExpression" || readObject(callee.property).name !== "map") {
    return false;
  }

  const renderer = readObject(readArray(expression.arguments)[0]);

  if (renderer.type !== "ArrowFunctionExpression") {
    return false;
  }

  const body = unwrapOxcParentheses(readObject(renderer.body));

  if (isOxcJsxReturnExpression(body)) {
    return true;
  }

  if (body.type !== "BlockStatement") {
    return false;
  }

  const statements = readArray(body.body);
  const last = readObject(statements.at(-1));

  return last.type === "ReturnStatement" && isOxcJsxReturnExpression(readObject(last.argument));
}

export function hasLocalJsxHelperCallReturn(
  body: unknown,
  localJsxReturnFunctionNames: ReadonlySet<string>,
): boolean {
  if (localJsxReturnFunctionNames.size === 0) {
    return false;
  }

  return readArray(readObject(body).body).some((statement) => {
    const object = readObject(statement);

    if (object.type === "ReturnStatement") {
      return isOxcLocalJsxHelperCallExpression(
        unwrapOxcParentheses(readObject(object.argument)),
        localJsxReturnFunctionNames,
      );
    }

    return hasNestedLocalJsxHelperCallReturn(object, localJsxReturnFunctionNames);
  });
}

export function isOxcLocalJsxHelperCallExpression(
  expression: Record<string, unknown>,
  localJsxReturnFunctionNames: ReadonlySet<string>,
): boolean {
  if (expression.type !== "CallExpression") {
    return false;
  }

  const callee = unwrapOxcParentheses(readObject(expression.callee));

  return (
    callee.type === "Identifier" &&
    typeof callee.name === "string" &&
    localJsxReturnFunctionNames.has(callee.name)
  );
}

function hasNestedJsxReturn(statement: Record<string, unknown>): boolean {
  if (statement.type === "SwitchStatement") {
    return readArray(statement.cases).some((switchCase) =>
      readArray(readObject(switchCase).consequent).some((child) => {
        const object = readObject(child);
        return (
          object.type === "ReturnStatement" &&
          isOxcJsxReturnExpression(readObject(object.argument))
        );
      }),
    );
  }

  if (statement.type === "IfStatement") {
    return (
      hasJsxReturn({ body: [statement.consequent] }) ||
      hasJsxReturn({ body: [statement.alternate] })
    );
  }

  if (statement.type === "BlockStatement") {
    return hasJsxReturn(statement);
  }

  return false;
}

function hasNestedComponentCallReturn(statement: Record<string, unknown>): boolean {
  if (statement.type === "SwitchStatement") {
    return readArray(statement.cases).some((switchCase) =>
      readArray(readObject(switchCase).consequent).some((child) => {
        const object = readObject(child);
        return (
          object.type === "ReturnStatement" &&
          isOxcComponentCallExpression(unwrapOxcParentheses(readObject(object.argument)))
        );
      }),
    );
  }

  if (statement.type === "IfStatement") {
    return (
      hasComponentCallReturn({ body: [statement.consequent] }) ||
      hasComponentCallReturn({ body: [statement.alternate] })
    );
  }

  if (statement.type === "BlockStatement") {
    return hasComponentCallReturn(statement);
  }

  return false;
}

function hasNestedLocalJsxHelperCallReturn(
  statement: Record<string, unknown>,
  localJsxReturnFunctionNames: ReadonlySet<string>,
): boolean {
  if (statement.type === "SwitchStatement") {
    return readArray(statement.cases).some((switchCase) =>
      readArray(readObject(switchCase).consequent).some((child) => {
        const object = readObject(child);
        return (
          object.type === "ReturnStatement" &&
          isOxcLocalJsxHelperCallExpression(
            unwrapOxcParentheses(readObject(object.argument)),
            localJsxReturnFunctionNames,
          )
        );
      }),
    );
  }

  if (statement.type === "IfStatement") {
    return (
      hasLocalJsxHelperCallReturn(
        { body: [statement.consequent] },
        localJsxReturnFunctionNames,
      ) ||
      hasLocalJsxHelperCallReturn(
        { body: [statement.alternate] },
        localJsxReturnFunctionNames,
      )
    );
  }

  if (statement.type === "BlockStatement") {
    return hasLocalJsxHelperCallReturn(statement, localJsxReturnFunctionNames);
  }

  return false;
}

function collectReturnArguments(statement: Record<string, unknown>): Record<string, unknown>[] {
  if (statement.type === "ReturnStatement") {
    return [readObject(statement.argument)];
  }

  if (statement.type === "BlockStatement") {
    return readArray(statement.body).flatMap((child) => collectReturnArguments(readObject(child)));
  }

  if (statement.type === "IfStatement") {
    return [
      ...collectReturnArguments(readObject(statement.consequent)),
      ...collectReturnArguments(readObject(statement.alternate)),
    ];
  }

  if (statement.type === "SwitchStatement") {
    return readArray(statement.cases).flatMap((switchCase) =>
      readArray(readObject(switchCase).consequent).flatMap((child) =>
        collectReturnArguments(readObject(child)),
      ),
    );
  }

  return [];
}

function isNullReturnArgument(argument: Record<string, unknown>): boolean {
  return (
    argument.type === "NullLiteral" ||
    (argument.type === "Literal" && argument.value === null)
  );
}

export function isOxcComponentCallExpression(expression: Record<string, unknown>): boolean {
  if (expression.type !== "CallExpression") {
    return false;
  }

  const callee = unwrapOxcParentheses(readObject(expression.callee));

  if (callee.type === "Identifier") {
    return typeof callee.name === "string" && /^[A-Z]/.test(callee.name);
  }

  if (callee.type === "MemberExpression") {
    const object = readObject(callee.object);
    const property = readObject(callee.property);
    return (
      object.type === "Identifier" &&
      typeof object.name === "string" &&
      /^[A-Z]/.test(object.name) &&
      property.type === "Identifier" &&
      typeof property.name === "string" &&
      /^[A-Z]/.test(property.name)
    );
  }

  return false;
}

export function isJsxRoot(type: unknown): boolean {
  return type === "JSXElement" || type === "JSXFragment" || type === "JSXSelfClosingElement";
}

function isOxcJsxReturnExpression(expression: Record<string, unknown>): boolean {
  const unwrapped = unwrapOxcParentheses(expression);

  if (isJsxRoot(unwrapped.type)) {
    return true;
  }

  if (unwrapped.type === "LogicalExpression") {
    return (
      unwrapped.operator === "&&" &&
      isOxcJsxReturnBranch(readObject(unwrapped.right))
    );
  }

  if (unwrapped.type === "ConditionalExpression") {
    return (
      isOxcJsxReturnBranch(readObject(unwrapped.consequent)) &&
      isOxcJsxReturnBranch(readObject(unwrapped.alternate))
    );
  }

  return false;
}

function isOxcJsxReturnBranch(expression: Record<string, unknown>): boolean {
  const unwrapped = unwrapOxcParentheses(expression);

  if (unwrapped.type === "Literal" && (unwrapped.value === null || unwrapped.value === false)) {
    return true;
  }

  return isOxcJsxReturnExpression(unwrapped);
}
