import { parseSync } from "oxc-parser";
import { analyzeToIr, type AnalyzeToIrInput } from "./internal.js";

export interface OxcParityResult {
  matches: boolean;
  oxc: {
    errors: string[];
    exportedComponents: string[];
  };
  typescript: {
    diagnostics: string[];
    exportedComponents: string[];
  };
}

export function analyzeOxcParity(input: AnalyzeToIrInput): OxcParityResult {
  const oxc = parseSync(input.filename, input.code, {
    lang: "tsx",
    sourceType: "module",
    astType: "ts",
  });
  const typescript = analyzeToIr(input);
  const oxcExportedComponents = collectOxcExportedComponents(oxc.program);
  const typescriptExportedComponents = typescript.ir.components.map(
    (component) => component.exportName,
  );

  return {
    matches: arraysEqual(oxcExportedComponents, typescriptExportedComponents),
    oxc: {
      errors: oxc.errors.map((error) => error.message),
      exportedComponents: oxcExportedComponents,
    },
    typescript: {
      diagnostics: typescript.diagnostics.map((diagnostic) => diagnostic.code),
      exportedComponents: typescriptExportedComponents,
    },
  };
}

function collectOxcExportedComponents(program: unknown): string[] {
  const body = readArray(readObject(program).body);
  const components: string[] = [];

  for (const statement of body) {
    const object = readObject(statement);

    if (object.type !== "ExportNamedDeclaration") {
      continue;
    }

    const declaration = readObject(object.declaration);

    if (declaration.type !== "FunctionDeclaration") {
      continue;
    }

    if (!hasJsxReturn(declaration.body)) {
      continue;
    }

    const id = readObject(declaration.id);

    if (typeof id.name === "string") {
      components.push(id.name);
    }
  }

  return components;
}

function hasJsxReturn(body: unknown): boolean {
  return readArray(readObject(body).body).some((statement) => {
    const object = readObject(statement);

    if (object.type !== "ReturnStatement") {
      return false;
    }

    return isJsxRoot(readObject(object.argument).type);
  });
}

function isJsxRoot(type: unknown): boolean {
  return (
    type === "JSXElement" ||
    type === "JSXFragment" ||
    type === "JSXSelfClosingElement"
  );
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
