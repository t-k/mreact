import type { ModuleIr } from "./ir.js";
import { analyzeWithOxc } from "./oxc.js";
import type { AnalyzeModuleOptions, CompileTarget, Diagnostic } from "./types.js";
import { parseSync } from "oxc-parser";

export interface AnalyzeToIrInput {
  code: string;
  filename: string;
  target: CompileTarget;
  options?: AnalyzeModuleOptions;
}

export interface AnalyzeToIrOutput {
  ir: ModuleIr;
  diagnostics: Diagnostic[];
  usedTypescriptFallback?: boolean;
}

export function analyzeToIr(input: AnalyzeToIrInput): AnalyzeToIrOutput {
  return analyzeWithOxc(input);
}

export function hasTopLevelExportDeclaration(input: {
  code: string;
  filename?: string | undefined;
  names: readonly string[];
}): boolean {
  const names = new Set(input.names);
  const parsed = parseModule(input.code, input.filename);

  return programBody(parsed.program).some((statement) =>
    exportedNames(statement).some((name) => names.has(name)),
  );
}

export function stripTopLevelExportDeclarations(input: {
  code: string;
  filename?: string | undefined;
  names: readonly string[];
}): string {
  const names = new Set(input.names);
  const parsed = parseModule(input.code, input.filename);
  const removals = programBody(parsed.program)
    .filter((statement) => {
      const exported = exportedNames(statement);
      return exported.length > 0 && exported.every((name) => names.has(name));
    })
    .map((statement) => statementRange(input.code, statement))
    .filter((range): range is { end: number; start: number } => range !== undefined)
    .sort((left, right) => right.start - left.start);
  let code = input.code;

  for (const removal of removals) {
    code = `${code.slice(0, removal.start)}${code.slice(removal.end)}`;
  }

  return code;
}

function parseModule(code: string, filename: string | undefined) {
  const parsed = parseSync(filename ?? "module.tsx", code, {
    astType: "ts",
    lang: "tsx",
    sourceType: "module",
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((error) => error.message).join("\n"));
  }

  return parsed;
}

function programBody(program: unknown): Record<string, unknown>[] {
  const body = readObject(program).body;
  return Array.isArray(body) ? body.map(readObject) : [];
}

function exportedNames(statement: Record<string, unknown>): string[] {
  if (statement.type !== "ExportNamedDeclaration") {
    return [];
  }

  const declaration = readOptionalObject(statement.declaration);

  if (declaration !== undefined) {
    if (declaration.type === "FunctionDeclaration") {
      const name = readOptionalObject(declaration.id)?.name;
      return typeof name === "string" ? [name] : [];
    }

    if (declaration.type === "VariableDeclaration") {
      const declarations = Array.isArray(declaration.declarations) ? declaration.declarations : [];

      return declarations.flatMap((item) => bindingNames(readObject(item).id));
    }

    return [];
  }

  const specifiers = Array.isArray(statement.specifiers) ? statement.specifiers : [];
  return specifiers.flatMap((specifier) => {
    const object = readObject(specifier);
    const exported = readOptionalObject(object.exported);
    const local = readOptionalObject(object.local);
    const name = exported?.name ?? exported?.value ?? local?.name ?? local?.value;

    return typeof name === "string" ? [name] : [];
  });
}

function bindingNames(node: unknown): string[] {
  const object = readObject(node);

  if (typeof object.name === "string") {
    return [object.name];
  }

  if (Array.isArray(object.properties)) {
    return object.properties.flatMap((property) => bindingNames(readObject(property).value));
  }

  if (Array.isArray(object.elements)) {
    return object.elements.flatMap((element) => (element === null ? [] : bindingNames(element)));
  }

  if (object.type === "AssignmentPattern") {
    return bindingNames(object.left);
  }

  if (object.type === "RestElement") {
    return bindingNames(object.argument);
  }

  return [];
}

function statementRange(
  code: string,
  statement: Record<string, unknown>,
): { end: number; start: number } | undefined {
  const start = typeof statement.start === "number" ? statement.start : undefined;
  const end = typeof statement.end === "number" ? statement.end : undefined;

  if (start === undefined || end === undefined) {
    return undefined;
  }

  let removalStart = start;
  while (removalStart > 0 && code[removalStart - 1] !== "\n") {
    if (!/\s/.test(code[removalStart - 1] ?? "")) {
      break;
    }
    removalStart -= 1;
  }

  let removalEnd = end;
  while (removalEnd < code.length && /[ \t]/.test(code[removalEnd] ?? "")) {
    removalEnd += 1;
  }
  if (code[removalEnd] === "\r") {
    removalEnd += 1;
  }
  if (code[removalEnd] === "\n") {
    removalEnd += 1;
  }

  return { start: removalStart, end: removalEnd };
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function readOptionalObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export type {
  AsyncBoundaryIr,
  AttributeIr,
  ComponentIr,
  ComponentPropIr,
  ComponentRefIr,
  ConditionalIr,
  DynamicAttributeIr,
  EventAttributeIr,
  ExprIr,
  JsxElementIr,
  JsxFragmentIr,
  JsxNodeIr,
  ListIr,
  ModuleIr,
  SpreadAttributeIr,
  StaticAttributeIr,
  TextIr,
} from "./ir.js";
