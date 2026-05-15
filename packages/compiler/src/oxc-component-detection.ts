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

export function isOxcExportedJsxComponent(statement: unknown): boolean {
  const object = readObject(statement);

  if (object.type === "ExportDefaultDeclaration") {
    const declaration = unwrapOxcComponentFunctionLikeInitializer(readObject(object.declaration));
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
  return declaration.type === "FunctionDeclaration" && !hasJsxReturn(declaration.body);
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
