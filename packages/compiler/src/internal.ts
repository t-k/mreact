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

export interface StaticImportReference {
  localNames: string[];
  sideEffect: boolean;
  source: string;
  specifiers: StaticImportSpecifierReference[];
}

export interface StaticImportSpecifierReference {
  importedName: string;
  kind: "default" | "named" | "namespace";
  localName: string;
}

export interface StaticExportReference {
  exportedNames: string[];
  exportAll: boolean;
  source: string;
}

export interface TopLevelExportRenderInfo {
  clientRuntime: boolean;
  name: string;
  renderedComponentRoots: string[];
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

export function demoteTopLevelExportDeclarations(input: {
  code: string;
  filename?: string | undefined;
  names: readonly string[];
}): string {
  const names = new Set(input.names);
  const parsed = parseModule(input.code, input.filename);
  const replacements = programBody(parsed.program)
    .map((statement) => exportDeclarationDemotion(input.code, statement, names))
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

export function collectStaticImportReferences(input: {
  code: string;
  filename?: string | undefined;
}): StaticImportReference[] {
  const parsed = parseModule(input.code, input.filename);

  return programBody(parsed.program).flatMap(staticImportReference);
}

export function collectStaticExportReferences(input: {
  code: string;
  filename?: string | undefined;
}): StaticExportReference[] {
  const parsed = parseModule(input.code, input.filename);

  return programBody(parsed.program).flatMap(staticExportReference);
}

export function collectJsxComponentRootNames(input: {
  code: string;
  filename?: string | undefined;
}): string[] {
  const parsed = parseModule(input.code, input.filename);
  const names = new Set<string>();
  const aliases = new Map<string, string>();

  collectJsxComponentRootNamesFromNode(parsed.program, names);
  collectSimpleComponentAliasesFromNode(parsed.program, aliases);
  expandJsxComponentAliasRoots(names, aliases);
  return Array.from(names).sort();
}

export function collectIdentifierReferenceNames(input: {
  code: string;
  filename?: string | undefined;
}): string[] {
  const parsed = parseModule(input.code, input.filename);
  const names = new Set<string>();

  collectIdentifierReferenceNamesFromNode(parsed.program, names);
  return Array.from(names).sort();
}

export function collectTopLevelValueExportNames(input: {
  code: string;
  filename?: string | undefined;
}): string[] {
  const parsed = parseModule(input.code, input.filename);
  const names = new Set<string>();

  for (const statement of programBody(parsed.program)) {
    for (const name of exportedNames(statement)) {
      names.add(name);
    }
  }

  return Array.from(names).sort();
}

export function collectTopLevelExportRenderInfo(input: {
  code: string;
  filename?: string | undefined;
}): TopLevelExportRenderInfo[] {
  const parsed = parseModule(input.code, input.filename);
  const declarations = new Map<string, unknown>();
  const exported = new Map<string, string>();
  const directExports = new Map<string, unknown>();

  for (const statement of programBody(parsed.program)) {
    collectTopLevelDeclarationReferences(statement, declarations);

    if (statement.type === "ExportDefaultDeclaration") {
      const declaration = readOptionalObject(statement.declaration);
      const localName = typeof declaration?.name === "string" ? declaration.name : undefined;
      directExports.set("default", declaration);

      if (localName !== undefined) {
        exported.set("default", localName);
      }
      continue;
    }

    if (statement.type !== "ExportNamedDeclaration") {
      continue;
    }

    const declaration = readOptionalObject(statement.declaration);
    if (declaration !== undefined) {
      for (const name of exportedNames(statement)) {
        exported.set(name, name);
        directExports.set(name, declarationForExportedName(declaration, name) ?? declaration);
      }
      continue;
    }

    const specifiers = Array.isArray(statement.specifiers) ? statement.specifiers.map(readObject) : [];
    for (const specifier of specifiers) {
      const exportedName = exportedNameForSpecifier(specifier);
      const localName = localNameForExportSpecifier(specifier);

      if (exportedName !== undefined && localName !== undefined) {
        exported.set(exportedName, localName);
      }
    }
  }

  return [...exported.entries()]
    .map(([name, localName]) => {
      const node = directExports.get(name) ?? declarations.get(localName);

      return node === undefined
        ? undefined
        : {
            clientRuntime: hasClientRuntimeSyntaxNode(node),
            name,
            renderedComponentRoots: collectJsxComponentRootNamesFromSubtree(node),
          };
    })
    .filter((item): item is TopLevelExportRenderInfo => item !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function hasModuleDirective(input: {
  code: string;
  directive: string;
  filename?: string | undefined;
}): boolean {
  const parsed = parseModule(input.code, input.filename);

  for (const statement of programBody(parsed.program)) {
    if (statement.type !== "ExpressionStatement") {
      return false;
    }

    const directive = statement.directive;
    if (typeof directive !== "string") {
      return false;
    }

    if (directive === input.directive) {
      return true;
    }
  }

  return false;
}

export function hasClientRuntimeSyntax(input: {
  code: string;
  filename?: string | undefined;
}): boolean {
  const parsed = parseModule(input.code, input.filename);

  return hasClientRuntimeSyntaxNode(parsed.program);
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
  if (statement.type === "ExportDefaultDeclaration") {
    return ["default"];
  }

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

function collectTopLevelDeclarationReferences(
  statement: Record<string, unknown>,
  declarations: Map<string, unknown>,
): void {
  const declaration =
    statement.type === "ExportNamedDeclaration"
      ? readOptionalObject(statement.declaration)
      : statement;

  if (declaration?.type === "FunctionDeclaration") {
    const name = readOptionalObject(declaration.id)?.name;

    if (typeof name === "string") {
      declarations.set(name, declaration);
    }
    return;
  }

  if (declaration?.type !== "VariableDeclaration") {
    return;
  }

  const declarators = Array.isArray(declaration.declarations)
    ? declaration.declarations.map(readObject)
    : [];

  for (const declarator of declarators) {
    const id = readOptionalObject(declarator.id);
    const name = typeof id?.name === "string" ? id.name : undefined;

    if (name !== undefined) {
      declarations.set(name, readOptionalObject(declarator.init) ?? declarator);
    }
  }
}

function declarationForExportedName(
  declaration: Record<string, unknown>,
  name: string,
): unknown | undefined {
  if (declaration.type === "VariableDeclaration") {
    const declarators = Array.isArray(declaration.declarations)
      ? declaration.declarations.map(readObject)
      : [];

    for (const declarator of declarators) {
      if (bindingNames(declarator.id).includes(name)) {
        return readOptionalObject(declarator.init) ?? declarator;
      }
    }
  }

  return declaration;
}

function localNameForExportSpecifier(specifier: Record<string, unknown>): string | undefined {
  const local = readOptionalObject(specifier.local);
  const name = local?.name ?? local?.value;

  return typeof name === "string" ? name : undefined;
}

function exportDeclarationDemotion(
  code: string,
  statement: Record<string, unknown>,
  names: ReadonlySet<string>,
): Replacement | undefined {
  if (statement.type !== "ExportNamedDeclaration") {
    return undefined;
  }

  const declaration = readOptionalObject(statement.declaration);
  const exported = exportedNames(statement);

  if (exported.length === 0 || !exported.every((name) => names.has(name))) {
    return partialSpecifierExportReplacement(code, statement, names);
  }

  const range = statementRange(code, statement);

  if (range === undefined) {
    return undefined;
  }

  if (declaration?.type === "FunctionDeclaration" || declaration?.type === "VariableDeclaration") {
    return { ...range, text: `${nodeText(code, declaration)}\n` };
  }

  return { ...range, text: "" };
}

function exportDeclarationReplacement(
  code: string,
  statement: Record<string, unknown>,
  names: ReadonlySet<string>,
): Replacement | undefined {
  if (statement.type === "ExportDefaultDeclaration") {
    const range = statementRange(code, statement);
    return names.has("default") && range !== undefined ? { ...range, text: "" } : undefined;
  }

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

function staticImportReference(statement: Record<string, unknown>): StaticImportReference[] {
  if (statement.type !== "ImportDeclaration" || statement.importKind === "type") {
    return [];
  }

  const source = sourceValue(statement)[0];
  if (source === undefined) {
    return [];
  }

  const specifiers = Array.isArray(statement.specifiers)
    ? statement.specifiers.map(readObject)
    : [];
  const importSpecifiers = specifiers.flatMap(staticImportSpecifierReference);
  const localNames = specifiers
    .filter((specifier) => specifier.importKind !== "type")
    .flatMap((specifier) => {
      const local = readOptionalObject(specifier.local);
      return typeof local?.name === "string" ? [local.name] : [];
    });

  return [
    {
      localNames,
      sideEffect: localNames.length === 0,
      source,
      specifiers: importSpecifiers,
    },
  ];
}

function staticImportSpecifierReference(
  specifier: Record<string, unknown>,
): StaticImportSpecifierReference[] {
  if (specifier.importKind === "type") {
    return [];
  }

  const localName = readOptionalObject(specifier.local)?.name;
  if (typeof localName !== "string") {
    return [];
  }

  if (specifier.type === "ImportDefaultSpecifier") {
    return [{ importedName: "default", kind: "default", localName }];
  }

  if (specifier.type === "ImportNamespaceSpecifier") {
    return [{ importedName: "*", kind: "namespace", localName }];
  }

  const imported = readOptionalObject(specifier.imported);
  const importedName = imported?.name ?? imported?.value;
  return typeof importedName === "string"
    ? [{ importedName, kind: "named", localName }]
    : [];
}

function staticExportReference(statement: Record<string, unknown>): StaticExportReference[] {
  if (statement.type === "ExportAllDeclaration") {
    if (statement.exportKind === "type") {
      return [];
    }

    const source = sourceValue(statement)[0];
    return source === undefined
      ? []
      : [{ exportedNames: [], exportAll: true, source }];
  }

  if (statement.type !== "ExportNamedDeclaration" || statement.exportKind === "type") {
    return [];
  }

  const source = sourceValue(statement)[0];
  if (source === undefined) {
    return [];
  }

  return [
    {
      exportedNames: exportedNames(statement),
      exportAll: false,
      source,
    },
  ];
}

function sourceValue(statement: Record<string, unknown>): string[] {
  const source = readOptionalObject(statement.source);
  const value = source?.value;

  return typeof value === "string" ? [value] : [];
}

function collectJsxComponentRootNamesFromNode(
  node: unknown,
  names: Set<string>,
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectJsxComponentRootNamesFromNode(child, names);
    }
    return;
  }

  const object = readOptionalObject(node);
  if (object === undefined) {
    return;
  }

  if (object.type === "JSXElement") {
    const opening = readOptionalObject(object.openingElement);
    const nameNode = readOptionalObject(opening?.name);
    const name = jsxNameRoot(nameNode);
    if (name !== undefined && (nameNode?.type === "JSXMemberExpression" || /^[A-Z]/.test(name))) {
      names.add(name);
    }
  }

  for (const [key, value] of Object.entries(object)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }

    collectJsxComponentRootNamesFromNode(value, names);
  }
}

function collectJsxComponentRootNamesFromSubtree(node: unknown): string[] {
  const names = new Set<string>();
  const aliases = new Map<string, string>();

  collectJsxComponentRootNamesFromNode(node, names);
  collectSimpleComponentAliasesFromNode(node, aliases);
  expandJsxComponentAliasRoots(names, aliases);
  return Array.from(names).sort();
}

function jsxNameRoot(node: Record<string, unknown> | undefined): string | undefined {
  if (node === undefined) {
    return undefined;
  }

  if (typeof node.name === "string") {
    return node.name;
  }

  if (node.type === "JSXMemberExpression") {
    return jsxNameRoot(readOptionalObject(node.object));
  }

  return undefined;
}

function collectSimpleComponentAliasesFromNode(
  node: unknown,
  aliases: Map<string, string>,
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectSimpleComponentAliasesFromNode(child, aliases);
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

  if (object.type === "VariableDeclarator") {
    const id = readOptionalObject(object.id);
    const init = readOptionalObject(object.init);
    const aliasName = typeof id?.name === "string" ? id.name : undefined;
    const rootName = expressionRootName(init);

    if (aliasName !== undefined && rootName !== undefined) {
      aliases.set(aliasName, rootName);
    }
  }

  for (const [key, value] of Object.entries(object)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }

    collectSimpleComponentAliasesFromNode(value, aliases);
  }
}

function expandJsxComponentAliasRoots(
  names: Set<string>,
  aliases: ReadonlyMap<string, string>,
): void {
  let changed = true;

  while (changed) {
    changed = false;

    for (const [alias, root] of aliases) {
      if (names.has(alias) && !names.has(root)) {
        names.add(root);
        changed = true;
      }
    }
  }
}

function expressionRootName(node: Record<string, unknown> | undefined): string | undefined {
  if (node === undefined) {
    return undefined;
  }

  if (node.type === "Identifier" && typeof node.name === "string") {
    return node.name;
  }

  if (node.type === "MemberExpression") {
    return expressionRootName(readOptionalObject(node.object));
  }

  if (
    node.type === "ChainExpression" ||
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSNonNullExpression" ||
    node.type === "ParenthesizedExpression"
  ) {
    return expressionRootName(readOptionalObject(node.expression));
  }

  return undefined;
}

function collectIdentifierReferenceNamesFromNode(
  node: unknown,
  names: Set<string>,
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectIdentifierReferenceNamesFromNode(child, names);
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

  if (object.type === "ImportDeclaration") {
    return;
  }

  if (
    (object.type === "Identifier" || object.type === "JSXIdentifier") &&
    typeof object.name === "string"
  ) {
    names.add(object.name);
  }

  for (const [key, value] of Object.entries(object)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }

    collectIdentifierReferenceNamesFromNode(value, names);
  }
}

function hasClientRuntimeSyntaxNode(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(hasClientRuntimeSyntaxNode);
  }

  const object = readOptionalObject(node);
  if (object === undefined) {
    return false;
  }

  if (typeof object.type === "string" && object.type.startsWith("TS")) {
    return false;
  }

  if (object.type === "ImportDeclaration") {
    return false;
  }

  if (object.type === "ExportAllDeclaration") {
    return false;
  }

  if (object.type === "ExportNamedDeclaration" || object.type === "ExportDefaultDeclaration") {
    return hasClientRuntimeSyntaxNode(object.declaration);
  }

  if (object.type === "JSXAttribute") {
    const name = readOptionalObject(object.name)?.name;
    return typeof name === "string" && /^on[A-Z]/.test(name);
  }

  if (object.type === "CallExpression") {
    const callee = readOptionalObject(object.callee);
    if (callee?.type === "Identifier" && callee.name === "cell") {
      return true;
    }
  }

  if (object.type === "Identifier" && isClientRuntimeGlobal(object.name)) {
    return true;
  }

  if (object.type === "MemberExpression") {
    return (
      hasClientRuntimeSyntaxNode(object.object) ||
      (object.computed === true && hasClientRuntimeSyntaxNode(object.property))
    );
  }

  for (const [key, value] of Object.entries(object)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }

    if (hasClientRuntimeSyntaxNode(value)) {
      return true;
    }
  }

  return false;
}

function isClientRuntimeGlobal(name: unknown): boolean {
  return name === "window" || name === "document" || name === "localStorage";
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
