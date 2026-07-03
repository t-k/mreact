import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, extname, join, relative, sep } from "node:path";
import {
  analyzeBoundaryGraph,
  collectClientRouteModuleAnalysis,
  formatDiagnostic,
  type ComponentMetadata,
  type BoundaryGraphResult,
  type ClientRouteModuleAnalysis,
  type ClientRouteStaticImportReference,
  type StaticImportReference,
  type TopLevelExportRenderInfo,
} from "@reckona/mreact-compiler";
import type { ClientReferenceMetadata } from "@reckona/mreact-shared/compiler-contract";
import {
  collectClientRouteModuleAnalysisFromContext,
  createCompilerModuleContext,
  hasUnguardedBrowserGlobalReference,
  readTopLevelBooleanExport,
  readTopLevelBooleanExportFromContext,
  stripTypeScriptWithOxc,
  transformCompilerModuleContext,
  type CompilerModuleContext,
} from "@reckona/mreact-compiler/internal";
import { assetPath } from "./assets.js";
import {
  bundleRouterModule,
  bundleRouterModules,
  type RouterCompatBuildApi,
  type RouterBundleAssetOutput,
  type RouterBundleChunkOutput,
} from "./bundle-pipeline.js";
import { resolveClientConsolePureFunctions, type AppRouterProductionOptions } from "./config.js";
import type { AppRoute } from "./routes.js";
import { existingRouteShellCandidates } from "./route-shells.js";
import {
  routeDataScriptIds,
  routeDataScriptSelector,
  routeHydrationContract,
} from "./route-hydration-contract.js";
import { stripRouteClientSource } from "./route-source.js";
import { hasJsxSyntax } from "./source-jsx.js";
import { sourceModuleCandidates } from "./source-modules.js";
import { escapeHtmlQuotedAttribute as escapeHtmlAttribute } from "@reckona/mreact-shared/html-escape";
import { workspacePackageFile } from "./workspace-packages.js";
import type { Plugin, PluginOption } from "vite";

const nodeBuiltinPackages = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

export interface ClientRouteManifestEntry {
  bytes?: number;
  css?: readonly string[];
  path: string;
  kind: AppRoute["kind"];
  client: boolean;
  clientReferenceManifest?: readonly ClientReferenceMetadata[] | undefined;
  devScript?: string;
  imports?: readonly string[];
  navigation?: boolean;
  navigationScript?: string;
  routeId?: string;
  script?: string;
  sourceMap?: string;
}

export interface BuildClientRouteOutputOptions {
  cacheDir?: string | undefined;
  code: string;
  clientBoundaryImports?: readonly string[] | undefined;
  clientReferenceImports?: readonly ClientReferenceImport[] | undefined;
  clientReferenceManifest?: readonly ClientReferenceMetadata[] | undefined;
  dropClientConsole?: AppRouterProductionOptions["dropClientConsole"] | undefined;
  dropConsoleFunctions?: readonly string[] | undefined;
  filename: string;
  minify?: boolean | undefined;
  routePath: string;
  sourceMap?: boolean | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
  clientNavigation?: boolean | undefined;
  forceInlineNavigationRuntime?: boolean | undefined;
}

export interface BuildClientRouteBatchOutput {
  assets?: RouterBundleAssetOutput[] | undefined;
  chunks: readonly RouterBundleChunkOutput[];
  routes: readonly BuildClientRouteBatchRouteOutput[];
}

export interface BuildClientRouteBatchRouteOutput {
  chunk: RouterBundleChunkOutput;
  routeId: string;
  routePath: string;
}

export interface ClientRouteInferenceCache {
  moduleAnalysisByFile: Map<string, Promise<ClientRouteModuleAnalysis>>;
  moduleContextByFile: Map<string, Promise<CompilerModuleContext>>;
  resolvedByImport: Map<string, Promise<string | undefined>>;
  sourceByFile: Map<string, Promise<CachedClientRouteSource>>;
  transformedSourceByFile: Map<string, Promise<CachedClientRouteSource>>;
}

interface CachedClientRouteSource {
  signature: string;
  source: string;
}

interface ClientRouteSourceTransform {
  cacheKey: string;
  transform(filename: string, code: string): Promise<string>;
}

export interface ClientRouteInferenceResult {
  client: boolean;
  clientBoundaryImports: string[];
  clientBoundaryFallbackImports: string[];
  diagnostics: ClientRouteInferenceDiagnostic[];
}

interface ClientRouteModuleInferenceResult extends ClientRouteInferenceResult {
  boundaryGraphFallbackCandidate: boolean;
  boundaryGraphFallbackRequired: boolean;
  clientBoundaryExportNames: string[];
  clientBoundaryModule: boolean;
  nestedClientExportNames: string[];
  clientReferenceSourceFiles: string[];
  navigationLinkExportNames: string[];
  serverOnly: boolean;
  serverOnlyClientRuntime: boolean;
  usesNavigationLink: boolean;
}

export interface ClientReferenceImport {
  exportName: string;
  importSource: string;
  name: string;
}

export interface ClientRouteReferenceResult extends ClientRouteInferenceResult {
  clientReferenceImports: ClientReferenceImport[];
  clientReferenceManifest: ClientReferenceMetadata[];
  usesNavigationLink: boolean;
}

export interface ClientRouteInferenceDiagnostic {
  code:
    | typeof clientBoundaryInferenceServerOnlyReferenceCode
    | typeof clientBoundaryInferenceFunctionCallInteractiveCode
    | typeof clientBoundaryInferenceUnsupportedReferenceCode
    | typeof navigationRuntimeLinkDisabledCode;
  filename: string;
  level: "warn";
  localNames: string[];
  message: string;
  routePath?: string | undefined;
  source: string;
}

const clientBoundaryInferenceServerOnlyReferenceCode =
  "MR_CLIENT_BOUNDARY_INFERENCE_SERVER_ONLY_REFERENCE";
const clientBoundaryInferenceFunctionCallInteractiveCode =
  "MR_CLIENT_BOUNDARY_INFERENCE_FUNCTION_CALL_INTERACTIVE";
const clientBoundaryInferenceUnsupportedReferenceCode =
  "MR_CLIENT_BOUNDARY_INFERENCE_UNSUPPORTED_REFERENCE";
const navigationRuntimeLinkDisabledCode = "MR_NAVIGATION_RUNTIME_LINK_DISABLED";

export async function routeToClientManifestEntry(
  route: AppRoute,
): Promise<ClientRouteManifestEntry> {
  if (route.kind !== "page") {
    return { path: route.path, kind: route.kind, client: false };
  }

  const code = await readFile(route.file, "utf8");
  const inference = await inferClientRouteModule({
    code: stripRouteClientSource({ code, filename: route.file }),
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
    transformedSourceByFile: new Map(),
  };
}

export async function isClientRouteModule(options: {
  appDir?: string | undefined;
  cache?: ClientRouteInferenceCache | undefined;
  code: string;
  filename: string;
  routePath?: string | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
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
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<ClientRouteInferenceResult> {
  const cache = options.cache ?? createClientRouteInferenceCache();
  const sourceTransform = clientRouteSourceTransformForVitePlugins(options.vitePlugins);
  const code = await transformClientRouteSource({
    code: options.code,
    filename: options.filename,
    sourceTransform,
  });

  try {
    const routeInference = await inferClientRouteModuleSource({
      cache,
      code,
      filename: options.filename,
      ...(sourceTransform === undefined ? { moduleContext: options.moduleContext } : {}),
      root: true,
      seen: new Set(),
      sourceTransform,
    });
    const mergedRouteInference = routeInference.boundaryGraphFallbackRequired
      ? mergeClientRouteInference(
          routeInference,
          await inferClientRouteModuleBoundaryGraph({
            cache,
            code,
            filename: options.filename,
            sourceTransform,
          }),
        )
      : routeInference;

    if (options.appDir === undefined) {
      return withClientRouteDiagnosticPath(mergedRouteInference, options.routePath);
    }

    const shellInferences = await inferClientRouteShellModules({
      appDir: options.appDir,
      cache,
      filename: options.filename,
      sourceTransform,
    });

    return withClientRouteDiagnosticPath(
      {
        client:
          mergedRouteInference.client || shellInferences.some((inference) => inference.client),
        clientBoundaryImports: mergedRouteInference.clientBoundaryImports,
        clientBoundaryFallbackImports: mergedRouteInference.clientBoundaryFallbackImports,
        diagnostics: [
          ...mergedRouteInference.diagnostics,
          ...shellInferences.flatMap((inference) => inference.diagnostics),
        ],
      },
      options.routePath,
    );
  } catch (error) {
    throw new Error(
      `Failed to infer client route for ${options.routePath ?? "<unknown>"} (${options.filename}).\n${errorMessage(error)}`,
      { cause: error },
    );
  }
}

async function inferClientRouteModuleBoundaryGraph(options: {
  cache: ClientRouteInferenceCache;
  code: string;
  filename: string;
  sourceTransform?: ClientRouteSourceTransform | undefined;
}): Promise<ClientRouteInferenceResult> {
  const graph = await analyzeBoundaryGraph({
    entries: [{ file: options.filename, kind: "route-page" }],
    readModule: async (file) => {
      if (file === options.filename) {
        return options.code;
      }

      return await readClientRouteSource({
        cache: options.cache,
        filename: file,
        sourceTransform: options.sourceTransform,
      });
    },
    resolveModule: async ({ importer, source }) =>
      await resolveAppLocalModule({
        allowExplicitNonSource: options.sourceTransform !== undefined,
        cache: options.cache,
        importer,
        specifier: source,
      }),
  });

  return clientRouteInferenceFromBoundaryGraph(graph, options.filename);
}

function clientRouteInferenceFromBoundaryGraph(
  graph: BoundaryGraphResult,
  filename: string,
): ClientRouteInferenceResult {
  const clientBoundaryImports = graph.clientBoundaries
    .filter((boundary) => boundary.importerFile === filename)
    .map((boundary) => boundary.source);
  const clientRoute = graph.modules.some(
    (module) => module.file === filename && module.classification === "client-route",
  );

  return {
    client: clientRoute || clientBoundaryImports.length > 0,
    clientBoundaryImports,
    clientBoundaryFallbackImports: [],
    diagnostics: [],
  };
}

function mergeClientRouteInference(
  left: ClientRouteInferenceResult,
  right: ClientRouteInferenceResult,
): ClientRouteInferenceResult {
  return {
    client: left.client || right.client,
    clientBoundaryImports: Array.from(
      new Set([...left.clientBoundaryImports, ...right.clientBoundaryImports]),
    ),
    clientBoundaryFallbackImports: Array.from(
      new Set([...left.clientBoundaryFallbackImports, ...right.clientBoundaryFallbackImports]),
    ),
    diagnostics: [...left.diagnostics, ...right.diagnostics],
  };
}

export async function collectClientRouteReferences(options: {
  appDir?: string | undefined;
  cache?: ClientRouteInferenceCache | undefined;
  code: string;
  filename: string;
  routePath?: string | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<ClientRouteReferenceResult> {
  const cache = options.cache ?? createClientRouteInferenceCache();
  const sourceTransform = clientRouteSourceTransformForVitePlugins(options.vitePlugins);
  const code = await transformClientRouteSource({
    code: options.code,
    filename: options.filename,
    sourceTransform,
  });
  const routeModuleContext = await compilerModuleContextForSource({
    cache,
    code,
    filename: options.filename,
  });
  const routeInference = await inferClientRouteModuleSource({
    cache,
    code,
    filename: options.filename,
    moduleContext: routeModuleContext,
    root: true,
    seen: new Set(),
    sourceTransform,
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
      (await compilerModuleContextForSource({
        cache,
        code: sourceOptions.code,
        filename: sourceOptions.filename,
      }));
    const inference =
      sourceOptions.inference ??
      (await inferClientRouteModuleSource({
        cache,
        code: sourceOptions.code,
        filename: sourceOptions.filename,
        moduleContext,
        root: true,
        seen: new Set(),
        sourceTransform,
      }));
    sources.push({
      code: sourceOptions.code,
      filename: sourceOptions.filename,
      inference,
      moduleContext,
    });

    for (const referenceFile of inference.clientReferenceSourceFiles) {
      const code = stripRouteClientSource({
        code: await readClientRouteSource({ cache, filename: referenceFile, sourceTransform }),
        filename: referenceFile,
      });
      await addSource({ code, filename: referenceFile });
    }
  };

  await addSource({
    code,
    filename: options.filename,
    inference: routeInference,
    moduleContext: routeModuleContext,
  });

  if (options.appDir !== undefined) {
    for (const shell of await clientShellFilesForPage(options.appDir, options.filename)) {
      const code = stripRouteClientSource({
        code: await readClientRouteSource({ cache, filename: shell, sourceTransform }),
        filename: shell,
      });
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
          sourceTransform,
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
      clientBoundaryFallbackImports: source.inference.clientBoundaryFallbackImports,
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
        fatalDiagnostics
          .map((diagnostic) => formatDiagnostic(source.filename, diagnostic))
          .join("\n"),
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
    clientBoundaryFallbackImports: routeInference.clientBoundaryFallbackImports,
    clientReferenceImports,
    clientReferenceManifest,
    diagnostics: sources
      .flatMap((source) => source.inference.diagnostics)
      .map((diagnostic) => withClientRouteDiagnosticPath(diagnostic, options.routePath)),
    usesNavigationLink:
      routeInference.usesNavigationLink ||
      sources.some(
        (source) => source.filename !== options.filename && source.inference.usesNavigationLink,
      ),
  };
}

export async function resolveNavigationRuntime(options: {
  appDir?: string | undefined;
  cache?: ClientRouteInferenceCache | undefined;
  code: string;
  filename: string;
  references?: ClientRouteReferenceResult | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<boolean> {
  const cache = options.cache ?? createClientRouteInferenceCache();
  const sourceTransform = clientRouteSourceTransformForVitePlugins(options.vitePlugins);
  const code = await transformClientRouteSource({
    code: options.code,
    filename: options.filename,
    sourceTransform,
  });
  // Read the override from the cached module context so the dev server does not
  // re-parse every page route on each request.
  const moduleContext = await compilerModuleContextForSource({
    cache,
    code,
    filename: options.filename,
  });
  const override = readTopLevelBooleanExportFromContext(moduleContext, "navigationRuntime");

  if (override !== undefined) {
    return override;
  }

  const references =
    options.references ??
    (await collectClientRouteReferences({
      appDir: options.appDir,
      cache,
      code: options.code,
      filename: options.filename,
      vitePlugins: options.vitePlugins,
    }));

  return references.usesNavigationLink;
}

export function navigationRuntimeLinkDisabledDiagnostic(options: {
  filename: string;
  references: Pick<ClientRouteReferenceResult, "usesNavigationLink">;
  routePath?: string | undefined;
  source: string;
}): ClientRouteInferenceDiagnostic | undefined {
  if (
    !options.references.usesNavigationLink ||
    detectNavigationRuntimeOverride(options.source) !== false
  ) {
    return undefined;
  }

  return {
    code: navigationRuntimeLinkDisabledCode,
    filename: options.filename,
    level: "warn",
    localNames: [],
    message:
      "A rendered Link was detected, but this route exports navigationRuntime = false. Client-side navigation will be disabled for this route; remove the override or replace Link with a plain anchor if that is intentional.",
    routePath: options.routePath,
    source: options.source,
  };
}

async function inferClientRouteShellModules(options: {
  appDir: string;
  cache: ClientRouteInferenceCache;
  filename: string;
  sourceTransform?: ClientRouteSourceTransform | undefined;
}): Promise<ClientRouteInferenceResult[]> {
  return Promise.all(
    (await clientShellFilesForPage(options.appDir, options.filename)).map(async (shell) => {
      const code = stripRouteClientSource({
        code: await readClientRouteSource({
          cache: options.cache,
          filename: shell,
          sourceTransform: options.sourceTransform,
        }),
        filename: shell,
      });
      return await inferClientRouteModuleSource({
        cache: options.cache,
        code,
        filename: shell,
        root: true,
        seen: new Set(),
        sourceTransform: options.sourceTransform,
      });
    }),
  );
}

async function clientShellFilesForPage(appDir: string, pageFile: string): Promise<string[]> {
  const existing = await existingRouteShellCandidates(
    appDir,
    pageFile,
    async (file) => file !== pageFile && (await isFile(file)),
  );

  return existing.map((candidate) => candidate.file);
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
    analysis.hasUseClientDirective || (!analysis.hasUseServerDirective && analysis.clientRuntime)
  );
}

function isExplicitClientRouteSource(
  analysis: ClientRouteModuleAnalysis,
  filename: string,
): boolean {
  return analysis.hasUseClientDirective || isClientBoundaryFilename(filename);
}

function isClientBoundaryFilename(filename: string): boolean {
  return /\.(?:client|compat)(?:\.mreact)?\.[cm]?[jt]sx?$/.test(filename);
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
  sourceTransform?: ClientRouteSourceTransform | undefined;
}): Promise<ClientRouteModuleInferenceResult> {
  const analysis = await clientRouteModuleAnalysisForSource(options);
  const usesNavigationLinkLocal = detectLinkComponentUsage(analysis);

  if (isServerOnlyClientRouteSource(analysis)) {
    return emptyClientRouteModuleInferenceResult({
      navigationLinkExportNames: detectLinkComponentExportNames(analysis),
      serverOnly: true,
      serverOnlyClientRuntime: analysis.clientRuntime,
      usesNavigationLink: usesNavigationLinkLocal,
    });
  }

  if (isExplicitClientRouteSource(analysis, options.filename)) {
    return emptyClientRouteModuleInferenceResult({
      client: true,
      clientBoundaryModule: true,
    });
  }

  if (options.seen.has(options.filename)) {
    return emptyClientRouteModuleInferenceResult();
  }

  options.seen.add(options.filename);

  try {
    const clientBoundaryImports: string[] = [];
    const clientBoundaryFallbackImports: string[] = [];
    const clientBoundaryExportNames = new Set<string>();
    const nestedClientExportNames = new Set<string>();
    const clientReferenceSourceFiles: string[] = [];
    const diagnostics: ClientRouteInferenceDiagnostic[] = [];
    let boundaryGraphFallbackRequired = false;
    let clientProxy = false;
    let nestedClient = false;
    let usesNavigationLink = usesNavigationLinkLocal;
    const navigationLinkExportNames = new Set<string>(detectLinkComponentExportNames(analysis));
    const exportInfo = analysis.topLevelExportRenderInfo;
    const implicitModuleClient = exportInfo.length === 0 && analysis.clientRuntime;
    for (const info of exportInfo) {
      if (info.clientRuntime) {
        clientBoundaryExportNames.add(info.name);
      }
    }
    if (
      hasServerOnlyImports(analysis) &&
      (implicitModuleClient || clientBoundaryExportNames.size > 0)
    ) {
      return emptyClientRouteModuleInferenceResult({
        serverOnly: true,
        serverOnlyClientRuntime: true,
      });
    }
    const jsxComponentRoots = new Set(analysis.jsxComponentRoots);
    const componentCallRoots = new Set(analysis.componentCallRoots);
    // A bare-identifier default export (`export default Page`) is the route's
    // rendered component even though the module body has no JSX for it; treat it
    // as a rendered root so a re-exported imported component (and any Link it
    // renders) is followed.
    const renderedComponentRoots =
      analysis.defaultExportIdentifier === undefined
        ? unionSets(jsxComponentRoots, componentCallRoots)
        : new Set([...jsxComponentRoots, ...componentCallRoots, analysis.defaultExportIdentifier]);
    const identifierReferences = new Set(analysis.identifierReferences);

    for (const reference of analysis.staticImports) {
      const renderedByJsx = isRenderedImportReference(reference, jsxComponentRoots);
      const renderedByCall = isRenderedImportReference(reference, componentCallRoots);
      const rendered = isRenderedImportReference(reference, renderedComponentRoots);
      const referenced = isReferencedImportReference(reference, identifierReferences);

      if (
        !rendered &&
        (!referenced || !hasPotentialClientBoundaryReference(reference, identifierReferences))
      ) {
        continue;
      }
      if (reference.sideEffect && isStyleModuleSpecifier(reference.source)) {
        continue;
      }

      const resolved = await resolveAppLocalModule({
        allowExplicitNonSource: options.sourceTransform !== undefined,
        cache: options.cache,
        importer: options.filename,
        specifier: reference.source,
      });

      if (resolved === undefined) {
        continue;
      }

      const source = await readClientRouteSource({
        cache: options.cache,
        filename: resolved,
        sourceTransform: options.sourceTransform,
      });
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
        sourceTransform: options.sourceTransform,
      });
      diagnostics.push(...imported.diagnostics);
      // Propagate the navigation runtime only for imports that are actually
      // rendered here, and only for the specific exports whose subtree renders a
      // `Link`. A merely-referenced import (e.g. `const C = Nav`) recurses for
      // client-boundary detection but must not pull in a transitive `Link`, and
      // a barrel re-exporting Link-free siblings must not over-trigger.
      if (rendered) {
        const importedNavigationExportNames = renderedImportedExportNames(
          reference,
          renderedComponentRoots,
        );
        if (
          matchesInferredExportNames(
            importedNavigationExportNames,
            imported.navigationLinkExportNames,
          )
        ) {
          usesNavigationLink = true;
          for (const exportName of renderedLocalExportNames(reference, exportInfo)) {
            navigationLinkExportNames.add(exportName);
          }
        }
      }

      if (!imported.client) {
        if (rendered && imported.boundaryGraphFallbackCandidate) {
          boundaryGraphFallbackRequired = true;
        }
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
        const importedExportNames = renderedImportedExportNames(reference, renderedComponentRoots);
        const renderedExportNames = renderedLocalExportNames(reference, exportInfo);
        const importedBoundary =
          imported.clientBoundaryModule ||
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
          if (importedBoundary || importedNested || renderedByCall) {
            nestedClientExportNames.add(exportName);
          }
        }

        if (renderedByCall && !renderedByJsx) {
          diagnostics.push(
            functionCallInteractiveImportDiagnostic({
              filename: options.filename,
              reference,
            }),
          );
          continue;
        }

        if (!importedBoundary) {
          clientReferenceSourceFiles.push(resolved);
          continue;
        }

        clientBoundaryImports.push(reference.source);
        if (
          !imported.clientBoundaryModule &&
          isClientBoundaryFallbackEligibleSource(source, resolved)
        ) {
          clientBoundaryFallbackImports.push(reference.source);
        }
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
          allowExplicitNonSource: options.sourceTransform !== undefined,
          cache: options.cache,
          importer: options.filename,
          specifier: reference.source,
        });

        if (resolved === undefined) {
          continue;
        }

        const source = await readClientRouteSource({
          cache: options.cache,
          filename: resolved,
          sourceTransform: options.sourceTransform,
        });
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
          sourceTransform: options.sourceTransform,
        });
        diagnostics.push(...exported.diagnostics);
        // A re-export renders nothing itself, so it does not set the module's
        // own `usesNavigationLink`; it only forwards per-export `Link` usage so
        // an importer that renders this name can decide precisely. Map the
        // source module's export names onto the names this barrel re-exposes:
        // `export * from` keeps the original names, `export { A as Nav } from`
        // renames them.
        if (reference.exportAll) {
          for (const exportName of exported.navigationLinkExportNames) {
            navigationLinkExportNames.add(exportName);
          }
        } else {
          for (const specifier of reference.specifiers) {
            if (exported.navigationLinkExportNames.includes(specifier.localName)) {
              navigationLinkExportNames.add(specifier.exportedName);
            }
          }
        }

        if (exported.clientBoundaryModule) {
          clientProxy = true;
        } else if (exported.clientBoundaryExportNames.length > 0) {
          if (reference.exportAll) {
            for (const exportName of exported.clientBoundaryExportNames) {
              clientBoundaryExportNames.add(exportName);
            }
          } else {
            for (const specifier of reference.specifiers) {
              if (exported.clientBoundaryExportNames.includes(specifier.localName)) {
                clientBoundaryExportNames.add(specifier.exportedName);
              }
            }
          }
        } else if (exported.client) {
          nestedClient = true;
          clientReferenceSourceFiles.push(resolved);
        } else if (exported.boundaryGraphFallbackCandidate) {
          boundaryGraphFallbackRequired = true;
        }
      }
    }

    return {
      boundaryGraphFallbackCandidate:
        analysis.staticExports.length > 0 || boundaryGraphFallbackRequired,
      boundaryGraphFallbackRequired,
      client:
        clientBoundaryImports.length > 0 ||
        clientBoundaryExportNames.size > 0 ||
        implicitModuleClient ||
        clientProxy ||
        nestedClient,
      clientBoundaryImports,
      clientBoundaryFallbackImports,
      clientBoundaryExportNames: Array.from(clientBoundaryExportNames),
      clientBoundaryModule: clientProxy || implicitModuleClient,
      nestedClientExportNames: Array.from(nestedClientExportNames),
      clientReferenceSourceFiles: Array.from(new Set(clientReferenceSourceFiles)),
      diagnostics,
      navigationLinkExportNames: Array.from(navigationLinkExportNames),
      serverOnly: false,
      serverOnlyClientRuntime: false,
      usesNavigationLink,
    };
  } finally {
    options.seen.delete(options.filename);
  }
}

function emptyClientRouteModuleInferenceResult(
  overrides: Partial<ClientRouteModuleInferenceResult> = {},
): ClientRouteModuleInferenceResult {
  return {
    boundaryGraphFallbackCandidate: false,
    boundaryGraphFallbackRequired: false,
    client: false,
    clientBoundaryImports: [],
    clientBoundaryFallbackImports: [],
    clientBoundaryExportNames: [],
    clientBoundaryModule: false,
    nestedClientExportNames: [],
    clientReferenceSourceFiles: [],
    diagnostics: [],
    navigationLinkExportNames: [],
    serverOnly: false,
    serverOnlyClientRuntime: false,
    usesNavigationLink: false,
    ...overrides,
  };
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
        (await compilerModuleContextForSource({
          cache: options.cache,
          code: options.code,
          filename: options.filename,
        })),
    ),
  );
  setLatestModuleCacheEntry(
    options.cache.moduleAnalysisByFile,
    options.filename,
    cacheKey,
    analysis,
  );
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
  setLatestModuleCacheEntry(options.cache.moduleContextByFile, options.filename, cacheKey, context);
  return context;
}

function sourceAnalysisCacheKey(filename: string, code: string): string {
  return `${filename}\0${hashSourceText(code)}`;
}

// Keeps only the latest content version per file in the source-keyed caches.
// The cache persists across dev requests, and keys embed a content hash, so
// without this an edited file would accumulate an entry per saved version.
// Filenames cannot contain the NUL separator, so the `${filename}\0` prefix
// matches exactly that file's prior entries.
function setLatestModuleCacheEntry<T>(
  map: Map<string, T>,
  filename: string,
  cacheKey: string,
  value: T,
): void {
  const prefix = `${filename}\0`;

  for (const existing of map.keys()) {
    if (existing !== cacheKey && existing.startsWith(prefix)) {
      map.delete(existing);
    }
  }

  map.set(cacheKey, value);
}

function hashSourceText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function isRenderedImportReference(
  reference: StaticImportReference,
  componentRoots: ReadonlySet<string>,
): boolean {
  return (
    reference.sideEffect || reference.localNames.some((localName) => componentRoots.has(localName))
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
      (specifier) =>
        specifier.kind === "namespace" && identifierReferences.has(specifier.localName),
    ) ||
    reference.localNames.some(
      (localName) => identifierReferences.has(localName) && startsUppercase(localName),
    )
  );
}

function isStyleModuleSpecifier(source: string): boolean {
  const pathname = source.split(/[?#]/u, 1)[0] ?? source;
  return styleModuleExtensions.has(extname(pathname));
}

const styleModuleExtensions = new Set([".css", ".less", ".sass", ".scss", ".styl", ".stylus"]);

function isClientBoundaryFallbackEligibleSource(source: string, filename?: string): boolean {
  if (hasClientBoundaryFallbackUnsafeBrowserGlobal(source, filename)) {
    return false;
  }

  const destructuredCallbackPropNames = destructuredPropsCallbackNames(source);
  const callbackPropNames = new Set([
    ...destructuredCallbackPropNames,
    ...propsCallbackAliasNames(source),
    ...memberCallbackNames(source),
  ]);
  const sourceWithoutComponentCallbackProps = source.replaceAll(
    /<[A-Z][A-Za-z0-9_$.]*(?:\s[\s\S]*?)?>/gu,
    (tag) => tag.replaceAll(/\s+on[A-Z][A-Za-z0-9_$]*\s*=\s*\{[^{}]*\}/gu, ""),
  );
  let sourceWithoutGuardedUndefinedCallbacks = sourceWithoutComponentCallbackProps
    .replaceAll(
      /\bon[A-Z][A-Za-z0-9_$]*\s*=\s*\{\s*props\.[A-Za-z_$][\w$]*\s*===\s*undefined\s*\?\s*undefined\s*:/gu,
      "",
    )
    .replaceAll(
      /\bon[A-Z][A-Za-z0-9_$]*\s*=\s*\{\s*props\.[A-Za-z_$][\w$]*\s*\?\s*[^{}]*:\s*undefined\s*\}/gu,
      "",
    );

  for (const callbackName of callbackPropNames) {
    const escapedCallbackName = escapeRegExp(callbackName);
    const callbackHandlerAttributePattern = new RegExp(
      String.raw`\bon[A-Z][A-Za-z0-9_$]*\s*=\s*\{\s*[^{}]*\b${escapedCallbackName}\b[^{}]*\}`,
      "gu",
    );
    sourceWithoutGuardedUndefinedCallbacks = sourceWithoutGuardedUndefinedCallbacks.replaceAll(
      new RegExp(
        String.raw`\b(?:const|let|var)\s+${escapedCallbackName}\s*=\s*props\.[A-Za-z_$][\w$]*\s*;?`,
        "gu",
      ),
      "",
    );
    sourceWithoutGuardedUndefinedCallbacks = sourceWithoutGuardedUndefinedCallbacks.replaceAll(
      new RegExp(
        String.raw`\b(?:const|let|var)\s+${escapedCallbackName}\s*=\s*[^;\n]+\.${escapedCallbackName}\s*;?`,
        "gu",
      ),
      "",
    );
    sourceWithoutGuardedUndefinedCallbacks = sourceWithoutGuardedUndefinedCallbacks.replaceAll(
      new RegExp(
        String.raw`\bon[A-Z][A-Za-z0-9_$]*\s*=\s*\{\s*${escapedCallbackName}\s*\?\s*[^{}]*:\s*undefined\s*\}`,
        "gu",
      ),
      "",
    );
    sourceWithoutGuardedUndefinedCallbacks = sourceWithoutGuardedUndefinedCallbacks.replaceAll(
      new RegExp(
        String.raw`\bon[A-Z][A-Za-z0-9_$]*\s*=\s*\{\s*${escapedCallbackName}\s*(?:===|==)\s*(?:undefined|null)\s*\?\s*undefined\s*:\s*[^{}]*\}`,
        "gu",
      ),
      "",
    );
    sourceWithoutGuardedUndefinedCallbacks = sourceWithoutGuardedUndefinedCallbacks.replaceAll(
      new RegExp(
        String.raw`\bon[A-Z][A-Za-z0-9_$]*\s*=\s*\{\s*(?:undefined|null)\s*(?:===|==)\s*${escapedCallbackName}\s*\?\s*undefined\s*:\s*[^{}]*\}`,
        "gu",
      ),
      "",
    );
    sourceWithoutGuardedUndefinedCallbacks = sourceWithoutGuardedUndefinedCallbacks.replaceAll(
      new RegExp(
        String.raw`\bon[A-Z][A-Za-z0-9_$]*\s*=\s*\{\s*${escapedCallbackName}\s*(?:!==|!=)\s*(?:undefined|null)\s*\?\s*[^{}]*:\s*undefined\s*\}`,
        "gu",
      ),
      "",
    );
    sourceWithoutGuardedUndefinedCallbacks = sourceWithoutGuardedUndefinedCallbacks.replaceAll(
      new RegExp(
        String.raw`\bon[A-Z][A-Za-z0-9_$]*\s*=\s*\{\s*typeof\s+${escapedCallbackName}\s*===\s*["']function["']\s*\?\s*[^{}]*:\s*undefined\s*\}`,
        "gu",
      ),
      "",
    );
    sourceWithoutGuardedUndefinedCallbacks = sourceWithoutGuardedUndefinedCallbacks.replaceAll(
      new RegExp(
        String.raw`\bon[A-Z][A-Za-z0-9_$]*\s*=\s*\{\s*${escapedCallbackName}\s*\?\?\s*undefined\s*\}`,
        "gu",
      ),
      "",
    );

    if (
      hasCallbackAbsenceGuard(
        sourceWithoutComponentCallbackProps.replaceAll(callbackHandlerAttributePattern, ""),
        callbackName,
      )
    ) {
      sourceWithoutGuardedUndefinedCallbacks = sourceWithoutGuardedUndefinedCallbacks.replaceAll(
        callbackHandlerAttributePattern,
        "",
      );
    }
    sourceWithoutGuardedUndefinedCallbacks = removeSafeCallbackHandlerAttributes(
      sourceWithoutGuardedUndefinedCallbacks,
      callbackName,
      {
        externalAbsenceGuard: hasCallbackAbsenceGuard(
          sourceWithoutComponentCallbackProps.replaceAll(callbackHandlerAttributePattern, ""),
          callbackName,
        ),
      },
    );

    if (
      new RegExp(String.raw`\b${escapedCallbackName}\s*\(`, "u").test(
        sourceWithoutGuardedUndefinedCallbacks,
      )
    ) {
      return false;
    }
  }

  return (
    !/\bon[A-Z][A-Za-z0-9_$]*\s*=/u.test(sourceWithoutGuardedUndefinedCallbacks) &&
    !/\bglobalThis\b/u.test(source)
  );
}

function hasClientBoundaryFallbackUnsafeBrowserGlobal(source: string, filename?: string): boolean {
  const sourceWithoutTypeofGuards = source.replaceAll(
    /\btypeof\s+(?:window|document|localStorage)\s*(?:(?:={2,3}|!={1,2})\s*["']undefined["'])?/gu,
    "",
  );
  if (!/\b(?:window|document|localStorage)\b/u.test(sourceWithoutTypeofGuards)) {
    return false;
  }

  // Remaining browser-global tokens may still be typeof-guarded uses such as
  // `if (typeof window !== "undefined") return window.location.pathname;`.
  // Those never execute on the server, so the AST guard analysis decides;
  // an unparsable module stays conservatively ineligible.
  try {
    return hasUnguardedBrowserGlobalReference({ code: source, filename });
  } catch {
    return true;
  }
}

function propsCallbackAliasNames(source: string): Set<string> {
  const names = new Set<string>();

  for (const match of source.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*props\.([A-Za-z_$][\w$]*)\b/gu,
  )) {
    const localName = match[1];
    const propName = match[2];

    if (
      localName !== undefined &&
      (isCallbackPropName(propName) || isCallbackPropName(localName))
    ) {
      names.add(localName);
    }
  }

  for (const match of source.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*props\s+as\s+[^)]+\)\.([A-Za-z_$][\w$]*)\b/gu,
  )) {
    const localName = match[1];
    const propName = match[2];

    if (
      localName !== undefined &&
      (isCallbackPropName(propName) || isCallbackPropName(localName))
    ) {
      names.add(localName);
    }
  }

  for (const match of source.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*props\s*\)\.([A-Za-z_$][\w$]*)\b/gu,
  )) {
    const localName = match[1];
    const propName = match[2];

    if (
      localName !== undefined &&
      (isCallbackPropName(propName) || isCallbackPropName(localName))
    ) {
      names.add(localName);
    }
  }

  for (const match of source.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]+\.([A-Za-z_$][\w$]*)\s*;?/gu,
  )) {
    const localName = match[1];
    const propName = match[2];

    if (
      localName !== undefined &&
      (isCallbackPropName(propName) || isCallbackPropName(localName))
    ) {
      names.add(localName);
    }
  }

  let added = true;
  while (added) {
    added = false;
    for (const match of source.matchAll(
      /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\b/gu,
    )) {
      const localName = match[1];
      const sourceName = match[2];

      if (localName !== undefined && sourceName !== undefined && names.has(sourceName)) {
        const previousSize = names.size;
        names.add(localName);
        added ||= names.size !== previousSize;
      }
    }
  }

  return names;
}

function hasCallbackAbsenceGuard(source: string, name: string): boolean {
  const escapedName = escapeRegExp(name);

  return new RegExp(
    String.raw`(?:!\s*${escapedName}\b|${escapedName}\s*(?:===|==)\s*(?:undefined|null)|(?:undefined|null)\s*(?:===|==)\s*${escapedName}\b)`,
    "u",
  ).test(source);
}

function memberCallbackNames(source: string): Set<string> {
  const names = new Set<string>();

  for (const match of source.matchAll(/\.([A-Za-z_$][\w$]*)\b/gu)) {
    const memberName = match[1];

    if (memberName !== undefined && isCallbackPropName(memberName)) {
      names.add(memberName);
    }
  }

  return names;
}

function removeSafeCallbackHandlerAttributes(
  source: string,
  callbackName: string,
  options: { externalAbsenceGuard: boolean },
): string {
  const attributePattern = /\bon[A-Z][A-Za-z0-9_$]*\s*=\s*\{/gu;
  let result = "";
  let cursor = 0;

  for (const match of source.matchAll(attributePattern)) {
    const start = match.index;
    const expressionStart = start + match[0].length;
    const end = matchingBraceEnd(source, expressionStart - 1);

    if (end === undefined) {
      continue;
    }

    const expression = source.slice(expressionStart, end);
    if (isSafeCallbackHandlerExpression(expression, callbackName, options)) {
      result += source.slice(cursor, start);
      cursor = end + 1;
    }
  }

  return cursor === 0 ? source : result + source.slice(cursor);
}

function matchingBraceEnd(source: string, openBraceIndex: number): number | undefined {
  let depth = 0;
  let quote: "\"" | "'" | "`" | undefined;
  let escaped = false;

  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];

    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return undefined;
}

function isSafeCallbackHandlerExpression(
  expression: string,
  callbackName: string,
  options: { externalAbsenceGuard: boolean },
): boolean {
  const escapedName = escapeRegExp(callbackName);
  if (!new RegExp(String.raw`\b${escapedName}\b`, "u").test(expression)) {
    return false;
  }

  if (new RegExp(String.raw`\b${escapedName}\s*\(`, "u").test(expression)) {
    return false;
  }

  return (
    new RegExp(String.raw`\b${escapedName}\s*\?\.\s*\(`, "u").test(expression) ||
    new RegExp(String.raw`^\s*${escapedName}\s*\?\?\s*undefined\s*$`, "u").test(expression) ||
    options.externalAbsenceGuard
  );
}

function destructuredPropsCallbackNames(source: string): Set<string> {
  const names = new Set<string>();

  for (const match of source.matchAll(/\b(?:const|let|var)\s*\{([^}]+)\}\s*=\s*props\b/gu)) {
    addDestructuredCallbackNames(names, match[1] ?? "");
  }

  for (const match of source.matchAll(
    /\{[^{}]*:\s*\{([^{}]+)\}\s*(?:=\s*\{\})?[^{}]*\}/gu,
  )) {
    addDestructuredCallbackNames(names, match[1] ?? "");
  }

  for (const match of source.matchAll(
    /\bfunction(?:\s+[A-Za-z_$][\w$]*(?:<[^>()]+>)?)?\s*\(\s*\{([^}]+)\}/gu,
  )) {
    addDestructuredCallbackNames(names, match[1] ?? "");
  }

  for (const match of source.matchAll(
    /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\(?\s*\{([^}]+)\}\s*(?::\s*[^)=]+)?\)?\s*=>/gu,
  )) {
    addDestructuredCallbackNames(names, match[1] ?? "");
  }

  for (const match of source.matchAll(
    /\bexport\s+default\s+(?:async\s*)?\(?\s*\{([^}]+)\}\s*(?::\s*[^)=]+)?\)?\s*=>/gu,
  )) {
    addDestructuredCallbackNames(names, match[1] ?? "");
  }

  for (const match of source.matchAll(
    /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*function(?:\s+[A-Za-z_$][\w$]*)?\s*\(\s*\{([^}]+)\}/gu,
  )) {
    addDestructuredCallbackNames(names, match[1] ?? "");
  }

  return names;
}

function addDestructuredCallbackNames(names: Set<string>, destructured: string): void {
  for (const part of destructured.split(",")) {
    const [rawProperty, rawAlias] = part.trim().split(/\s*:\s*/u);
    const property = destructuredBindingName(rawProperty);
    const alias = destructuredBindingName(rawAlias);
    const name = alias ?? property;

    if (
      name !== undefined &&
      (isCallbackPropName(property) || isCallbackPropName(name))
    ) {
      names.add(name);
    }
  }
}

function destructuredBindingName(value: string | undefined): string | undefined {
  const name = value?.trim().split(/\s*=/u, 1)[0]?.trim();
  return name === "" ? undefined : name;
}

function isCallbackPropName(name: string | undefined): boolean {
  return name !== undefined && /^on[A-Z][A-Za-z0-9_$]*$/u.test(name);
}

function renderedImportedExportNames(
  reference: ClientRouteStaticImportReference,
  componentRoots: ReadonlySet<string>,
): string[] | undefined {
  if (reference.sideEffect) {
    return undefined;
  }

  const names = new Set<string>();

  for (const specifier of reference.specifiers) {
    if (!componentRoots.has(specifier.localName)) {
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
    .filter((info) => renderedComponentRootNames(info).some((root) => localNames.has(root)))
    .map((info) => info.name);

  return rendered.length === 0 ? ["default"] : rendered;
}

function renderedComponentRootNames(info: TopLevelExportRenderInfo): string[] {
  return [...info.renderedComponentRoots, ...info.calledComponentRoots];
}

function unionSets<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): ReadonlySet<T> {
  return new Set([...left, ...right]);
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
    code: clientBoundaryInferenceServerOnlyReferenceCode,
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

function functionCallInteractiveImportDiagnostic(options: {
  filename: string;
  reference: StaticImportReference;
}): ClientRouteInferenceDiagnostic {
  const localNames = options.reference.localNames.filter(startsUppercase);
  const component = localNames[0] ?? options.reference.localNames[0] ?? options.reference.source;
  const componentUsage = startsUppercase(component) ? `<${component} />` : "JSX";

  return {
    code: clientBoundaryInferenceFunctionCallInteractiveCode,
    filename: options.filename,
    level: "warn",
    localNames: localNames.length === 0 ? options.reference.localNames : localNames,
    message:
      `${options.filename}: interactive component import ${JSON.stringify(options.reference.source)} ` +
      `is rendered through a function call as ${component}(), so its event handlers or cell() state ` +
      "will not hydrate as a client boundary. Render it through JSX such as " +
      `${componentUsage}, or move the call behind an explicit client boundary.`,
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
    code: clientBoundaryInferenceUnsupportedReferenceCode,
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
  const route =
    diagnostic.routePath === undefined ? "" : ` on route ${JSON.stringify(diagnostic.routePath)}`;
  return `${diagnostic.code}: ${diagnostic.message}${route}`;
}

function withClientRouteDiagnosticPath<
  T extends ClientRouteInferenceDiagnostic | ClientRouteInferenceResult,
>(value: T, routePath: string | undefined): T {
  if (routePath === undefined) {
    return value;
  }

  if ("diagnostics" in value) {
    return {
      ...value,
      diagnostics: value.diagnostics.map((diagnostic) =>
        withClientRouteDiagnosticPath(diagnostic, routePath),
      ),
    };
  }

  return {
    ...value,
    routePath: value.routePath ?? routePath,
  };
}

async function resolveAppLocalModule(options: {
  allowExplicitNonSource?: boolean | undefined;
  cache: ClientRouteInferenceCache;
  importer: string;
  specifier: string;
}): Promise<string | undefined> {
  if (!options.specifier.startsWith(".")) {
    return undefined;
  }

  const cacheKey = `${options.importer}\0${options.specifier}\0${
    options.allowExplicitNonSource === true ? "explicit" : "source"
  }`;
  const cached = options.cache.resolvedByImport.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const resolved = resolveAppLocalModuleUncached({
    allowExplicitNonSource: options.allowExplicitNonSource === true,
    importer: options.importer,
    specifier: options.specifier,
  });
  options.cache.resolvedByImport.set(cacheKey, resolved);
  return resolved;
}

async function resolveAppLocalModuleUncached(options: {
  allowExplicitNonSource: boolean;
  importer: string;
  specifier: string;
}): Promise<string | undefined> {
  const { importer, specifier } = options;
  const base = join(dirname(importer), specifier);
  const candidates = sourceModuleCandidates(base);

  if (candidates.length === 0) {
    if (options.allowExplicitNonSource && extname(base) !== "" && (await isFile(base))) {
      return base;
    }

    return undefined;
  }

  for (const candidate of candidates) {
    if (await isFile(candidate)) {
      return candidate;
    }
  }

  throw new Error(`${importer}: could not resolve app-local import ${JSON.stringify(specifier)}.`);
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function readCachedFile(cache: ClientRouteInferenceCache, filename: string): Promise<string> {
  const signature = await sourceFileSignature(filename);
  const cached = cache.sourceByFile.get(filename);

  if (cached !== undefined) {
    const source = await cached;

    if (source.signature === signature) {
      return source.source;
    }
  }

  const source = readFile(filename, "utf8").then((value) => ({
    signature,
    source: value,
  }));
  cache.sourceByFile.set(filename, source);
  return (await source).source;
}

async function readClientRouteSource(options: {
  cache: ClientRouteInferenceCache;
  filename: string;
  sourceTransform?: ClientRouteSourceTransform | undefined;
}): Promise<string> {
  if (options.sourceTransform === undefined) {
    return readCachedFile(options.cache, options.filename);
  }

  const signature = await sourceFileSignature(options.filename);
  const cacheKey = `${options.filename}\0${options.sourceTransform.cacheKey}`;
  const cached = options.cache.transformedSourceByFile.get(cacheKey);

  if (cached !== undefined) {
    const source = await cached;

    if (source.signature === signature) {
      return source.source;
    }
  }

  const source = readCachedFile(options.cache, options.filename).then(async (code) => ({
    signature,
    source: await options.sourceTransform!.transform(options.filename, code),
  }));
  options.cache.transformedSourceByFile.set(cacheKey, source);
  return (await source).source;
}

async function transformClientRouteSource(options: {
  code: string;
  filename: string;
  sourceTransform?: ClientRouteSourceTransform | undefined;
}): Promise<string> {
  return options.sourceTransform === undefined
    ? options.code
    : await options.sourceTransform.transform(options.filename, options.code);
}

function clientRouteSourceTransformForVitePlugins(
  pluginOptions: readonly PluginOption[] | undefined,
): ClientRouteSourceTransform | undefined {
  const plugins = orderVitePlugins(flattenVitePlugins(pluginOptions)).filter((plugin) =>
    hasViteTransformHook(plugin),
  );

  if (plugins.length === 0) {
    return undefined;
  }

  return {
    cacheKey: plugins.map((plugin, index) => `${index}:${plugin.name}`).join("\0"),
    async transform(filename, code) {
      let nextCode = code;

      for (const plugin of plugins) {
        const handler = viteTransformHookHandler(plugin);

        if (handler === undefined) {
          continue;
        }

        const result = await handler.call(
          createClientRouteViteTransformContext(plugin.name),
          nextCode,
          filename,
          { ssr: false },
        );

        if (typeof result === "string") {
          nextCode = result;
        } else if (result !== null && result !== undefined && typeof result === "object") {
          const codeResult = (result as { code?: unknown }).code;

          if (typeof codeResult === "string") {
            nextCode = codeResult;
          }
        }
      }

      return nextCode;
    },
  };
}

function flattenVitePlugins(pluginOptions: readonly PluginOption[] | undefined): Plugin[] {
  const plugins: Plugin[] = [];
  const visit = (option: PluginOption | null | false | undefined): void => {
    if (option === false || option === null || option === undefined) {
      return;
    }

    if (Array.isArray(option)) {
      for (const child of option) {
        visit(child);
      }
      return;
    }

    if (typeof option === "object" && "then" in option) {
      return;
    }

    plugins.push(option as Plugin);
  };

  for (const option of pluginOptions ?? []) {
    visit(option);
  }

  return plugins;
}

function orderVitePlugins(plugins: readonly Plugin[]): Plugin[] {
  return [
    ...plugins.filter((plugin) => plugin.enforce === "pre"),
    ...plugins.filter((plugin) => plugin.enforce !== "pre" && plugin.enforce !== "post"),
    ...plugins.filter((plugin) => plugin.enforce === "post"),
  ];
}

function hasViteTransformHook(plugin: Plugin): boolean {
  return viteTransformHookHandler(plugin) !== undefined;
}

function viteTransformHookHandler(
  plugin: Plugin,
):
  | ((this: unknown, code: string, id: string, options?: { ssr?: boolean | undefined }) => unknown)
  | undefined {
  const transform = plugin.transform as unknown;

  if (typeof transform === "function") {
    return transform as (
      this: unknown,
      code: string,
      id: string,
      options?: { ssr?: boolean | undefined },
    ) => unknown;
  }

  if (transform !== null && typeof transform === "object") {
    const handler = (transform as { handler?: unknown }).handler;

    if (typeof handler === "function") {
      return handler as (
        this: unknown,
        code: string,
        id: string,
        options?: { ssr?: boolean | undefined },
      ) => unknown;
    }
  }

  return undefined;
}

function createClientRouteViteTransformContext(pluginName: string): unknown {
  return {
    addWatchFile() {},
    async resolve() {
      return null;
    },
    error(error: unknown): never {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error(String(error));
    },
    warn() {},
    getCombinedSourcemap() {
      return null;
    },
    parse() {
      throw new Error(
        `${pluginName}: client route import analysis cannot provide Rollup parser context.`,
      );
    },
  };
}

async function sourceFileSignature(filename: string): Promise<string> {
  const stats = await stat(filename);

  return `${stats.mtimeMs}\0${stats.size}`;
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

  return `<div ${routeHydrationContract.routeMarkerAttribute}="${escapeHtmlAttribute(routeId)}">${options.html}</div>`;
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
  const [propsScriptId, clientReferencesScriptId] = routeDataScriptIds(routeId).map((id) =>
    escapeHtmlAttribute(id),
  );
  const propsJson = escapeScriptJson(JSON.stringify(options.props));
  const script = options.script ?? clientScriptForPath(options.routePath);
  const scriptSrc = assetPath(script, options.assetBaseUrl ?? "/_mreact/client/");
  const clientReferencesJson =
    options.clientReferenceManifest === undefined || options.clientReferenceManifest.length === 0
      ? undefined
      : escapeScriptJson(JSON.stringify(options.clientReferenceManifest));

  return {
    prefix: `<div ${routeHydrationContract.routeMarkerAttribute}="${escapedRouteId}">`,
    suffix: [
      "</div>",
      `<script type="application/json" id="${propsScriptId}">${propsJson}</script>`,
      clientReferencesJson === undefined
        ? undefined
        : `<script type="application/json" id="${clientReferencesScriptId}">${clientReferencesJson}</script>`,
      `<script type="module" src="${escapeHtmlAttribute(scriptSrc)}"></script>`,
    ]
      .filter((part): part is string => part !== undefined)
      .join(""),
  };
}

export async function buildClientRouteBundle(options: {
  code: string;
  clientBoundaryImports?: readonly string[] | undefined;
  clientReferenceImports?: readonly ClientReferenceImport[] | undefined;
  clientReferenceManifest?: readonly ClientReferenceMetadata[] | undefined;
  filename: string;
  routePath: string;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  return (await buildClientRouteOutput(options)).code;
}

export async function buildNavigationRuntimeBundle(
  options: {
    dropConsoleFunctions?: readonly string[] | undefined;
    minify?: boolean;
    sourceMap?: boolean;
  } = {},
): Promise<{ code: string; map?: string }> {
  return buildClientRouteOutput({
    code: "export default undefined;",
    filename: "__mreact_navigation_runtime.tsx",
    routePath: "/__mreact_navigation_runtime",
    clientNavigation: true,
    forceInlineNavigationRuntime: true,
    ...(options.dropConsoleFunctions === undefined
      ? {}
      : { dropConsoleFunctions: options.dropConsoleFunctions }),
    ...(options.minify === undefined ? {} : { minify: options.minify }),
    ...(options.sourceMap === undefined ? {} : { sourceMap: options.sourceMap }),
  });
}

export async function buildClientRouteOutput(
  options: BuildClientRouteOutputOptions,
): Promise<{ code: string; map?: string }> {
  const entry = await buildClientRouteEntrySource(options);
  const dropConsoleFunctions =
    options.dropConsoleFunctions ?? resolveClientConsolePureFunctions(options.dropClientConsole);
  const bundled = await bundleRouterModule({
    code: entry.code,
    cacheDir: options.cacheDir,
    define: {
      __MREACT_CLIENT_DEVTOOLS__: "false",
    },
    filename: options.filename,
    dropConsoleFunctions,
    minify: options.minify === true,
    platform: "browser",
    preserveExports: true,
    plugins: [workspaceRuntimePlugin({ routeFiles: [options.filename] })],
    sourceMap: options.sourceMap,
    vitePlugins: options.vitePlugins,
  });

  return {
    code: bundled.code,
    ...(bundled.map === undefined ? {} : { map: bundled.map }),
  };
}

export async function buildClientRouteBatchOutput(options: {
  assetBaseUrl?: string | undefined;
  cacheDir?: string | undefined;
  dropConsoleFunctions?: readonly string[] | undefined;
  minify?: boolean;
  projectRoot?: string | undefined;
  routes: readonly BuildClientRouteOutputOptions[];
  sourceMap?: boolean;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<BuildClientRouteBatchOutput> {
  const entries = await Promise.all(
    options.routes.map(async (route) => ({
      filename: route.filename,
      name: routeIdForPath(route.routePath),
      routePath: route.routePath,
      source: await buildClientRouteEntrySource({
        ...route,
        minify: options.minify ?? route.minify,
        sourceMap: options.sourceMap ?? route.sourceMap,
        vitePlugins: options.vitePlugins ?? route.vitePlugins,
      }),
    })),
  );
  const bundled = await bundleRouterModules({
    base: options.assetBaseUrl ?? "/_mreact/client/",
    cacheDir: options.cacheDir,
    define: {
      __MREACT_CLIENT_DEVTOOLS__: "false",
    },
    entries: entries.map((entry) => ({
      code: entry.source.code,
      filename: entry.filename,
      name: entry.name,
    })),
    minify: options.minify === true,
    platform: "browser",
    plugins: [workspaceRuntimePlugin({ routeFiles: entries.map((entry) => entry.filename) })],
    root: options.projectRoot,
    sourceMap: options.sourceMap,
    dropConsoleFunctions: options.dropConsoleFunctions,
    vitePlugins: options.vitePlugins,
  });
  const entryChunks = new Map(
    bundled.chunks.filter((chunk) => chunk.isEntry).map((chunk) => [chunk.name, chunk]),
  );

  return {
    ...(bundled.assets === undefined ? {} : { assets: bundled.assets }),
    chunks: bundled.chunks,
    routes: entries.map((entry) => {
      const chunk = entryChunks.get(entry.name);

      if (chunk === undefined) {
        throw new Error(`Failed to bundle client route ${entry.routePath}: missing entry chunk.`);
      }

      return {
        chunk,
        routeId: entry.name,
        routePath: entry.routePath,
      };
    }),
  };
}

export async function buildClientRouteEntrySource(
  options: BuildClientRouteOutputOptions,
): Promise<{ code: string }> {
  const moduleContext = createCompilerModuleContext({
    code: options.code,
    filename: options.filename,
  });
  const routeSourceAnalysis = collectClientRouteModuleAnalysisFromContext(moduleContext);
  const compiled = transformCompilerModuleContext({
    code: options.code,
    clientBoundaryImports: options.clientBoundaryImports ?? [],
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
  const inlineClientNavigation =
    clientNavigation && (options.forceInlineNavigationRuntime === true || options.minify !== true);
  const deferredClientNavigation = clientNavigation && !inlineClientNavigation;
  const clientReferenceManifest =
    options.clientReferenceManifest ?? (await inferClientReferenceManifestForBundle(options));
  const compatClientReferenceNames = compatClientReferenceComponentNames(clientReferenceManifest);
  const clientReferenceImportBlock = emitClientReferenceImportBlock(
    options.clientReferenceImports ?? [],
  );
  const clientReferenceRegistry = emitClientReferenceRegistry(
    clientReferenceManifest,
    options.clientReferenceImports ?? [],
    compatClientReferenceNames,
  );
  const routeComponentExpression = routeComponentExpressionForComponents(
    compiled.metadata.components,
  );

  const routeId = routeIdForPath(options.routePath);
  const routeUsesCells = detectRouteCellStateHint(compiled.code);
  const routeUsesReactiveEffect = detectRouteReactiveEffectHint(compiled.code);
  const routeUsesCleanupScope = routeUsesCells || routeUsesReactiveEffect;
  const routeExplicitlyRequiresHydration = isExplicitClientRouteSource(
    routeSourceAnalysis,
    options.filename,
  );
  const routeHasEventBindings = (compiled.metadata.eventHydrationManifest?.events.length ?? 0) > 0;
  const routeRequiresFullHydration =
    routeExplicitlyRequiresHydration ||
    routeUsesCells ||
    routeUsesReactiveEffect ||
    routeHasEventBindings;
  const routeUsesOnlyClientReferenceBoundaries =
    !routeRequiresFullHydration &&
    clientReferenceManifest.length > 0 &&
    (options.clientReferenceImports?.length ?? 0) > 0;
  const routeHydrationCode = routeUsesOnlyClientReferenceBoundaries ? "" : compiled.code;
  const hydratedRouteComponentExpression = routeUsesOnlyClientReferenceBoundaries
    ? "undefined"
    : routeComponentExpression;
  const routeStateSignature = routeUsesCells ? routeStateSignatureForSource(compiled.code) : "";
  const routeCellEffectImport = routeUsesCells
    ? `import { effect as __mreactRouteEffect } from "@reckona/mreact-reactive-core";\n`
    : "";
  const routeCleanupScopeImport = routeUsesCleanupScope
    ? `import { withCleanupScope as __mreactWithCleanupScope } from "@reckona/mreact-reactive-core/internal";\n`
    : "";
  const routeReactiveDomMetadataImport = !routeUsesOnlyClientReferenceBoundaries
    ? `import { withEventBindingMetadata as __mreactWithEventBindingMetadata, withPropBindingMetadata as __mreactWithPropBindingMetadata } from "@reckona/mreact-reactive-dom";\n`
    : "";
  const navigationStateDeclaration = inlineClientNavigation
    ? `const __mreactNavigationState = __mreactGlobal.__mreactNavigationState ??= {
  cache: new Map(),
  current: {
    from: null,
    pending: false,
    to: null,
    type: null,
  },
  fetchRevalidationInstalled: false,
  installed: false,
  pendingHtmlFetches: new Map(),
  prefetchedUrls: new Set(),
  prefetchedScripts: new Set(),
  reloadNextNavigationFetch: false,
  routePrefetchManifest: undefined,
  routePrefetchManifestText: undefined,
  viewportAnchors: new WeakSet(),
  viewportObserver: undefined,
};`
    : "";
  const deferredNavigationRuntime = deferredClientNavigation
    ? `
let __mreactDeferredNavigationRuntime = undefined;

function __mreactNavigationRuntimeScript() {
  if (typeof document === "undefined") {
    return undefined;
  }

  const element = document.getElementById("mreact-navigation-runtime");
  const text = element?.textContent;

  if (text === undefined || text === "") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text);
    return typeof parsed?.script === "string" ? parsed.script : undefined;
  } catch {
    return undefined;
  }
}

function __mreactLoadNavigationRuntime() {
  const script = __mreactNavigationRuntimeScript();
  if (script === undefined) {
    return Promise.resolve(undefined);
  }

  if (__mreactDeferredNavigationRuntime !== undefined) {
    return __mreactDeferredNavigationRuntime;
  }

  __mreactDeferredNavigationRuntime = import(/* @vite-ignore */ script).catch(() => undefined);
  return __mreactDeferredNavigationRuntime;
}

function __mreactDeferredAnchorFromEvent(event) {
  const target = event.target;
  const anchor = target instanceof Element ? target.closest("a[href]") : null;

  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

function __mreactDeferredAnchorScrollMode(anchor) {
  return anchor.dataset.mreactScroll === "preserve" ? false : true;
}

function __mreactDeferredAnchorTransitionMode(anchor) {
  return anchor.dataset.mreactTransition === "auto" ? "auto" : false;
}

function __mreactDeferredIsHashOnlyNavigation(nextUrl) {
  return nextUrl.origin === location.origin &&
    nextUrl.pathname === location.pathname &&
    nextUrl.search === location.search &&
    nextUrl.hash !== "" &&
    nextUrl.hash !== location.hash;
}

function __mreactDeferredIsCurrentLocationNavigation(nextUrl) {
  return nextUrl.origin === location.origin &&
    nextUrl.pathname === location.pathname &&
    nextUrl.search === location.search;
}

function __mreactDeferredHandleClick(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }

  const anchor = __mreactDeferredAnchorFromEvent(event);

  if (anchor === null || anchor.dataset.mreactReload === "true") {
    return;
  }

  const nextUrl = new URL(anchor.href, location.href);

  if (nextUrl.origin !== location.origin || __mreactDeferredIsHashOnlyNavigation(nextUrl)) {
    return;
  }

  if (__mreactNavigationRuntimeScript() === undefined) {
    return;
  }

  if (__mreactDeferredIsCurrentLocationNavigation(nextUrl)) {
    event.preventDefault();

    if (__mreactDeferredAnchorScrollMode(anchor) !== false && nextUrl.hash === "") {
      scrollTo(0, 0);
    }

    return;
  }

  event.preventDefault();
  void __mreactLoadNavigationRuntime()
    .then((runtime) =>
      typeof runtime?.__mreactNavigate === "function"
        ? runtime.__mreactNavigate(nextUrl.href, {
            scroll: __mreactDeferredAnchorScrollMode(anchor),
            transition: __mreactDeferredAnchorTransitionMode(anchor),
          })
        : false,
    )
    .then((navigated) => {
      if (!navigated) {
        location.href = nextUrl.href;
      }
    })
    .catch(() => {
      location.href = nextUrl.href;
    });
}

function __mreactInstallNavigation() {
  if (typeof document === "undefined") {
    return;
  }

  const load = () => {
    void __mreactLoadNavigationRuntime();
  };
  const loadFromAnchorEvent = (event) => {
    const target = event.target;
    const anchor = target instanceof Element ? target.closest("a[href]") : null;

    if (anchor instanceof HTMLAnchorElement && anchor.origin === location.origin) {
      load();
    }
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(load);
  } else {
    setTimeout(load, 0);
  }

  addEventListener("popstate", load);
  document.addEventListener("pointerover", loadFromAnchorEvent, true);
  document.addEventListener("pointerdown", loadFromAnchorEvent, true);
  document.addEventListener("click", __mreactDeferredHandleClick, true);
  document.addEventListener("focusin", loadFromAnchorEvent);
}

export async function __mreactNavigate(url, options = {}) {
  const runtime = await __mreactLoadNavigationRuntime();
  return typeof runtime?.__mreactNavigate === "function"
    ? runtime.__mreactNavigate(url, options)
    : false;
}

export async function __mreactPrefetch(url) {
  const runtime = await __mreactLoadNavigationRuntime();
  return typeof runtime?.__mreactPrefetch === "function"
    ? runtime.__mreactPrefetch(url)
    : false;
}

export async function __mreactInvalidateNavigationCache(path) {
  const runtime = await __mreactLoadNavigationRuntime();
  runtime?.__mreactInvalidateNavigationCache?.(path);
}

export async function __mreactRestoreHistoryState(state) {
  const runtime = await __mreactLoadNavigationRuntime();
  return typeof runtime?.__mreactRestoreHistoryState === "function"
    ? runtime.__mreactRestoreHistoryState(state)
    : false;
}

export async function __mreactGetNavigationState() {
  const runtime = await __mreactLoadNavigationRuntime();
  return typeof runtime?.__mreactGetNavigationState === "function"
    ? runtime.__mreactGetNavigationState()
    : { from: null, pending: false, to: null, type: null };
}
`
    : "";
  const routeCellStateDeclaration = routeUsesCells
    ? `const __mreactRouteStates = __mreactGlobal.__mreactRouteStates ??= new Map();
let __mreactActiveCellRecords = undefined;
let __mreactActiveCellIndex = 0;`
    : "";
  const routeCleanupStateDeclaration = routeUsesCleanupScope
    ? `const __mreactRouteDisposers = __mreactGlobal.__mreactRouteDisposers ??= new Map();`
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
    __mreactPreviousState?.signature === __mreactRouteStateSignature &&
    __mreactPreviousState?.propsText === (__mreactPropsText ?? "")
    ? __mreactPreviousState
    : {
        cells: new Map(),
        marker: __mreactMarker,
        propsText: __mreactPropsText ?? "",
        signature: __mreactRouteStateSignature,
      };
  __mreactDropMismatchedRouteState(__mreactPreviousState, __mreactState);
  __mreactRouteStates.set(__mreactRouteId, __mreactState);
  __mreactState.dispose?.();

  __mreactState.dispose = __mreactRouteEffect(() => {
    const __mreactRouteEffectDisposers = new Set();
    __mreactActiveCellRecords = __mreactState.cells;
    __mreactActiveCellIndex = 0;
    __mreactRouteDisposers.set(__mreactRouteId, () => __mreactState.dispose?.());

    try {
`
    : "";
  const routeCellHydrationEnd = routeUsesCells
    ? `    } finally {
      __mreactActiveCellRecords = undefined;
      __mreactActiveCellIndex = 0;
    }
    return () => {
      for (const __mreactDispose of Array.from(__mreactRouteEffectDisposers)) {
        __mreactDispose();
      }
      __mreactRouteEffectDisposers.clear();
    };
  });
`
    : "";
  const routeCellHydrationIndent = routeUsesCells ? "      " : "  ";
  const routeCleanupHydrationStart =
    routeUsesCleanupScope && !routeUsesCells
      ? `  __mreactDisposeRoute(__mreactRouteId);
  const __mreactRouteEffectDisposers = new Set();
  __mreactRouteDisposers.set(__mreactRouteId, () => {
    for (const __mreactDispose of Array.from(__mreactRouteEffectDisposers)) {
      __mreactDispose();
    }
    __mreactRouteEffectDisposers.clear();
  });
`
      : "";
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
  const routeCleanupFunction = routeUsesCleanupScope
    ? `
function __mreactDisposeRoute(routeId) {
  const __mreactDispose = __mreactRouteDisposers.get(routeId);
  if (__mreactDispose === undefined) {
    return;
  }
  __mreactRouteDisposers.delete(routeId);
  __mreactDispose();
}
`
    : "";
  const routeCleanupNavigationDispose = routeUsesCleanupScope
    ? `  if (currentRouteId !== nextRouteId) {
    __mreactDisposeRoute(currentRouteId);
  }
`
    : "";
  const routeNodeResolver = routeUsesCells
    ? `
function __mreactResolveRouteNode(value) {
  if (
    value !== null &&
    typeof value === "object" &&
    value.$$typeof === Symbol.for("react.transitional.element") &&
    typeof value.type === "function"
  ) {
    return __mreactResolveRouteNode(value.type(value.props ?? {}));
  }

  if (value !== null && typeof value === "object" && value.nodeType !== undefined) {
    return value;
  }

  const fragment = document.createDocumentFragment();
  if (value !== null && value !== undefined && value !== false && value !== true) {
    fragment.append(document.createTextNode(String(value)));
  }
  return fragment;
}
`
    : "";
  const routeComponentCallExpression = routeUsesCleanupScope
    ? "__mreactWithCleanupScope((__mreactDispose) => __mreactRouteEffectDisposers.add(__mreactDispose), () => __mreactComponent(__mreactProps))"
    : "__mreactComponent(__mreactProps)";
  const routeNodeExpression = routeUsesCells
    ? `__mreactResolveRouteNode(${routeComponentCallExpression})`
    : routeComponentCallExpression;
  const routeHydrationNodeExpression = !routeUsesOnlyClientReferenceBoundaries
    ? `__mreactWithPropBindingMetadata(() => __mreactWithEventBindingMetadata(() => __mreactEvaluateHydrationNode(() => ${routeNodeExpression})))`
    : `__mreactEvaluateHydrationNode(() => ${routeNodeExpression})`;
  const boundaryOnlyHydrationBlock = routeRequiresFullHydration
    ? ""
    : `${routeCellHydrationIndent}if (!__mreactHasNonSerializableClientBoundaries(__mreactMarker) && __mreactHydrateClientBoundaries(document, __mreactClientReferences, __mreactClientReferenceComponents)) {
${routeCellHydrationIndent}  __mreactMarker.setAttribute(${JSON.stringify(routeHydrationContract.hydratedAttribute)}, "true");
${routeCellHydrationIndent}  __mreactMarkRouteHydrated();
${routeCellHydrationIndent}  return;
${routeCellHydrationIndent}}
`;
  const routeComponentGuard = `${routeCellHydrationIndent}if (__mreactComponent === undefined) {
${routeCellHydrationIndent}  return;
${routeCellHydrationIndent}}
`;
  const entry = `${routeCellEffectImport}${routeCleanupScopeImport}${routeReactiveDomMetadataImport}${emitCompatClientReferenceImportBlock(compatClientReferenceNames)}${clientReferenceImportBlock}${routeHydrationCode}

const __mreactRouteId = ${JSON.stringify(routeId)};
  const __mreactRouteStateSignature = ${JSON.stringify(routeStateSignature)};
  const __mreactRouteMarkerAttribute = ${JSON.stringify(routeHydrationContract.routeMarkerAttribute)};
  const __mreactRouteHydratedAttribute = ${JSON.stringify(routeHydrationContract.hydratedAttribute)};
  const __mreactPropsScriptPrefix = ${JSON.stringify(routeHydrationContract.propsScriptPrefix)};
  const __mreactClientReferencesScriptPrefix = ${JSON.stringify(routeHydrationContract.clientReferencesScriptPrefix)};
  const __mreactGlobal = globalThis;
  __mreactGlobal.__mreactHydrateRoute;
${navigationStateDeclaration}
${routeCellStateDeclaration}
${routeCleanupStateDeclaration}
${routeCellHook}
${clientReferenceRegistry}
${routeNodeResolver}

export function __mreactHydrateRoute() {
  __mreactApplyOutOfOrderFragments(document);
  const __mreactMarker = document.querySelector(\`[\${__mreactRouteMarkerAttribute}="\${__mreactRouteId}"]\`);
  const __mreactPropsElement = document.getElementById(\`\${__mreactPropsScriptPrefix}\${__mreactRouteId}\`);
  const __mreactClientReferencesElement = document.getElementById(\`\${__mreactClientReferencesScriptPrefix}\${__mreactRouteId}\`);
  const __mreactPropsText = __mreactPropsElement?.textContent;
  const __mreactProps = __mreactPropsText === undefined
    ? {}
    : JSON.parse(__mreactPropsText);
  const __mreactClientReferences = __mreactClientReferencesElement?.textContent === undefined
    ? []
    : JSON.parse(__mreactClientReferencesElement.textContent);
  const __mreactClientReferenceManifests = __mreactGlobal.__mreactClientReferenceManifests ??= new Map();
  __mreactClientReferenceManifests.set(__mreactRouteId, __mreactClientReferences);
  const __mreactComponent = ${hydratedRouteComponentExpression};

  if (__mreactMarker === null) {
    return;
  }
${routeCellHydrationStart}${routeCleanupHydrationStart}${boundaryOnlyHydrationBlock}${routeComponentGuard}${routeCellHydrationIndent}const __mreactNode = ${routeHydrationNodeExpression};
${routeCellHydrationIndent}__mreactResumeRoute(__mreactMarker, __mreactNode);
${routeCellHydrationIndent}__mreactHydrateClientBoundaries(document, __mreactClientReferences, __mreactClientReferenceComponents);
${routeCellHydrationIndent}__mreactMarker.setAttribute(__mreactRouteHydratedAttribute, "true");
${routeCellHydrationIndent}__mreactMarkRouteHydrated();
${routeCellHydrationEnd}}
${routeCellDropFunction}
${routeCleanupFunction}

function __mreactMarkRouteHydrated() {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute(__mreactRouteHydratedAttribute, "true");
  }

  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("mreact:hydrated", {
      detail: { routeId: __mreactRouteId },
    }));
  }
}

function __mreactMarkRouteHydrating() {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.removeAttribute(__mreactRouteHydratedAttribute);
}

function __mreactEvaluateHydrationNode(factory) {
  const previous = __mreactGlobal.__mreactHydratingDynamicRanges;
  __mreactGlobal.__mreactHydratingDynamicRanges = true;

  try {
    return factory();
  } finally {
    if (previous === undefined) {
      delete __mreactGlobal.__mreactHydratingDynamicRanges;
    } else {
      __mreactGlobal.__mreactHydratingDynamicRanges = previous;
    }
  }
}

const __mreactRouteHydrationReported = Symbol.for("mreact.routeHydrationReported");

function __mreactReportRouteHydrationError(error) {
  if (error !== null && typeof error === "object") {
    if (error[__mreactRouteHydrationReported] === true) {
      return;
    }
    error[__mreactRouteHydrationReported] = true;
  }

  if (typeof console !== "undefined" && typeof console.error === "function") {
    console.error(
      \`mreact: route hydration failed for route "\${__mreactRouteId}". Server HTML remains visible, but client interactivity for this route was not attached.\`,
      error,
    );
  }
}

function __mreactRunRouteHydration(factory) {
  try {
    return factory();
  } catch (error) {
    __mreactReportRouteHydrationError(error);
    throw error;
  }
}

${deferredNavigationRuntime}
__mreactRunRouteHydration(() => __mreactHydrateRoute());
${clientNavigation ? "__mreactInstallNavigation();" : ""}

${
  inlineClientNavigation
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
  __mreactResetNavigationFocus();
  __mreactAnnounceNavigation();
  return true;
}

function __mreactResetNavigationFocus() {
  if (typeof document === "undefined") {
    return;
  }

  const focusTarget =
    document.querySelector("[data-mreact-focus-target]") ??
    document.querySelector("main") ??
    document.querySelector("h1") ??
    document.body;

  if (!(focusTarget instanceof HTMLElement)) {
    return;
  }

  const hadTabIndex = focusTarget.hasAttribute("tabindex");

  if (!hadTabIndex) {
    focusTarget.setAttribute("tabindex", "-1");
  }

  try {
    focusTarget.focus({ preventScroll: true });
  } catch {
    focusTarget.focus();
  }

  if (!hadTabIndex) {
    focusTarget.addEventListener(
      "blur",
      () => focusTarget.removeAttribute("tabindex"),
      { once: true },
    );
  }
}

function __mreactAnnounceNavigation() {
  if (typeof document === "undefined" || document.body === null) {
    return;
  }

  const announcement = __mreactRouteAnnouncementElement();
  announcement.textContent = \`Loaded \${document.title || "page"}\`;
}

function __mreactRouteAnnouncementElement() {
  const existing = document.getElementById("mreact-route-announcement");

  if (existing instanceof HTMLElement) {
    return existing;
  }

  const announcement = document.createElement("div");
  announcement.id = "mreact-route-announcement";
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  announcement.setAttribute("aria-atomic", "true");
  announcement.setAttribute(
    "style",
    "position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden",
  );
  document.body.appendChild(announcement);
  return announcement;
}

export async function __mreactPrefetch(url) {
  if (!__mreactCanPrefetch()) {
    return false;
  }

  const href = __mreactNormalizeNavigationUrl(url);

  if (href === undefined) {
    return false;
  }

  if (!__mreactIsSameOriginNavigationUrl(href)) {
    return false;
  }

  if (__mreactIsCurrentLocationNavigationHref(href)) {
    return false;
  }

  if (__mreactNavigationState.prefetchedUrls.has(href)) {
    return true;
  }

  __mreactRememberPrefetchedUrl(href);

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

  return __mreactFetchNavigationHtmlOnce(href)
    .then((html) => typeof html === "string")
    .catch(() => false);
}

const __mreactNavigationHtmlCacheMaxEntries = 64;
const __mreactNavigationPrefetchHistoryMaxEntries = 64;

function __mreactRememberPrefetchedUrl(href) {
  __mreactRememberPrefetchHistory(__mreactNavigationState.prefetchedUrls, href);
}

function __mreactRememberPrefetchedScript(href) {
  __mreactRememberPrefetchHistory(__mreactNavigationState.prefetchedScripts, href);
}

function __mreactRememberPrefetchHistory(history, href) {
  if (history.has(href)) {
    history.delete(href);
  }

  history.add(href);

  while (history.size > __mreactNavigationPrefetchHistoryMaxEntries) {
    const oldestHref = history.keys().next().value;

    if (oldestHref === undefined) {
      return;
    }

    history.delete(oldestHref);
  }
}

function __mreactCachedNavigationHtml(href) {
  const html = __mreactNavigationState.cache.get(href);

  if (html === undefined) {
    return undefined;
  }

  __mreactNavigationState.cache.delete(href);
  __mreactNavigationState.cache.set(href, html);
  return html;
}

function __mreactRememberNavigationHtml(href, html) {
  if (__mreactNavigationState.cache.has(href)) {
    __mreactNavigationState.cache.delete(href);
  }

  __mreactNavigationState.cache.set(href, html);

  while (__mreactNavigationState.cache.size > __mreactNavigationHtmlCacheMaxEntries) {
    const oldestHref = __mreactNavigationState.cache.keys().next().value;

    if (oldestHref === undefined) {
      return;
    }

    __mreactNavigationState.cache.delete(oldestHref);
    __mreactNavigationState.prefetchedUrls.delete(oldestHref);
  }
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
      __mreactRememberPrefetchedScript(href);
      return true;
    }
  }

  const link = document.createElement("link");
  link.rel = "modulepreload";
  link.href = href;
  document.head.appendChild(link);
  __mreactRememberPrefetchedScript(href);
  return true;
}

export async function __mreactNavigate(url, options = {}) {
  const href = __mreactNormalizeNavigationUrl(url);

  if (href === undefined) {
    return false;
  }

  __mreactSetNavigationState(__mreactPendingNavigationState(href, options.type ?? "push"));

  try {
    const cachedHtml = __mreactCachedNavigationHtml(href);
    const script = __mreactRouteScriptForNavigationUrl(href);
    if (script !== undefined) {
      void __mreactPrefetchRouteScript(script);
    }
    const html = cachedHtml ?? await __mreactFetchNavigationHtmlOnce(href);

    if (typeof html !== "string") {
      return false;
    }

    __mreactRememberNavigationHtml(href, html);
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
  if (!__mreactViewTransitionsAllowed(options.transition)) {
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

function __mreactViewTransitionsAllowed(transition) {
  if (
    transition !== "auto" ||
    typeof document === "undefined" ||
    typeof document.startViewTransition !== "function"
  ) {
    return false;
  }

  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }

  try {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

export function __mreactInvalidateNavigationCache(path) {
  const normalizedPath = __mreactNormalizeNavigationPath(path);

  if (normalizedPath === undefined) {
    return;
  }

  const hrefs = new Set([
    ...Array.from(__mreactNavigationState.cache.keys()),
    ...Array.from(__mreactNavigationState.pendingHtmlFetches.keys()),
  ]);

  for (const href of hrefs) {
    if (__mreactNormalizeNavigationPath(href) === normalizedPath) {
      __mreactNavigationState.cache.delete(href);
      __mreactNavigationState.prefetchedUrls.delete(href);
      __mreactNavigationState.pendingHtmlFetches.delete(href);
    }
  }
}

function __mreactInvalidateAllNavigationCache() {
  __mreactNavigationState.cache.clear();
  __mreactNavigationState.prefetchedUrls.clear();
  __mreactNavigationState.pendingHtmlFetches.clear();
}

function __mreactFetchNavigationHtmlOnce(href) {
  const pending = __mreactNavigationState.pendingHtmlFetches.get(href);

  if (pending !== undefined) {
    return pending;
  }

  const request = __mreactFetchNavigationHtml(href)
    .then((html) => {
      if (
        typeof html === "string" &&
        __mreactNavigationState.pendingHtmlFetches.get(href) === request
      ) {
        __mreactRememberNavigationHtml(href, html);
      }

      return html;
    })
    .finally(() => {
      if (__mreactNavigationState.pendingHtmlFetches.get(href) === request) {
        __mreactNavigationState.pendingHtmlFetches.delete(href);
      }
    });

  __mreactNavigationState.pendingHtmlFetches.set(href, request);
  return request;
}

function __mreactFetchNavigationHtml(href) {
  const reloadRouteCache = __mreactNavigationState.reloadNextNavigationFetch === true;
  __mreactNavigationState.reloadNextNavigationFetch = false;
  const headers = reloadRouteCache
    ? { "x-mreact-navigation": "1", "x-mreact-navigation-cache": "reload" }
    : { "x-mreact-navigation": "1" };

  return fetch(href, {
    headers,
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
  const header = typeof response?.headers?.get === "function"
    ? response.headers.get("x-mreact-revalidate")
    : null;

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
  if (state === null || state === undefined || state.__mreact !== true) {
    return false;
  }

  const html = typeof state.html === "string"
    ? state.html
    : typeof state.url === "string" ? __mreactNavigationState.cache.get(state.url) : undefined;

  if (typeof html !== "string") {
    return false;
  }

  const applied = __mreactApplyNavigationHtml(html, state.url);

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
  const nextMarker = template.content.querySelector("[${routeHydrationContract.routeMarkerAttribute}]");
  const currentMarker = document.querySelector("[${routeHydrationContract.routeMarkerAttribute}]");

  if (nextMarker === null || currentMarker === null) {
    return false;
  }

  const currentRouteId = currentMarker.getAttribute("${routeHydrationContract.routeMarkerAttribute}");
  const nextRouteId = nextMarker.getAttribute("${routeHydrationContract.routeMarkerAttribute}");

  __mreactMarkRouteHydrating();
  __mreactSyncHeadMetadata(template.content, html);
  if (!__mreactApplyNavigationShellHtml(currentMarker, nextMarker)) {
    __mreactUnmountCompatBoundaries(currentMarker);
    __mreactResumeNode(currentMarker, nextMarker);
  }
${routeCleanupNavigationDispose}  __mreactSyncRouteDataScripts(template.content, currentRouteId, nextRouteId);

  const script = template.content.querySelector('script[type="module"][src]')?.getAttribute("src");
  if (script !== null && script !== undefined) {
    void import(/* @vite-ignore */ script)
      .then((module) => __mreactRunRouteHydration(() => module.${routeHydrationContract.routeHydrateExport}?.()))
      .catch((error) => {
        __mreactReportRouteHydrationError(error);
        throw error;
      });
  } else {
    __mreactMarkRouteHydrated();
  }

  __mreactApplyOutOfOrderFragments(document);
  __mreactObserveViewportPrefetchAnchors(document);

  return true;
}

function __mreactApplyNavigationShellHtml(currentMarker, nextMarker) {
  const target = __mreactNavigationShellSyncTarget(currentMarker, nextMarker);

  if (target === null) {
    return false;
  }

  __mreactUnmountCompatBoundaries(target.current);
  __mreactResumeNode(target.current, target.next);
  return true;
}

function __mreactNavigationShellSyncTarget(currentMarker, nextMarker) {
  const currentShells = __mreactMarkerShellAncestors(currentMarker);
  const nextShells = __mreactMarkerShellAncestors(nextMarker);
  const commonLength = Math.min(currentShells.length, nextShells.length);
  let commonIndex = -1;

  for (let index = 0; index < commonLength; index += 1) {
    if (!__mreactSameNavigationShellBoundary(currentShells[index], nextShells[index])) {
      break;
    }

    commonIndex = index;
  }

  if (commonIndex >= 0) {
    return __mreactNavigationShellDomTarget(currentShells[commonIndex], nextShells[commonIndex]);
  }

  if (currentShells.length === 0 || nextShells.length === 0) {
    return null;
  }

  const currentRoot = currentShells[0];
  const nextRoot = nextShells[0];

  if (currentRoot.tagName !== nextRoot.tagName) {
    return null;
  }

  return __mreactNavigationShellDomTarget(currentRoot, nextRoot);
}

function __mreactMarkerShellAncestors(marker) {
  const shells = [];
  let current = marker.parentElement;

  while (current !== null) {
    if (__mreactIsNavigationShellBoundary(current)) {
      shells.push(current);
    }

    current = current.parentElement;
  }

  shells.reverse();
  return shells;
}

function __mreactIsNavigationShellBoundary(element) {
  return element.hasAttribute("data-mreact-layout-boundary") ||
    element.hasAttribute("data-mreact-template-boundary");
}

function __mreactSameNavigationShellBoundary(current, next) {
  const currentKind = __mreactNavigationShellBoundaryKind(current);
  const nextKind = __mreactNavigationShellBoundaryKind(next);

  if (currentKind === null || currentKind !== nextKind || current.tagName !== next.tagName) {
    return false;
  }

  const attribute = currentKind === "layout"
    ? "data-mreact-layout-boundary"
    : "data-mreact-template-boundary";

  return current.getAttribute(attribute) === next.getAttribute(attribute);
}

function __mreactNavigationShellBoundaryKind(element) {
  if (element.hasAttribute("data-mreact-layout-boundary")) {
    return "layout";
  }

  if (element.hasAttribute("data-mreact-template-boundary")) {
    return "template";
  }

  return null;
}

function __mreactNavigationShellDomTarget(currentShell, nextShell) {
  if (currentShell.tagName === "HTML" && nextShell.tagName === "HTML") {
    const currentBody = currentShell.querySelector("body");
    const nextBody = nextShell.querySelector("body");

    if (currentBody !== null && nextBody !== null) {
      return { current: currentBody, next: nextBody };
    }
  }

  return { current: currentShell, next: nextShell };
}

function __mreactSyncHeadMetadata(root, html) {
  __mreactSyncHtmlLang(root, html);

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

function __mreactSyncHtmlLang(root, html) {
  const nextHtml = root.querySelector("html");
  const nextLang = nextHtml?.getAttribute("lang") ?? __mreactHtmlLangFromSource(html);

  if (nextLang === null) {
    return;
  }

  if (document.documentElement.lang !== nextLang) {
    document.documentElement.lang = nextLang;
  }
}

function __mreactHtmlLangFromSource(html) {
  const match = /<html\\b[^>]*\\slang=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))/i.exec(html);

  return match === null ? null : match[1] ?? match[2] ?? match[3] ?? null;
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

  for (const id of managedIds) {
    document.getElementById(id)?.remove();
    const next = typeof root.getElementById === "function"
      ? root.getElementById(id)
      : root.querySelector(\`#\${id}\`);

    if (next !== null && next !== undefined) {
      document.body.appendChild(next);
    }
  }
}

function __mreactRouteDataScriptIds(...routeIds) {
  const ids = new Set();

  for (const routeId of routeIds) {
    if (typeof routeId !== "string" || routeId === "") {
      continue;
    }

    ids.add(\`${routeHydrationContract.propsScriptPrefix}\${routeId}\`);
    ids.add(\`${routeHydrationContract.clientReferencesScriptPrefix}\${routeId}\`);
  }

  return ids;
}

function __mreactRouteDataScriptSelector() {
  return ${JSON.stringify(routeDataScriptSelector())};
}

function __mreactCurrentHistoryState(url) {
  return {
    __mreact: true,
    html: __mreactCurrentDocumentRouteHtml(),
    scrollX: Number(globalThis.scrollX ?? 0),
    scrollY: Number(globalThis.scrollY ?? 0),
    url,
  };
}

function __mreactCurrentDocumentRouteHtml() {
  if (typeof document === "undefined") {
    return undefined;
  }

  const marker = document.querySelector("[" + __mreactRouteMarkerAttribute + "]");
  if (marker === null) {
    return undefined;
  }

  const routeDataScripts = Array.from(document.querySelectorAll(__mreactRouteDataScriptSelector()))
    .map((script) => script.outerHTML)
    .join("");
  return marker.outerHTML + routeDataScripts;
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

function __mreactIsSameOriginNavigationUrl(url) {
  if (typeof location === "undefined") {
    return true;
  }

  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
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

function __mreactIsCurrentLocationNavigationHref(href) {
  if (typeof location === "undefined") {
    return false;
  }

  return __mreactIsCurrentLocationNavigation(new URL(href, location.href));
}

function __mreactIsCurrentLocationNavigation(nextUrl) {
  if (typeof location === "undefined") {
    return false;
  }

  return nextUrl.origin === location.origin &&
    nextUrl.pathname === location.pathname &&
    nextUrl.search === location.search;
}

function __mreactInstallNavigation() {
  if (__mreactNavigationState.installed || typeof document === "undefined") {
    return;
  }

  __mreactNavigationState.installed = true;
  __mreactInstallNavigationFetchRevalidation();
  __mreactEnableManualScrollRestoration();
  __mreactSaveCurrentHistoryState();
  addEventListener("popstate", (event) => {
    __mreactSaveCurrentHistoryState();
    if (!__mreactRestoreHistoryState(event.state)) {
      location.reload();
    }
  });
  document.addEventListener("pointerover", (event) => {
    const anchor = __mreactAnchorFromEvent(event);

    if (anchor !== null && __mreactAnchorPrefetchMode(anchor) === "intent") {
      void __mreactPrefetch(anchor.href);
    }
  }, true);
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
  document.addEventListener("submit", (event) => {
    if (event.defaultPrevented || typeof fetch !== "function") {
      return;
    }

    const submission = __mreactServerActionSubmissionFromEvent(event);

    if (submission === null) {
      return;
    }

    event.preventDefault();
    void __mreactSubmitServerActionForm(submission).catch(() => {
      location.href = submission.action;
    });
  });
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

    if (__mreactIsCurrentLocationNavigation(nextUrl)) {
      event.preventDefault();

      if (__mreactAnchorScrollMode(anchor) !== false && nextUrl.hash === "") {
        __mreactScrollTo(0, 0);
      }

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

function __mreactServerActionSubmissionFromEvent(event) {
  const target = event.target;
  const form = target instanceof Element ? target.closest("form") : null;
  const submitter = __mreactFormSubmitterFromEvent(event);

  if (!(form instanceof HTMLFormElement)) {
    return null;
  }

  const action = submitter?.getAttribute("formaction") ?? form.action;
  const method = submitter?.getAttribute("formmethod") ?? form.method;
  const targetName = submitter?.getAttribute("formtarget") ?? form.target;
  const actionUrl = new URL(action, location.href);

  if (
    targetName !== "" ||
    actionUrl.origin !== location.origin ||
    actionUrl.pathname !== "/_mreact/actions" ||
    method.toUpperCase() !== "POST"
  ) {
    return null;
  }

  return { action: actionUrl.href, form, submitter };
}

function __mreactFormSubmitterFromEvent(event) {
  const submitter = event.submitter;

  return submitter instanceof HTMLElement ? submitter : null;
}

async function __mreactSubmitServerActionForm(submission) {
  const response = await fetch(submission.action, {
    body: __mreactServerActionFormData(submission.form, submission.submitter),
    headers: { "x-mreact-action-single-flight": "1" },
    method: "POST",
  });
  __mreactApplyRevalidationHeader(response);

  const contentType = response.headers.get("content-type") ?? "";
  const singleFlight = response.headers.get("x-mreact-action-single-flight") === "1";
  if (
    !singleFlight &&
    !contentType.includes("text/html")
  ) {
    location.href = response.url || submission.action;
    return;
  }

  const html = await response.text();
  const applied = __mreactApplyServerActionHtml(html, singleFlight);

  if (!applied) {
    location.href = response.url || submission.action;
  }
}

function __mreactServerActionFormData(form, submitter) {
  if (submitter !== null) {
    try {
      return new FormData(form, submitter);
    } catch {
      // Older DOM implementations only accept the form argument.
    }
  }

  return new FormData(form);
}

function __mreactApplyServerActionHtml(html, singleFlight) {
  __mreactSaveCurrentHistoryState();
  const applied = __mreactApplyNavigationHtml(html, location.href);

  if (!applied) {
    if (
      !singleFlight ||
      typeof document === "undefined" ||
      typeof document.open !== "function"
    ) {
      return false;
    }

    document.open();
    document.write(html);
    document.close();
    return true;
  }

  __mreactResetNavigationFocus();
  __mreactAnnounceNavigation();
  return true;
}

function __mreactInstallNavigationFetchRevalidation() {
  if (
    __mreactNavigationState.fetchRevalidationInstalled ||
    typeof globalThis.fetch !== "function"
  ) {
    return;
  }

  __mreactNavigationState.fetchRevalidationInstalled = true;
  const fetchImpl = globalThis.fetch;
  globalThis.fetch = function(input, init) {
    const mutating = __mreactIsMutatingFetchRequest(input, init);

    return Promise.resolve(fetchImpl.call(this, input, init)).then((response) => {
      __mreactApplyRevalidationHeader(response);

      if (mutating) {
        __mreactInvalidateAllNavigationCache();
        __mreactNavigationState.reloadNextNavigationFetch = true;
      }

      return response;
    });
  };
}

function __mreactIsMutatingFetchRequest(input, init) {
  const method = __mreactFetchRequestMethod(input, init);

  return method !== "GET" && method !== "HEAD";
}

function __mreactFetchRequestMethod(input, init) {
  if (typeof init?.method === "string" && init.method !== "") {
    return init.method.toUpperCase();
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }

  return "GET";
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
  const completionMarkers = new Map();
  for (const marker of root.querySelectorAll("[data-mreact-oob-complete]")) {
    const id = marker.getAttribute("data-mreact-oob-complete");
    if (!completionMarkers.has(id)) {
      completionMarkers.set(id, marker);
    }
  }
  const placeholders = new Map();
  for (const placeholder of root.querySelectorAll("[data-mreact-oob-placeholder]")) {
    const id = placeholder.getAttribute("data-mreact-oob-placeholder");
    if (!placeholders.has(id)) {
      placeholders.set(id, placeholder);
    }
  }

  for (const fragment of fragments) {
    const id = fragment.getAttribute("data-mreact-oob-fragment");

    if (id === null) {
      continue;
    }

    const completionMarker = completionMarkers.get(id);
    if (completionMarker === undefined) {
      continue;
    }

    const placeholder = placeholders.get(id);
    if (placeholder === undefined) {
      continue;
    }

    placeholder.replaceWith(fragment.content.cloneNode(true));
    fragment.remove();
    completionMarker.remove();
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
    const entry = name === null ? undefined : components.get(name);
    const component = typeof entry === "function" ? entry : entry?.component;
    const compat = entry?.compat === true;

    if (typeof component !== "function") {
      return false;
    }

    const propsElement = __mreactClientBoundaryPropsElement(placeholder, name);
    const props = propsElement?.textContent === undefined || propsElement.textContent === ""
      ? {}
      : JSON.parse(propsElement.textContent);
    const fallbackChildren = __mreactClientBoundaryFallbackChildren(placeholder, propsElement);

    if (fallbackChildren !== undefined) {
      props.children = fallbackChildren;
    }

    if (compat) {
      const parentContainer = __mreactClientBoundaryParentContainer(placeholder, propsElement);
      const container = parentContainer ?? document.createElement("span");
      container.setAttribute("data-mreact-compat-boundary", name ?? "");
      if (parentContainer === null) {
        container.style.display = "contents";
        placeholder.replaceWith(container);
      } else {
        placeholder.remove();
      }
      propsElement?.remove();
      const root = __mreactCompatCreateRoot(container);
      container.__mreactCompatRoot = root;
      root.render(__mreactCompatCreateElement(component, props));
      continue;
    }

    const node = component(props);

    placeholder.replaceWith(node);
    propsElement?.remove();
  }

  return true;
}

function __mreactClientBoundaryParentContainer(placeholder, propsElement) {
  const parent = placeholder.parentElement;

  if (parent === null) {
    return null;
  }

  for (const node of Array.from(parent.childNodes)) {
    if (node === placeholder || node === propsElement) {
      continue;
    }

    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() === "") {
      continue;
    }

    return null;
  }

  return parent;
}

function __mreactUnmountCompatBoundaries(root) {
  const containers = [];

  if (
    root.nodeType === Node.ELEMENT_NODE &&
    root.hasAttribute("data-mreact-compat-boundary")
  ) {
    containers.push(root);
  }

  if (typeof root.querySelectorAll === "function") {
    containers.push(...root.querySelectorAll("[data-mreact-compat-boundary]"));
  }

  for (const container of containers) {
    const compatRoot = container.__mreactCompatRoot;

    if (compatRoot === undefined || typeof compatRoot.unmount !== "function") {
      continue;
    }

    compatRoot.unmount();
    container.__mreactCompatRoot = undefined;
  }
}

function __mreactHasNonSerializableClientBoundaries(marker) {
  return marker.querySelector(
    'template[data-mreact-client-boundary][data-mreact-client-boundary-nonserializable="true"]',
  ) !== null;
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

    next = next.nextSibling;
  }

  return undefined;
}

function __mreactClientBoundaryFallbackChildren(placeholder, propsElement) {
  const nodes = [];
  let next = placeholder.nextSibling;

  while (next !== null && next !== propsElement) {
    const current = next;
    next = next.nextSibling;

    if (current.nodeType === Node.TEXT_NODE && (current.textContent ?? "").trim() === "") {
      current.remove();
      continue;
    }

    current.remove();
    nodes.push(current);
  }

  if (nodes.length === 0) {
    return undefined;
  }

  return nodes.length === 1 ? nodes[0] : nodes;
}

function __mreactResumeRoute(marker, nextNode) {
  if (nextNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    marker.replaceChildren(nextNode);
    return;
  }

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
    __mreactUnmountCompatBoundaries(current);
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
    __mreactUnmountCompatBoundaries(current);
    current.replaceWith(next);
    return;
  }

  __mreactSyncEventBindings(current, next);
  __mreactSyncAttributes(current, next);
  __mreactSyncPropBindings(current, next);
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

  const rawBindings = next.__mreactEventBindings;
  const bindings =
    rawBindings === undefined ? [] : Array.isArray(rawBindings) ? rawBindings : [rawBindings];

  if (bindings.length === 0) {
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

function __mreactSyncPropBindings(current, next) {
  const previousBindings = current.__mreactPropBindings;

  if (Array.isArray(previousBindings)) {
    for (const binding of previousBindings) {
      binding.dispose?.();
    }
  }

  const bindings = next.__mreactPropBindings;

  if (!Array.isArray(bindings) || bindings.length === 0) {
    current.__mreactPropBindings = [];
    current.__mreactHasReactiveProps = false;
    return;
  }

  current.__mreactPropBindings = bindings;
  current.__mreactHasReactiveProps = true;
  next.__mreactPropBindings = [];
  next.__mreactHasReactiveProps = false;

  for (const binding of bindings) {
    binding.retarget?.(current);
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

    // Nodes owned by insertDynamic/bindText must replace the matching server
    // DOM so subsequent reactive updates mutate the live node/range instead of
    // appending beside stale SSR fallback content.
    const isDynamicNode = nextChild.__mreactDynamicNode === true;
    const isReactiveText = nextChild.__mreactReactiveText === true;

    if (isDynamicNode) {
      currentChild.replaceWith(nextChild);
    } else if (
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
    const lastChild = current.lastChild;
    if (lastChild === null) {
      break;
    }
    __mreactUnmountCompatBoundaries(lastChild);
    lastChild.remove();
  }
}
`;
  return {
    code: stripTypeScriptWithOxc(entry),
  };
}

function workspaceRuntimePlugin(options: { routeFiles: readonly string[] }) {
  const routeFiles = new Set(options.routeFiles);
  const packageFile = (monorepoDir: string, packageName: string, entry: string): string =>
    workspacePackageFile({
      currentFileUrl: import.meta.url,
      entry,
      monorepoDir,
      packageName,
    });
  const reactiveCorePath = packageFile("reactive-core", "@reckona/mreact-reactive-core", "index");
  const reactiveCoreDir = dirname(reactiveCorePath);
  const reactiveDomPath = packageFile("reactive-dom", "@reckona/mreact-reactive-dom", "index");
  const reactiveDomDir = dirname(reactiveDomPath);
  const reactCompatPath = packageFile("react-compat", "@reckona/mreact-compat", "index");
  const reactCompatDir = dirname(reactCompatPath);
  const runtimePackageDirs = [reactiveCoreDir, reactiveDomDir, reactCompatDir];
  const runtimePackageNames = [
    "@reckona/mreact-reactive-core",
    "@reckona/mreact-reactive-dom",
    "@reckona/mreact-compat",
  ];
  const runtimePaths = new Map([
    ["react", reactCompatPath],
    ["react-dom", reactCompatPath],
    ["react-dom/client", reactCompatPath],
    ["react-dom/server", reactCompatPath],
    [
      "react/jsx-dev-runtime",
      packageFile("react-compat", "@reckona/mreact-compat", "jsx-dev-runtime"),
    ],
    ["react/jsx-runtime", packageFile("react-compat", "@reckona/mreact-compat", "jsx-runtime")],
    [
      "@reckona/mreact-reactive-core/internal",
      packageFile("reactive-core", "@reckona/mreact-reactive-core", "internal"),
    ],
    ["@reckona/mreact-compat", reactCompatPath],
    [
      "@reckona/mreact-compat/event-priority",
      packageFile("react-compat", "@reckona/mreact-compat", "event-priority"),
    ],
    [
      "@reckona/mreact-compat/flight",
      packageFile("react-compat", "@reckona/mreact-compat", "flight"),
    ],
    [
      "@reckona/mreact-compat/hooks",
      packageFile("react-compat", "@reckona/mreact-compat", "hooks-entry"),
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
      "@reckona/mreact-compat/server",
      packageFile("react-compat", "@reckona/mreact-compat", "server"),
    ],
    ["@reckona/mreact-reactive-dom", reactiveDomPath],
  ]);

  return {
    name: "mreact-workspace-runtime",
    setup(buildApi: RouterCompatBuildApi) {
      buildApi.onResolve({ filter: /^\.\/devtools\.js$/ }, (args) =>
        importerInRuntimePackage(
          args.importer,
          [reactiveCoreDir],
          ["@reckona/mreact-reactive-core"],
        )
          ? { namespace: "mreact-devtools-stub", path: "devtools" }
          : undefined,
      );
      buildApi.onResolve({ filter: /^@reckona\/mreact-reactive-core$/ }, (args) => {
        const importer = args.importer;

        return importerInRuntimePackage(importer, runtimePackageDirs, runtimePackageNames)
          ? { path: reactiveCorePath }
          : {
              namespace: "mreact-hot-runtime",
              path: "reactive-core",
            };
      });
      buildApi.onResolve(
        {
          filter:
            /^(?:react(?:\/jsx-(?:dev-)?runtime)?|react-dom(?:\/(?:client|server))?|@reckona\/mreact-(?:compat|reactive-core|reactive-dom)(?:\/(?:event-priority|flight|internal|jsx-dev-runtime|jsx-runtime|scheduler))?)$/,
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
export function currentDevtoolsEmitter() { return undefined; }
export function currentReactiveDevtools() { return undefined; }`,
        loader: "ts",
      }));
      buildApi.onLoad({ filter: /\.(?:mreact\.)?[cm]?[jt]sx$/ }, async (args) => {
        if (!isRouteClientDependencySourcePath(args.path, routeFiles)) {
          return undefined;
        }

        const source = await readFile(args.path, "utf8");
        const moduleContext = createCompilerModuleContext({
          code: source,
          filename: args.path,
        });

        if (!hasJsxSyntax(moduleContext.program)) {
          return undefined;
        }

        const output = transformCompilerModuleContext({
          code: source,
          dev: true,
          filename: args.path,
          mode: isCompatSourcePath(args.path) ? "compat" : "reactive",
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

function isRouteClientDependencySourcePath(path: string, routeFiles: ReadonlySet<string>): boolean {
  return !routeFiles.has(path) && !path.includes(`${sep}node_modules${sep}`);
}

function isCompatSourcePath(path: string): boolean {
  return /\.compat(?:\.mreact)?(?:\.[cm]?[jt]sx?)?$/.test(path);
}

function importerInRuntimePackage(
  importer: string | undefined,
  directories: readonly string[],
  packageNames: readonly string[],
): boolean {
  if (importer === undefined) {
    return false;
  }

  const normalizedImporter = importer.split(/[\\/]+/).join("/");
  return (
    directories.some((directory) => importer.startsWith(`${directory}${sep}`)) ||
    packageNames.some((packageName) => normalizedImporter.includes(`/node_modules/${packageName}/`))
  );
}

/**
 * Detects the `export const clientNavigation = false` hint in a page module
 * source. Returns the hinted value, or `true` when no hint is present (i.e.,
 * preserve the historical "navigation runtime is always present" behavior).
 *
 * AST-based so commented-out or string-literal occurrences of the pattern are
 * not mistaken for a real export.
 */
export function detectClientNavigationHint(source: string): boolean {
  return readTopLevelBooleanExport({ code: source, name: "clientNavigation" }) ?? true;
}

// `Link` ships from the dedicated `/link` subpath and is also re-exported from
// the package root for backward compatibility, so both specifiers must count.
// The root entry exports many bindings, so a root import only triggers the
// navigation runtime when the rendered specifier is `Link` specifically.
const navigationLinkPackageSpecifiers = new Set([
  "@reckona/mreact-router",
  "@reckona/mreact-router/link",
]);

function staticImportsRenderLink(
  staticImports: readonly ClientRouteStaticImportReference[],
  renderedRoots: ReadonlySet<string>,
  renderedNames: ReadonlySet<string>,
): boolean {
  return staticImports.some(
    (reference) =>
      navigationLinkPackageSpecifiers.has(reference.source) &&
      reference.specifiers.some(
        (specifier) =>
          (specifier.importedName === "Link" && renderedRoots.has(specifier.localName)) ||
          (specifier.kind === "namespace" && renderedNames.has(`${specifier.localName}.Link`)),
      ),
  );
}

function detectLinkComponentUsage(analysis: ClientRouteModuleAnalysis): boolean {
  // Use the export-reachable rendered roots, not the file-wide JSX roots, so a
  // `Link` rendered only in dead/unreachable code does not trigger the runtime.
  return staticImportsRenderLink(
    analysis.staticImports,
    new Set(analysis.reachableRenderedComponentRoots),
    new Set(analysis.reachableRenderedComponentNames),
  );
}

// Export names whose own render subtree (transitively, within this module)
// renders a navigation `Link`. Lets callers attribute `Link` usage to the
// specific export they render, so a barrel that re-exports both Link-using and
// Link-free components only triggers the runtime for the ones actually rendered.
function detectLinkComponentExportNames(analysis: ClientRouteModuleAnalysis): string[] {
  return Object.keys(analysis.reachableExportRenderedComponentRoots).filter((exportName) =>
    staticImportsRenderLink(
      analysis.staticImports,
      new Set(analysis.reachableExportRenderedComponentRoots[exportName] ?? []),
      new Set(analysis.reachableExportRenderedComponentNames[exportName] ?? []),
    ),
  );
}

// Reads the explicit `export const navigationRuntime = true | false` override.
// Returns `undefined` when absent. AST-based so commented-out or string-literal
// occurrences of the pattern are not mistaken for a real export.
export function detectNavigationRuntimeOverride(source: string): boolean | undefined {
  return readTopLevelBooleanExport({ code: source, name: "navigationRuntime" });
}

function detectRouteCellStateHint(code: string): boolean {
  const callExpression = routeCellCallExpressionSource(code);

  return callExpression === undefined
    ? /\bcell\d*\s*\(/.test(code)
    : new RegExp(`(?:${callExpression})\\s*\\(`).test(code);
}

function detectRouteReactiveEffectHint(code: string): boolean {
  return /from\s+["']@reckona\/mreact-reactive-core["']/.test(code) && /\beffect\s*\(/.test(code);
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

  return `${imports
    .map((reference, index) => {
      const localName = clientReferenceLocalName(index);

      return isIdentifierName(reference.exportName)
        ? `import { ${reference.exportName} as ${localName} } from ${JSON.stringify(reference.importSource)};`
        : `import * as ${localName} from ${JSON.stringify(reference.importSource)};`;
    })
    .join("\n")}\n`;
}

function emitClientReferenceRegistry(
  manifest: readonly ClientReferenceMetadata[],
  imports: readonly ClientReferenceImport[],
  compatNames: ReadonlySet<string>,
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
    const expression =
      importedExpressions.get(reference.name) ?? clientReferenceExpression(reference.name);

    return expression === undefined
      ? []
      : [
          compatNames.has(reference.name)
            ? `  [${JSON.stringify(reference.name)}, { component: ${expression}, compat: true }],`
            : `  [${JSON.stringify(reference.name)}, ${expression}],`,
        ];
  });

  return ["const __mreactClientReferenceComponents = new Map([", ...entries, "]);"].join("\n");
}

function compatClientReferenceComponentNames(
  manifest: readonly ClientReferenceMetadata[],
): ReadonlySet<string> {
  return new Set(
    manifest
      .filter((reference) => isCompatSourcePath(reference.moduleId))
      .map((reference) => reference.name),
  );
}

function emitCompatClientReferenceImportBlock(compatNames: ReadonlySet<string>): string {
  return compatNames.size === 0
    ? ""
    : 'import { createElement as __mreactCompatCreateElement, createRoot as __mreactCompatCreateRoot } from "@reckona/mreact-compat";\n';
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
  return value
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
