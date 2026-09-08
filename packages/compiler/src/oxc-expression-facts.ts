import { collectOxcFunctionBodyBindingNames } from "./oxc-bindings.js";
import type { ExpressionFactsIr, ResolvedBindingIr } from "./expression-facts.js";
import { readArray, readObject, unwrapOxcParentheses } from "./oxc-node-utils.js";

const NATIVE_CELL_MODULE = "@reckona/mreact-reactive-core";
const NATIVE_CELL_EXPORT = "cell";

/** Collects the local names that static imports bind to the reactive-core cell factory. */
export function collectOxcNativeCellFactoryNames(statements: readonly unknown[]): Set<string> {
  const names = new Set<string>();

  for (const statement of statements) {
    const object = readObject(statement);

    if (object.type !== "ImportDeclaration") {
      continue;
    }

    if (readObject(object.source).value !== NATIVE_CELL_MODULE) {
      continue;
    }

    for (const specifierValue of readArray(object.specifiers)) {
      const specifier = readObject(specifierValue);
      // Default and namespace specifiers carry no `imported` node, so the name
      // check below already rejects them.
      const imported = readObject(specifier.imported);
      const local = readObject(specifier.local);

      if (imported.name !== NATIVE_CELL_EXPORT || typeof local.name !== "string") {
        continue;
      }

      names.add(local.name);
    }
  }

  return names;
}

/**
 * Collects `const name = cell(...)` bindings, keyed by name and carrying the
 * declarator span so a later consumer can tell two same-spelled bindings apart.
 */
export function collectOxcNativeCellBindings(
  statements: readonly unknown[],
  factoryNames: ReadonlySet<string>,
): Map<string, ResolvedBindingIr> {
  const bindings = new Map<string, ResolvedBindingIr>();

  if (factoryNames.size === 0) {
    return bindings;
  }

  for (const statement of statements) {
    const object = readObject(statement);
    const declaration =
      object.type === "ExportNamedDeclaration" ? readObject(object.declaration) : object;

    if (declaration.type !== "VariableDeclaration" || declaration.kind !== "const") {
      continue;
    }

    for (const declaratorValue of readArray(declaration.declarations)) {
      const declarator = readObject(declaratorValue);
      const id = readObject(declarator.id);
      const initializer = unwrapOxcParentheses(readObject(declarator.init));

      if (id.type !== "Identifier" || typeof id.name !== "string") {
        continue;
      }

      if (!isOxcNativeCellFactoryCall(initializer, factoryNames)) {
        continue;
      }

      const start = declarator.start;
      const end = declarator.end;

      if (typeof start !== "number" || typeof end !== "number") {
        continue;
      }

      bindings.set(id.name, { name: id.name, start, end });
    }
  }

  return bindings;
}

/**
 * Collects identifier names whose value or members are written anywhere in the
 * analyzed tree. A binding in this set can no longer be trusted to keep the
 * `get` method the cell factory installed, so its facts are invalidated.
 */
export function collectOxcMutatedBindingNames(node: unknown): Set<string> {
  const names = new Set<string>();
  const pending: unknown[] = [node];

  while (pending.length > 0) {
    // readObject yields an empty record for primitives, so arrays and scalars
    // need no separate branch: arrays enumerate their elements by index.
    const object = readObject(pending.pop());

    if (object.type === "AssignmentExpression") {
      collectOxcWrittenBindingName(readObject(object.left), names);
    }

    if (object.type === "UpdateExpression") {
      collectOxcWrittenBindingName(readObject(object.argument), names);
    }

    if (object.type === "UnaryExpression" && object.operator === "delete") {
      collectOxcWrittenBindingName(readObject(object.argument), names);
    }

    for (const value of Object.values(object)) {
      pending.push(value);
    }
  }

  return names;
}

/**
 * Collects identifier names that are used anywhere other than as the receiver
 * of a plain method call such as `name.get()` or `name.set(value)`.
 *
 * Such a use may hand the cell to code that replaces its methods later, for
 * example through an alias, a helper argument or `Object.assign()`, so the
 * binding can no longer be trusted for a direct subscription. The check is
 * deliberately syntactic and conservative: over-reporting only costs the
 * optimization, never correctness.
 */
export function collectOxcEscapedBindingNames(node: unknown): Set<string> {
  const names = new Set<string>();
  const pending: unknown[] = [node];

  while (pending.length > 0) {
    const object = readObject(pending.pop());

    if (object.type === "Identifier") {
      if (typeof object.name === "string") {
        names.add(object.name);
      }
      continue;
    }

    // An exported cell can be rewired by any importing module, which this
    // single-module analysis cannot see, so `export const name = cell()` is
    // treated as an escape. `export { name }` escapes through its `local`
    // identifier, which is visited like any other use below.
    if (object.type === "ExportNamedDeclaration") {
      collectOxcExportedDeclarationNames(readObject(object.declaration), names);
    }

    for (const [key, value] of Object.entries(object)) {
      if (isOxcNonEscapingIdentifierSlot(object, key)) {
        continue;
      }

      pending.push(value);
    }
  }

  return names;
}

function collectOxcExportedDeclarationNames(
  declaration: Record<string, unknown>,
  names: Set<string>,
): void {
  if (declaration.type !== "VariableDeclaration" || !Array.isArray(declaration.declarations)) {
    return;
  }

  for (const declarator of declaration.declarations) {
    const id = readObject(readObject(declarator).id);

    if (id.type === "Identifier" && typeof id.name === "string") {
      names.add(id.name);
    }
  }
}

function isOxcNonEscapingIdentifierSlot(object: Record<string, unknown>, key: string): boolean {
  switch (object.type) {
    case "CallExpression": {
      if (key !== "callee") {
        return false;
      }

      // `name.method(...)`: the receiver identifier stays put, but the callee
      // member expression still has to be visited for computed properties.
      const callee = unwrapOxcParentheses(readObject(object.callee));
      return (
        callee.type === "MemberExpression" &&
        callee.computed !== true &&
        unwrapOxcParentheses(readObject(callee.object)).type === "Identifier" &&
        readObject(callee.property).type === "Identifier"
      );
    }
    case "MemberExpression":
      return key === "property" && object.computed !== true;
    case "Property":
    case "MethodDefinition":
    case "PropertyDefinition":
      return key === "key" && object.computed !== true;
    case "VariableDeclarator":
      return key === "id" && readObject(object.id).type === "Identifier";
    case "ImportSpecifier":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
      return true;
    case "ExportSpecifier":
      return key !== "local";
    default:
      return false;
  }
}

/**
 * Analyzes one lowered JSX expression against the supported facts subset.
 *
 * Returns `undefined` when nothing could be proven, so unsupported inputs keep
 * their existing IR shape and emitted output byte for byte.
 */
export function analyzeOxcExpressionFacts(
  expression: Record<string, unknown>,
  nativeCellBindings: ReadonlyMap<string, ResolvedBindingIr> | undefined,
): ExpressionFactsIr | undefined {
  const binding = readOxcNativeCellReadBinding(expression, nativeCellBindings);

  if (binding !== undefined) {
    return {
      value: { kind: "native-cell-read", binding },
      dependencies: [binding],
      effectFree: "proven",
      escape: "unknown",
    };
  }

  return isOxcRenderablePrimitiveExpression(expression) ? RENDERABLE_PRIMITIVE_FACTS : undefined;
}

/** Facts for an expression that reads a prop of the component it appears in. */
export const COMPONENT_PROP_READ_FACTS: ExpressionFactsIr = Object.freeze({
  value: Object.freeze({ kind: "component-prop-read" }) as ExpressionFactsIr["value"],
  effectFree: "unknown",
  escape: "unknown",
});

/** Facts for an expression proven to evaluate to a primitive render value. */
export const RENDERABLE_PRIMITIVE_FACTS: ExpressionFactsIr = Object.freeze({
  value: Object.freeze({ kind: "renderable-primitive" }) as ExpressionFactsIr["value"],
  dependencies: Object.freeze([]) as unknown as ResolvedBindingIr[],
  effectFree: "proven",
  escape: "contained",
});

/**
 * Reports whether an expression can only ever evaluate to a primitive.
 *
 * The supported subset is deliberately syntactic: literals, `undefined`, and
 * template literals with no substitutions. Anything that reads a binding or
 * calls a function stays unknown.
 */
function isOxcRenderablePrimitiveExpression(expression: Record<string, unknown>): boolean {
  const unwrapped = unwrapOxcParentheses(expression);

  if (unwrapped.type === "Literal") {
    return true;
  }

  if (unwrapped.type === "TemplateLiteral") {
    return readArray(unwrapped.expressions).length === 0;
  }

  return unwrapped.type === "Identifier" && unwrapped.name === "undefined";
}

function readOxcNativeCellReadBinding(
  expression: Record<string, unknown>,
  nativeCellBindings: ReadonlyMap<string, ResolvedBindingIr> | undefined,
): ResolvedBindingIr | undefined {
  // Optional calls and optional member access parse as ChainExpression, which
  // the CallExpression and MemberExpression checks already reject.
  const call = unwrapOxcParentheses(expression);

  if (call.type !== "CallExpression") {
    return undefined;
  }

  if (readArray(call.arguments).length !== 0) {
    return undefined;
  }

  const callee = unwrapOxcParentheses(readObject(call.callee));

  if (
    callee.type !== "MemberExpression" ||
    callee.computed === true ||
    readObject(callee.property).name !== "get"
  ) {
    return undefined;
  }

  const receiver = unwrapOxcParentheses(readObject(callee.object));

  if (receiver.type !== "Identifier" || typeof receiver.name !== "string") {
    return undefined;
  }

  return nativeCellBindings?.get(receiver.name);
}

function isOxcNativeCellFactoryCall(
  initializer: Record<string, unknown>,
  factoryNames: ReadonlySet<string>,
): boolean {
  if (initializer.type !== "CallExpression") {
    return false;
  }

  const callee = unwrapOxcParentheses(readObject(initializer.callee));

  return callee.type === "Identifier" && factoryNames.has(callee.name as string);
}

function collectOxcWrittenBindingName(target: Record<string, unknown>, names: Set<string>): void {
  const unwrapped = unwrapOxcParentheses(target);

  if (unwrapped.type === "Identifier" && typeof unwrapped.name === "string") {
    names.add(unwrapped.name);
    return;
  }

  if (unwrapped.type !== "MemberExpression") {
    return;
  }

  const object = unwrapOxcParentheses(readObject(unwrapped.object));

  if (object.type === "Identifier" && typeof object.name === "string") {
    names.add(object.name);
  }
}

/** Groups the module-wide inputs required to resolve expression facts inside a component. */
export interface OxcModuleExpressionFacts {
  nativeCellFactoryNames: ReadonlySet<string>;
  moduleNativeCellBindings: ReadonlyMap<string, ResolvedBindingIr>;
  mutatedBindingNames: ReadonlySet<string>;
  escapedBindingNames: ReadonlySet<string>;
}

/** Collects the module-wide facts inputs once per analyzed program. */
export function collectOxcModuleExpressionFacts(
  program: unknown,
  statements: readonly unknown[],
): OxcModuleExpressionFacts {
  const nativeCellFactoryNames = collectOxcNativeCellFactoryNames(statements);

  return {
    nativeCellFactoryNames,
    moduleNativeCellBindings:
      nativeCellFactoryNames.size === 0
        ? new Map<string, ResolvedBindingIr>()
        : collectOxcNativeCellBindings(statements, nativeCellFactoryNames),
    mutatedBindingNames:
      nativeCellFactoryNames.size === 0
        ? new Set<string>()
        : collectOxcMutatedBindingNames(program),
    escapedBindingNames:
      nativeCellFactoryNames.size === 0
        ? new Set<string>()
        : collectOxcEscapedBindingNames(program),
  };
}

/**
 * Resolves the cell bindings visible inside one component body.
 *
 * Component-local declarations win over module-level ones, parameters shadow
 * both, and any binding written or passed around anywhere in the module is
 * dropped: only a cell used purely as a method call receiver keeps its facts.
 */
export function resolveOxcComponentNativeCellBindings(
  moduleFacts: OxcModuleExpressionFacts | undefined,
  bodyStatements: readonly unknown[],
  shadowingNames: readonly string[],
): Map<string, ResolvedBindingIr> | undefined {
  if (moduleFacts === undefined || moduleFacts.nativeCellFactoryNames.size === 0) {
    return undefined;
  }

  const bindings = new Map<string, ResolvedBindingIr>(moduleFacts.moduleNativeCellBindings);

  const localNames = collectOxcFunctionBodyBindingNames(bodyStatements);
  const factoryNames = new Set(moduleFacts.nativeCellFactoryNames);
  for (const name of localNames) {
    bindings.delete(name);
    factoryNames.delete(name);
  }
  for (const name of shadowingNames) factoryNames.delete(name);

  for (const [name, binding] of collectOxcNativeCellBindings(bodyStatements, factoryNames)) {
    bindings.set(name, binding);
  }

  for (const name of shadowingNames) {
    bindings.delete(name);
  }

  for (const name of moduleFacts.mutatedBindingNames) {
    bindings.delete(name);
  }

  for (const name of moduleFacts.escapedBindingNames) {
    bindings.delete(name);
  }

  return bindings.size === 0 ? undefined : bindings;
}
