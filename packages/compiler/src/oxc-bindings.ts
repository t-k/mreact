import { stripTypeScriptWithOxc } from "./oxc-transform.js";
import { readArray, readObject, readSource } from "./oxc-node-utils.js";

export function formatStatement(code: string, statement: unknown): string {
  const source = readSource(code, statement);
  return stripTypeScriptWithOxc(source).replace("() => {}", "() => { }");
}

export function collectBindingNames(statement: unknown): string[] {
  const object = readObject(statement);

  if (object.type === "ExportNamedDeclaration") {
    return collectBindingNames(object.declaration);
  }

  if (object.type === "ExportDefaultDeclaration") {
    return collectBindingNames(object.declaration);
  }

  if (object.type === "FunctionDeclaration" || object.type === "ClassDeclaration") {
    const id = readObject(object.id);
    return typeof id.name === "string" ? [id.name] : [];
  }

  if (object.type === "ForStatement") {
    return collectBindingNames(object.init);
  }

  if (object.type === "IfStatement") {
    return [...collectBindingNames(object.consequent), ...collectBindingNames(object.alternate)];
  }

  if (object.type === "BlockStatement") {
    return readArray(object.body).flatMap(collectBindingNames);
  }

  if (object.type !== "VariableDeclaration") {
    return readArray(object.body).flatMap(collectBindingNames);
  }

  return readArray(object.declarations).flatMap((declaration) => {
    const id = readObject(readObject(declaration).id);
    return collectBindingNamesFromPattern(id);
  });
}

export function collectBindingNamesFromPattern(pattern: Record<string, unknown>): string[] {
  if (typeof pattern.name === "string") {
    return [pattern.name];
  }

  if (pattern.type === "AssignmentPattern") {
    return collectBindingNamesFromPattern(readObject(pattern.left));
  }

  if (pattern.type === "RestElement") {
    return collectBindingNamesFromPattern(readObject(pattern.argument));
  }

  if (pattern.type === "ObjectPattern") {
    return readArray(pattern.properties).flatMap((property) => {
      const object = readObject(property);

      if (object.type === "RestElement") {
        return collectBindingNamesFromPattern(readObject(object.argument));
      }

      return collectBindingNamesFromPattern(readObject(object.value));
    });
  }

  if (pattern.type === "ArrayPattern") {
    return readArray(pattern.elements).flatMap((element) => {
      const object = readObject(element);
      return Object.keys(object).length === 0 ? [] : collectBindingNamesFromPattern(object);
    });
  }

  return [];
}

export function collectImportBindingNames(statement: unknown): string[] {
  return readArray(readObject(statement).specifiers).flatMap((specifier) => {
    const local = readObject(readObject(specifier).local);
    return typeof local.name === "string" ? [local.name] : [];
  });
}

export function readOxcParameterName(code: string, parameter: unknown): string {
  const object = readObject(parameter);

  if (typeof object.name === "string") {
    return object.name;
  }

  if (object.type === "AssignmentPattern") {
    return readOxcParameterName(code, object.left);
  }

  if (object.type === "RestElement") {
    return `...${readOxcParameterName(code, object.argument)}`;
  }

  return readSource(code, parameter);
}
