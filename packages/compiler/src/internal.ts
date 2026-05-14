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
  const replacements = programBody(parsed.program)
    .map((statement) => exportDeclarationReplacement(input.code, statement, names))
    .filter((replacement): replacement is Replacement => replacement !== undefined)
    .sort((left, right) => right.start - left.start);
  let code = input.code;

  for (const replacement of replacements) {
    code = `${code.slice(0, replacement.start)}${replacement.text}${code.slice(replacement.end)}`;
  }

  return code;
}

export function collectStaticModuleSpecifiers(input: {
  code: string;
  filename?: string | undefined;
}): string[] {
  const parsed = parseModule(input.code, input.filename);

  return programBody(parsed.program).flatMap(staticModuleSpecifier);
}

interface Replacement {
  end: number;
  start: number;
  text: string;
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
    const name = exportedNameForSpecifier(readObject(specifier));

    return typeof name === "string" ? [name] : [];
  });
}

function exportDeclarationReplacement(
  code: string,
  statement: Record<string, unknown>,
  names: ReadonlySet<string>,
): Replacement | undefined {
  if (statement.type !== "ExportNamedDeclaration") {
    return undefined;
  }

  const partial = partialExportDeclarationReplacement(code, statement, names);

  if (partial !== undefined) {
    return partial;
  }

  const exported = exportedNames(statement);
  if (exported.length === 0 || !exported.every((name) => names.has(name))) {
    return undefined;
  }

  const range = statementRange(code, statement);
  return range === undefined ? undefined : { ...range, text: "" };
}

function partialExportDeclarationReplacement(
  code: string,
  statement: Record<string, unknown>,
  names: ReadonlySet<string>,
): Replacement | undefined {
  const declaration = readOptionalObject(statement.declaration);

  if (declaration?.type === "VariableDeclaration") {
    return partialVariableExportReplacement(code, statement, declaration, names);
  }

  if (declaration !== undefined) {
    return undefined;
  }

  return partialSpecifierExportReplacement(code, statement, names);
}

function partialVariableExportReplacement(
  code: string,
  statement: Record<string, unknown>,
  declaration: Record<string, unknown>,
  names: ReadonlySet<string>,
): Replacement | undefined {
  const declarations = Array.isArray(declaration.declarations)
    ? declaration.declarations.map(readObject)
    : [];

  if (declarations.length <= 1) {
    return undefined;
  }

  const kept = declarations.filter((declarator) => {
    const declaredNames = bindingNames(declarator.id);
    return declaredNames.every((name) => !names.has(name));
  });

  if (kept.length === declarations.length) {
    return undefined;
  }

  if (kept.length === 0) {
    const range = statementRange(code, statement);
    return range === undefined ? undefined : { ...range, text: "" };
  }

  const range = statementRange(code, statement);
  const kind = typeof declaration.kind === "string" ? declaration.kind : "const";

  return range === undefined
    ? undefined
    : {
        ...range,
        text: `export ${kind} ${kept.map((item) => nodeText(code, item)).join(", ")};\n`,
      };
}

function partialSpecifierExportReplacement(
  code: string,
  statement: Record<string, unknown>,
  names: ReadonlySet<string>,
): Replacement | undefined {
  const specifiers = Array.isArray(statement.specifiers)
    ? statement.specifiers.map(readObject)
    : [];

  if (specifiers.length <= 1) {
    return undefined;
  }

  const kept = specifiers.filter((specifier) => {
    const name = exportedNameForSpecifier(specifier);
    return typeof name !== "string" || !names.has(name);
  });

  if (kept.length === specifiers.length) {
    return undefined;
  }

  const range = statementRange(code, statement);
  if (range === undefined) {
    return undefined;
  }

  if (kept.length === 0) {
    return { ...range, text: "" };
  }

  const source = readOptionalObject(statement.source);
  const sourceText = source === undefined ? "" : ` from ${nodeText(code, source)}`;
  const exportKind = statement.exportKind === "type" ? "export type" : "export";

  return {
    ...range,
    text: `${exportKind} { ${kept.map((item) => nodeText(code, item)).join(", ")} }${sourceText};\n`,
  };
}

function staticModuleSpecifier(statement: Record<string, unknown>): string[] {
  if (statement.type === "ImportDeclaration") {
    if (statement.importKind === "type") {
      return [];
    }

    return sourceValue(statement);
  }

  if (statement.type === "ExportAllDeclaration" || statement.type === "ExportNamedDeclaration") {
    if (statement.exportKind === "type") {
      return [];
    }

    return sourceValue(statement);
  }

  return [];
}

function sourceValue(statement: Record<string, unknown>): string[] {
  const source = readOptionalObject(statement.source);
  const value = source?.value;

  return typeof value === "string" ? [value] : [];
}

function exportedNameForSpecifier(specifier: Record<string, unknown>): string | undefined {
  const exported = readOptionalObject(specifier.exported);
  const local = readOptionalObject(specifier.local);
  const name = exported?.name ?? exported?.value ?? local?.name ?? local?.value;

  return typeof name === "string" ? name : undefined;
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

function nodeText(code: string, node: Record<string, unknown>): string {
  const start = typeof node.start === "number" ? node.start : undefined;
  const end = typeof node.end === "number" ? node.end : undefined;

  return start === undefined || end === undefined ? "" : code.slice(start, end);
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
