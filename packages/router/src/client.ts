import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, extname, join, relative, sep } from "node:path";
import {
  collectClientRouteModuleAnalysis,
  formatDiagnostic,
  type ComponentMetadata,
  type ClientRouteModuleAnalysis,
  type ClientRouteStaticImportReference,
  type ClientReferenceMetadata,
  type StaticImportReference,
  type TopLevelExportRenderInfo,
} from "@reckona/mreact-compiler";
import {
  collectClientRouteModuleAnalysisFromContext,
  createCompilerModuleContext,
  transformCompilerModuleContext,
  type CompilerModuleContext,
} from "@reckona/mreact-compiler/internal";
import { assetPath } from "./assets.js";
import { bundleRouterModule, type RouterCompatBuildApi } from "./bundle-pipeline.js";
import type { AppRoute } from "./routes.js";
import { stripRouteClientOnlyExports } from "./route-source.js";
import { escapeHtmlQuotedAttribute as escapeHtmlAttribute } from "@reckona/mreact-shared/html-escape";
import { workspacePackageFile } from "./workspace-packages.js";

const nodeBuiltinPackages = new Set(
  builtinModules.flatMap((name) => [name, `node:${name}`]),
);

export interface ClientRouteManifestEntry {
  bytes?: number;
  path: string;
  kind: AppRoute["kind"];
  client: boolean;
  devScript?: string;
  navigation?: boolean;
  navigationScript?: string;
  routeId?: string;
  script?: string;
  sourceMap?: string;
}

export interface ClientRouteInferenceCache {
  moduleAnalysisByFile: Map<string, Promise<ClientRouteModuleAnalysis>>;
  moduleContextByFile: Map<string, Promise<CompilerModuleContext>>;
  resolvedByImport: Map<string, Promise<string | undefined>>;
  sourceByFile: Map<string, Promise<string>>;
}

export interface ClientRouteInferenceResult {
  client: boolean;
  clientBoundaryImports: string[];
  diagnostics: ClientRouteInferenceDiagnostic[];
}

interface ClientRouteModuleInferenceResult extends ClientRouteInferenceResult {
  clientBoundaryExportNames: string[];
  clientBoundaryModule: boolean;
  nestedClientExportNames: string[];
  clientReferenceSourceFiles: string[];
  serverOnly: boolean;
  serverOnlyClientRuntime: boolean;
}

export interface ClientReferenceImport {
  exportName: string;
  importSource: string;
  name: string;
}

export interface ClientRouteReferenceResult extends ClientRouteInferenceResult {
  clientReferenceImports: ClientReferenceImport[];
  clientReferenceManifest: ClientReferenceMetadata[];
}

export interface ClientRouteInferenceDiagnostic {
  code:
    | "MR_CLIENT_BOUNDARY_INFERENCE_SERVER_ONLY_REFERENCE"
    | "MR_CLIENT_BOUNDARY_INFERENCE_UNSUPPORTED_REFERENCE";
  filename: string;
  level: "warn";
  localNames: string[];
  message: string;
  source: string;
}

export async function routeToClientManifestEntry(
  route: AppRoute,
): Promise<ClientRouteManifestEntry> {
  if (route.kind === "server") {
    return { path: route.path, kind: route.kind, client: false };
  }

  const code = await readFile(route.file, "utf8");
  const inference = await inferClientRouteModule({
    code: stripRouteClientOnlyExports(code),
    filename: route.file,
    routePath: route.path,
  });

  return inference.client
    ? {
        path: route.path,
        kind: route.kind,
        client: true,
        routeId: routeIdForPath(route.path),
        script: clientScriptForPath(route.path),
      }
    : { path: route.path, kind: route.kind, client: false };
}

export function createClientRouteInferenceCache(): ClientRouteInferenceCache {
  return {
    moduleAnalysisByFile: new Map(),
    moduleContextByFile: new Map(),
    resolvedByImport: new Map(),
    sourceByFile: new Map(),
  };
}

export async function isClientRouteModule(options: {
  appDir?: string | undefined;
  cache?: ClientRouteInferenceCache | undefined;
  code: string;
  filename: string;
  routePath?: string | undefined;
}): Promise<boolean> {
  return (await inferClientRouteModule(options)).client;
}

export async function inferClientRouteModule(options: {
  appDir?: string | undefined;
  cache?: ClientRouteInferenceCache | undefined;
  code: string;
  filename: string;
  moduleContext?: CompilerModuleContext | undefined;
  routePath?: string | undefined;
}): Promise<ClientRouteInferenceResult> {
  const cache = options.cache ?? createClientRouteInferenceCache();

  try {
    const routeInference = await inferClientRouteModuleSource({
      cache,
      code: options.code,
      filename: options.filename,
      moduleContext: options.moduleContext,
      root: true,
      seen: new Set(),
    });

    if (options.appDir === undefined) {
      return routeInference;
    }

    const shellInferences = await inferClientRouteShellModules({
      appDir: options.appDir,
      cache,
      filename: options.filename,
      routePath: options.routePath,
    });

    return {
      client: routeInference.client || shellInferences.some((inference) => inference.client),
      clientBoundaryImports: routeInference.clientBoundaryImports,
      diagnostics: [
        ...routeInference.diagnostics,
        ...shellInferences.flatMap((inference) => inference.diagnostics),
      ],
    };
  } catch (error) {
    throw new Error(
      `Failed to infer client route for ${options.routePath ?? "<unknown>"} (${options.filename}).\n${errorMessage(error)}`,
      { cause: error },
    );
  }
}

export async function collectClientRouteReferences(options: {
  appDir?: string | undefined;
  cache?: ClientRouteInferenceCache | undefined;
  code: string;
  filename: string;
  routePath?: string | undefined;
}): Promise<ClientRouteReferenceResult> {
  const cache = options.cache ?? createClientRouteInferenceCache();
  const routeModuleContext = await compilerModuleContextForSource({
    cache,
    code: options.code,
    filename: options.filename,
  });
  const routeInference = await inferClientRouteModuleSource({
    cache,
    code: options.code,
    filename: options.filename,
    moduleContext: routeModuleContext,
    root: true,
    seen: new Set(),
  });
  const sources: Array<{
    code: string;
    filename: string;
    inference: ClientRouteModuleInferenceResult;
    moduleContext: CompilerModuleContext;
  }> = [];
  const seenSourceFiles = new Set<string>();
  const addSource = async (sourceOptions: {
    code: string;
    filename: string;
    inference?: ClientRouteModuleInferenceResult | undefined;
    moduleContext?: CompilerModuleContext | undefined;
  }) => {
    if (seenSourceFiles.has(sourceOptions.filename)) {
      return;
    }

    seenSourceFiles.add(sourceOptions.filename);
    const moduleContext =
      sourceOptions.moduleContext ??
      await compilerModuleContextForSource({
        cache,
        code: sourceOptions.code,
        filename: sourceOptions.filename,
      });
    const inference =
      sourceOptions.inference ??
      (await inferClientRouteModuleSource({
        cache,
        code: sourceOptions.code,
        filename: sourceOptions.filename,
        moduleContext,
        root: true,
        seen: new Set(),
      }));
    sources.push({
      code: sourceOptions.code,
      filename: sourceOptions.filename,
      inference,
      moduleContext,
    });

    for (const referenceFile of inference.clientReferenceSourceFiles) {
      const code = stripRouteClientOnlyExports(await readCachedFile(cache, referenceFile));
      await addSource({ code, filename: referenceFile });
    }
  };

  await addSource({
    code: options.code,
    filename: options.filename,
    inference: routeInference,
    moduleContext: routeModuleContext,
  });

  if (options.appDir !== undefined) {
    for (const shell of await clientShellFilesForPage(options.appDir, options.filename)) {
      const code = stripRouteClientOnlyExports(await readCachedFile(cache, shell));
      const moduleContext = await compilerModuleContextForSource({
        cache,
        code,
        filename: shell,
      });
      await addSource({
        code,
        filename: shell,
        inference: await inferClientRouteModuleSource({
          cache,
          code,
          filename: shell,
          moduleContext,
          root: true,
          seen: new Set(),
        }),
        moduleContext,
      });
    }
  }

  const clientReferenceManifest: ClientReferenceMetadata[] = [];
  const clientReferenceImports: ClientReferenceImport[] = [];
  const seenReferences = new Set<string>();

  for (const source of sources) {
    const output = transformCompilerModuleContext({
      code: source.code,
      clientBoundaryImports: source.inference.clientBoundaryImports,
      dev: false,
      filename: source.filename,
      moduleContext: source.moduleContext,
      target: "server",
    });
    const fatalDiagnostics = output.diagnostics.filter(
      (diagnostic) =>
        diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER" &&
        diagnostic.code !== "MR_UNSUPPORTED_AWAIT_INNER_COMPONENT",
    );

    if (fatalDiagnostics.length > 0) {
      throw new Error(
        fatalDiagnostics.map((diagnostic) => formatDiagnostic(source.filename, diagnostic)).join("\n"),
      );
    }

    for (const reference of output.metadata.clientReferenceManifest ?? []) {
      const key = `${reference.name}\0${reference.moduleId}\0${reference.exportName}`;

      if (seenReferences.has(key)) {
        continue;
      }

      seenReferences.add(key);
      clientReferenceManifest.push(reference);
      clientReferenceImports.push({
        exportName: reference.exportName,
        importSource: clientReferenceImportSource({
          moduleId: reference.moduleId,
          routeFile: options.filename,
          sourceFile: source.filename,
        }),
        name: reference.name,
      });
    }
  }

  return {
    client:
      routeInference.client ||
      sources.some((source) => source.filename !== options.filename && source.inference.client),
    clientBoundaryImports: routeInference.clientBoundaryImports,
    clientReferenceImports,
    clientReferenceManifest,
    diagnostics: sources.flatMap((source) => source.inference.diagnostics),
  };
}

async function inferClientRouteShellModules(options: {
  appDir: string;
  cache: ClientRouteInferenceCache;
  filename: string;
  routePath?: string | undefined;
}): Promise<ClientRouteInferenceResult[]> {
  const inferences: ClientRouteInferenceResult[] = [];

  for (const shell of await clientShellFilesForPage(options.appDir, options.filename)) {
    const code = stripRouteClientOnlyExports(await readCachedFile(options.cache, shell));
    inferences.push(
      await inferClientRouteModuleSource({
        cache: options.cache,
        code,
        filename: shell,
        root: true,
        seen: new Set(),
      }),
    );
  }

  return inferences;
}

async function clientShellFilesForPage(appDir: string, pageFile: string): Promise<string[]> {
  const relativeDir = relative(appDir, dirname(pageFile));
  const parts = relativeDir === "" ? [] : relativeDir.split(sep);
  const directories = [appDir];
  const files: string[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    directories.push(join(appDir, ...parts.slice(0, index + 1)));
  }

  for (const directory of directories) {
    for (const filename of ["layout.tsx", "layout.mreact.tsx", "template.tsx", "template.mreact.tsx"]) {
      const candidate = join(directory, filename);

      if (candidate !== pageFile && await isFile(candidate)) {
        files.push(candidate);
      }
    }
  }

  return files;
}

function clientReferenceImportSource(options: {
  moduleId: string;
  routeFile: string;
  sourceFile: string;
}): string {
  if (!options.moduleId.startsWith(".")) {
    return options.moduleId;
  }

  const absolute = join(dirname(options.sourceFile), options.moduleId);
  const relativeImport = relative(dirname(options.routeFile), absolute).replaceAll(sep, "/");

  return relativeImport.startsWith(".") ? relativeImport : `./${relativeImport}`;
}

export function isClientRouteSource(code: string): boolean {
  const analysis = collectClientRouteModuleAnalysis({ code });

  return (
    analysis.hasUseClientDirective ||
    (!analysis.hasUseServerDirective && analysis.clientRuntime)
  );
}

function isExplicitClientRouteSource(
  analysis: ClientRouteModuleAnalysis,
  filename: string,
): boolean {
  return analysis.hasUseClientDirective || isClientBoundaryFilename(filename);
}

function isClientBoundaryFilename(filename: string): boolean {
  return /\.client(?:\.mreact)?\.[cm]?[jt]sx?$/.test(filename);
}

function isServerOnlyClientRouteSource(analysis: ClientRouteModuleAnalysis): boolean {
  return analysis.hasUseServerDirective;
}

function isServerOnlyImportSource(source: string): boolean {
  return nodeBuiltinPackages.has(source);
}

function hasServerOnlyImports(analysis: ClientRouteModuleAnalysis): boolean {
  return analysis.staticImports.some((reference) => isServerOnlyImportSource(reference.source));
}

async function inferClientRouteModuleSource(options: {
  cache: ClientRouteInferenceCache;
  code: string;
  filename: string;
  moduleContext?: CompilerModuleContext | undefined;
  root: boolean;
  seen: Set<string>;
}): Promise<ClientRouteModuleInferenceResult> {
  const analysis = await clientRouteModuleAnalysisForSource(options);

  if (isServerOnlyClientRouteSource(analysis)) {
    return {
      client: false,
      clientBoundaryImports: [],
      clientBoundaryExportNames: [],
      clientBoundaryModule: false,
      nestedClientExportNames: [],
      clientReferenceSourceFiles: [],
      diagnostics: [],
      serverOnly: true,
      serverOnlyClientRuntime: analysis.clientRuntime,
    };
  }

  if (isExplicitClientRouteSource(analysis, options.filename)) {
    return {
      client: true,
      clientBoundaryImports: [],
      clientBoundaryExportNames: [],
      clientBoundaryModule: true,
      nestedClientExportNames: [],
      clientReferenceSourceFiles: [],
      diagnostics: [],
      serverOnly: false,
      serverOnlyClientRuntime: false,
    };
  }

  if (options.seen.has(options.filename)) {
    return {
      client: false,
      clientBoundaryImports: [],
      clientBoundaryExportNames: [],
      clientBoundaryModule: false,
      nestedClientExportNames: [],
      clientReferenceSourceFiles: [],
      diagnostics: [],
      serverOnly: false,
      serverOnlyClientRuntime: false,
    };
  }

  options.seen.add(options.filename);

  try {
    const clientBoundaryImports: string[] = [];
    const clientBoundaryExportNames = new Set<string>();
    const nestedClientExportNames = new Set<string>();
    const clientReferenceSourceFiles: string[] = [];
    const diagnostics: ClientRouteInferenceDiagnostic[] = [];
    let clientProxy = false;
    let nestedClient = false;
    const exportInfo = analysis.topLevelExportRenderInfo;
    const implicitModuleClient =
      exportInfo.length === 0 &&
      analysis.clientRuntime;
    for (const info of exportInfo) {
      if (info.clientRuntime) {
        clientBoundaryExportNames.add(info.name);
      }
    }
    if (
      hasServerOnlyImports(analysis) &&
      (implicitModuleClient || clientBoundaryExportNames.size > 0)
    ) {
      return {
        client: false,
        clientBoundaryImports: [],
        clientBoundaryExportNames: [],
        clientBoundaryModule: false,
        nestedClientExportNames: [],
        clientReferenceSourceFiles: [],
        diagnostics: [],
        serverOnly: true,
        serverOnlyClientRuntime: true,
      };
    }
    const jsxComponentRoots = new Set(analysis.jsxComponentRoots);
    const identifierReferences = new Set(analysis.identifierReferences);

    for (const reference of analysis.staticImports) {
      const rendered = isRenderedImportReference(reference, jsxComponentRoots);
      const referenced = isReferencedImportReference(reference, identifierReferences);

      if (
        !rendered &&
        (!referenced || !hasPotentialClientBoundaryReference(reference, identifierReferences))
      ) {
        continue;
      }

      const resolved = await resolveAppLocalModule({
        cache: options.cache,
        importer: options.filename,
        specifier: reference.source,
      });

      if (resolved === undefined) {
        continue;
      }

      const source = await readCachedFile(options.cache, resolved);
      const imported = await inferClientRouteModuleSource({
      cache: options.cache,
      code: source,
      filename: resolved,
      moduleContext: await compilerModuleContextForSource({
        cache: options.cache,
        code: source,
        filename: resolved,
      }),
      root: false,
      seen: options.seen,
    });
      diagnostics.push(...imported.diagnostics);

      if (!imported.client) {
        if (imported.serverOnlyClientRuntime && rendered) {
          diagnostics.push(
            serverOnlyClientImportReferenceDiagnostic({
              filename: options.filename,
              reference,
            }),
          );
        }
        continue;
      }

      if (rendered) {
        const importedExportNames = renderedImportedExportNames(reference, jsxComponentRoots);
        const renderedExportNames = renderedLocalExportNames(reference, exportInfo);
        const importedBoundary = imported.clientBoundaryModule ||
          matchesInferredExportNames(importedExportNames, imported.clientBoundaryExportNames);
        const importedNested = matchesInferredExportNames(
          importedExportNames,
          imported.nestedClientExportNames,
        );
        if (!importedBoundary && !importedNested) {
          continue;
        }

        nestedClient = true;

        for (const exportName of renderedExportNames) {
          if (importedBoundary || importedNested) {
            nestedClientExportNames.add(exportName);
          }
        }

        if (!importedBoundary) {
          clientReferenceSourceFiles.push(resolved);
          continue;
        }

        clientBoundaryImports.push(reference.source);
        continue;
      }

      const diagnostic = unsupportedClientImportReferenceDiagnostic({
        filename: options.filename,
        identifierReferences,
        reference,
      });

      if (diagnostic !== undefined) {
        diagnostics.push(diagnostic);
      }
    }

    if (!options.root) {
      for (const reference of analysis.staticExports) {
        const resolved = await resolveAppLocalModule({
          cache: options.cache,
          importer: options.filename,
          specifier: reference.source,
        });

        if (resolved === undefined) {
          continue;
        }

        const source = await readCachedFile(options.cache, resolved);
        const exported = await inferClientRouteModuleSource({
          cache: options.cache,
          code: source,
          filename: resolved,
          moduleContext: await compilerModuleContextForSource({
            cache: options.cache,
            code: source,
            filename: resolved,
          }),
          root: false,
          seen: options.seen,
        });
        diagnostics.push(...exported.diagnostics);

        if (exported.clientBoundaryModule) {
          clientProxy = true;
        } else if (exported.clientBoundaryExportNames.length > 0) {
          for (const exportName of reference.exportedNames) {
            if (exported.clientBoundaryExportNames.includes(exportName)) {
              clientBoundaryExportNames.add(exportName);
            }
          }
        } else if (exported.client) {
          nestedClient = true;
          clientReferenceSourceFiles.push(resolved);
        }
      }
    }

    return {
      client:
        clientBoundaryImports.length > 0 ||
        clientBoundaryExportNames.size > 0 ||
        implicitModuleClient ||
        clientProxy ||
        nestedClient,
      clientBoundaryImports,
      clientBoundaryExportNames: Array.from(clientBoundaryExportNames),
      clientBoundaryModule: clientProxy || implicitModuleClient,
      nestedClientExportNames: Array.from(nestedClientExportNames),
      clientReferenceSourceFiles: Array.from(new Set(clientReferenceSourceFiles)),
      diagnostics,
      serverOnly: false,
      serverOnlyClientRuntime: false,
    };
  } finally {
    options.seen.delete(options.filename);
  }
}

async function clientRouteModuleAnalysisForSource(options: {
  cache: ClientRouteInferenceCache;
  code: string;
  filename: string;
  moduleContext?: CompilerModuleContext | undefined;
}): Promise<ClientRouteModuleAnalysis> {
  const cacheKey = sourceAnalysisCacheKey(options.filename, options.code);
  const cached = options.cache.moduleAnalysisByFile.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const analysis = Promise.resolve().then(async () =>
    collectClientRouteModuleAnalysisFromContext(
      options.moduleContext ??
        await compilerModuleContextForSource({
          cache: options.cache,
          code: options.code,
          filename: options.filename,
        }),
    ),
  );
  options.cache.moduleAnalysisByFile.set(cacheKey, analysis);
  return analysis;
}

export async function compilerModuleContextForSource(options: {
  cache: ClientRouteInferenceCache;
  code: string;
  filename: string;
}): Promise<CompilerModuleContext> {
  const cacheKey = sourceAnalysisCacheKey(options.filename, options.code);
  const cached = options.cache.moduleContextByFile.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const context = Promise.resolve().then(() =>
    createCompilerModuleContext({
      code: options.code,
      filename: options.filename,
    }),
  );
  options.cache.moduleContextByFile.set(cacheKey, context);
  return context;
}

function sourceAnalysisCacheKey(filename: string, code: string): string {
  return `${filename}\0${hashSourceText(code)}`;
}

function hashSourceText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function isRenderedImportReference(
  reference: StaticImportReference,
  jsxComponentRoots: ReadonlySet<string>,
): boolean {
  return (
    reference.sideEffect ||
    reference.localNames.some((localName) => jsxComponentRoots.has(localName))
  );
}

function isReferencedImportReference(
  reference: StaticImportReference,
  identifierReferences: ReadonlySet<string>,
): boolean {
  return (
    reference.sideEffect ||
    reference.localNames.some((localName) => identifierReferences.has(localName))
  );
}

function hasPotentialClientBoundaryReference(
  reference: ClientRouteStaticImportReference,
  identifierReferences: ReadonlySet<string>,
): boolean {
  return (
    reference.sideEffect ||
    reference.specifiers.some(
      (specifier) => specifier.kind === "namespace" && identifierReferences.has(specifier.localName),
    ) ||
    reference.localNames.some(
      (localName) => identifierReferences.has(localName) && startsUppercase(localName),
    )
  );
}

function renderedImportedExportNames(
  reference: ClientRouteStaticImportReference,
  jsxComponentRoots: ReadonlySet<string>,
): string[] | undefined {
  if (reference.sideEffect) {
    return undefined;
  }

  const names = new Set<string>();

  for (const specifier of reference.specifiers) {
    if (!jsxComponentRoots.has(specifier.localName)) {
      continue;
    }

    if (specifier.kind === "namespace") {
      return undefined;
    }

    names.add(specifier.importedName);
  }

  return Array.from(names);
}

function renderedLocalExportNames(
  reference: StaticImportReference,
  exportInfo: readonly TopLevelExportRenderInfo[],
): string[] {
  const localNames = new Set(reference.localNames);
  const rendered = exportInfo
    .filter((info) => info.renderedComponentRoots.some((root) => localNames.has(root)))
    .map((info) => info.name);

  return rendered.length === 0 ? ["default"] : rendered;
}

function matchesInferredExportNames(
  importedExportNames: readonly string[] | undefined,
  inferredExportNames: readonly string[],
): boolean {
  if (importedExportNames === undefined) {
    return inferredExportNames.length > 0;
  }

  return importedExportNames.some((name) => inferredExportNames.includes(name));
}

function serverOnlyClientImportReferenceDiagnostic(options: {
  filename: string;
  reference: StaticImportReference;
}): ClientRouteInferenceDiagnostic {
  return {
    code: "MR_CLIENT_BOUNDARY_INFERENCE_SERVER_ONLY_REFERENCE",
    filename: options.filename,
    level: "warn",
    localNames: options.reference.localNames,
    message:
      `${options.filename}: server-only component import ${JSON.stringify(options.reference.source)} ` +
      "uses client runtime syntax but is marked with server-only semantics. Automatic client " +
      "boundary detection skipped it. Move the interactive UI behind a .client module or add an " +
      "explicit clientBoundaryImports entry.",
    source: options.reference.source,
  };
}

function unsupportedClientImportReferenceDiagnostic(options: {
  filename: string;
  identifierReferences: ReadonlySet<string>;
  reference: StaticImportReference;
}): ClientRouteInferenceDiagnostic | undefined {
  if (options.reference.sideEffect) {
    return undefined;
  }

  const localNames = options.reference.localNames.filter((name) =>
    options.identifierReferences.has(name),
  );

  if (localNames.length === 0) {
    return undefined;
  }

  return {
    code: "MR_CLIENT_BOUNDARY_INFERENCE_UNSUPPORTED_REFERENCE",
    filename: options.filename,
    level: "warn",
    localNames,
    message:
      `${options.filename}: client component import ${JSON.stringify(options.reference.source)} ` +
      `is referenced as ${localNames.map((name) => JSON.stringify(name)).join(", ")} but ` +
      "was not rendered through a supported static JSX pattern. Automatic client boundary " +
      "detection supports direct JSX such as <Counter />, JSX member roots such as " +
      "<components.Counter />, and simple aliases such as const Alias = Counter. For dynamic " +
      `registries or computed component selection, add ${JSON.stringify(options.reference.source)} ` +
      "to clientBoundaryImports.",
    source: options.reference.source,
  };
}

function startsUppercase(value: string): boolean {
  return /^[A-Z]/.test(value);
}

export function formatClientRouteInferenceDiagnostic(
  diagnostic: ClientRouteInferenceDiagnostic,
): string {
  return `${diagnostic.code}: ${diagnostic.message}`;
}

async function resolveAppLocalModule(options: {
  cache: ClientRouteInferenceCache;
  importer: string;
  specifier: string;
}): Promise<string | undefined> {
  if (!options.specifier.startsWith(".")) {
    return undefined;
  }

  const cacheKey = `${options.importer}\0${options.specifier}`;
  const cached = options.cache.resolvedByImport.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const resolved = resolveAppLocalModuleUncached(options.importer, options.specifier);
  options.cache.resolvedByImport.set(cacheKey, resolved);
  return resolved;
}

async function resolveAppLocalModuleUncached(
  importer: string,
  specifier: string,
): Promise<string | undefined> {
  const base = join(dirname(importer), specifier);
  const candidates = sourceModuleCandidates(base);

  if (candidates.length === 0) {
    return undefined;
  }

  for (const candidate of candidates) {
    if (await isFile(candidate)) {
      return candidate;
    }
  }

  throw new Error(`${importer}: could not resolve app-local import ${JSON.stringify(specifier)}.`);
}

function sourceModuleCandidates(base: string): string[] {
  if (hasSourceModuleExtension(base)) {
    return [base, ...typescriptSourceModuleCandidates(base)];
  }

  if (/\.(?:client|compat)$/.test(base)) {
    return [
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      `${base}.jsx`,
      `${base}.mjs`,
      `${base}.mts`,
      `${base}.cjs`,
      `${base}.cts`,
    ];
  }

  if (extname(base) !== "") {
    return [];
  }

  return [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mreact.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.mts`,
    `${base}.cjs`,
    `${base}.cts`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    join(base, "index.mreact.tsx"),
    join(base, "index.js"),
    join(base, "index.jsx"),
    join(base, "index.mjs"),
    join(base, "index.mts"),
    join(base, "index.cjs"),
    join(base, "index.cts"),
  ];
}

function hasSourceModuleExtension(path: string): boolean {
  return /\.(?:mreact\.tsx|tsx?|jsx?|mjs|mts|cjs|cts)$/.test(path);
}

function typescriptSourceModuleCandidates(path: string): string[] {
  if (path.endsWith(".js")) {
    return [`${path.slice(0, -3)}.ts`, `${path.slice(0, -3)}.tsx`];
  }

  if (path.endsWith(".jsx")) {
    return [`${path.slice(0, -4)}.tsx`];
  }

  if (path.endsWith(".mjs")) {
    return [`${path.slice(0, -4)}.mts`];
  }

  if (path.endsWith(".cjs")) {
    return [`${path.slice(0, -4)}.cts`];
  }

  return [];
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function readCachedFile(cache: ClientRouteInferenceCache, filename: string): Promise<string> {
  const cached = cache.sourceByFile.get(filename);

  if (cached !== undefined) {
    return cached;
  }

  const source = readFile(filename, "utf8");
  cache.sourceByFile.set(filename, source);
  return source;
}

export function routeIdForPath(path: string): string {
  if (path === "/") {
    return "index";
  }

  return path
    .slice(1)
    .replaceAll("/", "_")
    .replaceAll(":", "_")
    .replace(/[^A-Za-z0-9_$-]/g, "_");
}

export function clientScriptForPath(path: string): string {
  return `routes/${routeIdForPath(path)}.js`;
}

export function navigationRuntimeScriptForDev(): string {
  return "navigation.js";
}

export function withHydrationMarkers(options: {
  assetBaseUrl?: string | undefined;
  clientReferenceManifest?: readonly ClientReferenceMetadata[] | undefined;
  html: string;
  props: unknown;
  routePath: string;
  script?: string | undefined;
}): string {
  const marker = hydrationMarkerParts({
    assetBaseUrl: options.assetBaseUrl,
    clientReferenceManifest: options.clientReferenceManifest,
    props: options.props,
    routePath: options.routePath,
    script: options.script,
  });

  return `${marker.prefix}${options.html}${marker.suffix}`;
}

export function withRouteMarkers(options: { html: string; routePath: string }): string {
  const routeId = routeIdForPath(options.routePath);

  return `<div data-mreact-route-id="${escapeHtmlAttribute(routeId)}">${options.html}</div>`;
}

export function hydrationMarkerParts(options: {
  assetBaseUrl?: string | undefined;
  clientReferenceManifest?: readonly ClientReferenceMetadata[] | undefined;
  props: unknown;
  routePath: string;
  script?: string | undefined;
}): { prefix: string; suffix: string } {
  const routeId = routeIdForPath(options.routePath);
  const escapedRouteId = escapeHtmlAttribute(routeId);
  const propsJson = escapeScriptJson(JSON.stringify(options.props));
  const script = options.script ?? clientScriptForPath(options.routePath);
  const scriptSrc = assetPath(script, options.assetBaseUrl ?? "/_mreact/client/");
  const clientReferencesJson =
    options.clientReferenceManifest === undefined || options.clientReferenceManifest.length === 0
      ? undefined
      : escapeScriptJson(JSON.stringify(options.clientReferenceManifest));

  return {
    prefix: `<div data-mreact-route-id="${escapedRouteId}">`,
    suffix: [
      "</div>",
      `<script type="application/json" id="mreact-props-${escapedRouteId}">${propsJson}</script>`,
      clientReferencesJson === undefined
        ? undefined
        : `<script type="application/json" id="mreact-client-references-${escapedRouteId}">${clientReferencesJson}</script>`,
      `<script type="module" src="${escapeHtmlAttribute(scriptSrc)}"></script>`,
    ]
      .filter((part): part is string => part !== undefined)
      .join(""),
  };
}

export async function buildClientRouteBundle(options: {
  code: string;
  clientReferenceImports?: readonly ClientReferenceImport[] | undefined;
  clientReferenceManifest?: readonly ClientReferenceMetadata[] | undefined;
  filename: string;
  routePath: string;
}): Promise<string> {
  return (await buildClientRouteOutput(options)).code;
}

export async function buildNavigationRuntimeBundle(options: {
  minify?: boolean;
  sourceMap?: boolean;
} = {}): Promise<{ code: string; map?: string }> {
  return buildClientRouteOutput({
    code: "export default undefined;",
    filename: "__mreact_navigation_runtime.tsx",
    routePath: "/__mreact_navigation_runtime",
    clientNavigation: true,
    ...(options.minify === undefined ? {} : { minify: options.minify }),
    ...(options.sourceMap === undefined ? {} : { sourceMap: options.sourceMap }),
  });
}

export async function buildClientRouteOutput(options: {
  code: string;
  clientReferenceImports?: readonly ClientReferenceImport[] | undefined;
  clientReferenceManifest?: readonly ClientReferenceMetadata[] | undefined;
  filename: string;
  minify?: boolean;
  routePath: string;
  sourceMap?: boolean;
  /**
   * When `false`, omit the SPA navigation runtime (`__mreactPrefetch`,
   * `__mreactNavigate`, prefetch hover handlers, history integration, etc.)
   * from the emitted client bundle. The page can still hydrate and react to
   * `cell` / event bindings — only cross-route SPA navigation is disabled.
   * Useful for static / single-page interactive routes where the navigation
   * runtime is dead code.
   *
   * Default: `true` (preserve current behavior).
   *
   * If unset, the source code is also inspected for a top-level
   * `export const clientNavigation = false` hint and that takes precedence.
   * See `docs/issues/open/2026-05-12-058-client-navigation-runtime-opt-in.md`.
   */
  clientNavigation?: boolean;
}): Promise<{ code: string; map?: string }> {
  const moduleContext = createCompilerModuleContext({
    code: options.code,
    filename: options.filename,
  });
  const compiled = transformCompilerModuleContext({
    code: options.code,
    filename: options.filename,
    moduleContext,
    target: "client",
    dev: options.minify !== true,
  });

  if (compiled.diagnostics.length > 0) {
    throw new Error(
      compiled.diagnostics
        .map((diagnostic) => formatDiagnostic(options.filename, diagnostic))
        .join("\n"),
    );
  }

  const clientNavigation = options.clientNavigation ?? detectClientNavigationHint(options.code);
  const clientReferenceManifest =
    options.clientReferenceManifest ?? (await inferClientReferenceManifestForBundle(options));
  const clientReferenceImportBlock = emitClientReferenceImportBlock(
    options.clientReferenceImports ?? [],
  );
  const clientReferenceRegistry = emitClientReferenceRegistry(
    clientReferenceManifest,
    options.clientReferenceImports ?? [],
  );
  const routeComponentExpression = routeComponentExpressionForComponents(
    compiled.metadata.components,
  );

  const routeId = routeIdForPath(options.routePath);
  const routeUsesCells = detectRouteCellStateHint(compiled.code);
  const routeStateSignature = routeUsesCells ? routeStateSignatureForSource(compiled.code) : "";
  const navigationStateDeclaration = clientNavigation
    ? `const __mreactNavigationState = __mreactGlobal.__mreactNavigationState ??= {
  cache: new Map(),
  current: {
    from: null,
    pending: false,
    to: null,
    type: null,
  },
  installed: false,
  prefetchedScripts: new Set(),
  routePrefetchManifest: undefined,
  routePrefetchManifestText: undefined,
  viewportAnchors: new WeakSet(),
  viewportObserver: undefined,
};`
    : "";
  const routeCellStateDeclaration = routeUsesCells
    ? `const __mreactRouteStates = __mreactGlobal.__mreactRouteStates ??= new Map();
let __mreactActiveCellRecords = undefined;
let __mreactActiveCellIndex = 0;`
    : "";
  const routeCellHook = routeUsesCells
    ? `
__mreactGlobal.__mreactRouteCell = (nativeCell, initial) => {
  if (__mreactActiveCellRecords === undefined) {
    return nativeCell(initial);
  }

  const cellKey = String(__mreactActiveCellIndex);
  __mreactActiveCellIndex += 1;
  const existingRecord = __mreactActiveCellRecords.get(cellKey);
  const record = existingRecord ?? { value: initial };
  const stateCell = nativeCell(record.value);
  const setStateCell = stateCell.set;

  stateCell.set = (next) => {
    setStateCell((previous) => {
      const resolved = typeof next === "function" ? next(previous) : next;
      record.value = resolved;
      return resolved;
    });
  };

  __mreactActiveCellRecords.set(cellKey, record);
  return stateCell;
};`
    : "";
  const routeCellHydrationStart = routeUsesCells
    ? `  const __mreactPreviousState = __mreactRouteStates.get(__mreactRouteId);
  const __mreactState = __mreactPreviousState?.marker === __mreactMarker &&
    __mreactPreviousState?.signature === __mreactRouteStateSignature
    ? __mreactPreviousState
    : {
        cells: new Map(),
        marker: __mreactMarker,
        signature: __mreactRouteStateSignature,
      };
  __mreactDropMismatchedRouteState(__mreactPreviousState, __mreactState);
  __mreactRouteStates.set(__mreactRouteId, __mreactState);
  __mreactActiveCellRecords = __mreactState.cells;
  __mreactActiveCellIndex = 0;

  try {
`
    : "";
  const routeCellHydrationEnd = routeUsesCells
    ? `  } finally {
    __mreactActiveCellRecords = undefined;
    __mreactActiveCellIndex = 0;
  }
`
    : "";
  const routeCellHydrationIndent = routeUsesCells ? "    " : "  ";
  const routeCellDropFunction = routeUsesCells
    ? `
function __mreactDropMismatchedRouteState(previousState, nextState) {
  if (previousState === undefined || previousState === nextState) {
    return;
  }

  if (previousState.signature !== nextState.signature && typeof console !== "undefined") {
    console.warn("mreact: dropping stale route state after route cell signature changed");
  }
}
`
    : "";
  const entry = `${clientReferenceImportBlock}${compiled.code}

const __mreactRouteId = ${JSON.stringify(routeId)};
const __mreactRouteStateSignature = ${JSON.stringify(routeStateSignature)};
const __mreactGlobal = globalThis;
${navigationStateDeclaration}
${routeCellStateDeclaration}
${routeCellHook}
${clientReferenceRegistry}

export function __mreactHydrateRoute() {
  __mreactApplyOutOfOrderFragments(document);
  const __mreactMarker = document.querySelector(\`[data-mreact-route-id="\${__mreactRouteId}"]\`);
  const __mreactPropsElement = document.getElementById(\`mreact-props-\${__mreactRouteId}\`);
  const __mreactClientReferencesElement = document.getElementById(\`mreact-client-references-\${__mreactRouteId}\`);
  const __mreactProps = __mreactPropsElement?.textContent === undefined
    ? {}
    : JSON.parse(__mreactPropsElement.textContent);
  const __mreactClientReferences = __mreactClientReferencesElement?.textContent === undefined
    ? []
    : JSON.parse(__mreactClientReferencesElement.textContent);
  const __mreactClientReferenceManifests = __mreactGlobal.__mreactClientReferenceManifests ??= new Map();
  __mreactClientReferenceManifests.set(__mreactRouteId, __mreactClientReferences);
  const __mreactComponent = ${routeComponentExpression};

  if (__mreactMarker === null || __mreactComponent === undefined) {
    return;
  }
${routeCellHydrationStart}${routeCellHydrationIndent}if (__mreactHydrateClientBoundaries(document, __mreactClientReferences, __mreactClientReferenceComponents)) {
${routeCellHydrationIndent}  __mreactMarker.setAttribute("data-mreact-hydrated", "true");
${routeCellHydrationIndent}  return;
${routeCellHydrationIndent}}
${routeCellHydrationIndent}const __mreactNode = __mreactComponent(__mreactProps);
${routeCellHydrationIndent}__mreactResumeRoute(__mreactMarker, __mreactNode);
${routeCellHydrationIndent}__mreactMarker.setAttribute("data-mreact-hydrated", "true");
${routeCellHydrationEnd}}
${routeCellDropFunction}

__mreactHydrateRoute();
${clientNavigation ? "__mreactInstallNavigation();" : ""}

${
  clientNavigation
    ? `export function __mreactNavigateToHtml(html, url, options = {}) {
  __mreactSaveCurrentHistoryState();
  const applied = __mreactApplyNavigationHtml(html, url);

  if (!applied) {
    return false;
  }

  __mreactPushHistoryState(url);
  if (options.scroll !== "preserve") {
    __mreactScrollTo(0, 0);
  }
  return true;
}

export async function __mreactPrefetch(url) {
  if (!__mreactCanPrefetch()) {
    return false;
  }

  const href = __mreactNormalizeNavigationUrl(url);

  if (href === undefined) {
    return false;
  }

  const script = __mreactRouteScriptForNavigationUrl(href);

  if (script === undefined) {
    return __mreactPrefetchNavigationHtml(href);
  }

  return __mreactPrefetchRouteScript(script);
}

function __mreactPrefetchNavigationHtml(href) {
  if (__mreactNavigationState.cache.has(href)) {
    return true;
  }

  return __mreactFetchNavigationHtml(href).then((html) => {
    if (typeof html !== "string") {
      return false;
    }

    __mreactNavigationState.cache.set(href, html);
    return true;
  }).catch(() => false);
}

function __mreactPrefetchRouteScript(script) {
  if (typeof document === "undefined") {
    return false;
  }

  const href = __mreactNormalizeAssetUrl(script);

  if (href === undefined) {
    return false;
  }

  if (__mreactNavigationState.prefetchedScripts.has(href)) {
    return true;
  }

  for (const link of Array.from(document.querySelectorAll('link[rel="modulepreload"][href]'))) {
    if (link.href === href) {
      __mreactNavigationState.prefetchedScripts.add(href);
      return true;
    }
  }

  const link = document.createElement("link");
  link.rel = "modulepreload";
  link.href = href;
  document.head.appendChild(link);
  __mreactNavigationState.prefetchedScripts.add(href);
  return true;
}

export async function __mreactNavigate(url, options = {}) {
  const href = __mreactNormalizeNavigationUrl(url);

  if (href === undefined) {
    return false;
  }

  __mreactSetNavigationState(__mreactPendingNavigationState(href, options.type ?? "push"));

  try {
    const cachedHtml = __mreactNavigationState.cache.get(href);
    const html = cachedHtml ?? await __mreactFetchNavigationHtml(href);

    if (typeof html !== "string") {
      return false;
    }

    __mreactNavigationState.cache.set(href, html);
    return await __mreactApplyNavigationHtmlWithOptionalTransition(html, href, options);
  } finally {
    __mreactSetNavigationState(__mreactIdleNavigationState());
  }
}

export function __mreactGetNavigationState() {
  return __mreactNavigationStateSnapshot(__mreactNavigationState.current);
}

function __mreactPendingNavigationState(to, type) {
  return {
    from: typeof location === "undefined" ? null : location.href,
    pending: true,
    to,
    type: __mreactNavigationType(type),
  };
}

function __mreactIdleNavigationState() {
  return {
    from: null,
    pending: false,
    to: null,
    type: null,
  };
}

function __mreactSetNavigationState(state) {
  const snapshot = __mreactNavigationStateSnapshot(state);
  __mreactNavigationState.current = snapshot;
  __mreactApplyNavigationStateAttributes(snapshot);
  __mreactDispatchNavigationStateChange(snapshot);
}

function __mreactNavigationStateSnapshot(state) {
  return {
    from: typeof state?.from === "string" ? state.from : null,
    pending: state?.pending === true,
    to: typeof state?.to === "string" ? state.to : null,
    type: __mreactNavigationType(state?.type),
  };
}

function __mreactNavigationType(type) {
  return type === "push" || type === "replace" || type === "pop" || type === "refresh"
    ? type
    : null;
}

function __mreactApplyNavigationStateAttributes(state) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;

  if (state.pending !== true) {
    root.removeAttribute("data-mreact-navigation-pending");
    root.removeAttribute("data-mreact-navigation-from");
    root.removeAttribute("data-mreact-navigation-to");
    root.removeAttribute("data-mreact-navigation-type");
    return;
  }

  root.setAttribute("data-mreact-navigation-pending", "true");

  if (state.from === null) {
    root.removeAttribute("data-mreact-navigation-from");
  } else {
    root.setAttribute("data-mreact-navigation-from", state.from);
  }

  if (state.to === null) {
    root.removeAttribute("data-mreact-navigation-to");
  } else {
    root.setAttribute("data-mreact-navigation-to", state.to);
  }

  if (state.type === null) {
    root.removeAttribute("data-mreact-navigation-type");
  } else {
    root.setAttribute("data-mreact-navigation-type", state.type);
  }
}

function __mreactDispatchNavigationStateChange(state) {
  if (typeof window === "undefined" || typeof CustomEvent !== "function") {
    return;
  }

  window.dispatchEvent(new CustomEvent("mreact:navigation-state-change", {
    detail: state,
  }));
}

async function __mreactApplyNavigationHtmlWithOptionalTransition(html, href, options) {
  if (
    options.transition !== "auto" ||
    typeof document === "undefined" ||
    typeof document.startViewTransition !== "function"
  ) {
    return __mreactNavigateToHtml(html, href, options);
  }

  let navigated = false;
  const transition = document.startViewTransition(() => {
    navigated = __mreactNavigateToHtml(html, href, options);
  });

  try {
    await transition.updateCallbackDone;
  } catch {
    return navigated;
  }

  return navigated;
}

export function __mreactInvalidateNavigationCache(path) {
  const normalizedPath = __mreactNormalizeNavigationPath(path);

  if (normalizedPath === undefined) {
    return;
  }

  for (const href of Array.from(__mreactNavigationState.cache.keys())) {
    if (__mreactNormalizeNavigationPath(href) === normalizedPath) {
      __mreactNavigationState.cache.delete(href);
    }
  }
}

function __mreactFetchNavigationHtml(href) {
  return fetch(href, {
    headers: { "x-mreact-navigation": "1" },
  }).then((response) => {
    __mreactApplyRevalidationHeader(response);
    if (__mreactNavigationResponseRequiresDocumentReload(response)) {
      return undefined;
    }

    return response.text();
  });
}

function __mreactNavigationResponseRequiresDocumentReload(response) {
  return response.status === 204 || response.headers.get("x-mreact-navigation") === "reload";
}

function __mreactApplyRevalidationHeader(response) {
  const header = response.headers.get("x-mreact-revalidate");

  if (header === null || header.trim() === "") {
    return;
  }

  for (const path of header.split(",")) {
    __mreactInvalidateNavigationCache(path.trim());
  }
}

function __mreactNormalizeNavigationPath(path) {
  if (typeof location === "undefined") {
    return typeof path === "string" && path.length > 0 ? path : undefined;
  }

  try {
    const url = new URL(path, location.href);
    const pathname = url.pathname.replace(/\\/+$/, "");

    return pathname === "" ? "/" : pathname;
  } catch {
    return undefined;
  }
}

export function __mreactRestoreHistoryState(state) {
  if (state === null || state === undefined || state.__mreact !== true || typeof state.html !== "string") {
    return false;
  }

  const applied = __mreactApplyNavigationHtml(state.html, state.url);

  if (!applied) {
    return false;
  }

  __mreactScrollTo(Number(state.scrollX ?? 0), Number(state.scrollY ?? 0));
  return true;
}

function __mreactApplyNavigationHtml(html, url) {
  const template = document.createElement("template");
  template.innerHTML = html.replace(/^\\s*<!doctype html>/i, "");
  __mreactApplyOutOfOrderFragments(template.content);
  const nextMarker = template.content.querySelector("[data-mreact-route-id]");
  const currentMarker = document.querySelector("[data-mreact-route-id]");

  if (nextMarker === null || currentMarker === null) {
    return false;
  }

  const currentRouteId = currentMarker.getAttribute("data-mreact-route-id");
  const nextRouteId = nextMarker.getAttribute("data-mreact-route-id");

  __mreactSyncHeadMetadata(template.content, html);
  __mreactResumeNode(currentMarker, nextMarker);
  __mreactSyncRouteDataScripts(template.content, currentRouteId, nextRouteId);

  const script = template.content.querySelector('script[type="module"][src]')?.getAttribute("src");
  if (script !== null && script !== undefined) {
    void import(/* @vite-ignore */ script).then((module) => module.__mreactHydrateRoute?.());
  }

  __mreactApplyOutOfOrderFragments(document);
  __mreactObserveViewportPrefetchAnchors(document);

  return true;
}

function __mreactSyncHeadMetadata(root, html) {
  const nextHead = root.querySelector("head");

  if ((nextHead === null && !/<head(?:\\s[^>]*)?>/i.test(html)) || document.head === null) {
    return;
  }

  const metadataRoot = nextHead ?? root;
  const selector = __mreactManagedHeadMetadataSelector();

  for (const element of Array.from(document.head.querySelectorAll(selector))) {
    element.remove();
  }

  for (const element of Array.from(metadataRoot.querySelectorAll(selector))) {
    document.head.appendChild(element);
  }
}

function __mreactManagedHeadMetadataSelector() {
  return [
    "title",
    'meta[name="description"]',
    'link[rel="canonical"]',
    'meta[property="og:title"]',
    'meta[property="og:description"]',
    'meta[property="og:image"]',
    'link[rel="icon"]',
    'link[rel="apple-touch-icon"]',
    'meta[name="robots"]',
    'meta[name="theme-color"]',
    'meta[name="viewport"]',
  ].join(",");
}

function __mreactSyncRouteDataScripts(root, currentRouteId, nextRouteId) {
  const managedIds = __mreactRouteDataScriptIds(currentRouteId, nextRouteId);

  if (managedIds.size === 0) {
    return;
  }

  for (const element of Array.from(document.querySelectorAll(__mreactRouteDataScriptSelector()))) {
    if (managedIds.has(element.id)) {
      element.remove();
    }
  }

  for (const element of Array.from(root.querySelectorAll(__mreactRouteDataScriptSelector()))) {
    if (managedIds.has(element.id)) {
      document.body.appendChild(element);
    }
  }
}

function __mreactRouteDataScriptIds(...routeIds) {
  const ids = new Set();

  for (const routeId of routeIds) {
    if (typeof routeId !== "string" || routeId === "") {
      continue;
    }

    ids.add(\`mreact-props-\${routeId}\`);
    ids.add(\`mreact-client-references-\${routeId}\`);
  }

  return ids;
}

function __mreactRouteDataScriptSelector() {
  return 'script[type="application/json"][id^="mreact-props-"], script[type="application/json"][id^="mreact-client-references-"]';
}

function __mreactCurrentHistoryState(url) {
  return {
    __mreact: true,
    html: document.body.innerHTML,
    scrollX: Number(globalThis.scrollX ?? 0),
    scrollY: Number(globalThis.scrollY ?? 0),
    url,
  };
}

function __mreactPushHistoryState(url) {
  if (typeof history === "undefined" || url === undefined) {
    return;
  }

  try {
    history.pushState(__mreactCurrentHistoryState(url), "", url);
  } catch {
    // Ignore invalid URLs in non-browser test environments.
  }
}

function __mreactSaveCurrentHistoryState() {
  if (typeof history === "undefined" || typeof location === "undefined") {
    return;
  }

  try {
    history.replaceState(__mreactCurrentHistoryState(location.href), "", location.href);
  } catch {
    // Ignore invalid URLs in non-browser test environments.
  }
}

function __mreactEnableManualScrollRestoration() {
  if (typeof history === "undefined" || !("scrollRestoration" in history)) {
    return;
  }

  try {
    history.scrollRestoration = "manual";
  } catch {
    // Ignore read-only history implementations in non-browser runtimes.
  }
}

function __mreactNormalizeNavigationUrl(url) {
  if (typeof location === "undefined") {
    return typeof url === "string" ? url : undefined;
  }

  try {
    return new URL(url, location.href).href;
  } catch {
    return undefined;
  }
}

function __mreactNormalizeAssetUrl(url) {
  if (typeof location === "undefined") {
    return typeof url === "string" ? url : undefined;
  }

  try {
    return new URL(url, location.href).href;
  } catch {
    return undefined;
  }
}

function __mreactRouteScriptForNavigationUrl(url) {
  const href = __mreactNormalizeNavigationUrl(url);

  if (href === undefined || typeof location === "undefined") {
    return undefined;
  }

  let nextUrl;

  try {
    nextUrl = new URL(href, location.href);
  } catch {
    return undefined;
  }

  if (nextUrl.origin !== location.origin) {
    return undefined;
  }

  for (const route of __mreactClientRoutePrefetchManifest()) {
    if (__mreactRoutePathMatches(route.path, nextUrl.pathname)) {
      return route.script;
    }
  }

  return undefined;
}

function __mreactClientRoutePrefetchManifest() {
  const element = typeof document === "undefined"
    ? null
    : document.getElementById("mreact-route-prefetch-manifest");
  const text = element?.textContent ?? "";

  if (
    __mreactNavigationState.routePrefetchManifest !== undefined &&
    __mreactNavigationState.routePrefetchManifestText === text
  ) {
    return __mreactNavigationState.routePrefetchManifest;
  }

  __mreactNavigationState.routePrefetchManifestText = text;

  if (element === null) {
    __mreactNavigationState.routePrefetchManifest = [];
    return __mreactNavigationState.routePrefetchManifest;
  }

  try {
    const parsed = JSON.parse(text);
    __mreactNavigationState.routePrefetchManifest = Array.isArray(parsed)
      ? parsed.filter((route) =>
          route !== null &&
          typeof route === "object" &&
          typeof route.path === "string" &&
          typeof route.script === "string"
        )
      : [];
  } catch {
    __mreactNavigationState.routePrefetchManifest = [];
  }

  return __mreactNavigationState.routePrefetchManifest;
}

function __mreactRoutePathMatches(routePath, pathname) {
  const routeSegments = __mreactNormalizeRoutePath(routePath);
  const pathSegments = __mreactNormalizeRoutePath(pathname);

  if (routeSegments.length === 0) {
    return pathSegments.length === 0;
  }

  for (const [index, segment] of routeSegments.entries()) {
    const value = pathSegments[index];

    if (segment.startsWith(":...")) {
      return pathSegments.length >= index + 1;
    }

    if (value === undefined) {
      return false;
    }

    if (!segment.startsWith(":") && segment !== value) {
      return false;
    }
  }

  return routeSegments.length === pathSegments.length;
}

function __mreactNormalizeRoutePath(path) {
  const normalized = path.length > 1 ? path.replace(/\\/+$/, "") : path;
  return normalized === "/" || normalized === "" ? [] : normalized.replace(/^\\/+/, "").split("/");
}

function __mreactCanPrefetch() {
  if (typeof navigator === "undefined") {
    return true;
  }

  const connection = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection;
  const effectiveType = typeof connection?.effectiveType === "string"
    ? connection.effectiveType.toLowerCase()
    : "";

  return connection?.saveData !== true && effectiveType !== "slow-2g" && effectiveType !== "2g";
}

function __mreactScrollTo(x, y) {
  if (typeof scrollTo === "function") {
    scrollTo(x, y);
  }
}

function __mreactIsHashOnlyNavigation(nextUrl) {
  if (typeof location === "undefined") {
    return false;
  }

  return nextUrl.origin === location.origin &&
    nextUrl.pathname === location.pathname &&
    nextUrl.search === location.search &&
    nextUrl.hash !== "" &&
    nextUrl.hash !== location.hash;
}

function __mreactInstallNavigation() {
  if (__mreactNavigationState.installed || typeof document === "undefined") {
    return;
  }

  __mreactNavigationState.installed = true;
  __mreactEnableManualScrollRestoration();
  __mreactSaveCurrentHistoryState();
  addEventListener("popstate", (event) => {
    __mreactSaveCurrentHistoryState();
    if (!__mreactRestoreHistoryState(event.state)) {
      location.reload();
    }
  });
  document.addEventListener("pointerenter", (event) => {
    const anchor = __mreactAnchorFromEvent(event);

    if (anchor !== null && __mreactAnchorPrefetchMode(anchor) === "intent") {
      void __mreactPrefetch(anchor.href);
    }
  }, true);
  document.addEventListener("pointerdown", (event) => {
    const anchor = __mreactAnchorFromEvent(event);

    if (anchor !== null && __mreactAnchorPrefetchMode(anchor) === "intent") {
      void __mreactPrefetch(anchor.href);
    }
  }, true);
  document.addEventListener("focusin", (event) => {
    const anchor = __mreactAnchorFromEvent(event);

    if (anchor !== null && __mreactAnchorPrefetchMode(anchor) === "intent") {
      void __mreactPrefetch(anchor.href);
    }
  });
  __mreactObserveViewportPrefetchAnchors(document);
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const anchor = __mreactAnchorFromEvent(event);

    if (anchor === null) {
      return;
    }

    if (anchor.dataset.mreactReload === "true") {
      return;
    }

    const nextUrl = new URL(anchor.href, location.href);

    if (nextUrl.origin !== location.origin) {
      return;
    }

    if (__mreactIsHashOnlyNavigation(nextUrl)) {
      return;
    }

    event.preventDefault();
    void __mreactNavigate(nextUrl.href, {
      scroll: __mreactAnchorScrollMode(anchor),
      transition: __mreactAnchorTransitionMode(anchor),
    })
      .then((navigated) => {
        if (!navigated) {
          location.href = nextUrl.href;
        }
      }).catch(() => {
        location.href = nextUrl.href;
      });
  });
}

function __mreactAnchorFromEvent(event) {
  const target = event.target;
  const anchor = target instanceof Element ? target.closest("a[href]") : null;

  if (!(anchor instanceof HTMLAnchorElement) || anchor.target !== "" || anchor.hasAttribute("download")) {
    return null;
  }

  return anchor;
}

function __mreactAnchorPrefetchMode(anchor) {
  const value = anchor.dataset.mreactPrefetch;

  if (value === "false" || value === "none") {
    return "none";
  }

  return value === "viewport" ? "viewport" : "intent";
}

function __mreactAnchorScrollMode(anchor) {
  return anchor.dataset.mreactScroll === "preserve" ? "preserve" : "top";
}

function __mreactAnchorTransitionMode(anchor) {
  return anchor.dataset.mreactTransition === "auto" ? "auto" : "none";
}

function __mreactObserveViewportPrefetchAnchors(root) {
  if (typeof IntersectionObserver === "undefined") {
    return;
  }

  if (__mreactNavigationState.viewportObserver === undefined) {
    __mreactNavigationState.viewportObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLAnchorElement)) {
          continue;
        }

        __mreactNavigationState.viewportObserver?.unobserve(entry.target);
        void __mreactPrefetch(entry.target.href);
      }
    });
  }

  for (const anchor of Array.from(root.querySelectorAll('a[href][data-mreact-prefetch="viewport"]'))) {
    if (!(anchor instanceof HTMLAnchorElement) || __mreactNavigationState.viewportAnchors.has(anchor)) {
      continue;
    }

    __mreactNavigationState.viewportAnchors.add(anchor);
    __mreactNavigationState.viewportObserver.observe(anchor);
  }
}
`
    : ""
}

function __mreactApplyOutOfOrderFragments(root) {
  const fragments = Array.from(root.querySelectorAll("template[data-mreact-oob-fragment]"));

  for (const fragment of fragments) {
    const id = fragment.getAttribute("data-mreact-oob-fragment");

    if (id === null) {
      continue;
    }

    const placeholder = Array.from(root.querySelectorAll("[data-mreact-oob-placeholder]"))
      .find((candidate) => candidate.getAttribute("data-mreact-oob-placeholder") === id);

    if (placeholder === undefined) {
      continue;
    }

    placeholder.replaceWith(fragment.content.cloneNode(true));
    fragment.remove();
  }
}

function __mreactHydrateClientBoundaries(marker, references, components) {
  if (components.size === 0 && (!Array.isArray(references) || references.length === 0)) {
    return false;
  }

  const placeholders = Array.from(marker.querySelectorAll("template[data-mreact-client-boundary]"));

  if (placeholders.length === 0) {
    return false;
  }

  for (const placeholder of placeholders) {
    const name = placeholder.getAttribute("data-mreact-client-boundary");
    const component = name === null ? undefined : components.get(name);

    if (typeof component !== "function") {
      return false;
    }

    const propsElement = __mreactClientBoundaryPropsElement(placeholder, name);
    const props = propsElement?.textContent === undefined || propsElement.textContent === ""
      ? {}
      : JSON.parse(propsElement.textContent);
    const node = component(props);

    placeholder.replaceWith(node);
    propsElement?.remove();
  }

  return true;
}

function __mreactClientBoundaryPropsElement(placeholder, name) {
  let next = placeholder.nextSibling;

  while (next !== null) {
    if (
      next.nodeType === Node.ELEMENT_NODE &&
      next.tagName === "SCRIPT" &&
      next.getAttribute("type") === "application/json" &&
      next.getAttribute("data-mreact-client-boundary-props") === name
    ) {
      return next;
    }

    if (next.nodeType === Node.ELEMENT_NODE) {
      return undefined;
    }

    next = next.nextSibling;
  }

  return undefined;
}

function __mreactResumeRoute(marker, nextNode) {
  const current = __mreactRouteResumeTarget(marker, nextNode);

  if (current === null) {
    marker.appendChild(nextNode);
    return;
  }

  __mreactResumeNode(current, nextNode);

  if (current.parentNode !== marker) {
    return;
  }

  while (marker.childNodes.length > 1) {
    marker.lastChild?.remove();
  }
}

function __mreactRouteResumeTarget(marker, nextNode) {
  const current = marker.firstChild;

  if (
    current === null ||
    current.nodeType !== Node.ELEMENT_NODE ||
    nextNode.nodeType !== Node.ELEMENT_NODE ||
    current.tagName === nextNode.tagName ||
    !current.hasAttribute("data-mreact-layout-boundary")
  ) {
    return current;
  }

  return __mreactFindLayoutPageTarget(current, nextNode) ?? current;
}

function __mreactFindLayoutPageTarget(current, nextNode) {
  for (const child of Array.from(current.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    if (
      child.tagName === nextNode.tagName &&
      !child.hasAttribute("data-mreact-layout-boundary") &&
      !child.hasAttribute("data-mreact-template-boundary")
    ) {
      return child;
    }

    if (child.hasAttribute("data-mreact-layout-boundary")) {
      const nested = __mreactFindLayoutPageTarget(child, nextNode);

      if (nested !== null) {
        return nested;
      }
    }
  }

  return null;
}

function __mreactResumeNode(current, next) {
  if (
    next.nodeType === Node.COMMENT_NODE &&
    next.nodeValue === "mreact-async-boundary"
  ) {
    // Server stream emits the resolved <Await> content; preserve the existing
    // DOM instead of replacing it with the client placeholder comment.
    return;
  }

  if (__mreactShouldReplaceNode(current, next)) {
    current.replaceWith(next);
    return;
  }

  if (current.nodeType === Node.TEXT_NODE && next.nodeType === Node.TEXT_NODE) {
    if (current.nodeValue !== next.nodeValue) {
      current.nodeValue = next.nodeValue;
    }
    return;
  }

  if (current.nodeType !== Node.ELEMENT_NODE || next.nodeType !== Node.ELEMENT_NODE) {
    current.replaceWith(next);
    return;
  }

  __mreactSyncEventBindings(current, next);
  __mreactSyncAttributes(current, next);
  __mreactResumeChildren(current, next);
}

function __mreactShouldReplaceNode(current, next) {
  if (
    next.nodeType === Node.ELEMENT_NODE &&
    next.hasAttribute("data-mreact-template-boundary")
  ) {
    return true;
  }

  if (current.nodeType !== next.nodeType) {
    return true;
  }

  return current.nodeType === Node.ELEMENT_NODE &&
    current.tagName !== next.tagName;
}

function __mreactSyncEventBindings(current, next) {
  const previousDisposers = current.__mreactEventDisposers;

  if (Array.isArray(previousDisposers)) {
    for (const dispose of previousDisposers) {
      dispose();
    }
  }

  const bindings = next.__mreactEventBindings;

  if (!Array.isArray(bindings) || bindings.length === 0) {
    current.__mreactEventDisposers = [];
    current.__mreactHasEvents = false;
    return;
  }

  const disposers = [];

  for (const binding of bindings) {
    if (binding.delegated === true && __mreactIsDelegatedEventType(binding.type)) {
      disposers.push(__mreactAddDelegatedEventListener(current, binding.type, binding.listener));
    } else {
      current.addEventListener(binding.type, binding.listener);
      disposers.push(() => current.removeEventListener(binding.type, binding.listener));
    }
  }

  current.__mreactEventDisposers = disposers;
  current.__mreactHasEvents = true;
}

function __mreactIsDelegatedEventType(type) {
  return type === "change" ||
    type === "click" ||
    type === "input" ||
    type === "keydown" ||
    type === "keyup" ||
    type === "pointerdown" ||
    type === "pointermove" ||
    type === "pointerup" ||
    type === "submit";
}

function __mreactDelegatedEventState() {
  globalThis.__mreactDelegatedEventState ??= {
    elements: new WeakMap(),
    roots: new WeakMap(),
  };
  return globalThis.__mreactDelegatedEventState;
}

function __mreactAddDelegatedEventListener(element, type, listener) {
  const root = element.ownerDocument;
  const state = __mreactDelegatedEventState();
  let listenersByType = state.elements.get(element);

  if (listenersByType === undefined) {
    listenersByType = new Map();
    state.elements.set(element, listenersByType);
  }

  let listeners = listenersByType.get(type);

  if (listeners === undefined) {
    listeners = [];
    listenersByType.set(type, listeners);
  }

  listeners.push(listener);
  __mreactRetainDelegatedEventRoot(root, type);

  return () => {
    const state = __mreactDelegatedEventState();
    const currentListeners = state.elements.get(element)?.get(type);
    const index = currentListeners?.indexOf(listener) ?? -1;

    if (index !== -1) {
      currentListeners?.splice(index, 1);
    }

    if (currentListeners?.length === 0) {
      state.elements.get(element)?.delete(type);
    }

    __mreactReleaseDelegatedEventRoot(root, type);
  };
}

function __mreactRetainDelegatedEventRoot(root, type) {
  const state = __mreactDelegatedEventState();
  let rootsByType = state.roots.get(root);

  if (rootsByType === undefined) {
    rootsByType = new Map();
    state.roots.set(root, rootsByType);
  }

  const current = rootsByType.get(type);

  if (current !== undefined) {
    current.count += 1;
    return;
  }

  const listener = (event) => __mreactDispatchDelegatedEvent(root, type, event);
  rootsByType.set(type, { count: 1, listener });
  root.addEventListener(type, listener);
}

function __mreactReleaseDelegatedEventRoot(root, type) {
  const rootsByType = __mreactDelegatedEventState().roots.get(root);
  const current = rootsByType?.get(type);

  if (rootsByType === undefined || current === undefined) {
    return;
  }

  current.count -= 1;

  if (current.count > 0) {
    return;
  }

  root.removeEventListener(type, current.listener);
  rootsByType.delete(type);
}

function __mreactDispatchDelegatedEvent(root, type, event) {
  const state = __mreactDelegatedEventState();

  for (const target of event.composedPath()) {
    if (target === root) {
      break;
    }

    if (!(target instanceof HTMLElement)) {
      continue;
    }

    const listeners = state.elements.get(target)?.get(type);

    if (listeners === undefined || listeners.length === 0) {
      continue;
    }

    const activeListeners = listeners.slice();

    for (const listener of activeListeners) {
      __mreactCallWithCurrentTarget(listener, event, target);
    }

    if (event.cancelBubble) {
      break;
    }
  }
}

function __mreactCallWithCurrentTarget(listener, event, currentTarget) {
  const descriptor = Object.getOwnPropertyDescriptor(event, "currentTarget");

  Object.defineProperty(event, "currentTarget", {
    configurable: true,
    value: currentTarget,
  });

  try {
    listener.call(currentTarget, event);
  } finally {
    if (descriptor === undefined) {
      delete event.currentTarget;
    } else {
      Object.defineProperty(event, "currentTarget", descriptor);
    }
  }
}

function __mreactSyncAttributes(current, next) {
  for (const attribute of Array.from(current.attributes)) {
    if (!next.hasAttribute(attribute.name)) {
      current.removeAttribute(attribute.name);
    }
  }

  for (const attribute of Array.from(next.attributes)) {
    if (current.getAttribute(attribute.name) !== attribute.value) {
      current.setAttribute(attribute.name, attribute.value);
    }
  }
}

function __mreactResumeChildren(current, next) {
  const nextChildren = Array.from(next.childNodes);
  const refreshTextBindings = next.__mreactHasEvents === true;
  let index = 0;

  while (index < nextChildren.length) {
    const currentChild = current.childNodes[index];
    const nextChild = nextChildren[index];

    if (currentChild === undefined) {
      current.appendChild(nextChild);
      index += 1;
      continue;
    }

    // Text nodes that the client bound reactively must replace the
    // server's static text so subsequent updates land in the live DOM.
    const isReactiveText =
      nextChild.nodeType === Node.TEXT_NODE &&
      nextChild.__mreactReactiveText === true;

    if (
      (refreshTextBindings || isReactiveText) &&
      currentChild.nodeType === Node.TEXT_NODE &&
      nextChild.nodeType === Node.TEXT_NODE
    ) {
      currentChild.replaceWith(nextChild);
    } else {
      __mreactResumeNode(currentChild, nextChild);
    }
    index += 1;
  }

  while (current.childNodes.length > nextChildren.length) {
    current.lastChild?.remove();
  }
}
`;
  const bundled = await bundleRouterModule({
    code: entry,
    define: {
      __MREACT_CLIENT_DEVTOOLS__: "false",
    },
    filename: options.filename,
    minify: options.minify === true,
    platform: "browser",
    preserveExports: true,
    plugins: [workspaceRuntimePlugin({ routeFile: options.filename })],
    sourceMap: options.sourceMap,
  });

  return {
    code: bundled.code,
    ...(bundled.map === undefined ? {} : { map: bundled.map }),
  };
}

function workspaceRuntimePlugin(options: { routeFile: string }) {
  const routeDir = dirname(options.routeFile);
  const packageFile = (monorepoDir: string, packageName: string, entry: string): string =>
    workspacePackageFile({
      currentFileUrl: import.meta.url,
      entry,
      monorepoDir,
      packageName,
    });
  const reactiveCorePath = packageFile("reactive-core", "@reckona/mreact-reactive-core", "index");
  const reactiveCoreDir = dirname(reactiveCorePath);
  const runtimePaths = new Map([
    ["@reckona/mreact-compat", packageFile("react-compat", "@reckona/mreact-compat", "index")],
    [
      "@reckona/mreact-compat/event-priority",
      packageFile("react-compat", "@reckona/mreact-compat", "event-priority"),
    ],
    [
      "@reckona/mreact-compat/flight",
      packageFile("react-compat", "@reckona/mreact-compat", "flight"),
    ],
    [
      "@reckona/mreact-compat/internal",
      packageFile("react-compat", "@reckona/mreact-compat", "internal"),
    ],
    [
      "@reckona/mreact-compat/jsx-dev-runtime",
      packageFile("react-compat", "@reckona/mreact-compat", "jsx-dev-runtime"),
    ],
    [
      "@reckona/mreact-compat/jsx-runtime",
      packageFile("react-compat", "@reckona/mreact-compat", "jsx-runtime"),
    ],
    [
      "@reckona/mreact-compat/scheduler",
      packageFile("react-compat", "@reckona/mreact-compat", "scheduler"),
    ],
    [
      "@reckona/mreact-reactive-dom",
      packageFile("reactive-dom", "@reckona/mreact-reactive-dom", "index"),
    ],
  ]);

  return {
    name: "mreact-workspace-runtime",
    setup(buildApi: RouterCompatBuildApi) {
      buildApi.onResolve({ filter: /^\.\/devtools\.js$/ }, (args) =>
        args.importer?.startsWith(reactiveCoreDir) === true
          ? { namespace: "mreact-devtools-stub", path: "devtools" }
          : undefined,
      );
      buildApi.onResolve({ filter: /^@reckona\/mreact-reactive-core$/ }, () => ({
        namespace: "mreact-hot-runtime",
        path: "reactive-core",
      }));
      buildApi.onResolve(
        {
          filter:
            /^@reckona\/mreact-(?:compat|reactive-dom)(?:\/(?:event-priority|flight|internal|jsx-dev-runtime|jsx-runtime|scheduler))?$/,
        },
        (args) => {
          const path = runtimePaths.get(args.path);

          return path === undefined ? undefined : { path };
        },
      );
      buildApi.onLoad({ filter: /^reactive-core$/, namespace: "mreact-hot-runtime" }, () => ({
        contents: `import { cell as nativeCell } from ${JSON.stringify(reactiveCorePath)};
export * from ${JSON.stringify(reactiveCorePath)};
export function cell(initial) {
  const routeCell = globalThis.__mreactRouteCell;
  return typeof routeCell === "function" ? routeCell(nativeCell, initial) : nativeCell(initial);
}`,
        loader: "ts",
        resolveDir: reactiveCoreDir,
      }));
      buildApi.onLoad({ filter: /^devtools$/, namespace: "mreact-devtools-stub" }, () => ({
        contents: `export function emitReactiveDevtoolsEvent() {}
export function hasReactiveDevtoolsEmitter() { return false; }
export function currentDevtoolsEmitter() { return undefined; }`,
        loader: "ts",
      }));
      buildApi.onLoad({ filter: /\.(?:mreact\.)?[cm]?[jt]sx$/ }, async (args) => {
        if (!isAppLocalSourcePath(args.path, routeDir) || args.path === options.routeFile) {
          return undefined;
        }

        const source = await readFile(args.path, "utf8");
        const moduleContext = createCompilerModuleContext({
          code: source,
          filename: args.path,
        });
        const output = transformCompilerModuleContext({
          code: source,
          dev: true,
          filename: args.path,
          moduleContext,
          target: "client",
        });

        if (output.diagnostics.length > 0) {
          throw new Error(
            output.diagnostics
              .map((diagnostic) => formatDiagnostic(args.path, diagnostic))
              .join("\n"),
          );
        }

        return {
          contents: output.code,
          loader: "tsx",
          resolveDir: dirname(args.path),
        };
      });
    },
  };
}

function isAppLocalSourcePath(path: string, routeDir: string): boolean {
  return path === routeDir || path.startsWith(`${routeDir}/`);
}

/**
 * Detects the `export const clientNavigation = false` hint in a page module
 * source. Returns the hinted value, or `true` when no hint is present (i.e.,
 * preserve the historical "navigation runtime is always present" behavior).
 *
 * Regex-based to avoid pulling the JS parser into the build path. The pattern
 * accepts the common formatting variants:
 *   export const clientNavigation = false
 *   export const   clientNavigation   =  false ;
 *   export const clientNavigation: boolean = false
 */
export function detectClientNavigationHint(source: string): boolean {
  const match = source.match(
    /export\s+const\s+clientNavigation\s*(?::\s*[^=]+)?=\s*(true|false)\s*;?/,
  );
  return match === null ? true : match[1] === "true";
}

export function detectNavigationRuntimeHint(source: string): boolean {
  const match = source.match(
    /export\s+const\s+navigationRuntime\s*(?::\s*[^=]+)?=\s*(true|false)\s*;?/,
  );
  return match !== null && match[1] === "true";
}

function detectRouteCellStateHint(code: string): boolean {
  const callExpression = routeCellCallExpressionSource(code);

  return callExpression === undefined
    ? /\bcell\d*\s*\(/.test(code)
    : new RegExp(`(?:${callExpression})\\s*\\(`).test(code);
}

async function inferClientReferenceManifestForBundle(options: {
  code: string;
  filename: string;
  routePath: string;
}): Promise<readonly ClientReferenceMetadata[]> {
  const cache = createClientRouteInferenceCache();
  const moduleContext = await compilerModuleContextForSource({
    cache,
    code: options.code,
    filename: options.filename,
  });
  const inference = await inferClientRouteModule({
    cache,
    code: options.code,
    filename: options.filename,
    moduleContext,
    routePath: options.routePath,
  });

  if (inference.clientBoundaryImports.length === 0) {
    return [];
  }

  const output = transformCompilerModuleContext({
    code: options.code,
    clientBoundaryImports: inference.clientBoundaryImports,
    dev: true,
    filename: options.filename,
    moduleContext,
    target: "server",
  });

  return output.metadata.clientReferenceManifest ?? [];
}

function emitClientReferenceImportBlock(imports: readonly ClientReferenceImport[]): string {
  if (imports.length === 0) {
    return "";
  }

  return `${imports.map((reference, index) => {
    const localName = clientReferenceLocalName(index);

    return isIdentifierName(reference.exportName)
      ? `import { ${reference.exportName} as ${localName} } from ${JSON.stringify(reference.importSource)};`
      : `import * as ${localName} from ${JSON.stringify(reference.importSource)};`;
  }).join("\n")}\n`;
}

function emitClientReferenceRegistry(
  manifest: readonly ClientReferenceMetadata[],
  imports: readonly ClientReferenceImport[],
): string {
  const importedExpressions = new Map(
    imports.map((reference, index) => [
      reference.name,
      isIdentifierName(reference.exportName)
        ? clientReferenceLocalName(index)
        : `${clientReferenceLocalName(index)}[${JSON.stringify(reference.exportName)}]`,
    ]),
  );
  const entries = manifest.flatMap((reference) => {
    const expression = importedExpressions.get(reference.name) ?? clientReferenceExpression(reference.name);

    return expression === undefined
      ? []
      : [`  [${JSON.stringify(reference.name)}, ${expression}],`];
  });

  return ["const __mreactClientReferenceComponents = new Map([", ...entries, "]);"].join("\n");
}

function clientReferenceLocalName(index: number): string {
  return `__mreactClientReference${index}`;
}

function clientReferenceExpression(name: string): string | undefined {
  return /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(name) ? name : undefined;
}

function routeComponentExpressionForComponents(components: readonly ComponentMetadata[]): string {
  const candidates = uniqueStrings([
    ...components
      .filter((component) => component.exportName === "default")
      .map((component) => component.name),
    "Page",
    "DefaultExport",
  ]).filter(isIdentifierName);

  return candidates.reduceRight(
    (next, name) => `typeof ${name} === "function" ? ${name} : ${next}`,
    "undefined",
  );
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function isIdentifierName(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value);
}

function routeStateSignatureForSource(code: string): string {
  const callExpression = routeCellCallExpressionSource(code);
  const callsitePattern =
    callExpression === undefined
      ? /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(cell\d*|cell)\s*\(/g
      : new RegExp(
          `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(${callExpression})\\s*\\(`,
          "g",
        );
  const cellCallsites = Array.from(
    code.matchAll(callsitePattern),
    (match) => `${match[1]}:${match[2]}`,
  );
  const countPattern =
    callExpression === undefined
      ? /\bcell\d*\s*\(/g
      : new RegExp(`(?:${callExpression})\\s*\\(`, "g");
  const signature =
    cellCallsites.length > 0
      ? cellCallsites.join("\n")
      : `cell-count:${(code.match(countPattern) ?? []).length}`;

  return createHash("sha256").update(signature).digest("hex").slice(0, 16);
}

function routeCellCallExpressionSource(code: string): string | undefined {
  const namedImports = new Set<string>();
  const namespaceImports = new Set<string>();
  const namedImportPattern =
    /import\s+\{(?<imports>[^}]*)\}\s+from\s+["']@reckona\/mreact-reactive-core["']/g;

  for (const match of code.matchAll(namedImportPattern)) {
    const imports = match.groups?.imports;

    if (imports === undefined) {
      continue;
    }

    for (const part of imports.split(",")) {
      const specifier = part.trim();
      const alias = /^cell\s+as\s+([A-Za-z_$][\w$]*)$/.exec(specifier);

      if (specifier === "cell") {
        namedImports.add("cell");
      } else if (alias?.[1] !== undefined) {
        namedImports.add(alias[1]);
      }
    }
  }

  const namespaceImportPattern =
    /import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']@reckona\/mreact-reactive-core["']/g;

  for (const match of code.matchAll(namespaceImportPattern)) {
    if (match[1] !== undefined) {
      namespaceImports.add(match[1]);
    }
  }

  const alternatives = [
    ...Array.from(namedImports, (name) => `\\b${escapeRegExp(name)}`),
    ...Array.from(namespaceImports, (name) => `\\b${escapeRegExp(name)}\\.cell`),
  ];

  return alternatives.length === 0 ? undefined : `(?:${alternatives.join("|")})`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeScriptJson(value: string): string {
  return value.replaceAll("<", "\\u003c");
}
