import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createCompilerModuleContext } from "@reckona/mreact-compiler/internal";
import { sourceModuleCandidates } from "./source-modules.js";

type AstNode = Record<string, unknown>;
const object = (value: unknown): AstNode =>
  value !== null && typeof value === "object" ? (value as AstNode) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const safeHooks = new Set([
  "useState",
  "useReducer",
  "useRef",
  "useId",
  "useMemo",
  "useCallback",
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
  "useContext",
  "createContext",
  "Fragment",
]);
const unsafeNames = new Set([
  "window",
  "document",
  "navigator",
  "location",
  "history",
  "localStorage",
  "sessionStorage",
  "globalThis",
  "global",
  "self",
  "process",
  "Deno",
  "Bun",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "Worker",
  "Date",
  "performance",
  "crypto",
  "eval",
  "Function",
  "require",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
]);

export function isCompatSsrFilename(filename: string): boolean {
  return /\.compat(?:\.mreact)?\.[cm]?[jt]sx?$/.test(filename);
}

/** Conservatively checks every runtime dependency without evaluating application modules. */
export async function analyzeCompatSsrEligibility(
  filename: string,
): Promise<{ eligible: boolean; reason?: string }> {
  const visiting = new Set<string>();
  const proven = new Set<string>();
  async function visit(file: string): Promise<boolean> {
    // Stryker disable next-line ConditionalExpression: bypassing a successful cache changes work, not eligibility.
    if (proven.has(file)) return true;
    if (visiting.has(file)) return false;
    visiting.add(file);
    try {
      const code = await readFile(file, "utf8");
      const context = createCompilerModuleContext({ code, filename: file });
      if (context.parseErrors.length !== 0) return false;
      // Native JSX helpers produce HTML strings, not compat ReactNodes.
      if (!isCompatSsrFilename(file) && containsJsx(context.program)) return false;
      const body = list(object(context.program).body);
      for (const value of body) {
        const node = object(value);
        if (
          node.type === "ImportDeclaration" ||
          node.type === "ExportAllDeclaration" ||
          (node.type === "ExportNamedDeclaration" &&
            node.source !== null &&
            node.source !== undefined)
        ) {
          if (node.importKind === "type" || node.exportKind === "type") continue;
          const source = object(node.source).value;
          if (typeof source !== "string") return false;
          if (node.type === "ImportDeclaration" && list(node.specifiers).length === 0) return false;
          if (source === "@reckona/mreact-compat" || source === "react") {
            if (
              node.type !== "ImportDeclaration" ||
              !list(node.specifiers).every(
                (spec) =>
                  object(spec).importKind === "type" ||
                  (object(spec).type === "ImportSpecifier" &&
                    safeHooks.has(String(object(object(spec).imported).name))),
              )
            )
              return false;
            continue;
          }
          if (!source.startsWith(".")) return false;
          let dependency: string | undefined;
          for (const candidate of sourceModuleCandidates(resolve(dirname(file), source))) {
            try {
              await readFile(candidate, "utf8");
              dependency = candidate;
              break;
            } catch {
              /* Try the next source extension. */
            }
          }
          if (dependency === undefined || !(await visit(dependency))) return false;
          continue;
        }
        const declaration =
          node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration"
            ? object(node.declaration)
            : node;
        if (declaration.type === undefined && node.type === "ExportNamedDeclaration") continue;
        if (
          declaration.type === "FunctionDeclaration" ||
          ["TSTypeAliasDeclaration", "TSInterfaceDeclaration"].includes(String(declaration.type))
        )
          continue;
        if (
          declaration.type === "VariableDeclaration" &&
          declaration.kind === "const" &&
          list(declaration.declarations).every((item) => pureInitializer(object(item).init))
        )
          continue;
        return false;
      }
      if (hasUnsafeSyntax(context.program, new Set())) return false;
      proven.add(file);
      return true;
    } catch {
      return false;
    } finally {
      visiting.delete(file);
    }
  }
  const eligible = isCompatSsrFilename(filename) && (await visit(filename));
  return eligible
    ? { eligible }
    : {
        eligible,
        reason:
          "The compat module or its runtime dependencies are not proven safe for SSR; keeping the client-only boundary.",
      };
}

function pureInitializer(value: unknown): boolean {
  const node = object(value);
  if (value === null || value === undefined) return true;
  if (node.regex !== undefined) return false;
  if (
    [
      "Literal",
      "StringLiteral",
      "NumericLiteral",
      "BooleanLiteral",
      "NullLiteral",
      "ArrowFunctionExpression",
      "FunctionExpression",
    ].includes(String(node.type))
  )
    return true;

  return false;
}

function hasUnsafeSyntax(value: unknown, names: ReadonlySet<string>): boolean {
  if (Array.isArray(value)) return value.some((child) => hasUnsafeSyntax(child, names));
  if (value === null || typeof value !== "object") return false;
  const node = object(value);
  if (node.async === true || node.generator === true || node.declare === true) return true;
  if (
    [
      "Program",
      "BlockStatement",
      "FunctionDeclaration",
      "FunctionExpression",
      "ArrowFunctionExpression",
    ].includes(String(node.type))
  )
    names = scopeNames(node, names);
  if (["TSTypeAliasDeclaration", "TSInterfaceDeclaration"].includes(String(node.type)))
    return false;
  if (
    node.type === "Identifier" &&
    (unsafeNames.has(String(node.name)) ||
      (!names.has(String(node.name)) &&
        ![
          "undefined",
          "NaN",
          "Infinity",
          "Math",
          "String",
          "Number",
          "Boolean",
          "JSON",
          "Array",
        ].includes(String(node.name))))
  )
    return true;
  if (
    [
      "ImportExpression",
      "NewExpression",
      "AwaitExpression",
      "YieldExpression",
      "WithStatement",
      "TSEnumDeclaration",
      "TSModuleDeclaration",
      "AssignmentExpression",
      "UpdateExpression",
    ].includes(String(node.type))
  )
    return true;
  if (
    node.type === "MemberExpression" &&
    object(node.object).name === "Math" &&
    (node.computed === true || object(node.property).name === "random")
  )
    return true;
  if (
    node.type === "MemberExpression" &&
    ["constructor", "prototype", "__proto__", "random"].includes(
      String(object(node.property).name ?? object(node.property).value),
    )
  )
    return true;
  if (
    node.type === "MemberExpression" &&
    node.computed === true &&
    object(node.property).type !== "Literal"
  )
    return true;
  if (
    node.type === "Property" &&
    ["constructor", "prototype", "__proto__", "random"].includes(
      String(object(node.key).name ?? object(node.key).value),
    )
  )
    return true;
  if (node.type === "Property" && node.computed === true && object(node.key).type !== "Literal")
    return true;
  if (node.type === "JSXOpeningElement") {
    let component = object(node.name);
    const member = component.type === "JSXMemberExpression";
    while (component.type === "JSXMemberExpression") component = object(component.object);
    const name = String(component.name);
    if ((member || /^[A-Z]/.test(name)) && (!names.has(name) || unsafeNames.has(name))) return true;
  }
  if (node.type === "CallExpression") {
    const callee = object(node.callee);
    if (
      callee.type === "Identifier" &&
      !names.has(String(callee.name)) &&
      !["String", "Number", "Boolean"].includes(String(callee.name))
    )
      return true;
  }
  if (
    node.type === "ImportDeclaration" ||
    node.type === "ExportAllDeclaration" ||
    (node.type === "ExportNamedDeclaration" && node.source != null)
  )
    return false;
  return Object.entries(node).some(([key, child]) => {
    if (["typeAnnotation", "typeParameters", "typeArguments", "returnType"].includes(key))
      return false;
    if (key === "property" && node.type === "MemberExpression" && node.computed !== true)
      return false;
    if (
      key === "key" &&
      ["Property", "MethodDefinition"].includes(String(node.type)) &&
      node.computed !== true
    )
      return false;
    if (key === "exported" && node.type === "ExportSpecifier") return false;
    return hasUnsafeSyntax(child, names);
  });
}

function scopeNames(node: AstNode, inherited: ReadonlySet<string>): ReadonlySet<string> {
  const names = new Set(inherited);
  const bind = (value: unknown): void => {
    const pattern = object(value);
    if (pattern.type === "Identifier") names.add(String(pattern.name));
    else if (pattern.type === "RestElement") bind(pattern.argument);
    else if (pattern.type === "AssignmentPattern") bind(pattern.left);
    else if (pattern.type === "ArrayPattern") list(pattern.elements).forEach(bind);
    else if (pattern.type === "ObjectPattern")
      list(pattern.properties).forEach((prop) => bind(object(prop).value ?? object(prop).argument));
  };
  bind(node.id);
  list(node.params).forEach(bind);
  for (const statement of list(node.body)) {
    const item = object(statement);
    const declaration =
      item.type === "ExportNamedDeclaration" || item.type === "ExportDefaultDeclaration"
        ? object(item.declaration)
        : item;
    if (declaration.type === "VariableDeclaration")
      list(declaration.declarations).forEach((value) => bind(object(value).id));
    if (declaration.type === "FunctionDeclaration") bind(declaration.id);
    if (item.type === "ImportDeclaration")
      list(item.specifiers).forEach((value) => bind(object(value).local));
  }
  return names;
}

function containsJsx(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsJsx);
  if (value === null || typeof value !== "object") return false;
  const node = object(value);
  return (
    node.type === "JSXElement" ||
    node.type === "JSXFragment" ||
    Object.values(node).some(containsJsx)
  );
}
