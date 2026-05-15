import { readArray, readObject, unwrapOxcParentheses } from "./oxc-node-utils.js";

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

    if (initializer !== undefined && hasOxcFunctionLikeJsxReturn(initializer)) {
      return { name: id.name, initializer };
    }
  }

  return undefined;
}

export function readOxcPlainComponent(
  statement: unknown,
): { name: string; initializer: Record<string, unknown> } | undefined {
  const object = readObject(statement);

  if (object.type === "FunctionDeclaration" && hasJsxReturn(object.body)) {
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

  if (isJsxRoot(body.type)) {
    return true;
  }

  return hasJsxReturn(body);
}

export function hasJsxReturn(body: unknown): boolean {
  return readArray(readObject(body).body).some((statement) => {
    const object = readObject(statement);

    if (object.type !== "ReturnStatement") {
      return false;
    }

    return isJsxRoot(unwrapOxcParentheses(readObject(object.argument)).type);
  });
}

export function isJsxRoot(type: unknown): boolean {
  return type === "JSXElement" || type === "JSXFragment" || type === "JSXSelfClosingElement";
}
