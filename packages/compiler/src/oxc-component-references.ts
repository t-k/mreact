import type { ClientReferenceIr, JsxNodeIr } from "./ir.js";
import { readArray, readObject } from "./oxc-node-utils.js";

const routerEntryCompatRuntimeExports = new Set(["Link"]);
const routerLinkCompatRuntimeExports = new Set(["Link"]);

interface ClientReferenceAliasState {
  references: Map<string, ClientReferenceIr>;
  stringConstants: Map<string, string>;
  objectMembers: Map<string, Map<string, ClientReferenceIr>>;
}

export function collectOxcClientBoundaryImportComponents(
  program: unknown,
  inferredBoundaryImports: ReadonlySet<string>,
): Map<string, ClientReferenceIr> {
  const names = new Map<string, ClientReferenceIr>();

  for (const statement of readArray(readObject(program).body)) {
    const object = readObject(statement);

    if (
      object.type !== "ImportDeclaration" ||
      !isOxcClientBoundaryImport(object, inferredBoundaryImports)
    ) {
      continue;
    }

    const moduleId = String(readObject(object.source).value ?? "");

    for (const specifier of readArray(object.specifiers)) {
      const specifierObject = readObject(specifier);
      const local = readObject(specifierObject.local);
      const localName = typeof local.name === "string" ? local.name : undefined;

      if (localName === undefined || !/^[A-Z]/.test(localName)) {
        continue;
      }

      if (specifierObject.type === "ImportDefaultSpecifier") {
        names.set(localName, { moduleId, exportName: "default" });
        continue;
      }

      if (specifierObject.type === "ImportNamespaceSpecifier") {
        names.set(localName, { moduleId, exportName: "*" });
        continue;
      }

      if (specifierObject.type === "ImportSpecifier" && specifierObject.importKind !== "type") {
        const imported = readObject(specifierObject.imported);
        names.set(localName, {
          moduleId,
          exportName: String(imported.name ?? localName),
        });
      }
    }
  }

  collectOxcClientReferenceAliases(program, names);
  return names;
}

export function collectOxcCompatRuntimeImportComponents(
  program: unknown,
): Map<string, ClientReferenceIr> {
  const names = new Map<string, ClientReferenceIr>();

  for (const statement of readArray(readObject(program).body)) {
    const object = readObject(statement);

    if (object.type !== "ImportDeclaration") {
      continue;
    }

    const moduleId = String(readObject(object.source).value ?? "");
    const runtimeExports = compatRuntimeExports(moduleId);

    if (runtimeExports === undefined) {
      continue;
    }

    for (const specifier of readArray(object.specifiers)) {
      const specifierObject = readObject(specifier);
      const local = readObject(specifierObject.local);
      const localName = typeof local.name === "string" ? local.name : undefined;

      if (localName === undefined || !/^[A-Z]/.test(localName)) {
        continue;
      }

      if (
        specifierObject.type === "ImportDefaultSpecifier" &&
        runtimeExports.has("default")
      ) {
        names.set(localName, { moduleId, exportName: "default" });
        continue;
      }

      if (specifierObject.type === "ImportNamespaceSpecifier") {
        names.set(localName, { moduleId, exportName: "*" });
        continue;
      }

      if (specifierObject.type === "ImportSpecifier" && specifierObject.importKind !== "type") {
        const imported = readObject(specifierObject.imported);
        const importedName = String(imported.name ?? localName);

        if (runtimeExports.has(importedName)) {
          names.set(localName, {
            moduleId,
            exportName: importedName,
          });
        }
      }
    }
  }

  return names;
}

export function markOxcAsyncComponentReferences(
  node: JsxNodeIr,
  asyncComponentNames: Set<string>,
): void {
  visitOxcNode(node, (child) => {
    if (child.kind === "component" && asyncComponentNames.has(child.name)) {
      child.async = true;
    }
  });
}

export function markOxcClientReferences(
  node: JsxNodeIr,
  clientReferences: Map<string, ClientReferenceIr>,
): void {
  visitOxcNode(node, (child) => {
    if (child.kind !== "component") {
      return;
    }

    const clientReference = findOxcClientReference(child.name, clientReferences);

    if (clientReference !== undefined) {
      child.runtime = "compat";
      child.clientReference = clientReference;
    }
  });
}

export function markOxcCompatRuntimeReferences(
  node: JsxNodeIr,
  runtimeReferences: Map<string, ClientReferenceIr>,
): void {
  visitOxcNode(node, (child) => {
    if (child.kind !== "component") {
      return;
    }

    const runtimeReference = findOxcCompatRuntimeReference(child.name, runtimeReferences);

    if (runtimeReference !== undefined) {
      child.runtime = "compat";
    }
  });
}

function isOxcClientBoundaryImport(
  statement: Record<string, unknown>,
  inferredBoundaryImports: ReadonlySet<string>,
): boolean {
  const moduleId = String(readObject(statement.source).value ?? "");
  return inferredBoundaryImports.has(moduleId) || /\.(?:client|compat)\.[cm]?[jt]sx?$/.test(moduleId);
}

function findOxcClientReference(
  name: string,
  clientReferences: Map<string, ClientReferenceIr>,
): ClientReferenceIr | undefined {
  const direct = clientReferences.get(name);

  if (direct !== undefined) {
    return direct;
  }

  const [rootName, ...memberNames] = name.split(".");
  const rootReference = rootName === undefined ? undefined : clientReferences.get(rootName);

  if (rootReference === undefined || rootReference.exportName !== "*" || memberNames.length === 0) {
    return rootReference;
  }

  return {
    moduleId: rootReference.moduleId,
    exportName: memberNames.join("."),
  };
}

function collectOxcClientReferenceAliases(
  node: unknown,
  references: Map<string, ClientReferenceIr>,
): void {
  const state: ClientReferenceAliasState = {
    references,
    stringConstants: new Map(),
    objectMembers: new Map(),
  };

  collectOxcClientReferenceAliasesFromNode(node, state);
}

function collectOxcClientReferenceAliasesFromNode(
  node: unknown,
  state: ClientReferenceAliasState,
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectOxcClientReferenceAliasesFromNode(child, state);
    }
    return;
  }

  const object = readOptionalObject(node);
  if (object === undefined) {
    return;
  }

  if (typeof object.type === "string" && object.type.startsWith("TS")) {
    return;
  }

  if (object.type === "VariableDeclaration") {
    const constant = object.kind === "const";
    for (const declaration of readArray(object.declarations)) {
      collectOxcVariableClientReferenceAlias(readOptionalObject(declaration), state, constant);
    }
    return;
  }

  if (object.type === "VariableDeclarator") {
    collectOxcVariableClientReferenceAlias(object, state, false);
  }

  if (object.type === "AssignmentExpression") {
    collectOxcAssignmentClientReferenceAlias(object, state);
  }

  if (object.type === "CallExpression") {
    collectOxcObjectAssignClientReferenceAliases(object, state);
  }

  for (const [key, value] of Object.entries(object)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }

    collectOxcClientReferenceAliasesFromNode(value, state);
  }
}

function collectOxcVariableClientReferenceAlias(
  node: Record<string, unknown> | undefined,
  state: ClientReferenceAliasState,
  constant: boolean,
): void {
  if (node?.type !== "VariableDeclarator") {
    return;
  }

  const id = readOptionalObject(node.id);
  const init = readOptionalObject(node.init);
  const aliasName = typeof id?.name === "string" ? id.name : undefined;

  if (aliasName === undefined) {
    return;
  }

  if (constant) {
    const stringValue = stringExpressionValue(init, state);
    if (stringValue !== undefined) {
      state.stringConstants.set(aliasName, stringValue);
    }
  }

  collectOxcObjectLiteralClientReferenceAliases(aliasName, init, state);

  const reference = expressionClientReference(init, state);
  if (reference !== undefined) {
    state.references.set(aliasName, reference);
  }
}

function collectOxcObjectLiteralClientReferenceAliases(
  objectName: string | undefined,
  init: Record<string, unknown> | undefined,
  state: ClientReferenceAliasState,
): void {
  if (objectName === undefined || init?.type !== "ObjectExpression") {
    return;
  }

  for (const propertyValue of readArray(init.properties)) {
    const property = readOptionalObject(propertyValue);
    if (property?.type !== "Property") {
      continue;
    }

    const keyName = propertyName(readOptionalObject(property.key), property.computed === true, state);
    const reference = expressionClientReference(readOptionalObject(property.value), state);
    if (keyName !== undefined && reference !== undefined) {
      setObjectMemberReference(state, objectName, keyName, reference);
    }
  }
}

function collectOxcAssignmentClientReferenceAlias(
  node: Record<string, unknown>,
  state: ClientReferenceAliasState,
): void {
  if (node.operator !== "=") {
    return;
  }

  const left = readOptionalObject(node.left);
  if (left?.type !== "MemberExpression") {
    return;
  }

  const objectName = expressionObjectName(readOptionalObject(left.object));
  const memberName = propertyName(readOptionalObject(left.property), left.computed === true, state);
  const reference = expressionClientReference(readOptionalObject(node.right), state);
  if (objectName !== undefined && memberName !== undefined && reference !== undefined) {
    setObjectMemberReference(state, objectName, memberName, reference);
  }
}

function collectOxcObjectAssignClientReferenceAliases(
  node: Record<string, unknown>,
  state: ClientReferenceAliasState,
): void {
  if (!isObjectAssignCall(node)) {
    return;
  }

  const args = readArray(node.arguments).map(readOptionalObject);
  const target = expressionObjectName(args[0]);
  if (target === undefined) {
    return;
  }

  for (const source of args.slice(1)) {
    collectOxcObjectLiteralClientReferenceAliases(target, source, state);
  }
}

function expressionClientReference(
  node: Record<string, unknown> | undefined,
  state: ClientReferenceAliasState,
): ClientReferenceIr | undefined {
  if (node === undefined) {
    return undefined;
  }

  if (node.type === "Identifier" && typeof node.name === "string") {
    return state.references.get(node.name);
  }

  if (node.type === "MemberExpression") {
    const objectName = expressionObjectName(readOptionalObject(node.object));
    const memberName = propertyName(readOptionalObject(node.property), node.computed === true, state);
    const objectReference =
      objectName === undefined ? undefined : state.references.get(objectName);

    if (objectName !== undefined && memberName !== undefined) {
      const objectMember = state.objectMembers.get(objectName)?.get(memberName);
      if (objectMember !== undefined) {
        return objectMember;
      }
    }

    if (objectName !== undefined && memberName === undefined) {
      return uniqueClientReference(Array.from(state.objectMembers.get(objectName)?.values() ?? []));
    }

    if (objectReference?.exportName === "*" && memberName !== undefined) {
      return {
        moduleId: objectReference.moduleId,
        exportName: memberName,
      };
    }
  }

  if (node.type === "ConditionalExpression") {
    return uniqueClientReference([
      expressionClientReference(readOptionalObject(node.consequent), state),
      expressionClientReference(readOptionalObject(node.alternate), state),
    ]);
  }

  if (
    node.type === "ChainExpression" ||
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSNonNullExpression" ||
    node.type === "ParenthesizedExpression"
  ) {
    return expressionClientReference(readOptionalObject(node.expression), state);
  }

  return undefined;
}

function expressionObjectName(node: Record<string, unknown> | undefined): string | undefined {
  return node?.type === "Identifier" && typeof node.name === "string" ? node.name : undefined;
}

function propertyName(
  node: Record<string, unknown> | undefined,
  computed: boolean,
  state: ClientReferenceAliasState,
): string | undefined {
  if (!computed && node?.type === "Identifier" && typeof node.name === "string") {
    return node.name;
  }

  if (computed && node?.type === "Identifier" && typeof node.name === "string") {
    return state.stringConstants.get(node.name);
  }

  return stringExpressionValue(node, state);
}

function stringExpressionValue(
  node: Record<string, unknown> | undefined,
  state: ClientReferenceAliasState,
): string | undefined {
  if (
    (node?.type === "StringLiteral" || node?.type === "Literal") &&
    typeof node.value === "string"
  ) {
    return node.value;
  }

  if (node?.type === "ConditionalExpression") {
    return uniqueString([
      stringExpressionValue(readOptionalObject(node.consequent), state),
      stringExpressionValue(readOptionalObject(node.alternate), state),
    ]);
  }

  if (node?.type === "Identifier" && typeof node.name === "string") {
    return state.stringConstants.get(node.name);
  }

  if (
    node?.type === "ChainExpression" ||
    node?.type === "TSAsExpression" ||
    node?.type === "TSSatisfiesExpression" ||
    node?.type === "TSNonNullExpression" ||
    node?.type === "ParenthesizedExpression"
  ) {
    return stringExpressionValue(readOptionalObject(node.expression), state);
  }

  return undefined;
}

function setObjectMemberReference(
  state: ClientReferenceAliasState,
  objectName: string,
  memberName: string,
  reference: ClientReferenceIr,
): void {
  const members = state.objectMembers.get(objectName) ?? new Map<string, ClientReferenceIr>();
  members.set(memberName, reference);
  state.objectMembers.set(objectName, members);
}

function isObjectAssignCall(node: Record<string, unknown>): boolean {
  const callee = readOptionalObject(node.callee);
  if (callee?.type !== "MemberExpression" || callee.computed === true) {
    return false;
  }

  const object = readOptionalObject(callee.object);
  const property = readOptionalObject(callee.property);
  return object?.type === "Identifier" && object.name === "Object" &&
    property?.type === "Identifier" && property.name === "assign";
}

function uniqueClientReference(
  values: readonly (ClientReferenceIr | undefined)[],
): ClientReferenceIr | undefined {
  const refs = values.filter((value): value is ClientReferenceIr => value !== undefined);
  if (refs.length === 0) {
    return undefined;
  }

  const first = refs[0];
  if (first === undefined) {
    return undefined;
  }

  return refs.every(
    (reference) =>
      reference.moduleId === first.moduleId && reference.exportName === first.exportName,
  )
    ? first
    : undefined;
}

function uniqueString(values: readonly (string | undefined)[]): string | undefined {
  const unique = new Set(values.filter((value): value is string => value !== undefined));
  return unique.size === 1 ? Array.from(unique)[0] : undefined;
}

function readOptionalObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function findOxcCompatRuntimeReference(
  name: string,
  runtimeReferences: Map<string, ClientReferenceIr>,
): ClientReferenceIr | undefined {
  const direct = runtimeReferences.get(name);

  if (direct !== undefined) {
    return direct;
  }

  const [rootName, ...memberNames] = name.split(".");
  const rootReference = rootName === undefined ? undefined : runtimeReferences.get(rootName);

  if (rootReference === undefined || rootReference.exportName !== "*" || memberNames.length === 0) {
    return undefined;
  }

  const exportName = memberNames.join(".");
  return compatRuntimeExports(rootReference.moduleId)?.has(exportName) === true
    ? {
        moduleId: rootReference.moduleId,
        exportName,
      }
    : undefined;
}

function compatRuntimeExports(moduleId: string): ReadonlySet<string> | undefined {
  if (moduleId === "@reckona/mreact-router") {
    return routerEntryCompatRuntimeExports;
  }

  if (moduleId === "@reckona/mreact-router/link") {
    return routerLinkCompatRuntimeExports;
  }

  return undefined;
}

function visitOxcNode(node: JsxNodeIr, visitor: (node: JsxNodeIr) => void): void {
  visitor(node);

  if (node.kind === "component") {
    for (const prop of node.props) {
      if (prop.kind === "render-prop") {
        for (const child of prop.children) {
          visitOxcNode(child, visitor);
        }
      }
    }
    for (const child of node.children) {
      visitOxcNode(child, visitor);
    }
    return;
  }

  if (node.kind === "conditional") {
    for (const child of [...node.whenTrue, ...node.whenFalse]) {
      visitOxcNode(child, visitor);
    }
    return;
  }

  if (node.kind === "list") {
    for (const child of node.children) {
      visitOxcNode(child, visitor);
    }
    return;
  }

  if (node.kind === "async-boundary") {
    for (const child of [
      ...node.children,
      ...(node.placeholderChildren ?? []),
      ...(node.catchChildren ?? []),
    ]) {
      visitOxcNode(child, visitor);
    }
    return;
  }

  if (node.kind === "element" || node.kind === "fragment") {
    for (const child of node.children) {
      visitOxcNode(child, visitor);
    }
  }
}
