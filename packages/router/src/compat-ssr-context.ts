type AstNode = Record<string, unknown>;
const object = (value: unknown): AstNode =>
  value !== null && typeof value === "object" ? (value as AstNode) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Tracks Context identities without evaluating application modules or arbitrary factories. */
export interface CompatContextBindings {
  contexts: Set<string>;
  factories: Set<string>;
  readers: Set<string>;
}

export function unwrapContextExpression(value: unknown): AstNode {
  let node = object(value);
  while (
    [
      "TSAsExpression",
      "TSTypeAssertion",
      "TSNonNullExpression",
      "TSSatisfiesExpression",
      "ParenthesizedExpression",
    ].includes(String(node.type))
  )
    node = object(node.expression);
  return node;
}

/** Only primitive defaults avoid introducing shared mutable application data into SSR. */
export function isCompatContextInitializer(
  value: unknown,
  factories: ReadonlySet<string>,
  moduleNames: ReadonlySet<string>,
): boolean {
  const node = unwrapContextExpression(value);
  const callee = object(node.callee);
  const args = list(node.arguments);
  if (
    node.type !== "CallExpression" ||
    node.optional === true ||
    callee.type !== "Identifier" ||
    !factories.has(String(callee.name)) ||
    args.length !== 1
  )
    return false;
  const argument = unwrapContextExpression(args[0]);
  if (argument.type === "Identifier")
    return argument.name === "undefined" && !moduleNames.has("undefined");
  const literal =
    argument.type === "UnaryExpression" && ["-", "+"].includes(String(argument.operator))
      ? object(argument.argument)
      : argument;
  if (literal.type !== "Literal" || literal.regex !== undefined || literal.bigint !== undefined)
    return false;
  const primitive = literal.value;
  if (argument !== literal) return typeof primitive === "number" && Number.isFinite(primitive);
  return (
    primitive === null ||
    typeof primitive === "string" ||
    typeof primitive === "boolean" ||
    (typeof primitive === "number" && Number.isFinite(primitive))
  );
}

function bindingNames(value: unknown): string[] {
  const node = object(value);
  if (node.type === "Identifier") return [String(node.name)];
  if (node.type === "RestElement") return bindingNames(node.argument);
  if (node.type === "AssignmentPattern") return bindingNames(node.left);
  if (node.type === "ArrayPattern") return list(node.elements).flatMap(bindingNames);
  if (node.type === "ObjectPattern")
    return list(node.properties).flatMap((value) => {
      const property = object(value);
      return bindingNames(property.type === "RestElement" ? property.argument : property.value);
    });
  return [];
}

function declarationNames(value: unknown): string[] {
  const node = object(value);
  if (node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration")
    return declarationNames(node.declaration);
  if (node.type === "VariableDeclaration")
    return list(node.declarations).flatMap((value) => bindingNames(object(value).id));
  if (node.type === "ImportDeclaration")
    return list(node.specifiers).flatMap((value) => bindingNames(object(value).local));
  if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration")
    return bindingNames(node.id);
  return [];
}

export function compatContextModuleNames(program: unknown): Set<string> {
  return new Set(list(object(program).body).flatMap(declarationNames));
}

/** ReactElement types can expose Context identities, including through otherwise pure helpers. */
export function hasCompatContextReflection(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasCompatContextReflection);
  const node = object(value);
  if (["TSTypeAliasDeclaration", "TSInterfaceDeclaration"].includes(String(node.type)))
    return false;
  if (node.type === "Identifier" && node.name === "JSON") return true;
  const property = node.type === "Property" ? object(node.key) : object(node.property);
  if (
    ["MemberExpression", "JSXMemberExpression", "Property"].includes(String(node.type)) &&
    (property.name ?? property.value) === "type"
  )
    return true;
  return Object.entries(node).some(
    ([key, child]) =>
      !["typeAnnotation", "typeParameters", "typeArguments", "returnType"].includes(key) &&
      hasCompatContextReflection(child),
  );
}

function hoistedVarNames(value: unknown): string[] {
  const node = object(value);
  if (
    [
      "FunctionDeclaration",
      "FunctionExpression",
      "ArrowFunctionExpression",
      "ClassDeclaration",
      "ClassExpression",
      "StaticBlock",
    ].includes(String(node.type))
  )
    return [];
  if (node.type === "VariableDeclaration" && node.kind === "var") return declarationNames(node);
  if (Array.isArray(value)) return value.flatMap(hoistedVarNames);
  return Object.values(node).flatMap(hoistedVarNames);
}

function shadowBindings(bindings: CompatContextBindings, names: string[]): CompatContextBindings {
  const without = (set: Set<string>) => new Set([...set].filter((name) => !names.includes(name)));
  return {
    contexts: without(bindings.contexts),
    factories: without(bindings.factories),
    readers: without(bindings.readers),
  };
}

/** Context values may flow only through known reads, provider tags, and module exports. */
export function unsafeCompatContextUse(
  program: unknown,
  bindings: CompatContextBindings,
): string | undefined {
  function visit(value: unknown, scope: CompatContextBindings): string | undefined {
    if (Array.isArray(value)) {
      for (const child of value) {
        const reason = visit(child, scope);
        if (reason !== undefined) return reason;
      }
      return undefined;
    }
    const node = object(value);
    const type = String(node.type);
    if (["TSTypeAliasDeclaration", "TSInterfaceDeclaration"].includes(type)) return undefined;
    if (["ImportDeclaration", "ExportAllDeclaration"].includes(type)) return undefined;
    if (type === "ExportNamedDeclaration" && node.source != null) return undefined;
    if (type === "ClassDeclaration" || type === "ClassExpression")
      scope = shadowBindings(scope, bindingNames(node.id));
    if (["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(type)) {
      const parameterScope = shadowBindings(scope, [
        ...bindingNames(node.id),
        ...list(node.params).flatMap(bindingNames),
      ]);
      for (const param of list(node.params)) {
        const reason = visitPatternDefaults(param, parameterScope);
        if (reason !== undefined) return reason;
      }
      return visit(node.body, shadowBindings(parameterScope, hoistedVarNames(node.body)));
    }
    if (type === "BlockStatement")
      scope = shadowBindings(scope, list(node.body).flatMap(declarationNames));
    if (type === "StaticBlock")
      scope = shadowBindings(scope, [
        ...list(node.body).flatMap(declarationNames),
        ...hoistedVarNames(node.body),
      ]);
    if (type === "SwitchStatement") {
      const reason = visit(node.discriminant, scope);
      if (reason !== undefined) return reason;
      return visit(
        node.cases,
        shadowBindings(
          scope,
          list(node.cases).flatMap((item) =>
            list(object(item).consequent).flatMap(declarationNames),
          ),
        ),
      );
    }
    if (["ForStatement", "ForInStatement", "ForOfStatement"].includes(type))
      scope = shadowBindings(scope, declarationNames(node.init ?? node.left));
    if (type === "CatchClause") {
      scope = shadowBindings(scope, bindingNames(node.param));
      return visitPatternDefaults(node.param, scope) ?? visit(node.body, scope);
    }
    if (type === "Identifier" && scope.contexts.has(String(node.name)))
      return `Context ${node.name} escapes its provider/read boundary`;
    if (type === "CallExpression" && node.optional !== true) {
      const callee = object(node.callee);
      const args = list(node.arguments);
      const context = unwrapContextExpression(args[0]);
      if (
        callee.type === "Identifier" &&
        scope.readers.has(String(callee.name)) &&
        args.length === 1 &&
        context.type === "Identifier" &&
        scope.contexts.has(String(context.name))
      )
        return undefined;
    }
    if (type === "JSXOpeningElement" || type === "JSXClosingElement") {
      const name = object(node.name);
      let root = name;
      while (root.type === "JSXMemberExpression") root = object(root.object);
      if (scope.contexts.has(String(root.name))) {
        if (
          name.type !== "JSXIdentifier" &&
          !(
            name.type === "JSXMemberExpression" &&
            object(name.object).type === "JSXIdentifier" &&
            ["Provider", "Consumer"].includes(String(object(name.property).name))
          )
        )
          return `Context ${root.name} uses an unsupported provider tag`;
      }
      return visit(node.attributes, scope);
    }
    for (const [key, child] of Object.entries(node)) {
      if (["typeAnnotation", "typeParameters", "typeArguments", "returnType"].includes(key))
        continue;
      if (key === "id" && type === "VariableDeclarator") {
        const reason = visitPatternDefaults(child, scope);
        if (reason !== undefined) return reason;
        continue;
      }
      if (type === "ExportSpecifier") continue;
      if (key === "property" && type === "MemberExpression" && node.computed !== true) continue;
      if (key === "key" && type === "Property" && node.computed !== true) continue;
      const reason = visit(child, scope);
      if (reason !== undefined) return reason;
    }
    return undefined;
  }
  function visitPatternDefaults(value: unknown, scope: CompatContextBindings): string | undefined {
    const node = object(value);
    if (node.type === "Identifier") return undefined;
    if (node.type === "AssignmentPattern")
      return visit(node.right, scope) ?? visitPatternDefaults(node.left, scope);
    if (node.type === "Property")
      return (
        (node.computed === true ? visit(node.key, scope) : undefined) ??
        visitPatternDefaults(node.value, scope)
      );
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) {
        for (const item of child) {
          const reason = visitPatternDefaults(item, scope);
          if (reason !== undefined) return reason;
        }
      } else if (child !== null && typeof child === "object") {
        const reason = visitPatternDefaults(child, scope);
        if (reason !== undefined) return reason;
      }
    }
    return undefined;
  }
  return visit(program, bindings);
}
