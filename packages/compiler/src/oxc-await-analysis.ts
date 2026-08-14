import { readOxcJsxTagName } from "./oxc-jsx-attributes.js";
import { readArray, readObject, readSource, unwrapOxcParentheses } from "./oxc-node-utils.js";

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

export function detectUnserializableAwaitValueReason(
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

  if (type === "FunctionExpression" || type === "ArrowFunctionExpression") {
    return "function expressions cannot be JSON-serialized";
  }

  return undefined;
}

export function collectOxcVariableInitializers(
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

export function readOxcExpressionAttribute(
  code: string,
  attributes: readonly unknown[],
  name: string,
): string | undefined {
  const expression = readOxcExpressionAttributeNode(attributes, name);
  return expression === undefined ? undefined : readSource(code, expression);
}

export function readOxcExpressionAttributeNode(
  attributes: readonly unknown[],
  name: string,
): Record<string, unknown> | undefined {
  for (const attr of attributes) {
    const object = readObject(attr);

    if (object.type !== "JSXAttribute" || readOxcJsxTagName(readObject(object.name)) !== name) {
      continue;
    }

    const value = readObject(object.value);

    if (value.type === "JSXExpressionContainer") {
      return unwrapOxcParentheses(readObject(value.expression));
    }
  }

  return undefined;
}
