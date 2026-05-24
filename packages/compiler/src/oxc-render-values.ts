import type { JsxNodeIr } from "./ir.js";
import { readArray, readObject, readSource, unwrapOxcParentheses } from "./oxc-node-utils.js";

interface ReactiveAliasReplacement {
  end: number;
  start: number;
  text: string;
}

interface ReactiveAliasExpressionState {
  reactive: boolean;
  safe: boolean;
}

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
  reactiveDerivedFunctions: ReadonlySet<string> = new Set(),
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
      if (
        !isOxcReactiveAliasExpression(initializer) &&
        !isOxcReactiveDerivedAliasExpression(initializer, reactiveDerivedFunctions)
      ) {
        continue;
      }

      aliases.set(id.name, readSource(code, initializer));
    }
  }

  return aliases;
}

export function collectOxcReactiveDerivedFunctionNames(
  statements: readonly unknown[],
): Set<string> {
  const names = new Set<string>();

  for (const statementValue of statements) {
    const statement = readObject(statementValue);

    if (statement.type === "FunctionDeclaration") {
      const id = readObject(statement.id);
      if (typeof id.name === "string" && isOxcReactiveDerivedFunction(statement)) {
        names.add(id.name);
      }
      continue;
    }

    if (statement.type !== "VariableDeclaration" || statement.kind !== "const") {
      continue;
    }

    for (const declarationValue of readArray(statement.declarations)) {
      const declaration = readObject(declarationValue);
      const id = readObject(declaration.id);
      const initializer = unwrapOxcParentheses(readObject(declaration.init));

      if (
        typeof id.name === "string" &&
        (initializer.type === "FunctionExpression" ||
          initializer.type === "ArrowFunctionExpression") &&
        isOxcReactiveDerivedFunction(initializer)
      ) {
        names.add(id.name);
      }
    }
  }

  return names;
}

export function rewriteOxcReactiveAliasExpressionCode(
  code: string,
  expression: Record<string, unknown>,
  aliases: ReadonlyMap<string, string> | undefined,
): string | undefined {
  if (aliases === undefined || aliases.size === 0) {
    return undefined;
  }

  const expressionStart = readNumber(expression.start);
  const expressionEnd = readNumber(expression.end);

  if (expressionStart === undefined || expressionEnd === undefined) {
    return undefined;
  }

  const replacements: ReactiveAliasReplacement[] = [];
  collectOxcReactiveAliasReplacements(
    expression,
    undefined,
    undefined,
    aliases,
    new Set(),
    replacements,
  );

  if (replacements.length === 0) {
    return undefined;
  }

  let source = readSource(code, expression);

  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    const start = replacement.start - expressionStart;
    const end = replacement.end - expressionStart;

    if (start < 0 || end > source.length || start > end) {
      return undefined;
    }

    source = `${source.slice(0, start)}${replacement.text}${source.slice(end)}`;
  }

  return source;
}

function collectOxcReactiveAliasReplacements(
  node: unknown,
  parent: Record<string, unknown> | undefined,
  parentKey: string | undefined,
  aliases: ReadonlyMap<string, string>,
  shadowed: ReadonlySet<string>,
  replacements: ReactiveAliasReplacement[],
): void {
  const object = readObject(node);

  if (typeof object.type !== "string") {
    return;
  }

  if (object.type.startsWith("TS")) {
    return;
  }

  if (
    object.type === "Identifier" &&
    typeof object.name === "string" &&
    !shadowed.has(object.name) &&
    isOxcReactiveAliasReference(object, parent, parentKey)
  ) {
    const replacement = aliases.get(object.name);
    const start = readNumber(object.start);
    const end = readNumber(object.end);

    if (replacement !== undefined && start !== undefined && end !== undefined) {
      replacements.push({
        end,
        start,
        text: isOxcShorthandPropertyValue(object, parent)
          ? `${object.name}: (${replacement})`
          : `(${replacement})`,
      });
    }
    return;
  }

  if (isOxcFunctionNode(object)) {
    const functionShadowed = new Set(shadowed);
    collectOxcBindingNames(object.id, functionShadowed);
    for (const parameter of readArray(object.params)) {
      collectOxcBindingNames(parameter, functionShadowed);
    }
    collectOxcReactiveAliasReplacements(
      object.body,
      object,
      "body",
      aliases,
      addOxcBlockBindingNames(object.body, functionShadowed),
      replacements,
    );
    return;
  }

  const childShadowed =
    object.type === "BlockStatement" || object.type === "Program"
      ? addOxcBlockBindingNames(object, new Set(shadowed))
      : shadowed;

  for (const [key, value] of Object.entries(object)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }

    if (key === "id" && isOxcDeclarationWithId(object)) {
      continue;
    }

    if (key === "params" && isOxcFunctionNode(object)) {
      continue;
    }

    if (key === "key" && isOxcNonComputedKey(object)) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        collectOxcReactiveAliasReplacements(
          item,
          object,
          key,
          aliases,
          childShadowed,
          replacements,
        );
      }
      continue;
    }

    if (typeof value === "object" && value !== null) {
      collectOxcReactiveAliasReplacements(value, object, key, aliases, childShadowed, replacements);
    }
  }
}

function isOxcReactiveAliasReference(
  node: Record<string, unknown>,
  parent: Record<string, unknown> | undefined,
  parentKey: string | undefined,
): boolean {
  if (parent === undefined) {
    return true;
  }

  if (parent.type === "MemberExpression" && parentKey === "property" && parent.computed !== true) {
    return false;
  }

  if (parentKey === "id" && isOxcDeclarationWithId(parent)) {
    return false;
  }

  if (parentKey === "params" && isOxcFunctionNode(parent)) {
    return false;
  }

  if (parentKey === "key" && isOxcNonComputedKey(parent)) {
    return isOxcShorthandPropertyValue(node, parent);
  }

  if (
    (parent.type === "BreakStatement" ||
      parent.type === "ContinueStatement" ||
      parent.type === "LabeledStatement") &&
    parentKey === "label"
  ) {
    return false;
  }

  return true;
}

function isOxcShorthandPropertyValue(
  node: Record<string, unknown>,
  parent: Record<string, unknown> | undefined,
): boolean {
  const key = readObject(parent?.key);
  return (
    parent !== undefined &&
    (parent.type === "Property" || parent.type === "ObjectProperty") &&
    parent.shorthand === true &&
    parent.value === node &&
    readNumber(key.start) === readNumber(node.start) &&
    readNumber(key.end) === readNumber(node.end)
  );
}

function isOxcNonComputedKey(node: Record<string, unknown>): boolean {
  return (
    (node.type === "Property" ||
      node.type === "ObjectProperty" ||
      node.type === "PropertyDefinition" ||
      node.type === "MethodDefinition") &&
    node.computed !== true
  );
}

function isOxcDeclarationWithId(node: Record<string, unknown>): boolean {
  return (
    node.type === "VariableDeclarator" ||
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ClassDeclaration" ||
    node.type === "ClassExpression"
  );
}

function isOxcFunctionNode(node: Record<string, unknown>): boolean {
  return (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression"
  );
}

function addOxcBlockBindingNames(node: unknown, shadowed: Set<string>): ReadonlySet<string> {
  const object = readObject(node);
  const body = readArray(object.body);

  if (body.length === 0) {
    return shadowed;
  }

  for (const statement of body) {
    collectOxcStatementBindingNames(statement, shadowed);
  }

  return shadowed;
}

function collectOxcStatementBindingNames(node: unknown, names: Set<string>): void {
  const object = readObject(node);

  if (object.type === "VariableDeclaration") {
    for (const declaration of readArray(object.declarations)) {
      collectOxcBindingNames(readObject(declaration).id, names);
    }
    return;
  }

  if (object.type === "FunctionDeclaration" || object.type === "ClassDeclaration") {
    collectOxcBindingNames(object.id, names);
  }
}

function collectOxcBindingNames(node: unknown, names: Set<string>): void {
  const object = readObject(node);

  if (object.type === "Identifier" && typeof object.name === "string") {
    names.add(object.name);
    return;
  }

  if (object.type === "RestElement") {
    collectOxcBindingNames(object.argument, names);
    return;
  }

  if (object.type === "AssignmentPattern") {
    collectOxcBindingNames(object.left, names);
    return;
  }

  if (object.type === "ArrayPattern") {
    for (const element of readArray(object.elements)) {
      collectOxcBindingNames(element, names);
    }
    return;
  }

  if (object.type === "ObjectPattern") {
    for (const property of readArray(object.properties)) {
      collectOxcBindingNames(readObject(property).value ?? readObject(property).argument, names);
    }
  }
}

function collectOxcFunctionLocalBindings(
  functionNode: Record<string, unknown>,
  names: Set<string>,
): void {
  collectOxcBindingNames(functionNode.id, names);

  for (const parameter of readArray(functionNode.params)) {
    collectOxcBindingNames(parameter, names);
  }

  collectOxcLocalBindingsFromNode(readObject(functionNode.body), names);
}

function collectOxcLocalBindingsFromNode(node: unknown, names: Set<string>): void {
  const object = readObject(node);

  if (typeof object.type !== "string" || object.type.startsWith("TS")) {
    return;
  }

  if (object.type === "VariableDeclaration") {
    for (const declaration of readArray(object.declarations)) {
      collectOxcBindingNames(readObject(declaration).id, names);
    }
  } else if (object.type === "FunctionDeclaration" || object.type === "ClassDeclaration") {
    collectOxcBindingNames(object.id, names);
    return;
  } else if (object.type === "ForOfStatement" || object.type === "ForInStatement") {
    const left = readObject(object.left);
    const declarations = readArray(left.declarations);
    collectOxcBindingNames(
      declarations.length > 0 ? readObject(declarations[0]).id : object.left,
      names,
    );
  } else if (object.type === "ForStatement") {
    collectOxcLocalBindingsFromNode(object.init, names);
  } else if (isOxcFunctionNode(object)) {
    return;
  }

  for (const [key, value] of Object.entries(object)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        collectOxcLocalBindingsFromNode(item, names);
      }
      continue;
    }

    if (typeof value === "object" && value !== null) {
      collectOxcLocalBindingsFromNode(value, names);
    }
  }
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
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
  if (node.type === "ArrayExpression") {
    return readArray(node.elements).some((element) => {
      const object = readObject(element);
      return Object.keys(object).length > 0 && isJsxLikeInitializer(object);
    });
  }
  if (node.type === "ObjectExpression") {
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

function isOxcReactiveAliasExpression(expression: Record<string, unknown>): boolean {
  const state = analyzeOxcReactiveAliasExpression(expression);
  return state.safe && state.reactive;
}

function isOxcReactiveDerivedAliasExpression(
  expression: Record<string, unknown>,
  reactiveDerivedFunctions: ReadonlySet<string>,
): boolean {
  if (reactiveDerivedFunctions.size === 0) {
    return false;
  }

  const unwrappedExpression = unwrapOxcParentheses(expression);

  if (unwrappedExpression.type !== "CallExpression") {
    return false;
  }

  if (readArray(unwrappedExpression.arguments).length !== 0) {
    return false;
  }

  const callee = readObject(unwrappedExpression.callee);

  return (
    callee.type === "Identifier" &&
    typeof callee.name === "string" &&
    reactiveDerivedFunctions.has(callee.name)
  );
}

function isOxcReactiveDerivedFunction(functionNode: Record<string, unknown>): boolean {
  if (readArray(functionNode.params).length !== 0) {
    return false;
  }

  const localBindings = new Set<string>();
  collectOxcFunctionLocalBindings(functionNode, localBindings);
  const usage = analyzeOxcReactiveDerivedFunctionUsage(
    readObject(functionNode.body),
    localBindings,
  );

  return usage.reactive && usage.safe;
}

function analyzeOxcReactiveDerivedFunctionUsage(
  node: unknown,
  localBindings: ReadonlySet<string>,
): ReactiveAliasExpressionState {
  const object = readObject(node);

  if (typeof object.type !== "string" || object.type.startsWith("TS")) {
    return { reactive: false, safe: true };
  }

  if (isOxcFunctionNode(object)) {
    return { reactive: false, safe: true };
  }

  if (object.type === "CallExpression") {
    const callee = readObject(object.callee);
    const member = callee.type === "MemberExpression" ? callee : undefined;
    const property = readObject(member?.property);
    const owner = readObject(member?.object);
    const propertyName =
      member?.computed === true
        ? undefined
        : typeof property.name === "string"
          ? property.name
          : undefined;
    const ownerName = owner.type === "Identifier" ? owner.name : undefined;

    if (propertyName === "get" && typeof ownerName === "string" && !localBindings.has(ownerName)) {
      return mergeReactiveAliasStates([
        { reactive: true, safe: true },
        ...readArray(object.arguments).map((argument) =>
          analyzeOxcReactiveDerivedFunctionUsage(argument, localBindings),
        ),
      ]);
    }

    if (
      propertyName !== undefined &&
      typeof ownerName === "string" &&
      !localBindings.has(ownerName) &&
      isLikelyMutatingMethodName(propertyName)
    ) {
      return { reactive: false, safe: false };
    }
  }

  const states: ReactiveAliasExpressionState[] = [];

  for (const [key, value] of Object.entries(object)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }

    if (Array.isArray(value)) {
      states.push(
        ...value.map((item) => analyzeOxcReactiveDerivedFunctionUsage(item, localBindings)),
      );
      continue;
    }

    if (typeof value === "object" && value !== null) {
      states.push(analyzeOxcReactiveDerivedFunctionUsage(value, localBindings));
    }
  }

  return mergeReactiveAliasStates(states);
}

function mergeReactiveAliasStates(
  states: readonly ReactiveAliasExpressionState[],
): ReactiveAliasExpressionState {
  return states.reduce<ReactiveAliasExpressionState>(
    (merged, state) => ({
      reactive: merged.reactive || state.reactive,
      safe: merged.safe && state.safe,
    }),
    { reactive: false, safe: true },
  );
}

function isLikelyMutatingMethodName(name: string): boolean {
  return (
    name === "set" ||
    name === "delete" ||
    name === "clear" ||
    name === "push" ||
    name === "pop" ||
    name === "shift" ||
    name === "unshift" ||
    name === "splice" ||
    name === "sort" ||
    name === "reverse"
  );
}

function analyzeOxcReactiveAliasExpression(
  expression: Record<string, unknown>,
): ReactiveAliasExpressionState {
  const unwrappedExpression = unwrapOxcParentheses(expression);

  if (
    unwrappedExpression.type === "Literal" ||
    unwrappedExpression.type === "Identifier" ||
    unwrappedExpression.type === "ThisExpression"
  ) {
    return { reactive: false, safe: true };
  }

  if (isOxcReactiveReadExpression(unwrappedExpression)) {
    return { reactive: true, safe: true };
  }

  if (unwrappedExpression.type === "ChainExpression") {
    return analyzeOxcReactiveAliasExpression(readObject(unwrappedExpression.expression));
  }

  if (
    unwrappedExpression.type === "TSAsExpression" ||
    unwrappedExpression.type === "TSSatisfiesExpression" ||
    unwrappedExpression.type === "TSNonNullExpression" ||
    unwrappedExpression.type === "TSInstantiationExpression" ||
    unwrappedExpression.type === "TypeCastExpression"
  ) {
    return analyzeOxcReactiveAliasExpression(readObject(unwrappedExpression.expression));
  }

  if (unwrappedExpression.type === "MemberExpression") {
    const objectState = analyzeOxcReactiveAliasExpression(readObject(unwrappedExpression.object));
    const propertyState =
      unwrappedExpression.computed === true
        ? analyzeOxcReactiveAliasExpression(readObject(unwrappedExpression.property))
        : { reactive: false, safe: true };

    return {
      reactive: objectState.reactive || propertyState.reactive,
      safe: objectState.safe && propertyState.safe,
    };
  }

  if (unwrappedExpression.type === "UnaryExpression") {
    return analyzeOxcReactiveAliasExpression(readObject(unwrappedExpression.argument));
  }

  if (
    unwrappedExpression.type === "BinaryExpression" ||
    unwrappedExpression.type === "LogicalExpression"
  ) {
    const leftState = analyzeOxcReactiveAliasExpression(readObject(unwrappedExpression.left));
    const rightState = analyzeOxcReactiveAliasExpression(readObject(unwrappedExpression.right));

    return {
      reactive: leftState.reactive || rightState.reactive,
      safe: leftState.safe && rightState.safe,
    };
  }

  if (unwrappedExpression.type === "ConditionalExpression") {
    const testState = analyzeOxcReactiveAliasExpression(readObject(unwrappedExpression.test));
    const consequentState = analyzeOxcReactiveAliasExpression(
      readObject(unwrappedExpression.consequent),
    );
    const alternateState = analyzeOxcReactiveAliasExpression(
      readObject(unwrappedExpression.alternate),
    );

    return {
      reactive: testState.reactive || consequentState.reactive || alternateState.reactive,
      safe: testState.safe && consequentState.safe && alternateState.safe,
    };
  }

  return { reactive: false, safe: false };
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
