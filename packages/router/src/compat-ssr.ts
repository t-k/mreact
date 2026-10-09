import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createCompilerModuleContext } from "@reckona/mreact-compiler/internal";
import { sourceModuleCandidates } from "./source-modules.js";
import {
  compatContextModuleNames,
  hasCompatContextReflection,
  isCompatContextInitializer,
  unsafeCompatContextUse,
  type CompatContextBindings,
} from "./compat-ssr-context.js";

type AstNode = Record<string, unknown>;
const object = (value: unknown): AstNode =>
  value !== null && typeof value === "object" ? (value as AstNode) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const exportName = (value: unknown): string => String(object(value).name ?? object(value).value);
const safeHookSubpathImports = new Set([
  "useState",
  "useReducer",
  "useRef",
  "useId",
  "useMemo",
  "useCallback",
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
]);
const safeHooks = new Set([...safeHookSubpathImports, "useContext", "createContext", "Fragment"]);
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
  const proven = new Map<string, ReadonlySet<string>>();
  const programs = new Map<string, unknown>();
  let hasContext = false;
  let reason: string | undefined;
  const reject = (file: string, detail: string): undefined => {
    reason ??= `${file}: ${detail}; keeping the client-only boundary.`;
    return undefined;
  };
  async function visit(file: string): Promise<ReadonlySet<string> | undefined> {
    if (proven.has(file)) return proven.get(file);
    if (visiting.has(file))
      return reject(file, "Circular runtime dependency is not proven safe for SSR");
    visiting.add(file);
    try {
      const code = await readFile(file, "utf8");
      const context = createCompilerModuleContext({ code, filename: file });
      if (context.parseErrors.length !== 0) return reject(file, "Module could not be parsed");
      // Native JSX helpers produce HTML strings, not compat ReactNodes.
      if (!isCompatSsrFilename(file) && containsJsx(context.program))
        return reject(file, "Native JSX dependency does not produce compatibility ReactNodes");
      const body = list(object(context.program).body);
      const bindings: CompatContextBindings = {
        contexts: new Set(),
        factories: new Set(),
        readers: new Set(),
      };
      const reexportedContexts = new Set<string>();
      // Resolve imports before declarations, regardless of their position in the source module.
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
          if (typeof source !== "string") return reject(file, "Unknown runtime import");
          if (node.type === "ImportDeclaration" && list(node.specifiers).length === 0)
            return reject(file, "Side-effect import is not proven safe for SSR");
          if (
            source === "@reckona/mreact" ||
            source === "@reckona/mreact-compat" ||
            source === "react" ||
            source === "@reckona/mreact-compat/hooks"
          ) {
            const allowedImports =
              source === "@reckona/mreact-compat/hooks" ? safeHookSubpathImports : safeHooks;
            if (
              node.type !== "ImportDeclaration" ||
              !list(node.specifiers).every(
                (spec) =>
                  object(spec).importKind === "type" ||
                  (object(spec).type === "ImportSpecifier" &&
                    allowedImports.has(String(object(object(spec).imported).name))),
              )
            )
              return reject(file, `Unsupported compatibility import from ${source}`);
            for (const value of list(node.specifiers)) {
              const spec = object(value);
              if (spec.importKind === "type") continue;
              const imported = object(spec.imported).name;
              const local = String(object(spec.local).name);
              if (imported === "createContext") bindings.factories.add(local);
              if (imported === "useContext") bindings.readers.add(local);
            }
            continue;
          }
          if (!source.startsWith(".")) return reject(file, `Unknown runtime package ${source}`);
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
          if (dependency === undefined)
            return reject(file, `Runtime dependency ${source} could not be resolved`);
          const exportedContexts = await visit(dependency);
          if (exportedContexts === undefined) return undefined;
          if (node.type === "ExportAllDeclaration") {
            if (node.exported != null && exportedContexts.size > 0)
              return reject(file, "Namespace Context re-export is not supported");
            for (const name of exportedContexts)
              if (name !== "default") reexportedContexts.add(name);
          } else {
            for (const value of list(node.specifiers)) {
              const spec = object(value);
              if (spec.importKind === "type" || spec.exportKind === "type") continue;
              if (node.type === "ImportDeclaration") {
                if (spec.type === "ImportNamespaceSpecifier" && exportedContexts.size > 0)
                  return reject(file, "Namespace Context import is not supported");
                const imported =
                  spec.type === "ImportDefaultSpecifier" ? "default" : exportName(spec.imported);
                if (exportedContexts.has(imported))
                  bindings.contexts.add(String(object(spec.local).name));
              } else if (exportedContexts.has(exportName(spec.local))) {
                reexportedContexts.add(exportName(spec.exported));
              }
            }
          }
          continue;
        }
      }
      const moduleNames = compatContextModuleNames(context.program);
      for (const value of body) {
        const node = object(value);
        if (
          node.type === "ImportDeclaration" ||
          node.type === "ExportAllDeclaration" ||
          (node.type === "ExportNamedDeclaration" && node.source != null)
        )
          continue;
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
          list(declaration.declarations).every((item) => {
            const binding = object(item);
            if (
              isCompatContextInitializer(binding.init, bindings.factories, moduleNames) &&
              object(binding.id).type === "Identifier"
            ) {
              bindings.contexts.add(String(object(binding.id).name));
              return true;
            }
            return pureInitializer(binding.init);
          })
        )
          continue;
        return reject(file, "Module-level initialization is not proven safe for SSR");
      }
      if (hasUnsafeSyntax(context.program, new Set()))
        return reject(
          file,
          "Browser, nondeterministic, or mutable syntax is not proven safe for SSR",
        );
      const unsafeContext = unsafeCompatContextUse(context.program, bindings);
      if (unsafeContext !== undefined) return reject(file, unsafeContext);
      hasContext ||= bindings.contexts.size > 0;
      programs.set(file, context.program);
      for (const value of body) {
        const node = object(value);
        if (
          node.type !== "ExportNamedDeclaration" ||
          node.source != null ||
          node.exportKind === "type"
        )
          continue;
        for (const value of list(object(node.declaration).declarations)) {
          const name = String(object(object(value).id).name);
          if (bindings.contexts.has(name)) reexportedContexts.add(name);
        }
        for (const value of list(node.specifiers)) {
          const spec = object(value);
          if (spec.exportKind !== "type" && bindings.contexts.has(exportName(spec.local)))
            reexportedContexts.add(exportName(spec.exported));
        }
      }
      proven.set(file, reexportedContexts);
      return reexportedContexts;
    } catch {
      return reject(file, "Runtime dependency could not be analyzed");
    } finally {
      visiting.delete(file);
    }
  }
  let eligible = isCompatSsrFilename(filename) && (await visit(filename)) !== undefined;
  if (eligible && hasContext) {
    // The ordinary syntax check also excludes Object/Reflect and dynamic property access.
    for (const [file, program] of programs) {
      if (hasCompatContextReflection(program)) {
        reject(
          file,
          "ReactElement type introspection or JSON reflection can expose Context identity",
        );
        eligible = false;
        break;
      }
    }
  }
  return eligible
    ? { eligible }
    : {
        eligible,
        reason:
          reason ??
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
