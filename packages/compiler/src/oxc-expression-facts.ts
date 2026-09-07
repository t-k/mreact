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

  if (binding === undefined) {
    return undefined;
  }

  return {
    value: { kind: "native-cell-read", binding },
    dependencies: [binding],
    effectFree: "proven",
    escape: "unknown",
  };
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
  };
}

/**
 * Resolves the cell bindings visible inside one component body.
 *
 * Component-local declarations win over module-level ones, parameters shadow
 * both, and any binding written anywhere in the module is dropped.
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

  for (const [name, binding] of collectOxcNativeCellBindings(
    bodyStatements,
    moduleFacts.nativeCellFactoryNames,
  )) {
    bindings.set(name, binding);
  }

  for (const name of shadowingNames) {
    bindings.delete(name);
  }

  for (const name of moduleFacts.mutatedBindingNames) {
    bindings.delete(name);
  }

  return bindings.size === 0 ? undefined : bindings;
}
