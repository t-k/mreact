import type { JsxNodeIr } from "./ir.js";
import { readArray, readObject, readSource, unwrapOxcParentheses } from "./oxc-node-utils.js";

export function collectOxcBodyJsxBindingNames(statements: readonly unknown[]): Set<string> {
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

    const declarationKind = typeof object.kind === "string" ? object.kind : "let";
    const isImmutableBinding = declarationKind === "const";

    for (const declarationValue of readArray(object.declarations)) {
      const declaration = readObject(declarationValue);
      const id = readObject(declaration.id);
      const initializer = unwrapOxcParentheses(readObject(declaration.init));

      if (typeof id.name !== "string") continue;
      if (!containsOxcJsxSyntax(initializer)) continue;
      if (!isJsxLikeInitializer(initializer)) continue;
      if (!isImmutableBinding && isBindingReassigned(statements, id.name)) {
        continue;
      }
      names.add(id.name);
    }
  }

  return names;
}

export function collectOxcReactiveReadAliases(
  code: string,
  statements: readonly unknown[],
): Map<string, string> {
  const aliases = new Map<string, string>();

  for (const statement of statements) {
    const object = readObject(statement);

    if (object.type !== "VariableDeclaration" || object.kind !== "const") {
      continue;
    }

    for (const declarationValue of readArray(object.declarations)) {
      const declaration = readObject(declarationValue);
      const id = readObject(declaration.id);
      const initializer = unwrapOxcParentheses(readObject(declaration.init));

      if (typeof id.name !== "string") continue;
      if (!isOxcReactiveReadExpression(initializer)) continue;

      aliases.set(id.name, readSource(code, initializer));
    }
  }

  return aliases;
}

export function markOxcRenderValueExpressions(
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

export function isOxcRenderValueExpression(expression: Record<string, unknown>): boolean {
  if (isOxcRendererCallExpression(expression)) {
    return true;
  }

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

function isOxcRendererCallExpression(expression: Record<string, unknown>): boolean {
  if (expression.type !== "CallExpression") {
    return false;
  }

  const callee = readObject(expression.callee);

  return (
    callee.type === "Identifier" &&
    typeof callee.name === "string" &&
    /^render[A-Z0-9_$]/.test(callee.name)
  );
}

export function containsOxcJsxSyntax(node: Record<string, unknown>): boolean {
  if (node.type === "JSXElement" || node.type === "JSXFragment") {
    return true;
  }

  return Object.values(node).some((value) =>
    Array.isArray(value)
      ? value.some((item) => containsOxcJsxSyntax(readObject(item)))
      : typeof value === "object" && value !== null && containsOxcJsxSyntax(readObject(value)),
  );
}

function isJsxLikeInitializer(node: Record<string, unknown>): boolean {
  if (node.type === "JSXElement" || node.type === "JSXFragment") return true;
  if (node.type === "ConditionalExpression") {
    return (
      isJsxLikeInitializer(readObject(node.consequent)) ||
      isJsxLikeInitializer(readObject(node.alternate))
    );
  }
  if (node.type === "LogicalExpression") {
    return (
      isJsxLikeInitializer(readObject(node.left)) || isJsxLikeInitializer(readObject(node.right))
    );
  }
  if (node.type === "ArrayExpression" || node.type === "ObjectExpression") {
    return false;
  }
  return containsOxcJsxSyntax(node);
}

function isBindingReassigned(statements: readonly unknown[], name: string): boolean {
  for (const statement of statements) {
    if (containsAssignmentTo(readObject(statement), name)) return true;
  }
  return false;
}

function isOxcReactiveReadExpression(expression: Record<string, unknown>): boolean {
  if (expression.type !== "CallExpression") {
    return false;
  }

  const callee = readObject(expression.callee);

  if (callee.type !== "MemberExpression" || callee.computed === true || callee.optional === true) {
    return false;
  }

  const property = readObject(callee.property);

  return property.type === "Identifier" && property.name === "get";
}

function containsAssignmentTo(node: Record<string, unknown>, name: string): boolean {
  if (node.type === "AssignmentExpression") {
    const left = readObject(node.left);
    if (left.type === "Identifier" && left.name === name) return true;
  }
  if (node.type === "UpdateExpression") {
    const argument = readObject(node.argument);
    if (argument.type === "Identifier" && argument.name === name) return true;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (
          typeof item === "object" &&
          item !== null &&
          containsAssignmentTo(readObject(item), name)
        ) {
          return true;
        }
      }
    } else if (typeof value === "object" && value !== null) {
      if (containsAssignmentTo(readObject(value), name)) return true;
    }
  }
  return false;
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
