import { createHash } from "node:crypto";
import { dirname, relative, sep } from "node:path";
import {
  analyzeBoundaryGraph,
  collectFormActionExpressionReferences,
  hasModuleDirective,
  type FormActionExpressionReference,
} from "@reckona/mreact-compiler";
import type * as Ts from "typescript";

let ts = undefined as unknown as typeof Ts;
let typescriptLoaded = false;

export interface InferredServerActionReference {
  exportName: string;
  inferred: boolean;
  moduleId: string;
}

export interface InferredServerActionExpressionReference
  extends InferredServerActionReference {
  end: number;
  expression: string;
  expressionEnd: number;
  expressionStart: number;
  sourceHash: string;
  start: number;
}

export interface ServerActionInferenceDiagnostic {
  code: typeof dynamicFormActionInferenceCode;
  filename: string;
  level: "warn";
  message: string;
}

export interface RuntimeServerActionInferenceFileSystem {
  isUseServerFile(file: string): Promise<boolean>;
  resolveSourceFile(directory: string, source: string): Promise<string | undefined>;
}

export const dynamicFormActionInferenceCode =
  "MR_SERVER_ACTION_INFERENCE_DYNAMIC_FORM_ACTION";

const dynamicFormActionInferenceMessage =
  "mreact could not infer a single server action from this form action expression. Pass the action function directly or use an explicit escape hatch.";

export async function collectRuntimeInferredServerActions(options: {
  appDir: string;
  code: string;
  fileSystem: RuntimeServerActionInferenceFileSystem;
  pageFile: string;
}): Promise<{
  diagnostics: ServerActionInferenceDiagnostic[];
  references: Map<string, InferredServerActionReference>;
}> {
  const formReferences = collectFormActionExpressionReferences({
    code: options.code,
    filename: options.pageFile,
  });

  if (formReferences.length === 0) {
    return { diagnostics: [], references: new Map() };
  }

  await loadTypeScript();
  const program = ts.createProgram({
    host: createRuntimeProgramHost({
      code: options.code,
      compilerOptions: defaultCompilerOptions(),
      pageFile: options.pageFile,
    }),
    options: {
      allowJs: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
    },
    rootNames: [options.pageFile],
  });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(options.pageFile);

  if (sourceFile === undefined) {
    return { diagnostics: [], references: new Map() };
  }

  const diagnostics: ServerActionInferenceDiagnostic[] = [];
  const references = new Map<string, InferredServerActionReference>();

  for (const formReference of formReferences) {
    const expression = findExpressionAt(sourceFile, formReference);

    if (expression === undefined) {
      continue;
    }

    const resolved = await resolveRuntimeActionExpression({
      appDir: options.appDir,
      checker,
      expression,
      fileSystem: options.fileSystem,
      pageFile: options.pageFile,
      seen: new Set(),
    });

    if (resolved.kind === "resolved") {
      references.set(formActionOccurrenceKey(formReference), resolved.reference);
      continue;
    }

    if (resolved.kind === "dynamic") {
      diagnostics.push({
        code: dynamicFormActionInferenceCode,
        filename: options.pageFile,
        level: "warn",
        message: dynamicFormActionInferenceMessage,
      });
    }
  }

  return { diagnostics, references };
}

export async function collectBuildInferredServerActions(options: {
  file: string;
  files: Record<string, string>;
  relativeRoutesDir: string;
  resolveSourceImport: (importer: string, source: string) => string | undefined;
  source: string;
}): Promise<{
  diagnostics: ServerActionInferenceDiagnostic[];
  references: InferredServerActionExpressionReference[];
}> {
  const formReferences = collectFormActionExpressionReferences({
    code: options.source,
    filename: options.file,
  });

  if (formReferences.length === 0) {
    return { diagnostics: [], references: [] };
  }

  await loadTypeScript();
  const program = createBuildProgram(options.file, options.files, options.source);
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(options.file);

  if (sourceFile === undefined) {
    return { diagnostics: [], references: [] };
  }

  const diagnostics: ServerActionInferenceDiagnostic[] = [];
  const references: InferredServerActionExpressionReference[] = [];
  const sourceHash = formActionSourceHash(options.source);
  const graphReferences = await collectBuildBoundaryGraphServerActions({
    file: options.file,
    files: options.files,
    relativeRoutesDir: options.relativeRoutesDir,
    resolveSourceImport: options.resolveSourceImport,
    source: options.source,
    sourceHash,
  });

  for (const formReference of formReferences) {
    const expression = findExpressionAt(sourceFile, formReference);

    if (expression === undefined) {
      continue;
    }

    const resolved = resolveBuildActionExpression({
      checker,
      expression,
      file: options.file,
      files: options.files,
      relativeRoutesDir: options.relativeRoutesDir,
      resolveSourceImport: options.resolveSourceImport,
      seen: new Set(),
    });

    if (resolved.kind === "resolved") {
      references.push({
        ...resolved.reference,
        end: formReference.end,
        expression: formReference.expression,
        expressionEnd: formReference.expressionEnd,
        expressionStart: formReference.expressionStart,
        sourceHash,
        start: formReference.start,
      });
      continue;
    }

    const graphReference = graphReferences.get(formActionOccurrenceKey(formReference));

    if (graphReference !== undefined) {
      references.push(graphReference);
      continue;
    }

    if (resolved.kind === "dynamic") {
      diagnostics.push({
        code: dynamicFormActionInferenceCode,
        filename: options.file,
        level: "warn",
        message: dynamicFormActionInferenceMessage,
      });
    }
  }

  return { diagnostics, references };
}

async function collectBuildBoundaryGraphServerActions(options: {
  file: string;
  files: Record<string, string>;
  relativeRoutesDir: string;
  resolveSourceImport: (importer: string, source: string) => string | undefined;
  source: string;
  sourceHash: string;
}): Promise<Map<string, InferredServerActionExpressionReference>> {
  const graph = await analyzeBoundaryGraph({
    entries: [{ file: options.file, kind: "route-page" }],
    readModule: (file) => (file === options.file ? options.source : options.files[file]),
    resolveModule: ({ importer, source }) => options.resolveSourceImport(importer, source),
  });
  const references = new Map<string, InferredServerActionExpressionReference>();

  for (const action of graph.serverActions) {
    const reference = {
      end: action.end,
      exportName: action.exportName,
      expression: action.expression,
      expressionEnd: action.expressionEnd,
      expressionStart: action.expressionStart,
      inferred: action.inferred,
      moduleId: moduleIdForBuildFile(action.moduleFile, options.relativeRoutesDir),
      sourceHash: options.sourceHash,
      start: action.start,
    };
    references.set(formActionOccurrenceKey(reference), reference);
  }

  return references;
}

type RuntimeResolveResult =
  | { kind: "dynamic" }
  | { kind: "resolved"; reference: InferredServerActionReference }
  | { kind: "unresolved" };

type BuildResolveResult =
  | { kind: "dynamic" }
  | { kind: "resolved"; reference: InferredServerActionReference }
  | { kind: "unresolved" };

async function resolveRuntimeActionExpression(options: {
  appDir: string;
  checker: Ts.TypeChecker;
  expression: Ts.Expression;
  fileSystem: RuntimeServerActionInferenceFileSystem;
  pageFile: string;
  seen: Set<Ts.Node>;
}): Promise<RuntimeResolveResult> {
  const expression = unwrapExpression(options.expression);

  if (options.seen.has(expression)) {
    return { kind: "unresolved" };
  }

  options.seen.add(expression);

  if (ts.isIdentifier(expression)) {
    return await resolveRuntimeIdentifier({ ...options, expression });
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return await resolveRuntimePropertyAccess({ ...options, expression });
  }

  if (ts.isConditionalExpression(expression)) {
    return { kind: "dynamic" };
  }

  return { kind: "unresolved" };
}

async function resolveRuntimeIdentifier(options: {
  appDir: string;
  checker: Ts.TypeChecker;
  expression: Ts.Identifier;
  fileSystem: RuntimeServerActionInferenceFileSystem;
  pageFile: string;
  seen: Set<Ts.Node>;
}): Promise<RuntimeResolveResult> {
  const symbol = options.checker.getSymbolAtLocation(options.expression);

  if (symbol === undefined) {
    return { kind: "unresolved" };
  }

  for (const declaration of symbol.declarations ?? []) {
    if (ts.isImportSpecifier(declaration)) {
      return await referenceFromRuntimeImportSpecifier(options, declaration);
    }

    if (ts.isVariableDeclaration(declaration)) {
      if (declaration.initializer === undefined) {
        continue;
      }

      return await resolveRuntimeActionExpression({
        ...options,
        expression: declaration.initializer,
      });
    }
  }

  const aliased = aliasTargetSymbol(options.checker, symbol);

  if (aliased !== undefined) {
    const reference = await referenceFromRuntimeSymbolDeclaration(options, aliased);

    if (reference !== undefined) {
      return { kind: "resolved", reference };
    }
  }

  return { kind: "unresolved" };
}

async function resolveRuntimePropertyAccess(options: {
  appDir: string;
  checker: Ts.TypeChecker;
  expression: Ts.PropertyAccessExpression;
  fileSystem: RuntimeServerActionInferenceFileSystem;
  pageFile: string;
  seen: Set<Ts.Node>;
}): Promise<RuntimeResolveResult> {
  const object = unwrapExpression(options.expression.expression);

  if (!ts.isIdentifier(object)) {
    return { kind: "unresolved" };
  }

  const symbol = options.checker.getSymbolAtLocation(object);

  for (const declaration of symbol?.declarations ?? []) {
    if (!ts.isVariableDeclaration(declaration) || declaration.initializer === undefined) {
      continue;
    }

    const initializer = unwrapExpression(declaration.initializer);

    if (!ts.isObjectLiteralExpression(initializer)) {
      continue;
    }

    const property = initializer.properties.find((candidate) =>
      objectLiteralPropertyName(candidate) === options.expression.name.text,
    );

    if (property === undefined) {
      continue;
    }

    if (ts.isShorthandPropertyAssignment(property)) {
      return await resolveRuntimeSymbol(
        options,
        options.checker.getShorthandAssignmentValueSymbol(property),
      );
    }

    if (ts.isPropertyAssignment(property)) {
      return await resolveRuntimeActionExpression({
        ...options,
        expression: property.initializer,
      });
    }

    return { kind: "dynamic" };
  }

  return { kind: "unresolved" };
}

async function resolveRuntimeSymbol(
  options: {
    appDir: string;
    checker: Ts.TypeChecker;
    fileSystem: RuntimeServerActionInferenceFileSystem;
    pageFile: string;
  },
  symbol: Ts.Symbol | undefined,
): Promise<RuntimeResolveResult> {
  if (symbol === undefined) {
    return { kind: "unresolved" };
  }

  for (const declaration of symbol.declarations ?? []) {
    if (ts.isImportSpecifier(declaration)) {
      return await referenceFromRuntimeImportSpecifier(options, declaration);
    }
  }

  const aliased = aliasTargetSymbol(options.checker, symbol);

  if (aliased === undefined) {
    return { kind: "unresolved" };
  }

  const reference = await referenceFromRuntimeSymbolDeclaration(options, aliased);

  return reference === undefined ? { kind: "unresolved" } : { kind: "resolved", reference };
}

async function referenceFromRuntimeImportSpecifier(
  options: {
    appDir: string;
    fileSystem: RuntimeServerActionInferenceFileSystem;
    pageFile: string;
  },
  declaration: Ts.ImportSpecifier,
): Promise<RuntimeResolveResult> {
  const importDeclaration = declaration.parent.parent.parent;
  const source = importDeclaration.moduleSpecifier;

  if (!ts.isStringLiteral(source) || !source.text.startsWith(".")) {
    return { kind: "unresolved" };
  }

  const file = await options.fileSystem.resolveSourceFile(dirname(options.pageFile), source.text);

  if (file === undefined) {
    return { kind: "unresolved" };
  }

  return {
    kind: "resolved",
    reference: {
      exportName: declaration.propertyName?.text ?? declaration.name.text,
      inferred: !(await options.fileSystem.isUseServerFile(file)),
      moduleId: moduleIdForFile(options.appDir, file),
    },
  };
}

async function referenceFromRuntimeSymbolDeclaration(
  options: {
    appDir: string;
    fileSystem: RuntimeServerActionInferenceFileSystem;
    pageFile: string;
  },
  symbol: Ts.Symbol,
): Promise<InferredServerActionReference | undefined> {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];

  if (declaration === undefined) {
    return undefined;
  }

  const file = declaration.getSourceFile().fileName;

  if (file === options.pageFile || !isInsideAppDir(options.appDir, file)) {
    return undefined;
  }

  return {
    exportName: symbol.getName(),
    inferred: !(await options.fileSystem.isUseServerFile(file)),
    moduleId: moduleIdForFile(options.appDir, file),
  };
}

function resolveBuildActionExpression(options: {
  checker: Ts.TypeChecker;
  expression: Ts.Expression;
  file: string;
  files: Record<string, string>;
  relativeRoutesDir: string;
  resolveSourceImport: (importer: string, source: string) => string | undefined;
  seen: Set<Ts.Node>;
}): BuildResolveResult {
  const expression = unwrapExpression(options.expression);

  if (options.seen.has(expression)) {
    return { kind: "unresolved" };
  }

  options.seen.add(expression);

  if (ts.isIdentifier(expression)) {
    return resolveBuildIdentifier({ ...options, expression });
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return resolveBuildPropertyAccess({ ...options, expression });
  }

  if (ts.isConditionalExpression(expression)) {
    return { kind: "dynamic" };
  }

  return { kind: "unresolved" };
}

function resolveBuildIdentifier(options: {
  checker: Ts.TypeChecker;
  expression: Ts.Identifier;
  file: string;
  files: Record<string, string>;
  relativeRoutesDir: string;
  resolveSourceImport: (importer: string, source: string) => string | undefined;
  seen: Set<Ts.Node>;
}): BuildResolveResult {
  const symbol = options.checker.getSymbolAtLocation(options.expression);

  if (symbol === undefined) {
    return { kind: "unresolved" };
  }

  for (const declaration of symbol.declarations ?? []) {
    if (ts.isImportSpecifier(declaration)) {
      return referenceFromBuildImportSpecifier(options, declaration);
    }

    if (ts.isVariableDeclaration(declaration)) {
      if (declaration.initializer === undefined) {
        continue;
      }

      return resolveBuildActionExpression({
        ...options,
        expression: declaration.initializer,
      });
    }
  }

  return { kind: "unresolved" };
}

function resolveBuildPropertyAccess(options: {
  checker: Ts.TypeChecker;
  expression: Ts.PropertyAccessExpression;
  file: string;
  files: Record<string, string>;
  relativeRoutesDir: string;
  resolveSourceImport: (importer: string, source: string) => string | undefined;
  seen: Set<Ts.Node>;
}): BuildResolveResult {
  const object = unwrapExpression(options.expression.expression);

  if (!ts.isIdentifier(object)) {
    return { kind: "unresolved" };
  }

  const symbol = options.checker.getSymbolAtLocation(object);

  for (const declaration of symbol?.declarations ?? []) {
    if (!ts.isVariableDeclaration(declaration) || declaration.initializer === undefined) {
      continue;
    }

    const initializer = unwrapExpression(declaration.initializer);

    if (!ts.isObjectLiteralExpression(initializer)) {
      continue;
    }

    const property = initializer.properties.find((candidate) =>
      objectLiteralPropertyName(candidate) === options.expression.name.text,
    );

    if (property === undefined) {
      continue;
    }

    if (ts.isShorthandPropertyAssignment(property)) {
      return resolveBuildSymbol(options, options.checker.getShorthandAssignmentValueSymbol(property));
    }

    if (ts.isPropertyAssignment(property)) {
      return resolveBuildActionExpression({
        ...options,
        expression: property.initializer,
      });
    }

    return { kind: "dynamic" };
  }

  return { kind: "unresolved" };
}

function resolveBuildSymbol(
  options: {
    checker: Ts.TypeChecker;
    file: string;
    files: Record<string, string>;
    relativeRoutesDir: string;
    resolveSourceImport: (importer: string, source: string) => string | undefined;
  },
  symbol: Ts.Symbol | undefined,
): BuildResolveResult {
  if (symbol === undefined) {
    return { kind: "unresolved" };
  }

  for (const declaration of symbol.declarations ?? []) {
    if (ts.isImportSpecifier(declaration)) {
      return referenceFromBuildImportSpecifier(options, declaration);
    }
  }

  return { kind: "unresolved" };
}

function referenceFromBuildImportSpecifier(
  options: {
    file: string;
    files: Record<string, string>;
    relativeRoutesDir: string;
    resolveSourceImport: (importer: string, source: string) => string | undefined;
  },
  declaration: Ts.ImportSpecifier,
): BuildResolveResult {
  const importDeclaration = declaration.parent.parent.parent;
  const source = importDeclaration.moduleSpecifier;

  if (!ts.isStringLiteral(source) || !source.text.startsWith(".")) {
    return { kind: "unresolved" };
  }

  const localFile = options.resolveSourceImport(options.file, source.text);

  if (localFile === undefined) {
    return { kind: "unresolved" };
  }

  const sourceCode = options.files[localFile];

  if (sourceCode === undefined) {
    return { kind: "unresolved" };
  }

  return {
    kind: "resolved",
    reference: {
      exportName: declaration.propertyName?.text ?? declaration.name.text,
      inferred: !hasUseServerDirectiveInSource({ code: sourceCode, filename: localFile }),
      moduleId: moduleIdForBuildFile(localFile, options.relativeRoutesDir),
    },
  };
}

function aliasTargetSymbol(checker: Ts.TypeChecker, symbol: Ts.Symbol): Ts.Symbol | undefined {
  if ((symbol.flags & ts.SymbolFlags.Alias) === 0) {
    return undefined;
  }

  return checker.getAliasedSymbol(symbol);
}

function findExpressionAt(
  sourceFile: Ts.SourceFile,
  reference: FormActionExpressionReference,
): Ts.Expression | undefined {
  let found: Ts.Expression | undefined;

  const visit = (node: Ts.Node): void => {
    if (found !== undefined) {
      return;
    }

    if (
      ts.isExpression(node) &&
      node.getStart(sourceFile) === reference.expressionStart &&
      node.getEnd() === reference.expressionEnd
    ) {
      found = node;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

function objectLiteralPropertyName(property: Ts.ObjectLiteralElementLike): string | undefined {
  if (
    ts.isShorthandPropertyAssignment(property) ||
    ts.isPropertyAssignment(property) ||
    ts.isMethodDeclaration(property)
  ) {
    return propertyNameText(property.name);
  }

  return undefined;
}

function propertyNameText(name: Ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return undefined;
}

function unwrapExpression(expression: Ts.Expression): Ts.Expression {
  let current = expression;

  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function moduleIdForFile(appDir: string, file: string): string {
  return relative(appDir, file).split(sep).join("/");
}

function isInsideAppDir(appDir: string, file: string): boolean {
  const relativePath = relative(appDir, file);

  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/"));
}

function moduleIdForBuildFile(file: string, relativeRoutesDir: string): string {
  return relativeRoutesDir === "" ? file : file.slice(relativeRoutesDir.length + 1);
}

function createBuildProgram(
  file: string,
  files: Record<string, string>,
  source: string,
): Ts.Program {
  const compilerOptions = defaultCompilerOptions();
  const defaultHost = ts.createCompilerHost(compilerOptions, true);
  const host: Ts.CompilerHost = {
    ...defaultHost,
    fileExists: (filename) => filename === file || files[filename] !== undefined,
    getSourceFile: (filename, languageVersion) => {
      const fileSource = filename === file ? source : files[filename];

      if (fileSource !== undefined) {
        return ts.createSourceFile(filename, fileSource, languageVersion, true);
      }

      return defaultHost.getSourceFile(filename, languageVersion);
    },
    readFile: (filename) => (filename === file ? source : files[filename]),
  };

  return ts.createProgram({
    host,
    options: compilerOptions,
    rootNames: [file],
  });
}

function createRuntimeProgramHost(options: {
  code: string;
  compilerOptions: Ts.CompilerOptions;
  pageFile: string;
}): Ts.CompilerHost {
  const defaultHost = ts.createCompilerHost(options.compilerOptions, true);

  return {
    ...defaultHost,
    fileExists: (filename) => filename === options.pageFile || defaultHost.fileExists(filename),
    getSourceFile: (filename, languageVersion) => {
      if (filename === options.pageFile) {
        return ts.createSourceFile(filename, options.code, languageVersion, true);
      }

      return defaultHost.getSourceFile(filename, languageVersion);
    },
    readFile: (filename) =>
      filename === options.pageFile ? options.code : defaultHost.readFile(filename),
  };
}

function defaultCompilerOptions(): Ts.CompilerOptions {
  return {
    allowJs: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
  };
}

async function loadTypeScript(): Promise<void> {
  if (typescriptLoaded) {
    return;
  }

  ts = await import("typescript");
  typescriptLoaded = true;
}

export function __readServerActionInferenceTypeScriptLoadedForTests(): boolean {
  return typescriptLoaded;
}

export function __resetServerActionInferenceTypeScriptForTests(): void {
  ts = undefined as unknown as typeof Ts;
  typescriptLoaded = false;
}

function formActionOccurrenceKey(reference: {
  end: number;
  expression: string;
  expressionEnd: number;
  expressionStart: number;
  start: number;
}): string {
  return [
    reference.start,
    reference.end,
    reference.expressionStart,
    reference.expressionEnd,
    reference.expression,
  ].join(":");
}

function formActionSourceHash(code: string): string {
  return createHash("sha256").update(code).digest("base64url");
}

export function hasUseServerDirectiveInSource(input: {
  code: string;
  filename: string;
}): boolean {
  return hasModuleDirective({
    code: input.code,
    directive: "use server",
    filename: input.filename,
  });
}
