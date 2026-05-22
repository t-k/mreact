import type { ModuleIr } from "./ir.js";
import {
  analyzeCompilerModuleContextWithOxc,
  analyzeWithOxc,
} from "./oxc.js";
import {
  createCompilerModuleContextWithOxc,
  type CompilerModuleContext,
} from "./compiler-module-context.js";
export { transformCompilerModuleContext } from "./transform.js";
export type { CompilerModuleContext } from "./compiler-module-context.js";
import type {
  AnalyzeModuleOptions,
  CompileTarget,
  Diagnostic,
} from "./types.js";

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
}

export interface StaticImportSpecifierReference {
  importedName: string;
  kind: "default" | "named" | "namespace";
  localName: string;
}

export interface ClientRouteStaticImportReference extends StaticImportReference {
  specifiers: StaticImportSpecifierReference[];
}

export interface StaticExportReference {
  exportedNames: string[];
  exportAll: boolean;
  source: string;
}

export interface TopLevelExportRenderInfo {
  calledComponentRoots: string[];
  clientRuntime: boolean;
  name: string;
  renderedComponentRoots: string[];
}

export interface ClientRouteModuleAnalysis {
  clientRuntime: boolean;
  hasUseClientDirective: boolean;
  hasUseServerDirective: boolean;
  componentCallRoots: string[];
  identifierReferences: string[];
  jsxComponentRoots: string[];
  staticExports: StaticExportReference[];
  staticImports: ClientRouteStaticImportReference[];
  topLevelExportRenderInfo: TopLevelExportRenderInfo[];
}

interface ComponentAliasState {
  aliases: Map<string, string>;
  stringConstants: Map<string, string>;
}

export function analyzeToIr(input: AnalyzeToIrInput): AnalyzeToIrOutput {
  return analyzeWithOxc(input);
}

export function analyzeCompilerModuleContextToIr(
  context: CompilerModuleContext,
  input: Omit<AnalyzeToIrInput, "code" | "filename">,
): AnalyzeToIrOutput {
  return analyzeCompilerModuleContextWithOxc(context, input);
}

export function createCompilerModuleContext(input: {
  code: string;
  filename?: string | undefined;
}): CompilerModuleContext {
  return createCompilerModuleContextWithOxc(input);
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
  const aliasState = createComponentAliasState();

  collectJsxComponentRootNamesFromNode(parsed.program, names);
  collectSimpleComponentAliasesFromNode(parsed.program, aliasState);
  expandJsxComponentAliasRoots(names, aliasState.aliases);
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

  return collectTopLevelExportRenderInfoFromProgram(parsed.program);
}

export function collectClientRouteModuleAnalysis(input: {
  code: string;
  filename?: string | undefined;
}): ClientRouteModuleAnalysis {
  const parsed = parseModule(input.code, input.filename);

  return collectClientRouteModuleAnalysisFromContext(parsed);
}

export function collectClientRouteModuleAnalysisFromContext(
  context: CompilerModuleContext,
): ClientRouteModuleAnalysis {
  const parsed = parseModuleContext(context);
  const body = programBody(parsed.program);
  const identifierReferences = new Set<string>();

  collectIdentifierReferenceNamesFromNode(parsed.program, identifierReferences);

  return {
    clientRuntime: hasClientRuntimeSyntaxNode(parsed.program),
    componentCallRoots: collectComponentCallRootNamesFromSubtree(parsed.program),
    hasUseClientDirective: hasModuleDirectiveInProgram(parsed.program, "use client"),
    hasUseServerDirective: hasModuleDirectiveInProgram(parsed.program, "use server"),
    identifierReferences: Array.from(identifierReferences).sort(),
    jsxComponentRoots: collectJsxComponentRootNamesFromSubtree(parsed.program),
    staticExports: body.flatMap(staticExportReference),
    staticImports: body.flatMap(staticImportReference),
    topLevelExportRenderInfo: collectTopLevelExportRenderInfoFromProgram(parsed.program),
  };
}

function collectTopLevelExportRenderInfoFromProgram(program: unknown): TopLevelExportRenderInfo[] {
  const declarations = new Map<string, unknown>();
  const exported = new Map<string, string>();
  const directExports = new Map<string, unknown>();
  const aliasState = createComponentAliasState();

  collectSimpleComponentAliasesFromNode(program, aliasState);

  for (const statement of programBody(program)) {
    collectTopLevelDeclarationReferences(statement, declarations);

    if (statement.type === "ExportDefaultDeclaration") {
      const declaration = readOptionalObject(statement.declaration);
      directExports.set("default", declaration);
      exported.set("default", "default");
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
      const calledComponentRoots = node === undefined
        ? []
        : collectComponentCallRootNamesFromSubtree(
            node,
            aliasState.aliases,
          );
      const renderedComponentRoots = node === undefined
        ? []
        : collectJsxComponentRootNamesFromSubtree(
            node,
            aliasState.aliases,
          );

      return node === undefined
        ? undefined
        : {
            calledComponentRoots,
            clientRuntime:
              hasClientRuntimeSyntaxNode(node) ||
              hasReachableLocalClientRuntime({
                aliases: aliasState.aliases,
                declarations,
                roots: [...calledComponentRoots, ...renderedComponentRoots],
                seen: new Set([localName]),
              }),
            name,
            renderedComponentRoots,
          };
    })
    .filter((item): item is TopLevelExportRenderInfo => item !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function hasReachableLocalClientRuntime(options: {
  aliases: ReadonlyMap<string, string>;
  declarations: ReadonlyMap<string, unknown>;
  roots: readonly string[];
  seen: Set<string>;
}): boolean {
  for (const root of options.roots) {
    const resolved = options.aliases.get(root) ?? root;
    if (options.seen.has(resolved)) {
      continue;
    }

    const declaration = options.declarations.get(resolved);
    if (declaration === undefined) {
      continue;
    }

    if (hasClientRuntimeSyntaxNode(declaration)) {
      return true;
    }

    options.seen.add(resolved);
    const nestedCalledRoots = collectComponentCallRootNamesFromSubtree(
      declaration,
      options.aliases,
    );
    const nestedRenderedRoots = collectJsxComponentRootNamesFromSubtree(
      declaration,
      options.aliases,
    );

    if (
      hasReachableLocalClientRuntime({
        aliases: options.aliases,
        declarations: options.declarations,
        roots: [...nestedCalledRoots, ...nestedRenderedRoots],
        seen: options.seen,
      })
    ) {
      return true;
    }
  }

  return false;
}

export function hasModuleDirective(input: {
  code: string;
  directive: string;
  filename?: string | undefined;
}): boolean {
  const parsed = parseModule(input.code, input.filename);

  return hasModuleDirectiveInProgram(parsed.program, input.directive);
}

function hasModuleDirectiveInProgram(program: unknown, expectedDirective: string): boolean {
  for (const statement of programBody(program)) {
    if (statement.type !== "ExpressionStatement") {
      return false;
    }

    const directive = statement.directive;
    if (typeof directive !== "string") {
      return false;
    }

    if (directive === expectedDirective) {
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
  return parseModuleContext(createCompilerModuleContext({ code, filename }));
}

function parseModuleContext(context: CompilerModuleContext): CompilerModuleContext {
  if (context.parseErrors.length > 0) {
    throw new Error(
      context.parseErrors
        .map((error) => readObject(error).message)
        .filter((message): message is string => typeof message === "string")
        .join("\n"),
    );
  }

  return context;
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

function staticImportReference(
  statement: Record<string, unknown>,
): ClientRouteStaticImportReference[] {
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

function collectJsxComponentRootNamesFromSubtree(
  node: unknown,
  outerAliases?: ReadonlyMap<string, string> | undefined,
): string[] {
  const names = new Set<string>();
  const aliasState = createComponentAliasState(outerAliases);

  collectJsxComponentRootNamesFromNode(node, names);
  collectSimpleComponentAliasesFromNode(node, aliasState);
  expandJsxComponentAliasRoots(names, aliasState.aliases);
  return Array.from(names).sort();
}

function collectComponentCallRootNamesFromNode(
  node: unknown,
  names: Set<string>,
  state: ComponentAliasState,
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectComponentCallRootNamesFromNode(child, names, state);
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

  if (object.type === "CallExpression") {
    const root = expressionRootName(readOptionalObject(object.callee), state);
    if (root !== undefined && /^[A-Z]/.test(root)) {
      names.add(root);
    }
  }

  for (const [key, value] of Object.entries(object)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }

    collectComponentCallRootNamesFromNode(value, names, state);
  }
}

function collectComponentCallRootNamesFromSubtree(
  node: unknown,
  outerAliases?: ReadonlyMap<string, string> | undefined,
): string[] {
  const names = new Set<string>();
  const aliasState = createComponentAliasState(outerAliases);

  collectSimpleComponentAliasesFromNode(node, aliasState);
  collectComponentCallRootNamesFromNode(node, names, aliasState);
  expandJsxComponentAliasRoots(names, aliasState.aliases);
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
  state: ComponentAliasState,
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectSimpleComponentAliasesFromNode(child, state);
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
    const declarations = Array.isArray(object.declarations) ? object.declarations : [];
    for (const declaration of declarations) {
      collectVariableDeclaratorComponentAliases(readOptionalObject(declaration), state, constant);
    }
    return;
  }

  if (object.type === "VariableDeclarator") {
    collectVariableDeclaratorComponentAliases(object, state, false);
  }

  if (object.type === "AssignmentExpression") {
    collectAssignmentComponentAlias(object, state);
  }

  if (object.type === "CallExpression") {
    collectObjectAssignComponentAliases(object, state);
  }

  for (const [key, value] of Object.entries(object)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }

    collectSimpleComponentAliasesFromNode(value, state);
  }
}

function createComponentAliasState(
  aliases?: ReadonlyMap<string, string> | undefined,
): ComponentAliasState {
  return {
    aliases: new Map(aliases),
    stringConstants: new Map(),
  };
}

function collectVariableDeclaratorComponentAliases(
  object: Record<string, unknown> | undefined,
  state: ComponentAliasState,
  constant: boolean,
): void {
  if (object?.type !== "VariableDeclarator") {
    return;
  }

  const id = readOptionalObject(object.id);
  const init = readOptionalObject(object.init);
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

  collectObjectLiteralComponentAliases(aliasName, init, state);

  const rootName = expressionRootName(init, state);
  if (rootName !== undefined) {
    state.aliases.set(aliasName, rootName);
  }
}

function collectObjectLiteralComponentAliases(
  objectName: string | undefined,
  init: Record<string, unknown> | undefined,
  state: ComponentAliasState,
): void {
  if (objectName === undefined || init?.type !== "ObjectExpression") {
    return;
  }

  const properties = Array.isArray(init.properties) ? init.properties : [];
  for (const propertyValue of properties) {
    const property = readOptionalObject(propertyValue);
    if (property?.type !== "Property") {
      continue;
    }

    const keyName = propertyName(readOptionalObject(property.key), property.computed === true, state);
    const valueName = expressionRootName(readOptionalObject(property.value), state);
    if (keyName !== undefined && valueName !== undefined) {
      state.aliases.set(`${objectName}.${keyName}`, valueName);
    }
  }
}

function collectAssignmentComponentAlias(
  node: Record<string, unknown>,
  state: ComponentAliasState,
): void {
  if (node.operator !== "=") {
    return;
  }

  const left = readOptionalObject(node.left);
  const right = readOptionalObject(node.right);
  if (left?.type !== "MemberExpression") {
    return;
  }

  const objectRoot = expressionRootName(readOptionalObject(left.object), state);
  const memberName = propertyName(readOptionalObject(left.property), left.computed === true, state);
  const valueName = expressionRootName(right, state);
  if (objectRoot !== undefined && memberName !== undefined && valueName !== undefined) {
    state.aliases.set(`${objectRoot}.${memberName}`, valueName);
  }
}

function collectObjectAssignComponentAliases(
  node: Record<string, unknown>,
  state: ComponentAliasState,
): void {
  if (!isObjectAssignCall(node)) {
    return;
  }

  const args = Array.isArray(node.arguments) ? node.arguments.map(readOptionalObject) : [];
  const target = expressionRootName(args[0], state);
  if (target === undefined) {
    return;
  }

  for (const source of args.slice(1)) {
    collectObjectLiteralComponentAliases(target, source, state);
  }
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

function expressionRootName(
  node: Record<string, unknown> | undefined,
  state?: ComponentAliasState | undefined,
): string | undefined {
  if (node === undefined) {
    return undefined;
  }

  if (node.type === "Identifier" && typeof node.name === "string") {
    return node.name;
  }

  if (node.type === "MemberExpression") {
    const objectRoot = expressionRootName(readOptionalObject(node.object), state);
    const aliasedObjectRoot =
      objectRoot === undefined ? undefined : state?.aliases.get(objectRoot) ?? objectRoot;
    const memberName = propertyName(readOptionalObject(node.property), node.computed === true, state);
    const memberAlias =
      objectRoot !== undefined && memberName !== undefined
        ? state?.aliases.get(`${objectRoot}.${memberName}`) ??
          (aliasedObjectRoot === undefined
            ? undefined
            : state?.aliases.get(`${aliasedObjectRoot}.${memberName}`))
        : undefined;

    return memberAlias ??
      (node.computed === true && memberName === undefined
        ? uniqueObjectMemberAlias(aliasedObjectRoot, state)
        : aliasedObjectRoot);
  }

  if (node.type === "ConditionalExpression") {
    return uniqueDefinedString([
      expressionRootName(readOptionalObject(node.consequent), state),
      expressionRootName(readOptionalObject(node.alternate), state),
    ]);
  }

  if (
    node.type === "ChainExpression" ||
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSNonNullExpression" ||
    node.type === "ParenthesizedExpression"
  ) {
    return expressionRootName(readOptionalObject(node.expression), state);
  }

  return undefined;
}

function propertyName(
  node: Record<string, unknown> | undefined,
  computed: boolean,
  state?: ComponentAliasState | undefined,
): string | undefined {
  if (!computed && node?.type === "Identifier" && typeof node.name === "string") {
    return node.name;
  }

  if (computed && node?.type === "Identifier" && typeof node.name === "string") {
    return state?.stringConstants.get(node.name);
  }

  return stringExpressionValue(node, state);
}

function stringExpressionValue(
  node: Record<string, unknown> | undefined,
  state?: ComponentAliasState | undefined,
): string | undefined {
  if (
    (node?.type === "StringLiteral" || node?.type === "Literal") &&
    typeof node.value === "string"
  ) {
    return node.value;
  }

  if (node?.type === "ConditionalExpression") {
    return uniqueDefinedString([
      stringExpressionValue(readOptionalObject(node.consequent), state),
      stringExpressionValue(readOptionalObject(node.alternate), state),
    ]);
  }

  if (node?.type === "Identifier" && typeof node.name === "string") {
    return state?.stringConstants.get(node.name);
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

function uniqueObjectMemberAlias(
  objectName: string | undefined,
  state?: ComponentAliasState | undefined,
): string | undefined {
  if (objectName === undefined || state === undefined) {
    return undefined;
  }

  const prefix = `${objectName}.`;
  return uniqueDefinedString(
    Array.from(state.aliases.entries())
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value),
  );
}

function uniqueDefinedString(values: readonly (string | undefined)[]): string | undefined {
  const unique = new Set(values.filter((value): value is string => value !== undefined));
  return unique.size === 1 ? Array.from(unique)[0] : undefined;
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
