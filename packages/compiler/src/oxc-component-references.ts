import type { ClientReferenceIr, JsxNodeIr } from "./ir.js";
import { readArray, readObject } from "./oxc-node-utils.js";

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
