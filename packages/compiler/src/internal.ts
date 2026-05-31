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
export { stripTypeScriptWithOxc } from "./oxc-transform.js";
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
  specifiers: StaticExportSpecifierReference[];
  source: string;
}

export interface StaticExportSpecifierReference {
  exportedName: string;
  localName: string;
}

export interface TopLevelExportRenderInfo {
  calledComponentRoots: string[];
  clientRuntime: boolean;
  name: string;
  renderedComponentRoots: string[];
}

export interface ClientRouteModuleAnalysis {
  clientRuntime: boolean;
  defaultExportIdentifier: string | undefined;
  hasUseClientDirective: boolean;
  hasUseServerDirective: boolean;
  componentCallRoots: string[];
  identifierReferences: string[];
  jsxComponentRoots: string[];
  reachableExportRenderedComponentNames: Record<string, string[]>;
  reachableExportRenderedComponentRoots: Record<string, string[]>;
  reachableRenderedComponentNames: string[];
  reachableRenderedComponentRoots: string[];
  staticExports: StaticExportReference[];
  staticImports: ClientRouteStaticImportReference[];
  topLevelExportRenderInfo: TopLevelExportRenderInfo[];
}

export interface FormActionReference {
  end: number;
  name: string;
  start: number;
}

export interface FormActionExpressionReference {
  end: number;
  expression: string;
  expressionEnd: number;
  expressionStart: number;
  start: number;
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

// Reads the value of a top-level `export const <name> = <boolean literal>`
// declaration. Returns `undefined` when the export is absent or not a boolean
// literal. AST-based so commented-out or string-literal occurrences of the same
// text are not mistaken for a real export.
export function readTopLevelBooleanExport(input: {
  code: string;
  filename?: string | undefined;
  name: string;
}): boolean | undefined {
  return readTopLevelBooleanExportFromContext(
    createCompilerModuleContext({ code: input.code, filename: input.filename }),
    input.name,
  );
}

// Context-accepting variant so callers with a cached `CompilerModuleContext`
// (e.g. the dev server) avoid re-parsing the module per request.
export function readTopLevelBooleanExportFromContext(
  context: CompilerModuleContext,
  name: string,
): boolean | undefined {
  const parsed = parseModuleContext(context);

  for (const statement of programBody(parsed.program)) {
    if (statement.type !== "ExportNamedDeclaration") {
      continue;
    }

    const declaration = readOptionalObject(statement.declaration);
    if (declaration?.type !== "VariableDeclaration") {
      continue;
    }

    const declarators = Array.isArray(declaration.declarations)
      ? declaration.declarations.map(readObject)
      : [];

    for (const declarator of declarators) {
      const id = readOptionalObject(declarator.id);
      if (typeof id?.name !== "string" || id.name !== name) {
        continue;
      }

      const value = booleanExpressionValue(readOptionalObject(declarator.init));
      if (value !== undefined) {
        return value;
      }
    }
  }

  return undefined;
}

function booleanExpressionValue(node: Record<string, unknown> | undefined): boolean | undefined {
  if (
    (node?.type === "BooleanLiteral" || node?.type === "Literal") &&
    typeof node.value === "boolean"
  ) {
    return node.value;
  }

  if (
    node?.type === "TSAsExpression" ||
    node?.type === "TSSatisfiesExpression" ||
    node?.type === "ParenthesizedExpression"
  ) {
    return booleanExpressionValue(readOptionalObject(node.expression));
  }

  return undefined;
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

export function stripUnusedStaticValueImports(input: {
  code: string;
  filename?: string | undefined;
}): string {
  const parsed = parseModule(input.code, input.filename);
  const referencedNames = new Set(collectIdentifierReferenceNames(input));
  const replacements = programBody(parsed.program)
    .map((statement) =>
      unusedStaticValueImportReplacement(input.code, statement, referencedNames),
    )
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

export function collectFormActionReferenceNames(input: {
  code: string;
  filename?: string | undefined;
}): string[] {
  return Array.from(
    new Set(collectFormActionReferences(input).map((reference) => reference.name)),
  ).sort();
}

export function collectFormActionReferences(input: {
  code: string;
  filename?: string | undefined;
}): FormActionReference[] {
  const parsed = parseModule(input.code, input.filename);
  const references: FormActionReference[] = [];

  collectFormActionReferencesFromNode(parsed.program, references);
  return references.sort((left, right) =>
    left.start === right.start ? left.name.localeCompare(right.name) : left.start - right.start,
  );
}

export function collectFormActionExpressionReferences(input: {
  code: string;
  filename?: string | undefined;
}): FormActionExpressionReference[] {
  const parsed = parseModule(input.code, input.filename);
  const references: FormActionExpressionReference[] = [];

  collectFormActionExpressionReferencesFromNode(input.code, parsed.program, references);
  return references.sort((left, right) =>
    left.start === right.start
      ? left.expression.localeCompare(right.expression)
      : left.start - right.start,
  );
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
  const reachableRenderedComponents = collectReachableExportRenderedComponentsFromProgram(
    parsed.program,
  );

  collectIdentifierReferenceNamesFromNode(parsed.program, identifierReferences);

  return {
    clientRuntime: hasClientRuntimeSyntaxNode(parsed.program),
    defaultExportIdentifier: reachableRenderedComponents.defaultExportIdentifier,
    componentCallRoots: collectComponentCallRootNamesFromSubtree(parsed.program),
    hasUseClientDirective: hasModuleDirectiveInProgram(parsed.program, "use client"),
    hasUseServerDirective: hasModuleDirectiveInProgram(parsed.program, "use server"),
    identifierReferences: Array.from(identifierReferences).sort(),
    jsxComponentRoots: collectJsxComponentRootNamesFromSubtree(parsed.program),
    reachableExportRenderedComponentNames: reachableRenderedComponents.perExportNames,
    reachableExportRenderedComponentRoots: reachableRenderedComponents.perExportRoots,
    reachableRenderedComponentNames: reachableRenderedComponents.names,
    reachableRenderedComponentRoots: reachableRenderedComponents.roots,
    staticExports: body.flatMap(staticExportReference),
    staticImports: body.flatMap(staticImportReference),
    topLevelExportRenderInfo: collectTopLevelExportRenderInfoFromProgram(parsed.program),
  };
}

interface ModuleExportMap {
  aliasState: ComponentAliasState;
  declarations: Map<string, unknown>;
  // Local name when the default export is a bare identifier
  // (`export default Page`), including when that identifier is an import
  // binding. Such an identifier is the route's rendered component even though
  // the module body contains no JSX for it.
  defaultExportIdentifier: string | undefined;
  directExports: Map<string, unknown>;
  exported: Map<string, string>;
}

// Builds the module's export surface: top-level declarations by name, the
// exported-name -> local-name map, and direct export declaration nodes. A
// default export that references an identifier (`export default Page`) is
// resolved through `declarations` so it behaves like `export { Page as default
// }` rather than stopping at the bare identifier node.
function collectModuleExportMap(program: unknown): ModuleExportMap {
  const declarations = new Map<string, unknown>();
  const exported = new Map<string, string>();
  const directExports = new Map<string, unknown>();
  const aliasState = createComponentAliasState();
  let defaultExportIdentifier: string | undefined;

  collectSimpleComponentAliasesFromNode(program, aliasState);

  for (const statement of programBody(program)) {
    collectTopLevelDeclarationReferences(statement, declarations);

    if (statement.type === "ExportDefaultDeclaration") {
      const declaration = readOptionalObject(statement.declaration);

      if (declaration?.type === "Identifier" && typeof declaration.name === "string") {
        exported.set("default", declaration.name);
        defaultExportIdentifier = declaration.name;
      } else {
        directExports.set("default", declaration);
        exported.set("default", "default");
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

  return { aliasState, declarations, defaultExportIdentifier, directExports, exported };
}

function collectTopLevelExportRenderInfoFromProgram(program: unknown): TopLevelExportRenderInfo[] {
  const { aliasState, declarations, directExports, exported } = collectModuleExportMap(program);

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
      const clientRuntime = node === undefined
        ? false
        : hasReachableExportClientRuntime({
            aliases: aliasState.aliases,
            declarations,
            localName,
            node,
          });

      return node === undefined
        ? undefined
        : {
            calledComponentRoots,
            clientRuntime,
            name,
            renderedComponentRoots,
          };
    })
    .filter((item): item is TopLevelExportRenderInfo => item !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));
}

interface ReachableExportRenderedComponents {
  defaultExportIdentifier: string | undefined;
  names: string[];
  roots: string[];
  perExportNames: Record<string, string[]>;
  perExportRoots: Record<string, string[]>;
}

// Collects the JSX components that are actually reachable from the module's
// exports, walking transitively through same-file declarations (including
// non-exported helper components). Unlike the file-wide `jsxComponentRoots`,
// this excludes components rendered only inside dead/unreachable code, so it
// reflects what the route's server-rendered tree truly contains. Per-export
// breakdowns let callers attribute a rendered component to the specific export
// whose subtree renders it (e.g. to keep barrel re-exports precise).
function collectReachableExportRenderedComponentsFromProgram(
  program: unknown,
): ReachableExportRenderedComponents {
  const { aliasState, declarations, defaultExportIdentifier, directExports, exported } =
    collectModuleExportMap(program);

  const names = new Set<string>();
  const roots = new Set<string>();
  const perExportNames: Record<string, string[]> = {};
  const perExportRoots: Record<string, string[]> = {};

  const visit = (
    node: unknown,
    exportRoots: Set<string>,
    exportNames: Set<string>,
    seen: Set<string>,
  ): void => {
    const renderedRoots = collectJsxComponentRootNamesFromSubtree(node, aliasState.aliases);
    for (const root of renderedRoots) {
      exportRoots.add(root);
      roots.add(root);
    }

    const renderedNames = collectJsxComponentNamesFromSubtree(node, aliasState.aliases);
    for (const name of renderedNames) {
      exportNames.add(name);
      names.add(name);
    }

    const calledRoots = collectComponentCallRootNamesFromSubtree(node, aliasState.aliases);
    for (const root of [...renderedRoots, ...calledRoots]) {
      const resolved = aliasState.aliases.get(root) ?? root;

      if (seen.has(resolved)) {
        continue;
      }

      seen.add(resolved);
      const declaration = declarations.get(resolved);

      if (declaration !== undefined) {
        visit(declaration, exportRoots, exportNames, seen);
      }
    }
  };

  for (const [name, localName] of exported.entries()) {
    const node = directExports.get(name) ?? declarations.get(localName);

    if (node === undefined) {
      continue;
    }

    const exportRoots = new Set<string>();
    const exportNames = new Set<string>();
    visit(node, exportRoots, exportNames, new Set<string>([localName]));
    perExportRoots[name] = Array.from(exportRoots).sort();
    perExportNames[name] = Array.from(exportNames).sort();
  }

  return {
    defaultExportIdentifier,
    names: Array.from(names).sort(),
    roots: Array.from(roots).sort(),
    perExportNames,
    perExportRoots,
  };
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

function hasReachableExportClientRuntime(options: {
  aliases: ReadonlyMap<string, string>;
  declarations: ReadonlyMap<string, unknown>;
  localName: string;
  node: unknown;
}): boolean {
  return hasReachableExportClientRuntimeNode({
    aliases: options.aliases,
    declarations: options.declarations,
    node: options.node,
    seen: new Set([options.localName]),
  });
}

function hasReachableExportClientRuntimeNode(options: {
  aliases: ReadonlyMap<string, string>;
  declarations: ReadonlyMap<string, unknown>;
  node: unknown;
  seen: Set<string>;
}): boolean {
  if (hasClientRuntimeSyntaxNode(options.node)) {
    return true;
  }

  const references = collectRuntimeReferenceRootNamesFromSubtree(
    options.node,
    options.aliases,
  );

  for (const reference of references) {
    const declaration = options.declarations.get(reference);
    if (
      declaration !== undefined &&
      !isFunctionLikeClientRuntimeDeclaration(declaration) &&
      hasClientRuntimeSyntaxNode(declaration)
    ) {
      return true;
    }
  }

  const calledRoots = collectRuntimeCallRootNamesFromSubtree(
    options.node,
    options.aliases,
  );
  const renderedRoots = collectJsxComponentRootNamesFromSubtree(
    options.node,
    options.aliases,
  );

  if (
    hasReachableLocalClientRuntime({
      aliases: options.aliases,
      declarations: options.declarations,
      roots: [...calledRoots, ...renderedRoots],
      seen: options.seen,
    })
  ) {
    return true;
  }

  return false;
}

function collectRuntimeReferenceRootNamesFromSubtree(
  node: unknown,
  aliases: ReadonlyMap<string, string>,
): string[] {
  const names = new Set<string>();
  collectRuntimeReferenceRootNamesFromNode(
    node,
    names,
    createComponentAliasState(aliases),
    new Set(),
    undefined,
    undefined,
  );
  return Array.from(names).sort();
}

function collectRuntimeCallRootNamesFromSubtree(
  node: unknown,
  aliases: ReadonlyMap<string, string>,
): string[] {
  const names = new Set<string>();
  collectRuntimeCallRootNamesFromNode(
    node,
    names,
    createComponentAliasState(aliases),
    new Set(),
  );
  return Array.from(names).sort();
}

function collectRuntimeReferenceRootNamesFromNode(
  node: unknown,
  names: Set<string>,
  state: ComponentAliasState,
  shadowed: ReadonlySet<string>,
  parent: Record<string, unknown> | undefined,
  parentKey: string | undefined,
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectRuntimeReferenceRootNamesFromNode(
        child,
        names,
        state,
        shadowed,
        parent,
        parentKey,
      );
    }
    return;
  }

  const object = readOptionalObject(node);
  if (object === undefined || shouldSkipRuntimeReferenceNode(object)) {
    return;
  }

  if (object.type === "Identifier" && typeof object.name === "string") {
    if (
      !shadowed.has(object.name) &&
      isRuntimeReferenceIdentifier(parent, parentKey)
    ) {
      names.add(state.aliases.get(object.name) ?? object.name);
    }
    return;
  }

  if (isFunctionLikeClientRuntimeDeclaration(object)) {
    const nextShadowed = new Set(shadowed);
    collectBindingNamesInto(object.id, nextShadowed);
    for (const parameter of readArray(object.params)) {
      collectBindingNamesInto(parameter, nextShadowed);
    }
    collectRuntimeReferenceRootNamesFromNode(
      object.body,
      names,
      state,
      addBlockBindingNames(object.body, nextShadowed),
      object,
      "body",
    );
    return;
  }

  const childShadowed =
    object.type === "Program" || object.type === "BlockStatement"
      ? addBlockBindingNames(object, new Set(shadowed))
      : shadowed;

  for (const [key, value] of Object.entries(object)) {
    if (shouldSkipRuntimeReferenceProperty(object, key)) {
      continue;
    }

    collectRuntimeReferenceRootNamesFromNode(
      value,
      names,
      state,
      childShadowed,
      object,
      key,
    );
  }
}

function collectRuntimeCallRootNamesFromNode(
  node: unknown,
  names: Set<string>,
  state: ComponentAliasState,
  shadowed: ReadonlySet<string>,
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectRuntimeCallRootNamesFromNode(child, names, state, shadowed);
    }
    return;
  }

  const object = readOptionalObject(node);
  if (object === undefined || shouldSkipRuntimeReferenceNode(object)) {
    return;
  }

  if (isFunctionLikeClientRuntimeDeclaration(object)) {
    const nextShadowed = new Set(shadowed);
    collectBindingNamesInto(object.id, nextShadowed);
    for (const parameter of readArray(object.params)) {
      collectBindingNamesInto(parameter, nextShadowed);
    }
    collectRuntimeCallRootNamesFromNode(
      object.body,
      names,
      state,
      addBlockBindingNames(object.body, nextShadowed),
    );
    return;
  }

  if (object.type === "CallExpression") {
    const root = expressionRootName(readOptionalObject(object.callee), state);
    if (root !== undefined && !shadowed.has(root)) {
      names.add(root);
    }
  }

  const childShadowed =
    object.type === "Program" || object.type === "BlockStatement"
      ? addBlockBindingNames(object, new Set(shadowed))
      : shadowed;

  for (const [key, value] of Object.entries(object)) {
    if (shouldSkipRuntimeReferenceProperty(object, key)) {
      continue;
    }

    collectRuntimeCallRootNamesFromNode(value, names, state, childShadowed);
  }
}

function shouldSkipRuntimeReferenceNode(node: Record<string, unknown>): boolean {
  return (
    (typeof node.type === "string" && node.type.startsWith("TS")) ||
    node.type === "ImportDeclaration"
  );
}

function shouldSkipRuntimeReferenceProperty(
  node: Record<string, unknown>,
  key: string,
): boolean {
  if (key === "type" || key === "start" || key === "end" || key === "loc") {
    return true;
  }

  if (key === "id" && isDeclarationWithId(node)) {
    return true;
  }

  if (key === "params" && isFunctionLikeClientRuntimeDeclaration(node)) {
    return true;
  }

  if (key === "key" && isNonComputedPropertyKey(node)) {
    return true;
  }

  return false;
}

function isRuntimeReferenceIdentifier(
  parent: Record<string, unknown> | undefined,
  parentKey: string | undefined,
): boolean {
  if (parent === undefined) {
    return true;
  }

  if (parent.type === "MemberExpression" && parentKey === "property" && parent.computed !== true) {
    return false;
  }

  if (parentKey === "id" && isDeclarationWithId(parent)) {
    return false;
  }

  if (parentKey === "params" && isFunctionLikeClientRuntimeDeclaration(parent)) {
    return false;
  }

  if (parentKey === "key" && isNonComputedPropertyKey(parent)) {
    return false;
  }

  return !(
    (parent.type === "BreakStatement" ||
      parent.type === "ContinueStatement" ||
      parent.type === "LabeledStatement") &&
    parentKey === "label"
  );
}

function addBlockBindingNames(
  node: unknown,
  names: Set<string>,
): ReadonlySet<string> {
  const body = readArray(readObject(node).body);

  for (const statement of body) {
    const object = readObject(statement);
    if (object.type === "VariableDeclaration") {
      for (const declaration of readArray(object.declarations)) {
        collectBindingNamesInto(readObject(declaration).id, names);
      }
      continue;
    }

    if (object.type === "FunctionDeclaration" || object.type === "ClassDeclaration") {
      collectBindingNamesInto(object.id, names);
    }
  }

  return names;
}

function collectBindingNamesInto(node: unknown, names: Set<string>): void {
  for (const name of bindingNames(node)) {
    names.add(name);
  }
}

function isFunctionLikeClientRuntimeDeclaration(node: unknown): boolean {
  const object = readObject(node);
  return (
    object.type === "FunctionDeclaration" ||
    object.type === "FunctionExpression" ||
    object.type === "ArrowFunctionExpression"
  );
}

function isDeclarationWithId(node: Record<string, unknown>): boolean {
  return (
    node.type === "VariableDeclarator" ||
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ClassDeclaration" ||
    node.type === "ClassExpression"
  );
}

function isNonComputedPropertyKey(node: Record<string, unknown>): boolean {
  return (
    (node.type === "Property" ||
      node.type === "ObjectProperty" ||
      node.type === "PropertyDefinition" ||
      node.type === "MethodDefinition") &&
    node.computed !== true
  );
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
      `${context.filename}: ${context.parseErrors.map(parseErrorMessage).join("\n")}`,
    );
  }

  return context;
}

function parseErrorMessage(error: unknown): string {
  const object = readObject(error);
  const message = typeof object.message === "string" ? object.message : "Parse error";
  const codeframe = typeof object.codeframe === "string" ? object.codeframe.trimEnd() : undefined;

  return codeframe === undefined ? message : `${message}\n${codeframe}`;
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

function unusedStaticValueImportReplacement(
  code: string,
  statement: Record<string, unknown>,
  referencedNames: ReadonlySet<string>,
): Replacement | undefined {
  if (statement.type !== "ImportDeclaration" || statement.importKind === "type") {
    return undefined;
  }

  const specifiers = Array.isArray(statement.specifiers)
    ? statement.specifiers.map(readObject)
    : [];

  if (specifiers.length === 0) {
    return undefined;
  }

  const localNames = specifiers
    .filter((specifier) => specifier.importKind !== "type")
    .flatMap((specifier) => {
      const local = readOptionalObject(specifier.local);
      return typeof local?.name === "string" ? [local.name] : [];
    });

  if (localNames.length === 0 || localNames.some((name) => referencedNames.has(name))) {
    return undefined;
  }

  const range = statementRange(code, statement);
  return range === undefined ? undefined : { ...range, text: "" };
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
      : [{ exportedNames: [], exportAll: true, specifiers: [], source }];
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
      specifiers: staticExportSpecifierReferences(statement),
      source,
    },
  ];
}

function staticExportSpecifierReferences(
  statement: Record<string, unknown>,
): StaticExportSpecifierReference[] {
  const specifiers = Array.isArray(statement.specifiers)
    ? statement.specifiers.map(readObject)
    : [];

  return specifiers.flatMap((specifier) => {
    const exportedName = exportedNameForSpecifier(specifier);
    const localName = localNameForExportSpecifier(specifier);

    return exportedName === undefined || localName === undefined
      ? []
      : [{ exportedName, localName }];
  });
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

function collectJsxComponentNamesFromNode(node: unknown, names: Set<string>): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectJsxComponentNamesFromNode(child, names);
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
    const root = jsxNameRoot(nameNode);
    const name = jsxTagName(nameNode);
    if (
      name !== "" &&
      root !== undefined &&
      (nameNode?.type === "JSXMemberExpression" || /^[A-Z]/.test(root))
    ) {
      names.add(name);
    }
  }

  for (const [key, value] of Object.entries(object)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }

    collectJsxComponentNamesFromNode(value, names);
  }
}

function collectJsxComponentNamesFromSubtree(
  node: unknown,
  outerAliases?: ReadonlyMap<string, string> | undefined,
): string[] {
  const names = new Set<string>();
  const aliasState = createComponentAliasState(outerAliases);

  collectJsxComponentNamesFromNode(node, names);
  collectSimpleComponentAliasesFromNode(node, aliasState);
  expandJsxComponentAliasRoots(names, aliasState.aliases);
  return Array.from(names).sort();
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

function collectFormActionReferencesFromNode(
  node: unknown,
  references: FormActionReference[],
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectFormActionReferencesFromNode(child, references);
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
    object.type === "JSXOpeningElement" &&
    jsxTagName(readOptionalObject(object.name)) === "form"
  ) {
    const attributes = Array.isArray(object.attributes) ? object.attributes : [];

    for (const attribute of attributes) {
      const attr = readObject(attribute);

      if (attr.type !== "JSXAttribute" || readObject(attr.name).name !== "action") {
        continue;
      }

      const value = readObject(attr.value);
      const expression = readObject(value.expression);
      const start = typeof object.start === "number" ? object.start : undefined;
      const end = typeof object.end === "number" ? object.end : undefined;

      if (
        value.type === "JSXExpressionContainer" &&
        typeof expression.name === "string" &&
        start !== undefined &&
        end !== undefined
      ) {
        references.push({ end, name: expression.name, start });
      }
    }
  }

  for (const [key, value] of Object.entries(object)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }

    collectFormActionReferencesFromNode(value, references);
  }
}

function collectFormActionExpressionReferencesFromNode(
  code: string,
  node: unknown,
  references: FormActionExpressionReference[],
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectFormActionExpressionReferencesFromNode(code, child, references);
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
    object.type === "JSXOpeningElement" &&
    jsxTagName(readOptionalObject(object.name)) === "form"
  ) {
    const attributes = Array.isArray(object.attributes) ? object.attributes : [];

    for (const attribute of attributes) {
      const attr = readObject(attribute);

      if (attr.type !== "JSXAttribute" || readObject(attr.name).name !== "action") {
        continue;
      }

      const value = readObject(attr.value);
      const expression = readObject(value.expression);
      const start = typeof object.start === "number" ? object.start : undefined;
      const end = typeof object.end === "number" ? object.end : undefined;
      const expressionStart = typeof expression.start === "number" ? expression.start : undefined;
      const expressionEnd = typeof expression.end === "number" ? expression.end : undefined;

      if (
        value.type === "JSXExpressionContainer" &&
        start !== undefined &&
        end !== undefined &&
        expressionStart !== undefined &&
        expressionEnd !== undefined
      ) {
        references.push({
          end,
          expression: code.slice(expressionStart, expressionEnd).trim(),
          expressionEnd,
          expressionStart,
          start,
        });
      }
    }
  }

  for (const [key, value] of Object.entries(object)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") {
      continue;
    }

    collectFormActionExpressionReferencesFromNode(code, value, references);
  }
}

function jsxTagName(node: Record<string, unknown> | undefined): string {
  if (node === undefined) {
    return "";
  }

  if (typeof node.name === "string") {
    return node.name;
  }

  if (node.type === "JSXIdentifier" && typeof node.name === "string") {
    return node.name;
  }

  if (node.type === "JSXMemberExpression") {
    const objectName = jsxTagName(readOptionalObject(node.object));
    const propertyName = jsxTagName(readOptionalObject(node.property));
    return `${objectName}.${propertyName}`;
  }

  return "";
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

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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
