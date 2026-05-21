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

export function isOxcJsxComponentStatement(statement: unknown): boolean {
  return isOxcExportedJsxComponent(statement) || readOxcPlainComponent(statement) !== undefined;
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
): boolean {
  if (options?.compatReactNodeReturn === true) {
    return false;
  }

  const object = readObject(statement);

  if (object.type !== "ExportNamedDeclaration") {
    return false;
  }

  const declaration = readObject(object.declaration);
  return declaration.type === "FunctionDeclaration" && !hasComponentReturn(declaration.body);
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
    return typeof id.name === "string" && /^[A-Z]/.test(id.name)
      ? { name: id.name, initializer: object }
      : undefined;
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

export function hasComponentCallReturn(body: unknown): boolean {
  return readArray(readObject(body).body).some((statement) => {
    const object = readObject(statement);

    if (object.type === "ReturnStatement") {
      return isOxcComponentCallExpression(unwrapOxcParentheses(readObject(object.argument)));
    }

    return hasNestedComponentCallReturn(object);
  });
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
    return object.type === "Identifier" && typeof object.name === "string" && /^[A-Z]/.test(object.name);
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

  if (unwrapped.type !== "ConditionalExpression") {
    return false;
  }

  return (
    isOxcJsxReturnBranch(readObject(unwrapped.consequent)) &&
    isOxcJsxReturnBranch(readObject(unwrapped.alternate))
  );
}

function isOxcJsxReturnBranch(expression: Record<string, unknown>): boolean {
  const unwrapped = unwrapOxcParentheses(expression);

  if (unwrapped.type === "Literal" && (unwrapped.value === null || unwrapped.value === false)) {
    return true;
  }

  return isOxcJsxReturnExpression(unwrapped);
}
