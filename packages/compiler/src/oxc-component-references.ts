import type { ClientReferenceIr, JsxNodeIr } from "./ir.js";
import { readArray, readObject } from "./oxc-node-utils.js";

const routerEntryCompatRuntimeExports = new Set<string>();
const routerLinkCompatRuntimeExports = new Set<string>();
const unknownCompatReference: ClientReferenceIr = { moduleId: "", exportName: "default" };

interface ClientReferenceAliasState {
  allowAmbiguousAliases: boolean;
  references: Map<string, ClientReferenceIr>;
  stringConstants: Map<string, string>;
  objectMembers: Map<string, Map<string, ClientReferenceIr>>;
  objectMemberKeys: Map<string, Set<string>>;
  dynamicObjectMembers: Map<string, ClientReferenceIr[]>;
  dynamicObjectNestedMembers: Map<string, Map<string, ClientReferenceIr[]>>;
  globModuleMaps: Set<string>;
  objectEntryValueBindings: Map<string, string>;
}

export function collectOxcClientBoundaryImportComponents(
  program: unknown,
  inferredBoundaryImports: ReadonlySet<string>,
  fallbackBoundaryImports: ReadonlySet<string> = new Set(),
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
        names.set(localName, clientReference(moduleId, "default", fallbackBoundaryImports));
        continue;
      }

      if (specifierObject.type === "ImportNamespaceSpecifier") {
        names.set(localName, clientReference(moduleId, "*", fallbackBoundaryImports));
        continue;
      }

      if (specifierObject.type === "ImportSpecifier" && specifierObject.importKind !== "type") {
        const imported = readObject(specifierObject.imported);
        names.set(
          localName,
          clientReference(moduleId, String(imported.name ?? localName), fallbackBoundaryImports),
        );
      }
    }
  }

  collectOxcClientReferenceAliases(program, names);
  return names;
}

function clientReference(
  moduleId: string,
  exportName: string,
  fallbackBoundaryImports: ReadonlySet<string>,
): ClientReferenceIr {
  return {
    moduleId,
    exportName,
    ...(fallbackBoundaryImports.has(moduleId) ? { ssrFallback: true } : {}),
  };
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
    const compatComponentImport = runtimeExports !== undefined || isMdxModuleId(moduleId);

    if (!compatComponentImport) {
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
        (runtimeExports?.has("default") === true || isMdxModuleId(moduleId))
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

        if (runtimeExports?.has(importedName) === true || isMdxModuleId(moduleId)) {
          names.set(localName, {
            moduleId,
            exportName: importedName,
          });
        }
      }
    }
  }

  collectOxcClientReferenceAliases(program, names, { allowAmbiguousAliases: true });
  return names;
}

export function collectOxcCompatReactNodeComponentReferences(
  program: unknown,
): Map<string, ClientReferenceIr> {
  const names = new Map<string, ClientReferenceIr>();

  for (const statement of readArray(readObject(program).body)) {
    collectOxcCompatReactNodeImportReferences(statement, names);
    collectOxcCompatReactNodeClassReferences(statement, names);
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
  runtimeReferences: ReadonlyMap<string, ClientReferenceIr>,
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

export function markOxcCompatReactNodeReferences(
  node: JsxNodeIr,
  references: ReadonlyMap<string, ClientReferenceIr>,
): void {
  visitOxcNode(node, (child) => {
    if (child.kind !== "component") {
      return;
    }

    if (findOxcCompatReactNodeReference(child.name, references) !== undefined) {
      child.runtime = "compat";
    }
  });
}

function isOxcClientBoundaryImport(
  statement: Record<string, unknown>,
  inferredBoundaryImports: ReadonlySet<string>,
): boolean {
  const moduleId = String(readObject(statement.source).value ?? "");
  return (
    inferredBoundaryImports.has(moduleId) || /\.(?:client|compat)\.[cm]?[jt]sx?$/.test(moduleId)
  );
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

function collectOxcCompatReactNodeImportReferences(
  statement: unknown,
  names: Map<string, ClientReferenceIr>,
): void {
  const object = readObject(statement);

  if (object.type !== "ImportDeclaration" || object.importKind === "type") {
    return;
  }

  const moduleId = String(readObject(object.source).value ?? "");

  for (const specifier of readArray(object.specifiers)) {
    const specifierObject = readObject(specifier);

    if (specifierObject.importKind === "type") {
      continue;
    }

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

    if (specifierObject.type === "ImportSpecifier") {
      const imported = readObject(specifierObject.imported);
      names.set(localName, {
        moduleId,
        exportName: String(imported.name ?? localName),
      });
    }
  }
}

function collectOxcCompatReactNodeClassReferences(
  statement: unknown,
  names: Map<string, ClientReferenceIr>,
): void {
  const object = readObject(statement);
  const declaration =
    object.type === "ExportNamedDeclaration" || object.type === "ExportDefaultDeclaration"
      ? readOptionalObject(object.declaration)
      : object;
  const className = readOxcClassComponentName(declaration);

  if (className !== undefined) {
    names.set(className, { moduleId: "", exportName: className });
  }
}

function readOxcClassComponentName(node: Record<string, unknown> | undefined): string | undefined {
  if (node?.type === "ClassDeclaration" || node?.type === "ClassExpression") {
    const id = readOptionalObject(node.id);
    const name = typeof id?.name === "string" ? id.name : undefined;
    return name !== undefined && /^[A-Z]/.test(name) ? name : undefined;
  }

  if (node?.type !== "VariableDeclaration") {
    return undefined;
  }

  for (const declarationValue of readArray(node.declarations)) {
    const declaration = readOptionalObject(declarationValue);
    const id = readOptionalObject(declaration?.id);
    const init = readOptionalObject(declaration?.init);
    const name = typeof id?.name === "string" ? id.name : undefined;

    if (
      name !== undefined &&
      /^[A-Z]/.test(name) &&
      (init?.type === "ClassExpression" || init?.type === "ClassDeclaration")
    ) {
      return name;
    }
  }

  return undefined;
}

function collectOxcClientReferenceAliases(
  node: unknown,
  references: Map<string, ClientReferenceIr>,
  options: { allowAmbiguousAliases?: boolean } = {},
): void {
  const state: ClientReferenceAliasState = {
    allowAmbiguousAliases: options.allowAmbiguousAliases === true,
    references,
    stringConstants: new Map(),
    objectMembers: new Map(),
    objectMemberKeys: new Map(),
    dynamicObjectMembers: new Map(),
    dynamicObjectNestedMembers: new Map(),
    globModuleMaps: new Set(),
    objectEntryValueBindings: new Map(),
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

  if (object.type === "ForOfStatement") {
    collectOxcForOfClientReferenceAliases(object, state);
    return;
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

  if (isImportMetaGlobEagerCall(init)) {
    state.globModuleMaps.add(aliasName);
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

    const keyName = propertyName(
      readOptionalObject(property.key),
      property.computed === true,
      state,
    );
    const value = readOptionalObject(property.value);
    if (keyName !== undefined) {
      addObjectMemberKey(state, objectName, keyName);
    }

    if (keyName !== undefined && value?.type === "ObjectExpression") {
      collectOxcObjectLiteralClientReferenceAliases(`${objectName}.${keyName}`, value, state);
    }

    const reference = expressionClientReference(value, state);
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

  const objectName = expressionObjectName(readOptionalObject(left.object), state);
  const memberName = propertyName(readOptionalObject(left.property), left.computed === true, state);
  const reference = expressionClientReference(readOptionalObject(node.right), state);
  if (objectName !== undefined && memberName !== undefined) {
    addObjectMemberKey(state, objectName, memberName);
    if (reference !== undefined) {
      setObjectMemberReference(state, objectName, memberName, reference);
    }
  }

  if (objectName !== undefined && memberName === undefined) {
    if (reference !== undefined) {
      addDynamicObjectMemberReference(state, objectName, reference);
    }

    collectDynamicObjectNestedMemberReferences(objectName, readOptionalObject(node.right), state);
  }
}

function collectOxcForOfClientReferenceAliases(
  node: Record<string, unknown>,
  state: ClientReferenceAliasState,
): void {
  const sourceName = objectEntriesSourceName(readOptionalObject(node.right), state);
  const valueName = forOfObjectEntriesValueBindingName(readOptionalObject(node.left));

  if (sourceName === undefined || valueName === undefined) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "type" || key === "start" || key === "end" || key === "loc") {
        continue;
      }

      collectOxcClientReferenceAliasesFromNode(value, state);
    }
    return;
  }

  const previous = state.objectEntryValueBindings.get(valueName);
  state.objectEntryValueBindings.set(valueName, sourceName);
  collectOxcClientReferenceAliasesFromNode(node.body, state);
  if (previous === undefined) {
    state.objectEntryValueBindings.delete(valueName);
  } else {
    state.objectEntryValueBindings.set(valueName, previous);
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
  const target = expressionObjectName(args[0], state);
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
    const objectName = expressionObjectName(readOptionalObject(node.object), state);
    const memberName = propertyName(
      readOptionalObject(node.property),
      node.computed === true,
      state,
    );
    const objectReference = objectName === undefined ? undefined : state.references.get(objectName);

    if (objectName !== undefined && memberName !== undefined) {
      const objectMember = state.objectMembers.get(objectName)?.get(memberName);
      if (objectMember !== undefined) {
        return objectMember;
      }

      const dynamicObjectReference = selectClientReference(
        dynamicObjectMemberReferences(state, objectName),
        state.allowAmbiguousAliases,
      );
      if (dynamicObjectReference !== undefined) {
        return dynamicObjectReference;
      }

      const objectEntryReference = objectEntryMemberReference(objectName, memberName, state);
      if (objectEntryReference !== undefined) {
        return objectEntryReference;
      }
    }

    if (objectName !== undefined && memberName === undefined) {
      return selectClientReference(
        [
          ...objectMemberReferences(state, objectName),
          ...dynamicObjectMemberReferences(state, objectName),
        ],
        state.allowAmbiguousAliases,
      );
    }

    if (objectName === undefined && memberName !== undefined) {
      const references = [
        ...expressionObjectNameCandidates(readOptionalObject(node.object), state).map((candidate) =>
          state.objectMembers.get(candidate)?.get(memberName),
        ),
        ...expressionDynamicObjectNestedMemberReferences(
          readOptionalObject(node.object),
          memberName,
          state,
        ),
      ];
      return selectClientReference(references, state.allowAmbiguousAliases);
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

function objectEntryMemberReference(
  objectName: string,
  memberName: string,
  state: ClientReferenceAliasState,
): ClientReferenceIr | undefined {
  const sourceName = state.objectEntryValueBindings.get(objectName);
  if (sourceName === undefined) {
    return undefined;
  }

  if (
    state.allowAmbiguousAliases &&
    state.globModuleMaps.has(sourceName) &&
    memberName === "default"
  ) {
    return unknownCompatReference;
  }

  const references = Array.from(state.objectMemberKeys.get(sourceName) ?? []).map((key) =>
    state.objectMembers.get(`${sourceName}.${key}`)?.get(memberName),
  );
  return selectClientReference(references, state.allowAmbiguousAliases);
}

function expressionObjectNameCandidates(
  node: Record<string, unknown> | undefined,
  state: ClientReferenceAliasState,
): string[] {
  const exactName = expressionObjectName(node, state);
  if (exactName !== undefined) {
    return [exactName];
  }

  if (node?.type !== "MemberExpression") {
    return [];
  }

  const objectName = expressionObjectName(readOptionalObject(node.object), state);
  const memberName = propertyName(readOptionalObject(node.property), node.computed === true, state);

  if (objectName !== undefined && memberName === undefined) {
    return Array.from(state.objectMemberKeys.get(objectName) ?? []).map(
      (key) => `${objectName}.${key}`,
    );
  }

  if (memberName === undefined) {
    return [];
  }

  return expressionObjectNameCandidates(readOptionalObject(node.object), state).map(
    (candidate) => `${candidate}.${memberName}`,
  );
}

function expressionObjectName(
  node: Record<string, unknown> | undefined,
  state: ClientReferenceAliasState,
): string | undefined {
  if (node?.type === "Identifier" && typeof node.name === "string") {
    return node.name;
  }

  if (node?.type === "MemberExpression") {
    const objectName = expressionObjectName(readOptionalObject(node.object), state);
    const memberName = propertyName(
      readOptionalObject(node.property),
      node.computed === true,
      state,
    );

    return objectName !== undefined && memberName !== undefined
      ? `${objectName}.${memberName}`
      : undefined;
  }

  return undefined;
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
  addObjectMemberKey(state, objectName, memberName);
}

function addDynamicObjectMemberReference(
  state: ClientReferenceAliasState,
  objectName: string,
  reference: ClientReferenceIr,
): void {
  const references = state.dynamicObjectMembers.get(objectName) ?? [];
  references.push(reference);
  state.dynamicObjectMembers.set(objectName, references);
}

function collectDynamicObjectNestedMemberReferences(
  objectName: string,
  node: Record<string, unknown> | undefined,
  state: ClientReferenceAliasState,
): void {
  if (node?.type !== "ObjectExpression") {
    return;
  }

  for (const propertyValue of readArray(node.properties)) {
    const property = readOptionalObject(propertyValue);
    if (property?.type !== "Property") {
      continue;
    }

    const keyName = propertyName(
      readOptionalObject(property.key),
      property.computed === true,
      state,
    );
    const reference = expressionClientReference(readOptionalObject(property.value), state);
    if (keyName !== undefined && reference !== undefined) {
      addDynamicObjectNestedMemberReference(state, objectName, keyName, reference);
    }
  }
}

function addDynamicObjectNestedMemberReference(
  state: ClientReferenceAliasState,
  objectName: string,
  memberName: string,
  reference: ClientReferenceIr,
): void {
  const members =
    state.dynamicObjectNestedMembers.get(objectName) ?? new Map<string, ClientReferenceIr[]>();
  const references = members.get(memberName) ?? [];
  references.push(reference);
  members.set(memberName, references);
  state.dynamicObjectNestedMembers.set(objectName, members);
}

function addObjectMemberKey(
  state: ClientReferenceAliasState,
  objectName: string,
  memberName: string,
): void {
  const keys = state.objectMemberKeys.get(objectName) ?? new Set<string>();
  keys.add(memberName);
  state.objectMemberKeys.set(objectName, keys);
}

function isObjectAssignCall(node: Record<string, unknown>): boolean {
  const callee = readOptionalObject(node.callee);
  if (callee?.type !== "MemberExpression" || callee.computed === true) {
    return false;
  }

  const object = readOptionalObject(callee.object);
  const property = readOptionalObject(callee.property);
  return (
    object?.type === "Identifier" &&
    object.name === "Object" &&
    property?.type === "Identifier" &&
    property.name === "assign"
  );
}

function isObjectEntriesCall(node: Record<string, unknown> | undefined): boolean {
  const callee = readOptionalObject(node?.callee);
  if (callee?.type !== "MemberExpression" || callee.computed === true) {
    return false;
  }

  const object = readOptionalObject(callee.object);
  const property = readOptionalObject(callee.property);
  return (
    object?.type === "Identifier" &&
    object.name === "Object" &&
    property?.type === "Identifier" &&
    property.name === "entries"
  );
}

function isImportMetaGlobEagerCall(node: Record<string, unknown> | undefined): boolean {
  const callee = readOptionalObject(node?.callee);
  if (node?.type !== "CallExpression" || callee?.type !== "MemberExpression") {
    return false;
  }

  const property = readOptionalObject(callee.property);
  if (callee.computed === true || property?.type !== "Identifier" || property.name !== "glob") {
    return false;
  }

  const metaProperty = readOptionalObject(callee.object);
  const meta = readOptionalObject(metaProperty?.meta);
  const metaName = meta?.type === "Identifier" ? meta.name : undefined;
  const propertyName = readOptionalObject(metaProperty?.property);
  const importMetaPropertyName =
    propertyName?.type === "Identifier" ? propertyName.name : undefined;
  if (
    metaProperty?.type !== "MetaProperty" ||
    metaName !== "import" ||
    importMetaPropertyName !== "meta"
  ) {
    return false;
  }

  const options = readOptionalObject(readArray(node.arguments)[1]);
  if (options?.type !== "ObjectExpression") {
    return false;
  }

  return readArray(options.properties).some((propertyValue) => {
    const property = readOptionalObject(propertyValue);
    const key = readOptionalObject(property?.key);
    const value = readOptionalObject(property?.value);
    return (
      property?.type === "Property" &&
      property.computed !== true &&
      key?.type === "Identifier" &&
      key.name === "eager" &&
      value?.type === "Literal" &&
      value.value === true
    );
  });
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

function selectClientReference(
  values: readonly (ClientReferenceIr | undefined)[],
  allowAmbiguousAliases: boolean,
): ClientReferenceIr | undefined {
  if (!allowAmbiguousAliases) {
    return uniqueClientReference(values);
  }

  if (values.length === 0 || values.some((value) => value === undefined)) {
    return undefined;
  }

  return values[0];
}

function objectMemberReferences(
  state: ClientReferenceAliasState,
  objectName: string,
): Array<ClientReferenceIr | undefined> {
  const keys = Array.from(state.objectMemberKeys.get(objectName) ?? []);
  return keys.map((key) => state.objectMembers.get(objectName)?.get(key));
}

function dynamicObjectMemberReferences(
  state: ClientReferenceAliasState,
  objectName: string,
): Array<ClientReferenceIr | undefined> {
  return state.dynamicObjectMembers.get(objectName) ?? [];
}

function expressionDynamicObjectNestedMemberReferences(
  node: Record<string, unknown> | undefined,
  memberName: string,
  state: ClientReferenceAliasState,
): Array<ClientReferenceIr | undefined> {
  if (node?.type !== "MemberExpression") {
    return [];
  }

  const objectName = expressionObjectName(readOptionalObject(node.object), state);
  const property = propertyName(readOptionalObject(node.property), node.computed === true, state);
  if (objectName === undefined || property !== undefined) {
    return [];
  }

  return state.dynamicObjectNestedMembers.get(objectName)?.get(memberName) ?? [];
}

function objectEntriesSourceName(
  node: Record<string, unknown> | undefined,
  state: ClientReferenceAliasState,
): string | undefined {
  if (!isObjectEntriesCall(node)) {
    return undefined;
  }

  const args = readArray(node?.arguments).map(readOptionalObject);
  return expressionObjectName(args[0], state);
}

function forOfObjectEntriesValueBindingName(
  node: Record<string, unknown> | undefined,
): string | undefined {
  const declaration =
    node?.type === "VariableDeclaration"
      ? readOptionalObject(readArray(node.declarations)[0])
      : undefined;
  const pattern =
    declaration?.type === "VariableDeclarator" ? readOptionalObject(declaration.id) : node;

  if (pattern?.type !== "ArrayPattern") {
    return undefined;
  }

  const valueElement = readOptionalObject(readArray(pattern.elements)[1]);
  return valueElement?.type === "Identifier" && typeof valueElement.name === "string"
    ? valueElement.name
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
  runtimeReferences: ReadonlyMap<string, ClientReferenceIr>,
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

function findOxcCompatReactNodeReference(
  name: string,
  references: ReadonlyMap<string, ClientReferenceIr>,
): ClientReferenceIr | undefined {
  const direct = references.get(name);

  if (direct !== undefined) {
    return direct;
  }

  const [rootName, ...memberNames] = name.split(".");
  const rootReference = rootName === undefined ? undefined : references.get(rootName);

  if (rootReference === undefined || rootReference.exportName !== "*" || memberNames.length === 0) {
    return undefined;
  }

  return {
    moduleId: rootReference.moduleId,
    exportName: memberNames.join("."),
  };
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

function isMdxModuleId(moduleId: string): boolean {
  return /\.mdx(?:[?#].*)?$/.test(moduleId);
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
