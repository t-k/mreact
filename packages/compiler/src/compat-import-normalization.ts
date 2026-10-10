import { parseSync } from "oxc-parser";
import { readArray, readObject, readSource } from "./oxc-node-utils.js";
import type { CompilerModuleContext } from "./compiler-module-context.js";

// These public hooks do not observe the call receiver. The public default is an immutable compat namespace, unlike the mutable default on mreact-compat.
const receiverIndependentHooks = new Set([
  "useState",
  "useReducer",
  "useRef",
  "useMemo",
  "useCallback",
  "useEffect",
  "useLayoutEffect",
  "useId",
  "useContext",
  "useInsertionEffect",
]);

/** @internal Narrows proven public default hook calls without changing module resolution. */
export function normalizeCompatPublicHookImports(code: string): string {
  if (!code.includes('"@reckona/mreact"') && !code.includes("'@reckona/mreact'")) return code;
  const parsed = parseSync("compat-output.js", code, { lang: "js", sourceType: "module" });
  return normalizeCompatPublicHookImportsFromContext({
    code,
    filename: "compat-output.js",
    parseErrors: parsed.errors,
    program: parsed.program,
  });
}

/** @internal Applies the same import proof to parsed source and emitted JavaScript. */
export function normalizeCompatPublicHookImportsFromContext(
  context: CompilerModuleContext,
): string {
  let { code } = context;
  if (context.parseErrors.length !== 0) return code;
  const program = readObject(context.program);
  const identifiers = new Set<string>();
  let hasEval = false;
  visit(program, (node, _parent, _grandparent, typeOnly) => {
    if (
      (node.type === "Identifier" || node.type === "JSXIdentifier") &&
      typeof node.name === "string"
    ) {
      identifiers.add(node.name);
      if (node.name === "eval" && !typeOnly) hasEval = true;
    }
  });
  if (hasEval) return code;

  const edits: Array<{ start: number; end: number; text: string }> = [];
  for (const value of readArray(program.body)) {
    const statement = readObject(value);
    if (
      statement.type !== "ImportDeclaration" ||
      statement.importKind === "type" ||
      readObject(statement.source).value !== "@reckona/mreact" ||
      readArray(statement.attributes).length !== 0
    )
      continue;
    const specifiers = readArray(statement.specifiers).map(readObject);
    const defaultSpecifier = specifiers.find(
      (specifier) => specifier.type === "ImportDefaultSpecifier",
    );
    if (defaultSpecifier === undefined) continue;
    const name = readObject(defaultSpecifier.local).name;
    if (typeof name !== "string") continue;

    const calls: Array<{ member: Record<string, unknown>; hook: string }> = [];
    let unsafe = false;
    let hasTypeReference = false;
    visit(program, (node, parent, grandparent, typeOnly) => {
      if ((node.type !== "Identifier" && node.type !== "JSXIdentifier") || node.name !== name)
        return;
      if (node === defaultSpecifier.local) return;
      if (typeOnly) {
        hasTypeReference = true;
        return;
      }
      const hook = readObject(parent.property).name;
      if (
        parent.type !== "MemberExpression" ||
        parent.object !== node ||
        parent.computed !== false ||
        parent.optional === true ||
        typeof hook !== "string" ||
        !receiverIndependentHooks.has(hook) ||
        grandparent.type !== "CallExpression" ||
        grandparent.callee !== parent ||
        grandparent.optional === true
      ) {
        unsafe = true;
        return;
      }
      calls.push({ member: parent, hook });
    });
    if (unsafe || calls.length === 0) continue;

    const aliases = new Map<string, string>();
    for (const { member, hook } of calls) {
      let alias = aliases.get(hook);
      if (alias === undefined) {
        const base = `_react_${hook}`;
        alias = base;
        let suffix = 0;
        while (identifiers.has(alias)) alias = `${base}$${++suffix}`;
        identifiers.add(alias);
        aliases.set(hook, alias);
      }
      edits.push({ start: member.start as number, end: member.end as number, text: alias });
    }
    const remaining = specifiers.filter((specifier) => specifier !== defaultSpecifier);
    const original =
      remaining.length === 0
        ? ""
        : `import ${remaining[0]?.type === "ImportNamespaceSpecifier" ? readSource(code, remaining[0]) : `{ ${remaining.map((specifier) => readSource(code, specifier)).join(", ")} }`} from "@reckona/mreact";\n`;
    const named = [...aliases].map(([hook, alias]) => `${hook} as ${alias}`).join(", ");
    edits.push({
      start: statement.start as number,
      end: statement.end as number,
      text: `${hasTypeReference ? `import type ${name} from "@reckona/mreact";\n` : ""}${original}import { ${named} } from "@reckona/mreact";`,
    });
  }
  edits.sort((a, b) => b.start - a.start);
  for (const edit of edits) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  return code;
}

function visit(
  value: unknown,
  visitor: (
    node: Record<string, unknown>,
    parent: Record<string, unknown>,
    grandparent: Record<string, unknown>,
    typeOnly: boolean,
  ) => void,
  parent: Record<string, unknown> = {},
  grandparent: Record<string, unknown> = {},
  typeOnly = false,
): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const child of value) visit(child, visitor, parent, grandparent, typeOnly);
    return;
  }
  const node = value as Record<string, unknown>;
  // Classify erased declarations and type edges rather than skipping TS nodes:
  // assertions, instantiations, enums, and namespaces still contain runtime code.
  typeOnly ||=
    node.type === "TSTypeAliasDeclaration" ||
    node.type === "TSInterfaceDeclaration" ||
    node.type === "TSDeclareFunction" ||
    node.importKind === "type" ||
    node.exportKind === "type";
  visitor(node, parent, grandparent, typeOnly);
  for (const [key, child] of Object.entries(node)) {
    const childTypeOnly =
      typeOnly ||
      key === "typeAnnotation" ||
      key === "typeParameters" ||
      key === "typeArguments" ||
      key === "returnType" ||
      key === "superTypeArguments" ||
      key === "implements";
    visit(child, visitor, node, parent, childTypeOnly);
  }
}
