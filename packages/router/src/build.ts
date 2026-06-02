import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { copyFile, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { availableParallelism } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectStaticImportReferences,
  collectTopLevelValueExportNames,
  formatDiagnostic,
  hasModuleDirective,
  transform,
} from "@reckona/mreact-compiler";
import { transformCompilerModuleContext } from "@reckona/mreact-compiler/internal";
import type { ServerOutputMode } from "@reckona/mreact-compiler";
import {
  compilerModuleContextForSource,
  collectClientRouteReferences,
  createClientRouteInferenceCache,
  detectClientNavigationHint,
  formatClientRouteInferenceDiagnostic,
  inferClientRouteModule,
  resolveNavigationRuntime,
  type ClientRouteManifestEntry,
  type ClientRouteInferenceCache,
} from "./client-route-inference.js";
import {
  buildClientRouteBatchOutput,
  buildNavigationRuntimeBundle,
  clientScriptForPath,
  routeIdForPath,
  type BuildClientRouteOutputOptions,
} from "./navigation-runtime.js";
import {
  bundleAppRouterSourceModule,
  fileImportMetaUrlPlugin,
  importAppRouterSourceModule,
} from "./module-runner.js";
import { scanAppRoutes } from "./routes.js";
import type { AppRoute } from "./routes.js";
import {
  appFileConventionForRootFilename,
} from "./file-conventions.js";
import {
  resolveAppRouterProjectOptions,
  resolveBuildTargets,
  type AppRouterProjectOptions,
  type AppRouterBuildTarget,
  type AppRouterClientSourceMapMode,
  type ResolvedAppRouterProject,
} from "./config.js";
import type { ModuleMetadata } from "@reckona/mreact-compiler";
import type { RouteCachePolicy } from "./cache.js";
import { routeCachePolicyFromSource } from "./cache.js";
import { bundleMiddlewareModuleCode, renderAppRequest } from "./render.js";
import { createAppRouterImportPolicyPlugin, type AppRouterImportPolicy } from "./import-policy.js";
import {
  hasGenerateStaticParamsExport,
  hasLoaderExport,
  hasPrerenderExport,
  isStreamRouteSource,
  routeClosureMayUseAwaitBoundary,
  stripRouteBuildExports,
  stripRouteClientOnlyExports,
  stripRouteClientSource,
  stripRouteLoaderOnlyExports,
  stripRouteMetadataOnlyExports,
  stripRouteRequestOnlyExports,
} from "./route-source.js";
import {
  bundleRouterModule,
  bundleRouterModules,
  type RouterCompatPlugin,
  type RouterBundleChunkOutput,
  type RouterBundleOutput,
} from "./bundle-pipeline.js";
import { collectRouteCssFilesFromSources } from "./route-styles.js";
import { existingRouteShellCandidates } from "./route-shells.js";
import { sourceModuleCandidates } from "./source-modules.js";
import { collectBuildInferredServerActions } from "./server-action-inference.js";
import { vitePluginsCacheKey } from "./vite-plugin-cache-key.js";
import { workspacePackageFile } from "./workspace-packages.js";
import type { PluginOption, UserConfig } from "vite";

const nativeEscapeTransform = {
  batchImportName: "escapeHtmlBatch",
  batchImportSource: "@reckona/mreact-router/native-escape",
} as const;

const defaultBuildConcurrency = Math.max(1, Math.min(2, availableParallelism()));
const serverArtifactFilesystemConcurrency = 2;

type ServerTransformOutput = ReturnType<typeof transform>;
type ServerTransformCache = Map<string, Promise<ServerTransformOutput>>;

export interface BuildAppOptions extends AppRouterProjectOptions {
  onBuildPhaseTiming?: ((timing: BuildAppPhaseTiming) => void) | undefined;
  outDir: string;
  targets?: readonly AppRouterBuildTarget[] | undefined;
  viteConfig?: Pick<UserConfig, "define" | "plugins"> | undefined;
}

export type BuildAppPhase =
  | "scan"
  | "collectFiles"
  | "analyzeSources"
  | "validate"
  | "prepareOutput"
  | "publicAssets"
  | "serverActionManifest"
  | "serverModules"
  | "importPolicy"
  | "serverModuleArtifacts"
  | "clientBundles"
  | "navigationRuntime"
  | "prerender"
  | "cloudflare"
  | "writeManifests"
  | "adapterArtifacts";

export interface BuildAppPhaseTiming {
  ms: number;
  phase: BuildAppPhase;
}

export interface BuildAppResult {
  routes: AppRoute[];
}

export interface BuiltImportPolicyArtifact {
  byRoute: Record<string, string[]>;
  runtimePackages: string[];
  version: 1;
}

export interface AwsLambdaArtifactManifest {
  files: Array<{ bytes: number; path: string }>;
  handler: string;
  runtime: "aws-lambda";
  totalBytes: number;
  version: 1;
}

export interface CloudflarePagesArtifactManifest {
  files: Array<{ bytes: number; path: string }>;
  runtime: "cloudflare-pages";
  totalBytes: number;
  version: 1;
  worker: "_worker.js";
}

export interface PackageAwsLambdaArtifactOptions {
  fromDir: string;
  handlerEntry?: string | undefined;
  outDir: string;
  skipRuntimeDependencyCheck?: boolean | undefined;
}

export interface PackageCloudflarePagesArtifactOptions {
  fromDir: string;
  outDir: string;
}

export interface BuiltServerManifest {
  allowedSourceDirs?: readonly string[];
  assetBaseUrl?: string;
  version: 1;
  files: Record<string, string>;
  prerenderedRoutes?: Record<string, BuiltPrerenderedRoute>;
  publicAssetBaseUrl?: string;
  routesDir?: string;
  routeServerActionReferences?: Record<string, BuiltServerActionExpressionReference[]>;
  serverActionManifest?: BuiltServerActionReference[];
  serverModuleFiles?: Record<string, string>;
  serverModuleRenderFiles?: Record<string, string>;
  serverModuleRequestFiles?: Record<string, string>;
  routes: AppRoute[];
  serverModules?: Record<string, BuiltServerModuleArtifact>;
}

export interface BuiltServerActionReference {
  exportName: string;
  inferred?: boolean;
  moduleId: string;
}

export interface BuiltServerActionExpressionReference {
  end: number;
  exportName: string;
  expression: string;
  expressionEnd: number;
  expressionStart: number;
  inferred: boolean;
  moduleId: string;
  sourceHash: string;
  start: number;
}

export interface BuiltServerModuleArtifact {
  analysis?: BuiltRouteSourceAnalysisSummary;
  loader?: BuiltServerModuleOutput;
  routeMetadata?: BuiltServerModuleOutput;
  request?: BuiltServerModuleOutput;
  stream?: BuiltServerModuleOutput;
  string?: BuiltServerModuleOutput;
}

export interface BuiltRouteSourceAnalysisSummary {
  authIncludesClaims: boolean;
  cachePolicy?: RouteCachePolicy | undefined;
  clientBoundaryImports: readonly string[];
  clientRoute: boolean;
  hasLoader: boolean;
  routeCode: string;
  routePath: string;
  sourceHash: string;
  streamRoute: boolean;
  usesRuntimeCacheControl: boolean;
}

interface BuildSourceAnalysis {
  authIncludesClaims: boolean;
  cachePolicy?: RouteCachePolicy | undefined;
  hasGenerateStaticParams: boolean;
  hasLoader: boolean;
  hasMetadata: boolean;
  hasPrerender: boolean;
  source: string;
  sourceHash: string;
  usesRuntimeCacheControl: boolean;
}

interface BuildRouteSourceAnalysis extends BuildSourceAnalysis {
  clientBoundaryImports: readonly string[];
  clientRoute: boolean;
  file: string;
  route: AppRoute & { kind: "page" };
  routeCode: string;
  streamRoute: boolean;
}

interface BuildSourceAnalysisScope {
  byFile: ReadonlyMap<string, BuildSourceAnalysis>;
  byRouteFile: ReadonlyMap<string, BuildRouteSourceAnalysis>;
}

export interface BuiltServerModuleOutput {
  bundleCode?: string;
  code: string;
  metadata?: ModuleMetadata;
  moduleFile?: string;
  sourceHash: string;
}

export interface BuiltPrerenderedRoute {
  headers: Record<string, string>;
  html: string;
  status: number;
}

type StaticParams = Record<string, string | number | boolean | readonly string[]>;

export async function buildApp(options: BuildAppOptions): Promise<BuildAppResult> {
  const timingSink = options.onBuildPhaseTiming;
  const project = resolveAppRouterProjectOptions(options);
  const buildTargets = resolveBuildTargets(options.targets ?? project.buildTargets);
  const shouldBuildCloudflare = buildTargets.includes("cloudflare");
  const shouldBuildAwsLambda = buildTargets.includes("aws-lambda");
  const routes =
    timingSink === undefined
      ? await scanAppRoutes({ appDir: project.routesDir })
      : await timeBuildPhase(timingSink, "scan", () =>
          scanAppRoutes({ appDir: project.routesDir }),
        );
  const viteDefine = options.viteConfig?.define;
  const vitePlugins = options.viteConfig?.plugins;
  const files =
    timingSink === undefined
      ? await collectBuildFiles(project.projectRoot, project.allowedSourceDirs, project.routesDir)
      : await timeBuildPhase(timingSink, "collectFiles", () =>
          collectBuildFiles(project.projectRoot, project.allowedSourceDirs, project.routesDir),
        );
  const serverClientRouteInferenceCache = createClientRouteInferenceCache();
  const serverTransformCache: ServerTransformCache = new Map();
  const serverDir = join(options.outDir, "server");
  const clientDir = join(options.outDir, "client");
  const cloudflareDir = join(options.outDir, "cloudflare");
  const sourceAnalysis =
    timingSink === undefined
      ? await analyzeBuildRouteSources({
          clientRouteInferenceCache: serverClientRouteInferenceCache,
          files,
          project,
          projectRoot: project.projectRoot,
          routes,
          vitePlugins,
        })
      : await timeBuildPhase(timingSink, "analyzeSources", () =>
          analyzeBuildRouteSources({
            clientRouteInferenceCache: serverClientRouteInferenceCache,
            files,
            project,
            projectRoot: project.projectRoot,
            routes,
            vitePlugins,
          }),
        );

  if (timingSink === undefined) {
    await validateProductionRoutes({
      clientRouteInferenceCache: serverClientRouteInferenceCache,
      files,
      project,
      projectRoot: project.projectRoot,
      routes,
      sourceAnalysis,
      serverTransformCache,
      vitePlugins,
    });
  } else {
    await timeBuildPhase(timingSink, "validate", () =>
      validateProductionRoutes({
        clientRouteInferenceCache: serverClientRouteInferenceCache,
        files,
        project,
        projectRoot: project.projectRoot,
        routes,
        sourceAnalysis,
        serverTransformCache,
        vitePlugins,
      }),
    );
  }

  if (timingSink === undefined) {
    await rm(options.outDir, { force: true, recursive: true });
    await Promise.all([
      mkdir(serverDir, { recursive: true }),
      mkdir(clientDir, { recursive: true }),
      ...(shouldBuildCloudflare ? [mkdir(cloudflareDir, { recursive: true })] : []),
      mkdir(join(clientDir, ".vite"), { recursive: true }),
      mkdir(join(clientDir, "assets", "routes"), { recursive: true }),
    ]);
  } else {
    await timeBuildPhase(timingSink, "prepareOutput", async () => {
      await rm(options.outDir, { force: true, recursive: true });
      await Promise.all([
        mkdir(serverDir, { recursive: true }),
        mkdir(clientDir, { recursive: true }),
        ...(shouldBuildCloudflare ? [mkdir(cloudflareDir, { recursive: true })] : []),
        mkdir(join(clientDir, ".vite"), { recursive: true }),
        mkdir(join(clientDir, "assets", "routes"), { recursive: true }),
      ]);
    });
  }

  const publicAssets =
    timingSink === undefined
      ? await buildPublicAssetManifest(project, clientDir)
      : await timeBuildPhase(timingSink, "publicAssets", () =>
          buildPublicAssetManifest(project, clientDir),
        );

  const clientRouteInferenceCache = createClientRouteInferenceCache();
  const [serverActionManifest, serverModules, generatedImportPolicy] = await Promise.all([
    timingSink === undefined
      ? collectBuildServerActionManifest({
          files,
          projectRoot: project.projectRoot,
          routes,
          routesDir: project.routesDir,
        })
      : timeBuildPhase(timingSink, "serverActionManifest", () =>
          collectBuildServerActionManifest({
            files,
            projectRoot: project.projectRoot,
            routes,
            routesDir: project.routesDir,
          }),
        ),
    timingSink === undefined
      ? buildServerModuleArtifacts({
          bundleCache: new Map(),
          clientRouteInferenceCache: serverClientRouteInferenceCache,
          files,
          prebundleServerComponents: buildTargets.includes("node") || shouldBuildAwsLambda,
          project,
          projectRoot: project.projectRoot,
          routes,
          sourceAnalysis,
          serverTransformCache,
          vitePlugins,
        })
      : timeBuildPhase(timingSink, "serverModules", () =>
          buildServerModuleArtifacts({
            bundleCache: new Map(),
            clientRouteInferenceCache: serverClientRouteInferenceCache,
            files,
            prebundleServerComponents: buildTargets.includes("node") || shouldBuildAwsLambda,
            project,
            projectRoot: project.projectRoot,
            routes,
            sourceAnalysis,
            serverTransformCache,
            vitePlugins,
          }),
        ),
    timingSink === undefined
      ? buildGeneratedImportPolicy({
          files,
          projectRoot: project.projectRoot,
          routes,
          routesDir: project.routesDir,
        })
      : timeBuildPhase(timingSink, "importPolicy", () =>
          buildGeneratedImportPolicy({
            files,
            projectRoot: project.projectRoot,
            routes,
            routesDir: project.routesDir,
          }),
        ),
  ]);
  const serverRoutes = routes.map((route) => ({
    ...route,
    file: relative(project.projectRoot, route.file),
  }));
  const [serverModuleArtifacts, clientBundle] = await Promise.all([
    timingSink === undefined
      ? writeServerModuleArtifactFiles(serverDir, serverModules, generatedImportPolicy.runtimePackages)
      : timeBuildPhase(timingSink, "serverModuleArtifacts", () =>
          writeServerModuleArtifactFiles(
            serverDir,
            serverModules,
            generatedImportPolicy.runtimePackages,
          ),
        ),
    timingSink === undefined
      ? writeClientRouteBundles({
          appDir: project.routesDir,
          assetBaseUrl: project.assetBaseUrl,
          clientDir,
          clientConsolePureFunctions: project.clientConsolePureFunctions,
          clientRouteInferenceCache,
          projectRoot: project.projectRoot,
          routes,
          sourceAnalysis,
          sourceMapDir: join(options.outDir, "source-maps", "client"),
          sourceMaps: project.clientSourceMaps,
          vitePlugins,
        })
      : timeBuildPhase(timingSink, "clientBundles", () =>
          writeClientRouteBundles({
            appDir: project.routesDir,
            assetBaseUrl: project.assetBaseUrl,
            clientDir,
            clientConsolePureFunctions: project.clientConsolePureFunctions,
            clientRouteInferenceCache,
            projectRoot: project.projectRoot,
            routes,
            sourceAnalysis,
            sourceMapDir: join(options.outDir, "source-maps", "client"),
            sourceMaps: project.clientSourceMaps,
            vitePlugins,
          }),
        ),
  ]);
  const clientRoutes = clientBundle.routes;
  const navigationRuntimeScript = clientRoutes.some(
    (route) => route.navigation === true && !route.client,
  )
    ? timingSink === undefined
      ? await writeNavigationRuntimeBundle(clientDir, project.clientConsolePureFunctions)
      : await timeBuildPhase(timingSink, "navigationRuntime", () =>
          writeNavigationRuntimeBundle(clientDir, project.clientConsolePureFunctions),
        )
    : undefined;
  const clientManifestRoutes =
    navigationRuntimeScript === undefined
      ? clientRoutes
      : clientRoutes.map((route) =>
          route.navigation === true && !route.client
            ? { ...route, navigationScript: navigationRuntimeScript }
            : route,
        );
  const clientManifestAssets = Array.from(
    new Set([
      ...clientBundle.assets,
      ...(navigationRuntimeScript === undefined ? [] : [navigationRuntimeScript]),
    ]),
  ).sort();
  const prerenderedRoutes =
    timingSink === undefined
      ? await prerenderStaticRoutes({
          appDir: project.routesDir,
          assetBaseUrl: project.assetBaseUrl,
          clientRoutes: clientManifestRoutes,
          project,
          routes,
          serverModules,
          sourceAnalysis,
          vitePlugins,
        })
      : await timeBuildPhase(timingSink, "prerender", () =>
          prerenderStaticRoutes({
            appDir: project.routesDir,
            assetBaseUrl: project.assetBaseUrl,
            clientRoutes: clientManifestRoutes,
            project,
            routes,
            serverModules,
            sourceAnalysis,
            vitePlugins,
          }),
        );
  let cloudflareRouteModules: CloudflareRouteModulesOutput | undefined;
  if (shouldBuildCloudflare) {
    cloudflareRouteModules =
      timingSink === undefined
        ? await writeCloudflareRouteModules({
            cloudflareDir,
            define: viteDefine,
            files,
            prerenderedRoutes,
            projectRoot: project.projectRoot,
            routesDir: project.routesDir,
            routes,
            serverModules,
            sourceAnalysis,
            vitePlugins,
          })
        : await timeBuildPhase(timingSink, "cloudflare", () =>
            writeCloudflareRouteModules({
              cloudflareDir,
              define: viteDefine,
              files,
              prerenderedRoutes,
              projectRoot: project.projectRoot,
              routesDir: project.routesDir,
              routes,
              serverModules,
              sourceAnalysis,
              vitePlugins,
            }),
          );
  }

  const routeServerActionReferences = Object.fromEntries(
    [...serverActionManifest.routeReferences.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  const serverManifest = {
    allowedSourceDirs: project.allowedSourceDirs.map((directory) =>
      relative(project.projectRoot, directory),
    ),
    ...(project.assetBaseUrl === undefined ? {} : { assetBaseUrl: project.assetBaseUrl }),
    version: 1,
    routes: serverRoutes,
    routesDir: relative(project.projectRoot, project.routesDir),
    files,
    prerenderedRoutes,
    ...(project.publicAssetBaseUrl === undefined
      ? {}
      : { publicAssetBaseUrl: project.publicAssetBaseUrl }),
    ...(Object.keys(routeServerActionReferences).length === 0
      ? {}
      : { routeServerActionReferences }),
    ...(serverActionManifest.allowedActions.length === 0
      ? {}
      : { serverActionManifest: serverActionManifest.allowedActions }),
    ...(Object.keys(serverModuleArtifacts.files).length === 0
      ? {}
      : { serverModuleFiles: serverModuleArtifacts.files }),
    ...(Object.keys(serverModuleArtifacts.requestFiles).length === 0
      ? {}
      : { serverModuleRequestFiles: serverModuleArtifacts.requestFiles }),
    ...(Object.keys(serverModuleArtifacts.renderFiles).length === 0
      ? {}
      : { serverModuleRenderFiles: serverModuleArtifacts.renderFiles }),
  } satisfies BuiltServerManifest;
  const clientManifest = {
    ...(clientManifestAssets.length === 0 ? {} : { assets: clientManifestAssets }),
    ...(publicAssets.length === 0 ? {} : { publicAssets }),
    routes: clientManifestRoutes,
  };
  const writeManifestFiles = async () => {
    await Promise.all([
      writeFile(join(serverDir, "manifest.json"), JSON.stringify(serverManifest, null, 2)),
      writeFile(
        join(serverDir, "import-policy.json"),
        JSON.stringify(generatedImportPolicy, null, 2),
      ),
      writeFile(join(clientDir, "manifest.json"), JSON.stringify(clientManifest, null, 2)),
      writeFile(
        join(clientDir, ".vite", "manifest.json"),
        JSON.stringify(viteManifestFromClientRoutes(clientManifestRoutes), null, 2),
      ),
    ]);
  };
  if (timingSink === undefined) {
    await writeManifestFiles();
  } else {
    await timeBuildPhase(timingSink, "writeManifests", writeManifestFiles);
  }

  if (timingSink === undefined) {
    await Promise.all([
      ...(shouldBuildAwsLambda ? [writeAwsLambdaHandlerArtifact(options.outDir)] : []),
      ...(shouldBuildCloudflare
        ? [
            writeCloudflareWorkerArtifact({
              cloudflareDir,
              clientManifest,
              modulesFile: cloudflareRouteModules?.registryFile ?? "route-modules.mjs",
              serverManifest,
            }),
          ]
        : []),
    ]);
  } else {
    await timeBuildPhase(timingSink, "adapterArtifacts", async () => {
      await Promise.all([
        ...(shouldBuildAwsLambda ? [writeAwsLambdaHandlerArtifact(options.outDir)] : []),
        ...(shouldBuildCloudflare
          ? [
              writeCloudflareWorkerArtifact({
                cloudflareDir,
                clientManifest,
                modulesFile: cloudflareRouteModules?.registryFile ?? "route-modules.mjs",
                serverManifest,
              }),
            ]
          : []),
      ]);
    });
  }

  return { routes };
}

async function timeBuildPhase<T>(
  sink: (timing: BuildAppPhaseTiming) => void,
  phase: BuildAppPhase,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();

  try {
    return await run();
  } finally {
    sink({
      ms: roundBuildPhaseMs(performance.now() - startedAt),
      phase,
    });
  }
}

function roundBuildPhaseMs(value: number): number {
  return Math.round(value * 100) / 100;
}

async function mapWithBuildConcurrency<T, R>(
  items: readonly T[],
  map: (item: T, index: number) => Promise<R>,
  concurrency = defaultBuildConcurrency,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = [];
  results.length = items.length;
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await map(items[index] as T, index);
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      await runWorker();
    }),
  );

  return results;
}

export async function __mapWithBuildConcurrencyForTests<T, R>(
  items: readonly T[],
  map: (item: T, index: number) => Promise<R>,
  concurrency?: number,
): Promise<R[]> {
  return await mapWithBuildConcurrency(items, map, concurrency);
}

async function analyzeBuildRouteSources(options: {
  clientRouteInferenceCache: ClientRouteInferenceCache;
  files: Record<string, string>;
  project: ResolvedAppRouterProject;
  projectRoot: string;
  routes: readonly AppRoute[];
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<BuildSourceAnalysisScope> {
  const byFile = new Map<string, BuildSourceAnalysis>();

  for (const [file, source] of Object.entries(options.files)) {
    byFile.set(file, analyzeBuildSource(source, join(options.projectRoot, file)));
  }

  const routeAnalyses = await mapWithBuildConcurrency(
    options.routes.filter((route): route is AppRoute & { kind: "page" } => route.kind === "page"),
    async (route) => {
      const file = relative(options.projectRoot, route.file).split(sep).join("/");
      const source = options.files[file];

      if (source === undefined) {
        return undefined;
      }

      const routeCode = stripRouteBuildExports(source, route.file);
      const clientInference = await inferClientRouteModule({
        appDir: options.project.routesDir,
        cache: options.clientRouteInferenceCache,
        code: stripRouteClientSource({ code: source, filename: route.file }),
        filename: route.file,
        routePath: route.path,
        vitePlugins: options.vitePlugins,
      });

      for (const diagnostic of clientInference.diagnostics) {
        console.warn(formatClientRouteInferenceDiagnostic(diagnostic));
      }

      return [
        file,
        {
          ...analyzeBuildSource(source, route.file),
          clientBoundaryImports: clientInference.clientBoundaryImports,
          clientRoute: clientInference.client,
          file,
          route,
          routeCode,
          streamRoute: shouldBuildRouteAsStream({
            filename: file,
            files: options.files,
            projectRoot: options.projectRoot,
            source,
          }),
        },
      ] as const;
    },
  );
  const byRouteFile = new Map<string, BuildRouteSourceAnalysis>();

  for (const entry of routeAnalyses) {
    if (entry !== undefined) {
      byRouteFile.set(entry[0], entry[1]);
    }
  }

  return { byFile, byRouteFile };
}

function analyzeBuildSource(source: string, filename: string): BuildSourceAnalysis {
  const cachePolicy = routeCachePolicyFromSource(source);
  const sourceHash = hashText(source);

  if (!isSourceModuleFile(filename)) {
    return {
      authIncludesClaims: false,
      ...(cachePolicy === undefined ? {} : { cachePolicy }),
      hasGenerateStaticParams: false,
      hasLoader: false,
      hasMetadata: false,
      hasPrerender: false,
      source,
      sourceHash,
      usesRuntimeCacheControl: usesRuntimeCacheControl(source),
    };
  }

  return {
    authIncludesClaims: authIncludesClaims(source),
    ...(cachePolicy === undefined ? {} : { cachePolicy }),
    hasGenerateStaticParams: hasGenerateStaticParamsExport(source, filename),
    hasLoader: hasLoaderExport(source, filename),
    hasMetadata: hasMetadataExport(source),
    hasPrerender: hasPrerenderExport(source, filename),
    source,
    sourceHash,
    usesRuntimeCacheControl: usesRuntimeCacheControl(source),
  };
}

function buildSourceAnalysisForFile(
  sourceAnalysis: BuildSourceAnalysisScope,
  projectRoot: string,
  file: string,
): BuildSourceAnalysis | undefined {
  return sourceAnalysis.byFile.get(relative(projectRoot, file).split(sep).join("/"));
}

async function buildPublicAssetManifest(
  project: ResolvedAppRouterProject,
  clientDir: string,
): Promise<string[]> {
  const [publicAssetPaths, appConventionPublicAssets] = await Promise.all([
    collectPublicAssetPaths(project.publicDir),
    copyAppFileConventionAssets(project.routesDir, clientDir),
    copyPublicAssets(project.publicDir, join(clientDir, "public")),
    copyPublicAssets(project.publicDir, clientDir),
  ]);

  return [...new Set([...publicAssetPaths, ...appConventionPublicAssets])].sort();
}

async function writeServerModuleArtifactFiles(
  serverDir: string,
  serverModules: Record<string, BuiltServerModuleArtifact>,
  portableRuntimePackages: readonly string[] = [],
): Promise<{
  files: Record<string, string>;
  renderFiles: Record<string, string>;
  requestFiles: Record<string, string>;
}> {
  const files: Record<string, string> = {};
  const renderFiles: Record<string, string> = {};
  const requestFiles: Record<string, string> = {};
  const modulesDir = join(serverDir, "server-modules");
  const artifactEntries = Object.entries(serverModules);
  type WrittenServerModuleArtifact =
    | { artifactFile: string; file: string }
    | { file: string; renderArtifactFile: string; requestArtifactFile: string };

  await Promise.all([
    mkdir(modulesDir, { recursive: true }),
    mkdir(join(modulesDir, "code"), { recursive: true }),
    mkdir(join(modulesDir, "request"), { recursive: true }),
    mkdir(join(modulesDir, "render"), { recursive: true }),
  ]);

  const writtenArtifacts = await mapWithBuildConcurrency<
    [string, BuiltServerModuleArtifact],
    WrittenServerModuleArtifact
  >(
    artifactEntries,
    async ([file, artifact]) => {
      const externalized = await externalizeServerModuleArtifactCode(
        serverDir,
        artifact,
        portableRuntimePackages,
      );
      const requestArtifact = requestServerModuleArtifact(externalized);
      const renderArtifact = renderServerModuleArtifact(externalized);

      if (Object.keys(requestArtifact).length > 0 && Object.keys(renderArtifact).length > 0) {
        const requestJson = JSON.stringify(requestArtifact);
        const requestArtifactFile = `server-modules/request/${hashText(`${file}\0request\0${requestJson}`).slice(0, 16)}.json`;
        await writeFile(join(serverDir, requestArtifactFile), requestJson);

        const renderJson = JSON.stringify(renderArtifact);
        const renderArtifactFile = `server-modules/render/${hashText(`${file}\0render\0${renderJson}`).slice(0, 16)}.json`;
        await writeFile(join(serverDir, renderArtifactFile), renderJson);

        return { file, renderArtifactFile, requestArtifactFile };
      }

      const json = JSON.stringify(externalized);
      const artifactFile = `server-modules/${hashText(`${file}\0${json}`).slice(0, 16)}.json`;

      await writeFile(join(serverDir, artifactFile), json);
      return { artifactFile, file };
    },
    serverArtifactFilesystemConcurrency,
  );

  for (const artifact of writtenArtifacts) {
    if ("requestArtifactFile" in artifact) {
      requestFiles[artifact.file] = artifact.requestArtifactFile;
      renderFiles[artifact.file] = artifact.renderArtifactFile;
      continue;
    }

    files[artifact.file] = artifact.artifactFile;
  }

  return { files, renderFiles, requestFiles };
}

export async function __writeServerModuleArtifactFilesForTests(
  serverDir: string,
  serverModules: Record<string, BuiltServerModuleArtifact>,
): Promise<{
  files: Record<string, string>;
  renderFiles: Record<string, string>;
  requestFiles: Record<string, string>;
}> {
  return await writeServerModuleArtifactFiles(serverDir, serverModules);
}

async function externalizeServerModuleArtifactCode(
  serverDir: string,
  artifact: BuiltServerModuleArtifact,
  portableRuntimePackages: readonly string[],
): Promise<BuiltServerModuleArtifact> {
  return {
    ...(artifact.analysis === undefined ? {} : { analysis: artifact.analysis }),
    ...(artifact.loader === undefined
      ? {}
      : {
          loader: await externalizeServerModuleOutputCode(
            serverDir,
            artifact.loader,
            "code",
            portableRuntimePackages,
          ),
        }),
    ...(artifact.routeMetadata === undefined
      ? {}
      : {
          routeMetadata: await externalizeServerModuleOutputCode(
            serverDir,
            artifact.routeMetadata,
            "code",
            portableRuntimePackages,
          ),
        }),
    ...(artifact.request === undefined
      ? {}
      : {
          request: await externalizeServerModuleOutputCode(
            serverDir,
            artifact.request,
            "code",
            portableRuntimePackages,
          ),
        }),
    ...(artifact.stream === undefined
      ? {}
      : {
          stream: await externalizeServerModuleOutputCode(
            serverDir,
            artifact.stream,
            "bundle",
            portableRuntimePackages,
          ),
        }),
    ...(artifact.string === undefined
      ? {}
      : {
          string: await externalizeServerModuleOutputCode(
            serverDir,
            artifact.string,
            "bundle",
            portableRuntimePackages,
          ),
        }),
  };
}

async function externalizeServerModuleOutputCode(
  serverDir: string,
  output: BuiltServerModuleOutput,
  kind: "bundle" | "code",
  portableRuntimePackages: readonly string[],
): Promise<BuiltServerModuleOutput> {
  const sourceCode = kind === "bundle" ? output.bundleCode : output.code;
  const moduleCode =
    sourceCode === undefined
      ? undefined
      : rewritePortableRuntimePackageImports(sourceCode, portableRuntimePackages);

  if (moduleCode === undefined || moduleCode.length === 0) {
    return output;
  }

  const moduleFile = `server-modules/code/${hashText(moduleCode).slice(0, 16)}.mjs`;
  await writeFile(join(serverDir, moduleFile), moduleCode);

  return {
    code: kind === "code" ? "" : output.code,
    ...(output.metadata === undefined ? {} : { metadata: output.metadata }),
    moduleFile,
    sourceHash: output.sourceHash,
  };
}

function rewritePortableRuntimePackageImports(
  code: string,
  runtimePackages: readonly string[],
): string {
  if (runtimePackages.length === 0 || !code.includes("file://")) {
    return code;
  }

  return code.replace(
    /\b(from\s+|import\s*)["'](?<specifier>file:\/\/[^"']+)["']/gu,
    (match, prefix: string, specifier: string | undefined) => {
      const packageName =
        specifier === undefined ? undefined : runtimePackageForFileUrl(specifier, runtimePackages);

      return packageName === undefined ? match : `${prefix}"${packageName}"`;
    },
  );
}

function runtimePackageForFileUrl(
  specifier: string,
  runtimePackages: readonly string[],
): string | undefined {
  let filePath: string;

  try {
    filePath = fileURLToPath(specifier).split(sep).join("/");
  } catch {
    return undefined;
  }

  return [...runtimePackages]
    .sort((left, right) => right.length - left.length)
    .find((packageName) => filePath.includes(`/node_modules/${packageName}/`));
}

function requestServerModuleArtifact(
  artifact: BuiltServerModuleArtifact,
): BuiltServerModuleArtifact {
  return {
    ...(artifact.analysis === undefined ? {} : { analysis: artifact.analysis }),
    ...(artifact.loader === undefined ? {} : { loader: artifact.loader }),
    ...(artifact.routeMetadata === undefined ? {} : { routeMetadata: artifact.routeMetadata }),
    ...(artifact.request === undefined ? {} : { request: artifact.request }),
  };
}

function renderServerModuleArtifact(
  artifact: BuiltServerModuleArtifact,
): BuiltServerModuleArtifact {
  return {
    ...(artifact.stream === undefined ? {} : { stream: artifact.stream }),
    ...(artifact.string === undefined ? {} : { string: artifact.string }),
  };
}

const nodeBuiltinPackages = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const frameworkRuntimePackages = new Set([
  "@reckona/mreact",
  "@reckona/mreact-auth",
  "@reckona/mreact-compiler",
  "@reckona/mreact-query",
  "@reckona/mreact-reactive-core",
  "@reckona/mreact-router",
  "@reckona/mreact-server",
]);
const maxRuntimePackageManifestReads = 1000;

async function buildGeneratedImportPolicy(options: {
  files: Record<string, string>;
  projectRoot: string;
  routes: readonly AppRoute[];
  routesDir: string;
}): Promise<BuiltImportPolicyArtifact> {
  const routePackages = new Map<string, string[]>();
  const allPackages = new Set<string>();
  const relativeRoutesDir = relative(options.projectRoot, options.routesDir);
  const packageJsonLookupCache = new Map<
    string,
    Promise<(RuntimePackageManifest & { packageJsonPath: string }) | undefined>
  >();

  for (const route of options.routes) {
    const file = relative(options.projectRoot, route.file);
    const packages = await collectRuntimePackagesForFile({
      file,
      files: options.files,
      packageJsonLookupCache,
      projectRoot: options.projectRoot,
      seen: new Set(),
    });

    if (packages.length > 0) {
      routePackages.set(route.path, packages);
      for (const packageName of packages) {
        allPackages.add(packageName);
      }
    }
  }

  const middlewareFile = ["middleware.ts", "middleware.mreact.ts"]
    .map((file) => (relativeRoutesDir === "" ? file : `${relativeRoutesDir}/${file}`))
    .find((file) => options.files[file] !== undefined);

  if (middlewareFile !== undefined) {
    const packages = await collectRuntimePackagesForFile({
      file: middlewareFile,
      files: options.files,
      packageJsonLookupCache,
      projectRoot: options.projectRoot,
      seen: new Set(),
    });

    if (packages.length > 0) {
      routePackages.set("middleware", packages);
      for (const packageName of packages) {
        allPackages.add(packageName);
      }
    }
  }

  return {
    byRoute: Object.fromEntries(
      [...routePackages.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ),
    runtimePackages: [...allPackages].sort(),
    version: 1,
  };
}

async function collectRuntimePackagesForFile(options: {
  file: string;
  files: Record<string, string>;
  packageJsonLookupCache: RuntimePackageManifestCache;
  projectRoot: string;
  seen: Set<string>;
}): Promise<string[]> {
  if (options.seen.has(options.file)) {
    return [];
  }

  const source = options.files[options.file];
  if (
    source === undefined ||
    hasModuleDirective({
      code: source,
      directive: "use client",
      filename: join(options.projectRoot, options.file),
    })
  ) {
    return [];
  }

  options.seen.add(options.file);
  const packages = new Set<string>();

  for (const reference of collectStaticImportReferences({
    code: source,
    filename: join(options.projectRoot, options.file),
  })) {
    if (isRuntimePackageSpecifier(reference.source)) {
      const packageName = runtimePackageNameForSpecifier(reference.source);
      packages.add(packageName);
      for (const optionalPackageName of await collectRuntimeOptionalPackages({
        packageJsonLookupCache: options.packageJsonLookupCache,
        packageName,
        projectRoot: options.projectRoot,
      })) {
        packages.add(optionalPackageName);
      }
      continue;
    }

    const localFile = resolveBuildLocalSourceImport(options.files, options.file, reference.source);
    if (localFile === undefined) {
      continue;
    }

    for (const packageName of await collectRuntimePackagesForFile({
      ...options,
      file: localFile,
    })) {
      packages.add(packageName);
    }
  }

  options.seen.delete(options.file);

  return [...packages].sort();
}

interface RuntimePackageManifest {
  dependencies?: Record<string, unknown> | undefined;
  optionalDependencies?: Record<string, unknown> | undefined;
}

type RuntimePackageManifestCache = Map<
  string,
  Promise<(RuntimePackageManifest & { packageJsonPath: string }) | undefined>
>;

async function collectRuntimeOptionalPackages(options: {
  packageJsonLookupCache: RuntimePackageManifestCache;
  packageName: string;
  projectRoot: string;
}): Promise<string[]> {
  const optionalPackages = new Set<string>();
  const seenPackageJson = new Set<string>();
  const queue: Array<{ packageName: string; optional: boolean; startDir: string }> = [
    { packageName: options.packageName, optional: false, startDir: options.projectRoot },
  ];

  for (let index = 0; index < queue.length && seenPackageJson.size < maxRuntimePackageManifestReads; index += 1) {
    const item = queue[index];
    if (item === undefined || !isValidRuntimePackageName(item.packageName)) {
      continue;
    }

    const manifest = await readRuntimePackageManifest({
      cache: options.packageJsonLookupCache,
      packageName: item.packageName,
      startDir: item.startDir,
    });

    if (manifest === undefined || seenPackageJson.has(manifest.packageJsonPath)) {
      continue;
    }

    seenPackageJson.add(manifest.packageJsonPath);
    if (item.optional && isRuntimePackageName(item.packageName)) {
      optionalPackages.add(item.packageName);
    }

    const packageDir = dirname(manifest.packageJsonPath);
    for (const dependencyName of Object.keys(manifest.dependencies ?? {})) {
      if (isValidRuntimePackageName(dependencyName)) {
        queue.push({ packageName: dependencyName, optional: false, startDir: packageDir });
      }
    }

    for (const optionalDependencyName of Object.keys(manifest.optionalDependencies ?? {})) {
      if (isValidRuntimePackageName(optionalDependencyName)) {
        queue.push({ packageName: optionalDependencyName, optional: true, startDir: packageDir });
      }
    }
  }

  return [...optionalPackages].sort();
}

async function readRuntimePackageManifest(options: {
  cache: RuntimePackageManifestCache;
  packageName: string;
  startDir: string;
}): Promise<(RuntimePackageManifest & { packageJsonPath: string }) | undefined> {
  const key = `${options.startDir}\0${options.packageName}`;
  const cached = options.cache.get(key);
  const manifest =
    cached ??
    findRuntimePackageJson(options.packageName, options.startDir).then(async (packageJsonPath) => {
      if (packageJsonPath === undefined) {
        return undefined;
      }

      try {
        const json = JSON.parse(await readFile(packageJsonPath, "utf8")) as RuntimePackageManifest;
        return { ...json, packageJsonPath };
      } catch {
        return undefined;
      }
    });

  if (cached === undefined) {
    options.cache.set(key, manifest);
  }

  return (await manifest) as (RuntimePackageManifest & { packageJsonPath: string }) | undefined;
}

async function findRuntimePackageJson(
  packageName: string,
  startDir: string,
): Promise<string | undefined> {
  if (!isValidRuntimePackageName(packageName)) {
    return undefined;
  }

  let current = startDir;

  while (true) {
    const candidate = join(current, "node_modules", ...packageName.split("/"), "package.json");
    try {
      if ((await stat(candidate)).isFile()) {
        return candidate;
      }
    } catch {
      // Keep walking toward the filesystem root.
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function isRuntimePackageSpecifier(specifier: string): boolean {
  if (specifier.startsWith(".") || specifier.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier)) {
    return false;
  }

  const packageName = runtimePackageNameForSpecifier(specifier);
  return !nodeBuiltinPackages.has(specifier) && isRuntimePackageName(packageName);
}

function isRuntimePackageName(packageName: string): boolean {
  return !frameworkRuntimePackages.has(packageName);
}

function isValidRuntimePackageName(packageName: string): boolean {
  return (
    /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u.test(packageName) &&
    !packageName.includes("..")
  );
}

function runtimePackageNameForSpecifier(specifier: string): string {
  if (!specifier.startsWith("@")) {
    return specifier.split("/")[0] ?? specifier;
  }

  const [scope, name] = specifier.split("/");
  return scope !== undefined && name !== undefined ? `${scope}/${name}` : specifier;
}

async function collectBuildServerActionManifest(options: {
  files: Record<string, string>;
  projectRoot: string;
  routes: readonly AppRoute[];
  routesDir: string;
}): Promise<{
  allowedActions: BuiltServerActionReference[];
  routeReferences: Map<string, BuiltServerActionExpressionReference[]>;
}> {
  const entries = new Map<string, BuiltServerActionReference>();
  const routeReferences = new Map<string, BuiltServerActionExpressionReference[]>();
  const relativeRoutesDir = relative(options.projectRoot, options.routesDir);
  const routeSourceFiles = new Set(
    options.routes
      .filter((route) => route.kind === "page")
      .map((route) => relative(options.projectRoot, route.file).split(sep).join("/")),
  );

  for (const [file, code] of Object.entries(options.files)) {
    if (!isAppRelativeFile(file, relativeRoutesDir) || !isSourceModuleFile(file)) {
      continue;
    }

    if (hasModuleDirective({ code, directive: "use server", filename: file })) {
      const moduleId = moduleIdForBuildFile(file, relativeRoutesDir);

      for (const exportName of collectTopLevelValueExportNames({ code, filename: file })) {
        entries.set(`${moduleId}#${exportName}`, { moduleId, exportName });
      }
    }

    if (routeSourceFiles.has(file)) {
      const inference = await collectBuildInferredServerActionReferences({
        file,
        files: options.files,
        relativeRoutesDir,
        source: code,
      });

      for (const diagnostic of inference.diagnostics) {
        console.warn(formatServerActionInferenceDiagnostic(diagnostic));
      }

      routeReferences.set(file, inference.references);

      for (const reference of inference.references) {
        const key = `${reference.moduleId}#${reference.exportName}`;

        if (!entries.has(key)) {
          entries.set(key, {
            exportName: reference.exportName,
            inferred: reference.inferred,
            moduleId: reference.moduleId,
          });
        }
      }
    }
  }

  return {
    allowedActions: [...entries.values()].sort((left, right) =>
      left.moduleId === right.moduleId
        ? left.exportName.localeCompare(right.exportName)
        : left.moduleId.localeCompare(right.moduleId),
    ),
    routeReferences,
  };
}

function collectBuildInferredServerActionReferences(options: {
  file: string;
  files: Record<string, string>;
  relativeRoutesDir: string;
  source: string;
}): Promise<{
  diagnostics: { code: string; message: string }[];
  references: BuiltServerActionExpressionReference[];
}> {
  return collectBuildInferredServerActions({
    file: options.file,
    files: options.files,
    relativeRoutesDir: options.relativeRoutesDir,
    resolveSourceImport: (importer, source) =>
      resolveBuildLocalSourceImport(options.files, importer, source),
    source: options.source,
  });
}

function formatServerActionInferenceDiagnostic(diagnostic: {
  code: string;
  message: string;
}): string {
  return `${diagnostic.code}: ${diagnostic.message}`;
}

function isSourceModuleFile(file: string): boolean {
  return /\.(?:mreact\.tsx|tsx?|jsx?|mjs|mts|cjs|cts)$/.test(file);
}

function isAppRelativeFile(file: string, relativeRoutesDir: string): boolean {
  return relativeRoutesDir === "" || file === relativeRoutesDir || file.startsWith(`${relativeRoutesDir}/`);
}

function moduleIdForBuildFile(file: string, relativeRoutesDir: string): string {
  return relativeRoutesDir === "" ? file : file.slice(relativeRoutesDir.length + 1);
}

async function copyPublicAssets(publicDir: string, outDir: string): Promise<void> {
  try {
    await cp(publicDir, outDir, { force: true, recursive: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

async function collectPublicAssetPaths(publicDir: string): Promise<string[]> {
  try {
    const info = await stat(publicDir);

    if (!info.isDirectory()) {
      return [];
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const paths: string[] = [];
  await collectPublicAssetPathsInner(publicDir, "", paths);

  return paths.sort();
}

async function copyAppFileConventionAssets(
  appDir: string,
  outDir: string,
): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(appDir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const paths: string[] = [];
  await mkdir(outDir, { recursive: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const convention = appFileConventionForRootFilename(entry.name);
    if (convention === undefined || convention.kind !== "asset") {
      continue;
    }

    const outputPath = convention.path.startsWith("/")
      ? convention.path.slice(1)
      : convention.path;
    await copyFile(join(appDir, entry.name), join(outDir, outputPath));
    paths.push(convention.path);
  }

  return paths.sort();
}

async function collectPublicAssetPathsInner(
  publicDir: string,
  relativeDir: string,
  paths: string[],
): Promise<void> {
  const entries = await readdir(join(publicDir, relativeDir), { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`;

    if (entry.isDirectory()) {
      await collectPublicAssetPathsInner(publicDir, relativePath, paths);
      continue;
    }

    if (entry.isFile()) {
      paths.push(`/${relativePath}`);
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function prerenderStaticRoutes(options: {
  appDir: string;
  assetBaseUrl?: string | undefined;
  clientRoutes: readonly ClientRouteManifestEntry[];
  project: ResolvedAppRouterProject;
  routes: readonly AppRoute[];
  serverModules: Record<string, BuiltServerModuleArtifact>;
  sourceAnalysis: BuildSourceAnalysisScope;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<Record<string, BuiltPrerenderedRoute>> {
  const clientScripts = new Map(
    options.clientRoutes.flatMap((route) =>
      route.client && route.script !== undefined ? [[route.path, route.script]] : [],
    ),
  );
  const prerendered: Record<string, BuiltPrerenderedRoute> = {};
  const importPolicy = {
    allowedPackages: await readDeclaredProjectPackages(options.project.projectRoot),
    allowedSourceDirs: options.project.allowedSourceDirs,
    projectRoot: options.project.projectRoot,
  } satisfies AppRouterImportPolicy;
  const serverModuleMap = new Map(
    Object.entries(options.serverModules).map(([file, artifact]) => [
      join(options.project.projectRoot, file),
      artifact,
    ]),
  );

  const prerenderedEntries = await mapWithBuildConcurrency(
    options.routes.filter((route): route is AppRoute & { kind: "page" } => route.kind === "page"),
    async (route) => {
      const routeFile = relative(options.project.projectRoot, route.file).split(sep).join("/");
      const analysis = options.sourceAnalysis.byRouteFile.get(routeFile);

      if (analysis === undefined || !analysis.hasPrerender) {
        return [] as Array<[string, BuiltPrerenderedRoute]>;
      }

      const entries: Array<[string, BuiltPrerenderedRoute]> = [];
      for (const pathname of await prerenderPathsForRoute(route, analysis, options.vitePlugins)) {
        const response = await renderAppRequest({
          appDir: options.appDir,
          assetBaseUrl: options.assetBaseUrl,
          clientScripts,
          importPolicy,
          request: new Request(`http://mreact.local${pathname}`),
          serverModules: serverModuleMap,
          vitePlugins: options.vitePlugins,
        });
        const headers: Record<string, string> = {};

        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        entries.push([
          pathname,
          {
            headers,
            html: await response.text(),
            status: response.status,
          },
        ]);
      }
      return entries;
    },
  );

  for (const entries of prerenderedEntries) {
    for (const [pathname, route] of entries) {
      prerendered[pathname] = route;
    }
  }

  return prerendered;
}

async function prerenderPathsForRoute(
  route: AppRoute,
  analysis: BuildRouteSourceAnalysis,
  vitePlugins: readonly PluginOption[] | undefined,
): Promise<string[]> {
  if (route.segments.every((segment) => segment.kind === "static")) {
    return [route.path];
  }

  if (!analysis.hasGenerateStaticParams) {
    return [];
  }

  const module = await importAppRouterSourceModule<{
    generateStaticParams?: () => Iterable<StaticParams> | PromiseLike<Iterable<StaticParams>>;
  }>({
    code: analysis.source,
    label: `generate-static-params:${route.file}`,
    resolveDir: dirname(route.file),
    sourcefile: route.file,
    vitePlugins,
  });
  const params = await module.generateStaticParams?.();

  if (params === undefined) {
    return [];
  }

  return Array.from(params, (entry) => routePathFromParams(route, entry));
}

function routePathFromParams(route: AppRoute, params: StaticParams): string {
  const parts = route.segments.flatMap((segment) => {
    if (segment.kind === "static") {
      return [segment.value];
    }

    const value = params[segment.name];

    if (value === undefined) {
      throw new Error(`${route.file}: generateStaticParams() is missing "${segment.name}".`);
    }

    if (segment.kind === "catch-all") {
      const values = Array.isArray(value) ? value : String(value).split("/");

      return values.map((part) => encodeURIComponent(String(part)));
    }

    return [encodeURIComponent(String(value))];
  });

  return `/${parts.join("/")}`;
}

async function buildServerModuleArtifacts(options: {
  bundleCache: Map<string, Promise<RouterBundleOutput>>;
  cacheDir?: string | undefined;
  clientRouteInferenceCache: ClientRouteInferenceCache;
  files: Record<string, string>;
  prebundleServerComponents: boolean;
  project: ResolvedAppRouterProject;
  projectRoot: string;
  routes: readonly AppRoute[];
  sourceAnalysis: BuildSourceAnalysisScope;
  serverTransformCache: ServerTransformCache;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<Record<string, BuiltServerModuleArtifact>> {
  const routeByFile = new Map(
    options.routes.map((route) => [relative(options.projectRoot, route.file), route]),
  );
  const loaderArtifactFiles = new Set<string>();
  const metadataArtifactFiles = new Set<string>();
  const requestArtifactFiles = new Set<string>();
  const requestModuleImportPolicy = {
    allowedPackages: await readDeclaredProjectPackages(options.project.projectRoot),
    allowedSourceDirs: options.project.allowedSourceDirs,
    projectRoot: options.project.projectRoot,
  } satisfies AppRouterImportPolicy;
  const artifacts: Record<string, BuiltServerModuleArtifact> = {};

  for (const file of Object.keys(options.files)) {
    const absoluteFile = join(options.projectRoot, file);
    const route = routeByFile.get(file);
    const analysis = options.sourceAnalysis.byFile.get(file);

    if (isMiddlewareFile(options.project.routesDir, absoluteFile)) {
      requestArtifactFiles.add(file);
    }

    if (route?.kind === "server" || route?.kind === "metadata") {
      requestArtifactFiles.add(file);
    }

    if (route?.kind === "page" && analysis?.hasLoader === true) {
      loaderArtifactFiles.add(file);
    }

    if (isServerComponentFile(file) && analysis?.hasMetadata === true) {
      metadataArtifactFiles.add(file);
    }
  }

  const requestBatchEntries: RouteRequestModuleBatchEntry[] = [];
  for (const [file, source] of Object.entries(options.files)) {
    const absoluteFile = join(options.projectRoot, file);
    const route = routeByFile.get(file);

    if (loaderArtifactFiles.has(file)) {
      requestBatchEntries.push({
        code: stripRouteLoaderOnlyExports(source, absoluteFile),
        filename: absoluteFile,
        key: routeRequestArtifactBatchKey(file, "loader"),
        label: "Loader",
      });
    }

    if (metadataArtifactFiles.has(file)) {
      requestBatchEntries.push({
        code: stripRouteMetadataOnlyExports(source, absoluteFile),
        filename: absoluteFile,
        key: routeRequestArtifactBatchKey(file, "metadata"),
        label: "Metadata",
      });
    }

    if (
      requestArtifactFiles.has(file) &&
      !isMiddlewareFile(options.project.routesDir, absoluteFile) &&
      route?.kind !== "server" &&
      route?.kind !== "metadata"
    ) {
      requestBatchEntries.push({
        code: stripRouteRequestOnlyExports(source, absoluteFile),
        filename: absoluteFile,
        key: routeRequestArtifactBatchKey(file, "request"),
        label: "Loader",
      });
    }
  }

  const requestBatchOutputs = requestBatchEntries.length >= 3
    ? await bundleRouteRequestModuleBatchCode({
        appDir: options.project.routesDir,
        bundleCache: options.bundleCache,
        cacheDir: options.cacheDir,
        entries: requestBatchEntries,
        importPolicy: requestModuleImportPolicy,
        vitePlugins: options.vitePlugins,
      })
    : new Map<string, string>();

  const artifactEntries = await mapWithBuildConcurrency(Object.entries(options.files), async ([file, source]) => {
    const absoluteFile = join(options.projectRoot, file);
    const route = routeByFile.get(file);
    const routeAnalysis = options.sourceAnalysis.byRouteFile.get(file);
    const artifact: BuiltServerModuleArtifact = {};

    if (
      requestArtifactFiles.has(file) ||
      loaderArtifactFiles.has(file) ||
      metadataArtifactFiles.has(file)
    ) {
      if (loaderArtifactFiles.has(file)) {
        const code = requestBatchOutputs.get(routeRequestArtifactBatchKey(file, "loader")) ??
          await bundleRouteLoaderModuleCode({
            appDir: options.project.routesDir,
            bundleCache: options.bundleCache,
            cacheDir: options.cacheDir,
            code: stripRouteLoaderOnlyExports(source, absoluteFile),
            filename: absoluteFile,
            importPolicy: requestModuleImportPolicy,
            vitePlugins: options.vitePlugins,
          });
        artifact.loader = {
          code,
          sourceHash: hashText(source),
        };
      }

      if (metadataArtifactFiles.has(file)) {
        const code = requestBatchOutputs.get(routeRequestArtifactBatchKey(file, "metadata")) ??
          await bundleRouteRequestModuleCode({
            appDir: options.project.routesDir,
            bundleCache: options.bundleCache,
            cacheDir: options.cacheDir,
            code: stripRouteMetadataOnlyExports(source, absoluteFile),
            filename: absoluteFile,
            importPolicy: requestModuleImportPolicy,
            label: "Metadata",
            vitePlugins: options.vitePlugins,
          });
        artifact.routeMetadata = {
          code,
          sourceHash: hashText(source),
        };
      }

      if (requestArtifactFiles.has(file)) {
        const batchedRequestCode = requestBatchOutputs.get(
          routeRequestArtifactBatchKey(file, "request"),
        );
        artifact.request = {
          code: batchedRequestCode ??
            await buildRequestModuleArtifactCode({
              appDir: options.project.routesDir,
              bundleCache: options.bundleCache,
              cacheDir: options.cacheDir,
              filename: absoluteFile,
              importPolicy: requestModuleImportPolicy,
              routeKind: route?.kind,
              source,
              vitePlugins: options.vitePlugins,
            }),
          sourceHash: hashText(source),
        };
      }
    }

    if (!isServerComponentFile(file)) {
      return Object.keys(artifact).length > 0 ? ([file, artifact] as const) : undefined;
    }

    const closureUsesAwait = routeAnalysis?.streamRoute ??
      shouldBuildRouteAsStream({
        filename: file,
        files: options.files,
        projectRoot: options.projectRoot,
        source,
      });
    const streamRoute = route !== undefined && closureUsesAwait;
    const serverOutputs =
      streamRoute || (route === undefined && closureUsesAwait)
        ? (["stream", "string"] as const)
        : (["string"] as const);
    const code = routeAnalysis?.routeCode ??
      (route === undefined ? source : stripRouteBuildExports(source, absoluteFile));
    const clientInference = routeAnalysis === undefined
      ? await inferClientRouteModule({
          ...(route === undefined ? {} : { appDir: options.project.routesDir }),
          cache: options.clientRouteInferenceCache,
          code:
            route === undefined
              ? stripRouteClientOnlyExports(source, absoluteFile)
              : stripRouteClientSource({ code: source, filename: route.file }),
          filename: join(options.projectRoot, file),
          ...(route === undefined ? {} : { routePath: route.path }),
          vitePlugins: options.vitePlugins,
        })
      : undefined;
    const clientBoundaryImports = routeAnalysis?.clientBoundaryImports ??
      clientInference?.clientBoundaryImports ??
      [];

    for (const diagnostic of clientInference?.diagnostics ?? []) {
      console.warn(formatClientRouteInferenceDiagnostic(diagnostic));
    }

    if (routeAnalysis !== undefined) {
      artifact.analysis = builtRouteSourceAnalysisSummary({
        analysis: routeAnalysis,
      });
    }

    const serverOutputArtifacts = await mapWithBuildConcurrency(
      serverOutputs,
      async (serverOutput) => {
        const output = await transformServerRouteSource({
          cache: options.serverTransformCache,
          code,
          clientBoundaryImports,
          filename: join(options.projectRoot, file),
          moduleContextCache: options.clientRouteInferenceCache,
          serverOutput,
        });
        const fatalDiagnostics = output.diagnostics.filter(
          (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
        );

        if (fatalDiagnostics.length > 0) {
          if (
            serverOutput === "string" &&
            streamRoute &&
            route?.kind === "page" &&
            fatalDiagnostics.every(
              (diagnostic) => diagnostic.code === "MR_UNSUPPORTED_AWAIT_INNER_COMPONENT",
            )
          ) {
            return undefined;
          }

          throw new Error(
            fatalDiagnostics.map((diagnostic) => formatDiagnostic(file, diagnostic)).join("\n"),
          );
        }

        if (
          serverOutput === "string" &&
          streamRoute &&
          route?.kind === "page" &&
          source.includes("<Await") &&
          /\bLink\b/.test(source)
        ) {
          // Native Link renders pre-rendered children as HTML. Keep direct
          // Await renderers on the stream artifact so the string artifact
          // cannot drop deferred Link content before the boundary resolves.
          return undefined;
        }

        return [
          serverOutput,
          {
            ...(options.prebundleServerComponents
              ? {
                  bundleCode: await buildServerComponentBundleArtifactCode({
                    clientRouteInferenceCache: options.clientRouteInferenceCache,
                    code: output.code,
                    filename: absoluteFile,
                    root: options.projectRoot,
                    serverOutput,
                    vitePlugins: options.vitePlugins,
                  }),
                }
              : {}),
            code: output.code,
            metadata: output.metadata,
            sourceHash: hashText(code),
          },
        ] as const;
      },
    );

    for (const entry of serverOutputArtifacts) {
      if (entry !== undefined) {
        artifact[entry[0]] = entry[1];
      }
    }

    return [file, artifact] as const;
  });

  for (const entry of artifactEntries) {
    if (entry !== undefined) {
      artifacts[entry[0]] = entry[1];
    }
  }

  return artifacts;
}

async function buildServerComponentBundleArtifactCode(options: {
  clientRouteInferenceCache: ClientRouteInferenceCache;
  code: string;
  filename: string;
  root?: string | undefined;
  serverOutput: ServerOutputMode;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  return await bundleAppRouterSourceModule({
    code: options.code,
    label: `server-component:${options.filename}`,
    resolveDir: dirname(options.filename),
    root: options.root,
    serverSourceTransform: {
      clientRouteInferenceCache: options.clientRouteInferenceCache,
      dev: false,
      serverOutput: options.serverOutput,
      vitePlugins: options.vitePlugins,
    },
    sourcefile: options.filename,
    vitePlugins: options.vitePlugins,
  });
}

async function transformServerRouteSource(options: {
  cache: ServerTransformCache;
  clientBoundaryImports: readonly string[];
  code: string;
  filename: string;
  moduleContextCache: ClientRouteInferenceCache;
  serverOutput: ServerOutputMode;
}): Promise<ServerTransformOutput> {
  const cacheKey = stableCacheKey({
    clientBoundaryImports: options.clientBoundaryImports,
    codeHash: hashText(options.code),
    filename: resolve(options.filename),
    serverOutput: options.serverOutput,
    target: "server",
  });
  const cached = options.cache.get(cacheKey);

  if (cached !== undefined) {
    return await cached;
  }

  const transformed = Promise.resolve().then(async () => {
    const moduleContext = await compilerModuleContextForSource({
      cache: options.moduleContextCache,
      code: options.code,
      filename: options.filename,
    });

    return transformCompilerModuleContext({
      code: options.code,
      clientBoundaryImports: options.clientBoundaryImports,
      dev: false,
      filename: options.filename,
      moduleContext,
      serverEscape: nativeEscapeTransform,
      serverOutput: options.serverOutput,
      target: "server",
    });
  });
  options.cache.set(cacheKey, transformed);
  return await transformed;
}

function builtRouteSourceAnalysisSummary(options: {
  analysis: BuildRouteSourceAnalysis;
}): BuiltRouteSourceAnalysisSummary {
  return {
    authIncludesClaims: options.analysis.authIncludesClaims,
    ...(options.analysis.cachePolicy === undefined ? {} : { cachePolicy: options.analysis.cachePolicy }),
    clientBoundaryImports: options.analysis.clientBoundaryImports,
    clientRoute: options.analysis.clientRoute,
    hasLoader: options.analysis.hasLoader,
    routeCode: options.analysis.routeCode,
    routePath: options.analysis.route.path,
    sourceHash: options.analysis.sourceHash,
    streamRoute: options.analysis.streamRoute,
    usesRuntimeCacheControl: options.analysis.usesRuntimeCacheControl,
  };
}

function shouldBuildRouteAsStream(options: {
  filename: string;
  files: Record<string, string>;
  projectRoot: string;
  source: string;
}): boolean {
  return (
    isStreamRouteSource(
      options.source,
      sourceFilenameForBuildAnalysis(options.projectRoot, options.filename),
    ) ||
    routeClosureMayUseAwaitBoundary({
      filename: options.filename,
      files: options.files,
      projectRoot: options.projectRoot,
      source: options.source,
    })
  );
}

function sourceFilenameForBuildAnalysis(projectRoot: string, filename: string): string {
  return filename.startsWith("/") ? filename : join(projectRoot, filename);
}

function resolveBuildLocalSourceImport(
  files: Record<string, string>,
  importer: string,
  specifier: string,
): string | undefined {
  if (!specifier.startsWith(".")) {
    return undefined;
  }

  const base = join(dirname(importer), specifier);

  for (const candidate of sourceModuleCandidates(base)) {
    if (files[candidate] !== undefined) {
      return candidate;
    }
  }

  return undefined;
}

function usesRuntimeCacheControl(code: string): boolean {
  return /\bcacheControl\s*\(/.test(code);
}

function routeRequestArtifactBatchKey(file: string, kind: "loader" | "metadata" | "request"): string {
  return `${kind}:${file}`;
}

function authIncludesClaims(code: string): boolean {
  return /\bexport\s+const\s+auth\s*=\s*["']include-claims["']\s*;?/.test(code);
}

async function buildRequestModuleArtifactCode(options: {
  appDir: string;
  bundleCache: Map<string, Promise<RouterBundleOutput>>;
  cacheDir?: string | undefined;
  filename: string;
  importPolicy: AppRouterImportPolicy;
  routeKind?: AppRoute["kind"] | undefined;
  source: string;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  if (isMiddlewareFile(options.appDir, options.filename)) {
    return await bundleMiddlewareModuleCode({
      appDir: options.appDir,
      code: options.source,
      file: options.filename,
      importPolicy: options.importPolicy,
      vitePlugins: options.vitePlugins,
    });
  }

  if (options.routeKind === "server" || options.routeKind === "metadata") {
    return await bundleAppRouterSourceModule({
      code: options.source,
      label: `server-route:${options.filename}`,
      plugins: [fileImportMetaUrlPlugin()],
      resolveDir: dirname(options.filename),
      root: options.importPolicy.projectRoot,
      sourcefile: options.filename,
      vitePlugins: options.vitePlugins,
    });
  }

    return await bundleRouteLoaderModuleCode({
      appDir: options.appDir,
      bundleCache: options.bundleCache,
      cacheDir: options.cacheDir,
      code: stripRouteRequestOnlyExports(options.source, options.filename),
      filename: options.filename,
      importPolicy: options.importPolicy,
      vitePlugins: options.vitePlugins,
    });
}

async function bundleRouteLoaderModuleCode(options: {
  appDir: string;
  bundleCache?: Map<string, Promise<RouterBundleOutput>> | undefined;
  cacheDir?: string | undefined;
  code: string;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  return await bundleRouteRequestModuleCode({
    ...options,
    label: "Loader",
  });
}

async function bundleRouteRequestModuleBatchCode(options: {
  appDir: string;
  bundleCache?: Map<string, Promise<RouterBundleOutput>> | undefined;
  cacheDir?: string | undefined;
  entries: readonly RouteRequestModuleBatchEntry[];
  importPolicy?: AppRouterImportPolicy | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<Map<string, string>> {
  if (options.entries.length === 0) {
    return new Map();
  }

  if (options.entries.length === 1) {
    const entry = options.entries[0];
    if (entry === undefined) {
      return new Map();
    }

    return new Map([
      [
        entry.key,
        await bundleRouteRequestModuleCode({
          appDir: options.appDir,
          bundleCache: options.bundleCache,
          cacheDir: options.cacheDir,
          code: entry.code,
          filename: entry.filename,
          importPolicy: options.importPolicy,
          label: entry.label,
          vitePlugins: options.vitePlugins,
        }),
      ],
    ]);
  }

  const namesByKey = new Map(
    options.entries.map((entry, index) => [
      entry.key,
      `request-${index}-${hashText(entry.key).slice(0, 8)}`,
    ]),
  );
  const output = await bundleRouterModules({
    cacheDir: options.cacheDir,
    chunkFileNames: "request/chunks/[name].[hash].js",
    entries: options.entries.map((entry) => ({
      code: entry.code,
      filename: entry.filename,
      name: namesByKey.get(entry.key) ?? hashText(entry.key).slice(0, 8),
    })),
    entryFileNames: "request/[name].js",
    platform: "node",
    plugins: [
      fileImportMetaUrlPlugin(),
      createAppRouterImportPolicyPlugin({
        appDir: options.appDir,
        importPolicy: options.importPolicy,
        label: "Request artifact",
      }),
    ],
    root: options.importPolicy?.projectRoot ?? dirname(options.entries[0]?.filename ?? options.appDir),
    vitePlugins: options.vitePlugins,
  });

  if (output.chunks.some((chunk) => !chunk.isEntry)) {
    const fallbackEntries = await mapWithBuildConcurrency(options.entries, async (entry) => [
      entry.key,
      await bundleRouteRequestModuleCode({
        appDir: options.appDir,
        bundleCache: options.bundleCache,
        cacheDir: options.cacheDir,
        code: entry.code,
        filename: entry.filename,
        importPolicy: options.importPolicy,
        label: entry.label,
        vitePlugins: options.vitePlugins,
      }),
    ] as const);
    return new Map(fallbackEntries);
  }

  const chunksByName = new Map(output.chunks.map((chunk) => [chunk.name, chunk]));
  return new Map(
    options.entries.map((entry) => {
      const name = namesByKey.get(entry.key);
      const chunk = name === undefined ? undefined : chunksByName.get(name);

      if (chunk === undefined) {
        throw new Error(`Failed to compile request artifact for ${entry.filename}.`);
      }

      return [entry.key, chunk.code] as const;
    }),
  );
}

export async function __bundleRouteRequestModuleBatchForTests(options: {
  appDir: string;
  cacheDir?: string | undefined;
  entries: readonly RouteRequestModuleBatchEntry[];
  importPolicy?: AppRouterImportPolicy | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<Record<string, string>> {
  return Object.fromEntries(
    await bundleRouteRequestModuleBatchCode({
      appDir: options.appDir,
      cacheDir: options.cacheDir,
      entries: options.entries,
      importPolicy: options.importPolicy,
      vitePlugins: options.vitePlugins,
    }),
  );
}

async function bundleRouteRequestModuleCode(options: {
  appDir: string;
  bundleCache?: Map<string, Promise<RouterBundleOutput>> | undefined;
  cacheDir?: string | undefined;
  code: string;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  label: "Loader" | "Metadata";
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  const output = await bundleRouterModule({
    cache: options.bundleCache,
    cacheDir: options.cacheDir,
    cacheKey: routeRequestBundleCacheKey(options),
    code: options.code,
    filename: options.filename,
    platform: "node",
    root: options.importPolicy?.projectRoot,
    vitePlugins: options.vitePlugins,
    plugins: [
      fileImportMetaUrlPlugin(),
      createAppRouterImportPolicyPlugin({
        appDir: options.appDir,
        importPolicy: options.importPolicy,
        label: options.label,
      }),
    ],
  });
  const code = output.code;

  if (code === undefined) {
    throw new Error(`Failed to compile ${options.label.toLowerCase()} for ${options.filename}.`);
  }

  return code;
}

function routeRequestBundleCacheKey(options: {
  appDir: string;
  code: string;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  label: "Loader" | "Metadata";
  vitePlugins?: readonly PluginOption[] | undefined;
}): string {
  return stableCacheKey({
    appDir: resolve(options.appDir),
    codeHash: hashText(options.code),
    filename: resolve(options.filename),
    importPolicy:
      options.importPolicy === undefined
        ? undefined
        : {
            allowedPackages: [...(options.importPolicy.allowedPackages ?? [])].sort(),
            allowedSourceDirs: (options.importPolicy.allowedSourceDirs ?? [])
              .map((dir) => resolve(dir))
              .sort(),
            projectRoot:
              options.importPolicy.projectRoot === undefined
                ? undefined
                : resolve(options.importPolicy.projectRoot),
          },
    label: options.label,
    platform: "node",
    target: "es2022",
    vitePlugins: vitePluginsCacheKey(options.vitePlugins),
  });
}

function stableCacheKey(value: unknown): string {
  return JSON.stringify(value);
}

function isMiddlewareFile(appDir: string, file: string): boolean {
  return file === join(appDir, "middleware.ts") || file === join(appDir, "middleware.mreact.ts");
}

function hasMetadataExport(code: string): boolean {
  return /\bexport\s+const\s+metadata\s*=/.test(code) ||
    /\bexport\s+(?:async\s+)?function\s+generateMetadata\b/.test(code) ||
    /\bexport\s*\{[^}]*\bgenerateMetadata\b[^}]*\}/.test(code);
}

async function readDeclaredProjectPackages(projectRoot: string): Promise<string[]> {
  try {
    const json = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, unknown> | undefined;
      devDependencies?: Record<string, unknown> | undefined;
      optionalDependencies?: Record<string, unknown> | undefined;
      peerDependencies?: Record<string, unknown> | undefined;
    };

    return [
      ...Object.keys(json.dependencies ?? {}),
      ...Object.keys(json.devDependencies ?? {}),
      ...Object.keys(json.optionalDependencies ?? {}),
      ...Object.keys(json.peerDependencies ?? {}),
    ];
  } catch {
    return [];
  }
}

interface CloudflareRouteModulesOutput {
  registryFile: string;
}

interface CloudflareRequiredRoute {
  route: AppRoute;
  routeFile: string;
  routeId: string;
}

interface CloudflareBatchedRouteModule {
  code: string;
  fileName: string;
}

interface CloudflareBatchedRouteModules {
  chunks: readonly RouterBundleChunkOutput[];
  entries: ReadonlyMap<string, CloudflareBatchedRouteModule>;
}

interface CloudflareBatchedComponentRoute {
  filename: string;
  routeId: string;
}

interface CloudflareBatchedStringRoute {
  filename: string;
  routeId: string;
  shellFiles: CloudflareShellFile[];
}

interface RouteRequestModuleBatchEntry {
  code: string;
  filename: string;
  key: string;
  label: "Loader" | "Metadata";
}

async function writeCloudflareRouteModules(options: {
  cacheDir?: string | undefined;
  cloudflareDir: string;
  define?: UserConfig["define"] | undefined;
  files: Record<string, string>;
  prerenderedRoutes: Record<string, BuiltPrerenderedRoute>;
  projectRoot: string;
  routesDir: string;
  routes: readonly AppRoute[];
  serverModules: Record<string, BuiltServerModuleArtifact>;
  sourceAnalysis: BuildSourceAnalysisScope;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<CloudflareRouteModulesOutput> {
  const routesDir = join(options.cloudflareDir, "routes");
  const requiredRoutes = await Promise.all(
    options.routes
      .filter((route) => cloudflareRouteRequiresGeneratedModule(route, options.prerenderedRoutes))
      .flatMap((route): CloudflareRequiredRoute[] => {
        const routeFile = relative(options.projectRoot, route.file).replaceAll(sep, "/");
        const analysis = options.sourceAnalysis.byFile.get(routeFile);

        return analysis === undefined
          ? []
          : [{
              route,
              routeFile,
              routeId: routeIdForPath(route.path),
            }];
      }),
  );

  await mkdir(routesDir, { recursive: true });

  const serverRouteModules = await buildCloudflareServerRouteModuleBatch({
    cacheDir: options.cacheDir,
    define: options.define,
    routes: requiredRoutes
      .filter(({ route }) => route.kind === "server" || route.kind === "metadata")
      .map(({ route, routeId }) => ({ filename: route.file, routeId })),
    root: options.projectRoot,
    vitePlugins: options.vitePlugins,
  });
  const loaderRouteModules = await buildCloudflareRouteLoaderModuleBatch({
    cacheDir: options.cacheDir,
    define: options.define,
    routes: requiredRoutes
      .filter(({ route, routeFile }) =>
        route.kind === "page" && options.sourceAnalysis.byRouteFile.get(routeFile)?.hasLoader === true
      )
      .map(({ route, routeId }) => ({ filename: route.file, routeId })),
    root: options.projectRoot,
    vitePlugins: options.vitePlugins,
  });
  const directComponentRoutes = await collectCloudflareDirectComponentRoutes({
    requiredRoutes,
    routesDir: options.routesDir,
    serverModules: options.serverModules,
    sourceAnalysis: options.sourceAnalysis,
  });
  const stringShellComponentRoutes = await collectCloudflareStringShellComponentRoutes({
    requiredRoutes,
    routesDir: options.routesDir,
    serverModules: options.serverModules,
    sourceAnalysis: options.sourceAnalysis,
  });
  const directComponentRouteIds = new Set(directComponentRoutes.map((route) => route.routeId));
  const stringShellComponentRouteIds = new Set(
    stringShellComponentRoutes.map((route) => route.routeId),
  );
  const directComponentModules = await buildCloudflareServerComponentModuleBatch({
    cacheDir: options.cacheDir,
    define: options.define,
    projectRoot: options.projectRoot,
    routes: directComponentRoutes,
    serverModules: options.serverModules,
    sourceAnalysis: options.sourceAnalysis,
    vitePlugins: options.vitePlugins,
  });
  const stringShellComponentModules = await buildCloudflareStringRouteComponentModuleBatch({
    cacheDir: options.cacheDir,
    define: options.define,
    projectRoot: options.projectRoot,
    routes: stringShellComponentRoutes,
    serverModules: options.serverModules,
    sourceAnalysis: options.sourceAnalysis,
    vitePlugins: options.vitePlugins,
  });

  await Promise.all([
    writeCloudflareBatchedRouteModuleChunks(options.cloudflareDir, serverRouteModules),
    writeCloudflareBatchedRouteModuleChunks(options.cloudflareDir, loaderRouteModules),
    writeCloudflareBatchedRouteModuleChunks(options.cloudflareDir, directComponentModules),
    writeCloudflareBatchedRouteModuleChunks(options.cloudflareDir, stringShellComponentModules),
  ]);

  const registryEntries = await mapWithBuildConcurrency(requiredRoutes, async ({ route, routeFile, routeId }) => {
    const routeModuleFile = `routes/${routeId}.mjs`;
    let routeModuleExports: string[];

    if (route.kind === "server" || route.kind === "metadata") {
      try {
        const serverRouteModule = serverRouteModules.entries.get(routeId);

        if (serverRouteModule === undefined) {
          throw new Error(`Missing bundled Cloudflare ${route.kind} route module.`);
        }

        const serverRouteFile = serverRouteModule.fileName;
        const serverRouteImport = `./${serverRouteFile.split("/").pop() ?? serverRouteFile}`;
        routeModuleExports = [
          `export * from ${JSON.stringify(serverRouteImport)};`,
          ...(route.kind === "metadata"
            ? [`export { default } from ${JSON.stringify(serverRouteImport)};`]
            : []),
        ];
      } catch (error) {
        throw new Error(
          `Failed to build Cloudflare ${route.kind} route module for ${routeFile}: ${errorMessage(error)}`,
        );
      }

      await writeFile(join(options.cloudflareDir, routeModuleFile), `${routeModuleExports.join("\n")}\n`);
      return `${JSON.stringify(routeFile)}: () => import(${JSON.stringify(`./${routeModuleFile}`)})`;
    }

    const serverOutput =
      options.serverModules[routeFile]?.analysis?.streamRoute === true ||
      options.sourceAnalysis.byRouteFile.get(routeFile)?.streamRoute === true
        ? "stream"
        : "string";

    try {
      const batchedComponent =
        stringShellComponentRouteIds.has(routeId)
          ? stringShellComponentModules.entries.get(routeId)
          : directComponentRouteIds.has(routeId)
            ? directComponentModules.entries.get(routeId)
            : undefined;
      let componentFile = batchedComponent?.fileName;

      if (batchedComponent === undefined) {
        const componentOutput =
          serverOutput === "stream"
            ? await buildCloudflareStreamRouteComponentModule({
                cacheDir: options.cacheDir,
                define: options.define,
                filename: route.file,
                projectRoot: options.projectRoot,
                routesDir: options.routesDir,
                serverModules: options.serverModules,
                sourceAnalysis: options.sourceAnalysis,
                vitePlugins: options.vitePlugins,
              })
            : await buildCloudflareStringRouteComponentModule({
                cacheDir: options.cacheDir,
                define: options.define,
                filename: route.file,
                projectRoot: options.projectRoot,
                routesDir: options.routesDir,
                serverModules: options.serverModules,
                sourceAnalysis: options.sourceAnalysis,
                vitePlugins: options.vitePlugins,
              });

        componentFile = `routes/${routeId}.${hashText(componentOutput).slice(0, 8)}.component.mjs`;
        await writeFile(join(options.cloudflareDir, componentFile), componentOutput);
      }

      if (componentFile === undefined) {
        throw new Error("Missing bundled Cloudflare component module.");
      }

      const componentImport = `./${componentFile.split("/").pop() ?? componentFile}`;
      routeModuleExports = [
        cloudflarePageRouteFacadeModuleSource(componentImport),
      ];
    } catch (error) {
      throw new Error(
        `Failed to build Cloudflare route module for ${routeFile}: ${errorMessage(error)}`,
      );
    }

    if (options.sourceAnalysis.byRouteFile.get(routeFile)?.hasLoader === true) {
      try {
        const loaderModule = loaderRouteModules.entries.get(routeId);

        if (loaderModule === undefined) {
          throw new Error("Missing bundled Cloudflare loader module.");
        }

        const loaderFile = loaderModule.fileName;
        const loaderImport = `./${loaderFile.split("/").pop() ?? loaderFile}`;
        routeModuleExports.push(`export { loader } from ${JSON.stringify(loaderImport)};`);
      } catch (error) {
        throw new Error(
          `Failed to build Cloudflare loader module for ${routeFile}: ${errorMessage(error)}`,
        );
      }
    }

    await writeFile(join(options.cloudflareDir, routeModuleFile), `${routeModuleExports.join("\n")}\n`);
    return `${JSON.stringify(routeFile)}: () => import(${JSON.stringify(`./${routeModuleFile}`)})`;
  });

  const registrySource = [
    `export const routeModules = {`,
    ...registryEntries.map((entry) => `  ${entry},`),
    `};`,
    `export default routeModules;`,
    ``,
  ].join("\n");

  await writeFile(join(options.cloudflareDir, "route-modules.mjs"), registrySource);

  return { registryFile: "route-modules.mjs" };
}

function cloudflarePageRouteFacadeModuleSource(componentImport: string): string {
  return `import * as componentModule from ${JSON.stringify(componentImport)};

const componentSlots = readComponentModuleExport(componentModule, "slots");

export function App(props) {
  return renderCloudflareRouteComponent(props);
}
export default function CloudflareDefaultRouteComponent(props) {
  return renderCloudflareRouteComponent(props);
}
export function CloudflareRouteComponent(props) {
  return renderCloudflareRouteComponent(props);
}
export const slots = componentSlots === undefined ? undefined : { ...componentSlots };

function renderCloudflareRouteComponent(props) {
  const routeComponent = resolveCloudflareRouteComponent();
  if (routeComponent === undefined) {
    throw new Error("No Cloudflare component export was found for ${componentImport}.");
  }

  return routeComponent(props);
}

function resolveCloudflareRouteComponent() {
  const componentDefault = readComponentModuleExport(componentModule, "default");
  if (typeof componentDefault === "function") {
    return componentDefault;
  }

  const componentApp = readComponentModuleExport(componentModule, "App");
  if (typeof componentApp === "function") {
    return componentApp;
  }

  return undefined;
}

function readComponentModuleExport(module, name) {
  const descriptor = Object.getOwnPropertyDescriptor(module, name);
  if (descriptor === undefined) {
    return undefined;
  }

  if ("value" in descriptor) {
    return descriptor.value;
  }

  return descriptor.get?.call(module);
}`;
}

async function collectCloudflareDirectComponentRoutes(options: {
  requiredRoutes: readonly CloudflareRequiredRoute[];
  routesDir: string;
  serverModules: Record<string, BuiltServerModuleArtifact>;
  sourceAnalysis: BuildSourceAnalysisScope;
}): Promise<CloudflareBatchedComponentRoute[]> {
  const routes = await Promise.all(
    options.requiredRoutes.map(async ({ route, routeFile, routeId }) => {
      if (route.kind !== "page") {
        return undefined;
      }

      const serverOutput =
        options.serverModules[routeFile]?.analysis?.streamRoute === true ||
        options.sourceAnalysis.byRouteFile.get(routeFile)?.streamRoute === true
          ? "stream"
          : "string";

      if (serverOutput !== "string") {
        return undefined;
      }

      const shellFiles = await cloudflareShellFilesForPage(options.routesDir, route.file);

      if (shellFiles.length > 0) {
        return undefined;
      }

      return {
        filename: route.file,
        routeId,
      };
    }),
  );

  return routes.filter((route): route is CloudflareBatchedComponentRoute => route !== undefined);
}

async function collectCloudflareStringShellComponentRoutes(options: {
  requiredRoutes: readonly CloudflareRequiredRoute[];
  routesDir: string;
  serverModules: Record<string, BuiltServerModuleArtifact>;
  sourceAnalysis: BuildSourceAnalysisScope;
}): Promise<CloudflareBatchedStringRoute[]> {
  const routes = await Promise.all(
    options.requiredRoutes.map(async ({ route, routeFile, routeId }) => {
      if (route.kind !== "page") {
        return undefined;
      }

      const serverOutput =
        options.serverModules[routeFile]?.analysis?.streamRoute === true ||
        options.sourceAnalysis.byRouteFile.get(routeFile)?.streamRoute === true
          ? "stream"
          : "string";

      if (serverOutput !== "string") {
        return undefined;
      }

      const shellFiles = await cloudflareShellFilesForPage(options.routesDir, route.file);

      if (shellFiles.length === 0) {
        return undefined;
      }

      return {
        filename: route.file,
        routeId,
        shellFiles,
      };
    }),
  );

  return routes.filter((route): route is CloudflareBatchedStringRoute => route !== undefined);
}

interface CloudflareShellFile {
  file: string;
  id: string;
  kind: "layout" | "template";
}

async function buildCloudflareServerComponentModuleBatch(options: {
  cacheDir?: string | undefined;
  define?: UserConfig["define"] | undefined;
  projectRoot: string;
  routes: readonly CloudflareBatchedComponentRoute[];
  serverModules: Record<string, BuiltServerModuleArtifact>;
  sourceAnalysis: BuildSourceAnalysisScope;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<CloudflareBatchedRouteModules> {
  if (options.routes.length === 0) {
    return { chunks: [], entries: new Map() };
  }

  const virtualModules = new Map<string, CloudflareVirtualModule>();
  const bundleEntries = await Promise.all(
    options.routes.map(async (route) => {
      const metadataModule = await buildCloudflareRouteMetadataExportModule({
        cacheDir: options.cacheDir,
        define: options.define,
        filename: route.filename,
        hasMetadata: buildSourceAnalysisForFile(
          options.sourceAnalysis,
          options.projectRoot,
          route.filename,
        )?.hasMetadata,
        root: options.projectRoot,
        vitePlugins: options.vitePlugins,
      });
      const metadataId = `mreact:metadata:${route.routeId}`;

      if (metadataModule !== undefined) {
        virtualModules.set(metadataId, {
          contents: metadataModule,
          resolveDir: dirname(route.filename),
        });
      }

      return {
        code: cloudflareServerComponentModuleEntry(
          route.filename,
          metadataModule === undefined ? undefined : metadataId,
        ),
        filename: `${route.filename}.mreact-cloudflare-component.js`,
        name: `${route.routeId}.component`,
        routeId: route.routeId,
      };
    }),
  );
  const output = await bundleRouterModules({
    cacheDir: options.cacheDir,
    chunkFileNames: "routes/chunks/[name].[hash].mjs",
    define: options.define,
    entries: bundleEntries,
    entryFileNames: "routes/[name].[hash].mjs",
    minify: true,
    platform: "node",
    plugins: [
      cloudflareVirtualModulesPlugin(virtualModules),
      cloudflareServerSourceTransformPlugin({
        projectRoot: options.projectRoot,
        serverOutput: "string",
        serverModules: options.serverModules,
        vitePlugins: options.vitePlugins,
      }),
      cloudflareWorkspaceRuntimePlugin(),
    ],
    root: options.projectRoot,
    target: "es2022",
    vitePlugins: options.vitePlugins,
  });
  const entriesByName = new Map(bundleEntries.map((entry) => [entry.name, entry]));
  const entries = new Map<string, CloudflareBatchedRouteModule>();

  for (const chunk of output.chunks) {
    if (!chunk.isEntry) {
      continue;
    }

    const entry = entriesByName.get(chunk.name);

    if (entry === undefined) {
      continue;
    }

    entries.set(entry.routeId, {
      code: chunk.code,
      fileName: chunk.fileName,
    });
  }

  return { chunks: output.chunks, entries };
}

async function buildCloudflareStringRouteComponentModuleBatch(options: {
  cacheDir?: string | undefined;
  define?: UserConfig["define"] | undefined;
  projectRoot: string;
  routes: readonly CloudflareBatchedStringRoute[];
  serverModules: Record<string, BuiltServerModuleArtifact>;
  sourceAnalysis: BuildSourceAnalysisScope;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<CloudflareBatchedRouteModules> {
  if (options.routes.length === 0) {
    return { chunks: [], entries: new Map() };
  }

  const virtualModules = new Map<string, CloudflareVirtualModule>();
  const bundleEntries = await Promise.all(
    options.routes.map(async (route) => {
      const metadataImports: string[] = [];
      const pageMetadataId = `mreact:metadata:${route.routeId}:page`;
      const pageMetadataModule = await buildCloudflareRouteMetadataExportModule({
        cacheDir: options.cacheDir,
        define: options.define,
        filename: route.filename,
        hasMetadata: buildSourceAnalysisForFile(
          options.sourceAnalysis,
          options.projectRoot,
          route.filename,
        )?.hasMetadata,
        root: options.projectRoot,
        vitePlugins: options.vitePlugins,
      });

      if (pageMetadataModule === undefined) {
        metadataImports.push("const pageMetadataModule = {};");
      } else {
        virtualModules.set(pageMetadataId, {
          contents: pageMetadataModule,
          resolveDir: dirname(route.filename),
        });
        metadataImports.push(`import * as pageMetadataModule from ${JSON.stringify(pageMetadataId)};`);
      }

      const shellMetadataImports = await Promise.all(
        route.shellFiles.map(async (shell, index) => {
          const shellMetadataId = `mreact:metadata:${route.routeId}:shell:${index}`;
          const shellMetadataModule = await buildCloudflareRouteMetadataExportModule({
            cacheDir: options.cacheDir,
            define: options.define,
            filename: shell.file,
            hasMetadata: buildSourceAnalysisForFile(
              options.sourceAnalysis,
              options.projectRoot,
              shell.file,
            )?.hasMetadata,
            root: options.projectRoot,
            vitePlugins: options.vitePlugins,
          });

          if (shellMetadataModule === undefined) {
            return `const shellMetadataModule${index} = {};`;
          }

          virtualModules.set(shellMetadataId, {
            contents: shellMetadataModule,
            resolveDir: dirname(shell.file),
          });
          return `import * as shellMetadataModule${index} from ${JSON.stringify(shellMetadataId)};`;
        }),
      );
      metadataImports.push(...shellMetadataImports);

      return {
        code: cloudflareStringRouteComponentModuleEntry({
          filename: route.filename,
          metadataImports,
          pageMetadataModuleName: "pageMetadataModule",
          shellFiles: route.shellFiles,
          shellMetadataModuleName: (index) => `shellMetadataModule${index}`,
        }),
        filename: `${route.filename}.mreact-cloudflare-string-route.js`,
        name: `${route.routeId}.string`,
        routeId: route.routeId,
      };
    }),
  );
  const output = await bundleRouterModules({
    cacheDir: options.cacheDir,
    chunkFileNames: "routes/chunks/[name].[hash].mjs",
    define: options.define,
    entries: bundleEntries,
    entryFileNames: "routes/[name].[hash].mjs",
    minify: true,
    platform: "node",
    plugins: [
      cloudflareVirtualModulesPlugin(virtualModules),
      cloudflareServerSourceTransformPlugin({
        projectRoot: options.projectRoot,
        serverOutput: "string",
        serverModules: options.serverModules,
        vitePlugins: options.vitePlugins,
      }),
      cloudflareWorkspaceRuntimePlugin(),
    ],
    root: options.projectRoot,
    target: "es2022",
    vitePlugins: options.vitePlugins,
  });
  const entriesByName = new Map(bundleEntries.map((entry) => [entry.name, entry]));
  const entries = new Map<string, CloudflareBatchedRouteModule>();

  for (const chunk of output.chunks) {
    if (!chunk.isEntry) {
      continue;
    }

    const entry = entriesByName.get(chunk.name);

    if (entry === undefined) {
      continue;
    }

    entries.set(entry.routeId, {
      code: chunk.code,
      fileName: chunk.fileName,
    });
  }

  return { chunks: output.chunks, entries };
}

function cloudflareStringRouteComponentModuleEntry(options: {
  filename: string;
  metadataImports: readonly string[];
  pageMetadataModuleName: string;
  shellFiles: readonly CloudflareShellFile[];
  shellMetadataModuleName: (index: number) => string;
}): string {
  const shellImports = options.shellFiles.map(
    (shell, index) => `import * as shellRouteModule${index} from ${JSON.stringify(shell.file)};`,
  );
  const shellDefinitions = options.shellFiles.map(
    (shell, index) =>
      `{ component: selectComponent(shell${index}, ${JSON.stringify(shell.file)}), id: ${JSON.stringify(shell.id)}, kind: ${JSON.stringify(shell.kind)}, module: shell${index} }`,
  );
  const shellModules = options.shellFiles.map(
    (_, index) =>
      `const shell${index} = routeComponentModule(shellRouteModule${index}, ${options.shellMetadataModuleName(index)});`,
  );

  return `import * as pageRouteModule from ${JSON.stringify(options.filename)};
${shellImports.join("\n")}
${options.metadataImports.join("\n")}

const pageModule = routeComponentModule(pageRouteModule, ${options.pageMetadataModuleName});
${shellModules.join("\n")}
const pageComponent = selectComponent(pageModule, ${JSON.stringify(options.filename)});
const shells = [${shellDefinitions.join(", ")}];
export const slots = pageModule.slots;
export default function CloudflareStringRouteComponent(props) {
  return renderCloudflareStringRoute(props);
}

async function renderCloudflareStringRoute(props) {
  const slotHtml = await renderRouteSlots(pageModule.slots, props);
  const layoutShells = await renderLayoutShells(shells, props, slotHtml);
  const metadata = await resolveRouteMetadata([...shells.map((shell) => shell.module), pageModule], props);
  let html = "<!DOCTYPE html>";
  for (const shell of layoutShells) {
    html += shell.prefix;
  }
  html += withCloudflareHydrationMarkers(props, String(await pageComponent(props) ?? ""));
  for (const shell of [...layoutShells].reverse()) {
    html += shell.suffix;
  }
  html = injectCloudflareHead(html, metadata, cloudflareRouteHeadTags(props.clientManifest, props.route.path));
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}

function routeComponentModule(routeModule, metadataModule) {
  const component = routeModule.default ?? routeModule.App ?? Object.values(routeModule).find((value) => typeof value === "function");
  return {
    ...routeModule,
    App: component,
    default: component,
    generateMetadata: metadataModule.generateMetadata,
    metadata: metadataModule.metadata,
    slots: routeModule.slots,
  };
}

function selectComponent(module, label) {
  const component = module.default ?? module.App ?? Object.values(module).find((value) => typeof value === "function");
  if (typeof component !== "function") {
    throw new Error(\`No Cloudflare component export was found for \${label}.\`);
  }
  return component;
}

async function renderRouteSlots(slots, props) {
  if (slots === undefined) {
    return {};
  }
  const rendered = {};
  for (const [name, value] of Object.entries(slots)) {
    rendered[name] = typeof value === "function" ? String(await value(props) ?? "") : String(value ?? "");
  }
  return rendered;
}

${cloudflareShellRuntimeSource()}`;
}

async function buildCloudflareServerComponentModule(options: {
  cacheDir?: string | undefined;
  define?: UserConfig["define"] | undefined;
  filename: string;
  projectRoot: string;
  serverOutput: ServerOutputMode;
  serverModules: Record<string, BuiltServerModuleArtifact>;
  sourceAnalysis: BuildSourceAnalysisScope;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  const metadataModule = await buildCloudflareRouteMetadataExportModule({
    cacheDir: options.cacheDir,
    define: options.define,
    filename: options.filename,
    hasMetadata: buildSourceAnalysisForFile(options.sourceAnalysis, options.projectRoot, options.filename)?.hasMetadata,
    root: options.projectRoot,
    vitePlugins: options.vitePlugins,
  });
  const entry = cloudflareServerComponentModuleEntry(
    options.filename,
    metadataModule === undefined ? undefined : "mreact:metadata",
  );

  return bundleCloudflareVirtualModule({
    entry,
    filename: `${options.filename}.mreact-cloudflare-component.js`,
    cacheDir: options.cacheDir,
    define: options.define,
    modules: metadataModule === undefined
      ? new Map()
      : new Map([["mreact:metadata", metadataModule]]),
    plugins: [
      cloudflareServerSourceTransformPlugin({
        projectRoot: options.projectRoot,
        serverOutput: options.serverOutput,
        serverModules: options.serverModules,
        vitePlugins: options.vitePlugins,
      }),
      cloudflareWorkspaceRuntimePlugin(),
    ],
    resolveDir: dirname(options.filename),
    root: options.projectRoot,
    vitePlugins: options.vitePlugins,
  });
}

function cloudflareServerComponentModuleEntry(
  filename: string,
  metadataModuleId: string | undefined,
): string {
  return `import * as routeModule from ${JSON.stringify(filename)};
${metadataModuleId === undefined ? "const metadataModule = {};" : `import * as metadataModule from ${JSON.stringify(metadataModuleId)};`}

const component = routeModule.default ?? routeModule.App ?? Object.values(routeModule).find((value) => typeof value === "function");
export const App = component;
export default component;
export const generateMetadata = metadataModule.generateMetadata;
export const metadata = metadataModule.metadata;
export const slots = routeModule.slots;`;
}

async function buildCloudflareStringRouteComponentModule(options: {
  cacheDir?: string | undefined;
  define?: UserConfig["define"] | undefined;
  filename: string;
  projectRoot: string;
  routesDir: string;
  serverModules: Record<string, BuiltServerModuleArtifact>;
  sourceAnalysis: BuildSourceAnalysisScope;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  const shellFiles = await cloudflareShellFilesForPage(options.routesDir, options.filename);

  if (shellFiles.length === 0) {
    return buildCloudflareServerComponentModule({
      cacheDir: options.cacheDir,
      define: options.define,
      filename: options.filename,
      projectRoot: options.projectRoot,
      serverModules: options.serverModules,
      serverOutput: "string",
      sourceAnalysis: options.sourceAnalysis,
      vitePlugins: options.vitePlugins,
    });
  }

  const pageModule = await buildCloudflareComponentExportModule({
    cacheDir: options.cacheDir,
    define: options.define,
    filename: options.filename,
    projectRoot: options.projectRoot,
    serverModules: options.serverModules,
    serverOutput: "string",
    sourceAnalysis: options.sourceAnalysis,
    vitePlugins: options.vitePlugins,
  });
  const shellModules = await Promise.all(
    shellFiles.map((shell) =>
      buildCloudflareComponentExportModule({
        cacheDir: options.cacheDir,
        define: options.define,
        filename: shell.file,
        projectRoot: options.projectRoot,
        serverModules: options.serverModules,
        serverOutput: "string",
        sourceAnalysis: options.sourceAnalysis,
        vitePlugins: options.vitePlugins,
      }),
    ),
  );
  const shellImports = shellFiles.map((_, index) => `import * as shell${index} from "mreact:shell-${index}";`);
  const shellDefinitions = shellFiles.map(
    (shell, index) =>
      `{ component: selectComponent(shell${index}, ${JSON.stringify(shell.file)}), id: ${JSON.stringify(shell.id)}, kind: ${JSON.stringify(shell.kind)}, module: shell${index} }`,
  );
  const entry = `import * as pageModule from "mreact:page";
${shellImports.join("\n")}

const pageComponent = selectComponent(pageModule, ${JSON.stringify(options.filename)});
const shells = [${shellDefinitions.join(", ")}];
export const slots = pageModule.slots;
export default function CloudflareStringRouteComponent(props) {
  return renderCloudflareStringRoute(props);
}

async function renderCloudflareStringRoute(props) {
  const slotHtml = await renderRouteSlots(pageModule.slots, props);
  const layoutShells = await renderLayoutShells(shells, props, slotHtml);
  const metadata = await resolveRouteMetadata([...shells.map((shell) => shell.module), pageModule], props);
  let html = "<!DOCTYPE html>";
  for (const shell of layoutShells) {
    html += shell.prefix;
  }
  html += withCloudflareHydrationMarkers(props, String(await pageComponent(props) ?? ""));
  for (const shell of [...layoutShells].reverse()) {
    html += shell.suffix;
  }
  html = injectCloudflareHead(html, metadata, cloudflareRouteHeadTags(props.clientManifest, props.route.path));
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}

function selectComponent(module, label) {
  const component = module.default ?? module.App ?? Object.values(module).find((value) => typeof value === "function");
  if (typeof component !== "function") {
    throw new Error(\`No Cloudflare component export was found for \${label}.\`);
  }
  return component;
}

async function renderRouteSlots(slots, props) {
  if (slots === undefined) {
    return {};
  }
  const rendered = {};
  for (const [name, value] of Object.entries(slots)) {
    rendered[name] = typeof value === "function" ? String(await value(props) ?? "") : String(value ?? "");
  }
  return rendered;
}

${cloudflareShellRuntimeSource()}`;

  return bundleCloudflareVirtualModule({
    entry,
    cacheDir: options.cacheDir,
    define: options.define,
    filename: `${options.filename}.mreact-cloudflare-string-route.js`,
    modules: new Map([
      ["mreact:page", pageModule],
      ...shellModules.map((source, index) => [`mreact:shell-${index}`, source] as const),
    ]),
    plugins: [cloudflareWorkspaceRuntimePlugin()],
    resolveDir: dirname(options.filename),
    root: options.projectRoot,
    vitePlugins: options.vitePlugins,
  });
}

async function buildCloudflareStreamRouteComponentModule(options: {
  cacheDir?: string | undefined;
  define?: UserConfig["define"] | undefined;
  filename: string;
  projectRoot: string;
  routesDir: string;
  serverModules: Record<string, BuiltServerModuleArtifact>;
  sourceAnalysis: BuildSourceAnalysisScope;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  const pageModule = await buildCloudflareComponentExportModule({
    cacheDir: options.cacheDir,
    define: options.define,
    filename: options.filename,
    projectRoot: options.projectRoot,
    serverModules: options.serverModules,
    serverOutput: "stream",
    sourceAnalysis: options.sourceAnalysis,
    vitePlugins: options.vitePlugins,
  });
  const shellFiles = await cloudflareShellFilesForPage(options.routesDir, options.filename);
  const shellModules = await Promise.all(
    shellFiles.map((shell) =>
      buildCloudflareComponentExportModule({
        cacheDir: options.cacheDir,
        define: options.define,
        filename: shell.file,
        projectRoot: options.projectRoot,
        serverModules: options.serverModules,
        serverOutput: "string",
        sourceAnalysis: options.sourceAnalysis,
        vitePlugins: options.vitePlugins,
      }),
    ),
  );
  const shellImports = shellFiles.map((_, index) => `import * as shell${index} from "mreact:shell-${index}";`);
  const shellDefinitions = shellFiles.map(
    (shell, index) =>
      `{ component: selectComponent(shell${index}, ${JSON.stringify(shell.file)}), id: ${JSON.stringify(shell.id)}, kind: ${JSON.stringify(shell.kind)}, module: shell${index} }`,
  );
  const entry = `import { createStringSink, renderOutOfOrderReorderScript, renderToReadableStream } from "@reckona/mreact-server";
import * as pageModule from "mreact:page";
${shellImports.join("\n")}

const pageComponent = selectComponent(pageModule, ${JSON.stringify(options.filename)});
const shells = [${shellDefinitions.join(", ")}];
export const slots = pageModule.slots;
export const App = renderCloudflareStreamRoute;
export default renderCloudflareStreamRoute;

function renderCloudflareStreamRoute(props) {
  const body = renderToReadableStream(async ($sink) => {
    const slotHtml = await renderRouteSlots(pageModule.slots, props);
    const layoutShells = await renderLayoutShells(shells, props, slotHtml);
    const metadata = await resolveRouteMetadata([...shells.map((shell) => shell.module), pageModule], props);
    const routeHeadTags = cloudflareRouteHeadTags(props.clientManifest, props.route.path);
    $sink.append("<!DOCTYPE html>");
    if (layoutShells.length === 0) {
      $sink.append(injectCloudflareHead("", metadata, routeHeadTags));
    }
    for (let index = 0; index < layoutShells.length; index += 1) {
      const shell = layoutShells[index];
      $sink.append(index === 0 ? injectCloudflareHead(shell.prefix, metadata, routeHeadTags) : shell.prefix);
    }
    const hydrationMarker = cloudflareHydrationMarkerParts(props);
    $sink.append(hydrationMarker.prefix);
    await pageComponent($sink, props);
    $sink.append(hydrationMarker.suffix);
    renderOutOfOrderReorderScript($sink);
    for (const shell of [...layoutShells].reverse()) {
      $sink.append(shell.suffix);
    }
  });
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-mreact-stream": "1"
    }
  });
}

function selectComponent(module, label) {
  const component = module.default ?? module.App ?? Object.values(module).find((value) => typeof value === "function");
  if (typeof component !== "function") {
    throw new Error(\`No Cloudflare component export was found for \${label}.\`);
  }
  return component;
}

async function renderRouteSlots(slots, props) {
  if (slots === undefined) {
    return {};
  }
  const rendered = {};
  for (const [name, value] of Object.entries(slots)) {
    if (typeof value !== "function") {
      rendered[name] = String(value ?? "");
      continue;
    }
    const sink = createStringSink();
    await value(sink, props);
    await sink.drain();
    rendered[name] = sink.toString();
  }
  return rendered;
}

${cloudflareShellRuntimeSource()}`;

  return bundleCloudflareVirtualModule({
    entry,
    cacheDir: options.cacheDir,
    define: options.define,
    filename: `${options.filename}.mreact-cloudflare-stream-route.js`,
    modules: new Map([
      ["mreact:page", pageModule],
      ...shellModules.map((source, index) => [`mreact:shell-${index}`, source] as const),
    ]),
    plugins: [cloudflareWorkspaceRuntimePlugin()],
    resolveDir: dirname(options.filename),
    root: options.projectRoot,
    vitePlugins: options.vitePlugins,
  });
}

function cloudflareShellRuntimeSource(): string {
  return `async function renderLayoutShells(shells, props, namedSlots) {
  const slotContext = { consumedSlots: new Set(), namedSlots };
  const rendered = [];
  for (const shell of shells) {
    const html = await shell.component(props);
    rendered.push(splitLayoutSlot(markShellBoundary(String(html ?? ""), shell), slotContext));
  }
  return rendered;
}

function splitLayoutSlot(layoutHtml, slotContext) {
  const html = replaceNamedLayoutSlots(layoutHtml, slotContext);
  const match = findDefaultLayoutSlot(html);
  if (match === null) {
    return { prefix: html, suffix: "" };
  }
  return {
    prefix: html.slice(0, match.index),
    suffix: html.slice(match.index + match[0].length),
  };
}

function markShellBoundary(html, shell) {
  const attributeName = shell.kind === "layout" ? "data-mreact-layout-boundary" : "data-mreact-template-boundary";
  if (html.includes(\`\${attributeName}=\`)) {
    return html;
  }
  return html.replace(/<([A-Za-z][^\\s/>]*)([^>]*)>/, \`<$1$2 \${attributeName}="\${escapeHtmlAttribute(shell.id)}">\`);
}

const SLOT_TAG_PATTERN = /<slot\\b([^>]*)>(?:<\\/slot\\s*>)?/g;

function replaceNamedLayoutSlots(layoutHtml, slotContext) {
  return layoutHtml.replace(SLOT_TAG_PATTERN, (source, openAttributes) => {
    const name = readSlotName(openAttributes);
    if (name === undefined || name === "default") {
      return source;
    }
    if (Object.hasOwn(slotContext.namedSlots, name)) {
      slotContext.consumedSlots.add(name);
      return slotContext.namedSlots[name] ?? "";
    }
    return "";
  });
}

function findDefaultLayoutSlot(html) {
  SLOT_TAG_PATTERN.lastIndex = 0;
  for (;;) {
    const match = SLOT_TAG_PATTERN.exec(html);
    if (match === null) {
      return null;
    }
    const name = readSlotName(match[1] ?? "");
    if (name === undefined || name === "default") {
      return match;
    }
  }
}

function readSlotName(attributes) {
  const match = /\\bname\\s*=\\s*(?:"([^"]*)"|'([^']*)')/.exec(attributes);
  return match?.[1] ?? match?.[2];
}

function withCloudflareHydrationMarkers(props, html) {
  const marker = cloudflareHydrationMarkerParts(props);
  return marker.prefix === "" && marker.suffix === "" ? html : \`\${marker.prefix}\${html}\${marker.suffix}\`;
}

function cloudflareHydrationMarkerParts(props) {
  const route = props.clientManifest.routes.find((route) => route.path === props.route.path && route.client === true);
  if (route?.script === undefined) {
    return { prefix: "", suffix: "" };
  }
  const routeId = route.routeId ?? cloudflareRouteIdForPath(props.route.path);
  const escapedRouteId = escapeHtmlAttribute(routeId);
  const propsJson = escapeScriptJson(JSON.stringify({
    params: props.params,
    request: { url: props.request.url },
    data: props.data,
  }));
  const clientReferencesJson = route.clientReferenceManifest === undefined || route.clientReferenceManifest.length === 0
    ? undefined
    : escapeScriptJson(JSON.stringify(route.clientReferenceManifest));
  return {
    prefix: \`<div data-mreact-route-id="\${escapedRouteId}">\`,
    suffix: [
      "</div>",
      \`<script type="application/json" id="mreact-props-\${escapedRouteId}">\${propsJson}</script>\`,
      clientReferencesJson === undefined
        ? undefined
        : \`<script type="application/json" id="mreact-client-references-\${escapedRouteId}">\${clientReferencesJson}</script>\`,
      \`<script type="module" src="/_mreact/client/\${escapeHtmlAttribute(route.script)}"></script>\`,
    ].filter((part) => part !== undefined).join(""),
  };
}

function escapeScriptJson(json) {
  return json.replaceAll("<", "\\\\u003c");
}

function cloudflareRouteIdForPath(path) {
  if (path === "/") {
    return "index";
  }
  return path
    .slice(1)
    .replaceAll("/", "_")
    .replaceAll(":", "_")
    .replace(/[^A-Za-z0-9_$-]/g, "_");
}

async function resolveRouteMetadata(modules, props) {
  const metadata = [];
  const context = {
    data: props.data,
    params: props.params,
    request: props.request
  };
  for (const module of modules) {
    let next = module.metadata;
    if (typeof module.generateMetadata === "function") {
      const generated = await module.generateMetadata(context);
      next = mergeRouteMetadata([next, generated].filter(Boolean));
    }
    if (next !== undefined) {
      metadata.push(next);
    }
  }
  return mergeRouteMetadata(metadata);
}

function mergeRouteMetadata(metadata) {
  if (metadata.length === 0) {
    return undefined;
  }
  return metadata.reduce((merged, next) => ({
    ...merged,
    ...next,
    alternates: mergeObject(merged.alternates, next.alternates),
    csp: mergeObject(merged.csp, next.csp),
    head: mergeArrays(merged.head, next.head),
    icons: mergeObject(merged.icons, next.icons),
    openGraph: {
      ...mergeObject(merged.openGraph, next.openGraph),
      images: mergeArrays(merged.openGraph?.images, next.openGraph?.images),
    },
  }), {});
}

function mergeObject(left, right) {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  return { ...left, ...right };
}

function mergeArrays(left, right) {
  if (left === undefined || left.length === 0) {
    return right;
  }
  if (right === undefined || right.length === 0) {
    return left;
  }
  return [...left, ...right];
}

function injectCloudflareHead(html, metadata, routeHeadTags) {
  const metadataTags = routeMetadataHeadTags(metadata);
  const tags = routeHeadTags + metadataTags;
  let nextHtml = metadata?.lang === undefined ? html : injectHtmlLangAttribute(html, metadataString(metadata.lang));

  if (metadata?.title !== undefined) {
    nextHtml = nextHtml.replace(/<title\\b[^>]*>[\\s\\S]*?<\\/title\\s*>/i, "");
  }

  if (tags === "") {
    return nextHtml;
  }
  if (/<head(?:\\s[^>]*)?>/i.test(nextHtml)) {
    return nextHtml.replace(/<head(\\s[^>]*)?>/i, (match) => \`\${match}\${tags}\`);
  }
  if (/<html(?:\\s[^>]*)?>/i.test(nextHtml)) {
    return nextHtml.replace(/<html(\\s[^>]*)?>/i, (match) => \`\${match}<head>\${tags}</head>\`);
  }
  return \`<head>\${tags}</head>\${nextHtml}\`;
}

function routeMetadataHeadTags(metadata) {
  if (metadata === undefined) {
    return "";
  }
  const tags = [
    metadata.title === undefined ? undefined : \`<title>\${escapeHtml(metadataString(metadata.title))}</title>\`,
    metadata.description === undefined ? undefined : \`<meta name="description" content="\${escapeHtmlAttribute(metadataString(metadata.description))}">\`,
    metadata.alternates?.canonical === undefined ? undefined : \`<link rel="canonical" href="\${escapeHtmlAttribute(metadataString(metadata.alternates.canonical))}">\`,
    metadata.openGraph?.title === undefined ? undefined : \`<meta property="og:title" content="\${escapeHtmlAttribute(metadataString(metadata.openGraph.title))}">\`,
    metadata.openGraph?.description === undefined ? undefined : \`<meta property="og:description" content="\${escapeHtmlAttribute(metadataString(metadata.openGraph.description))}">\`,
    ...openGraphImages(metadata.openGraph).map((image) => \`<meta property="og:image" content="\${escapeHtmlAttribute(image)}">\`),
    metadata.icons?.icon === undefined ? undefined : \`<link rel="icon" href="\${escapeHtmlAttribute(metadataString(metadata.icons.icon))}">\`,
    metadata.icons?.apple === undefined ? undefined : \`<link rel="apple-touch-icon" href="\${escapeHtmlAttribute(metadataString(metadata.icons.apple))}">\`,
    ...headDescriptorTags(metadata.head, metadata.csp?.nonce),
  ];
  return tags.filter((tag) => tag !== undefined).join("");
}

function openGraphImages(openGraph) {
  if (openGraph?.images !== undefined && openGraph.images.length > 0) {
    return openGraph.images.map(metadataImageUrl);
  }
  return openGraph?.image === undefined ? [] : [metadataImageUrl(openGraph.image)];
}

function headDescriptorTags(descriptors, nonce) {
  return (descriptors ?? []).flatMap((descriptor) => {
    const descriptorNonce = descriptor.nonce === true ? nonce : descriptor.nonce || undefined;
    const attrs = {
      ...descriptor.attrs,
      ...(descriptorNonce === undefined ? {} : { nonce: descriptorNonce }),
    };
    const attrText = Object.entries(attrs)
      .flatMap(([name, value]) => {
        if (value === undefined || value === false) {
          return [];
        }
        return value === true
          ? [escapeHtmlAttribute(name)]
          : [\`\${escapeHtmlAttribute(name)}="\${escapeHtmlAttribute(String(value))}"\`];
      })
      .join(" ");
    const open = attrText === "" ? \`<\${descriptor.tag}>\` : \`<\${descriptor.tag} \${attrText}>\`;
    if (descriptor.tag === "meta" || descriptor.tag === "link" || descriptor.tag === "base") {
      return [open.slice(0, -1) + ">"];
    }
    return [\`\${open}\${String(descriptor.content ?? "").replaceAll("<", "\\\\u003c")}</\${descriptor.tag}>\`];
  });
}

function injectHtmlLangAttribute(html, lang) {
  const escapedLang = escapeHtmlAttribute(lang);
  if (!/<html(?:\\s[^>]*)?>/i.test(html)) {
    return html;
  }
  return html.replace(/<html(\\s[^>]*)?>/i, (_match, attrs = "") => {
    const strippedAttrs = String(attrs).replace(/\\s+lang=(?:"[^"]*"|'[^']*'|[^\\s>]+)/i, "");
    return \`<html lang="\${escapedLang}"\${strippedAttrs}>\`;
  });
}

function metadataString(value) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  throw new Error("Invalid metadata field: expected string, number, or boolean.");
}

function metadataImageUrl(value) {
  if (typeof value === "object" && value !== null && "url" in value) {
    return metadataString(value.url);
  }
  return metadataString(value);
}

function cloudflareRouteHeadTags(manifest, routePath) {
  const route = manifest.routes.find((route) => route.path === routePath);
  const css = route?.css ?? [];
  const styles = css
    .map((styleSheet) => \`<link rel="stylesheet" href="/_mreact/client/\${escapeHtmlAttribute(styleSheet)}">\`)
    .join("");
  const script = route?.script;
  const preload = script === undefined
    ? ""
    : \`<link rel="modulepreload" href="/_mreact/client/\${escapeHtmlAttribute(script)}">\`;
  return styles + preload;
}

function escapeHtmlAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}`;
}

async function buildCloudflareComponentExportModule(options: {
  cacheDir?: string | undefined;
  define?: UserConfig["define"] | undefined;
  filename: string;
  projectRoot: string;
  serverModules: Record<string, BuiltServerModuleArtifact>;
  serverOutput: ServerOutputMode;
  sourceAnalysis: BuildSourceAnalysisScope;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  const metadataModule = await buildCloudflareRouteMetadataExportModule({
    cacheDir: options.cacheDir,
    define: options.define,
    filename: options.filename,
    hasMetadata: buildSourceAnalysisForFile(options.sourceAnalysis, options.projectRoot, options.filename)?.hasMetadata,
    root: options.projectRoot,
    vitePlugins: options.vitePlugins,
  });
  const entry = `import * as routeModule from ${JSON.stringify(options.filename)};
${metadataModule === undefined ? "const metadataModule = {};" : 'import * as metadataModule from "mreact:metadata";'}

const component = routeModule.default ?? routeModule.App ?? Object.values(routeModule).find((value) => typeof value === "function");
export const App = component;
export default component;
export const generateMetadata = metadataModule.generateMetadata;
export const metadata = metadataModule.metadata;
export const slots = routeModule.slots;`;

  return bundleCloudflareVirtualModule({
    entry,
    cacheDir: options.cacheDir,
    define: options.define,
    filename: `${options.filename}.mreact-cloudflare-${options.serverOutput}-component.js`,
    modules: metadataModule === undefined
      ? new Map()
      : new Map([["mreact:metadata", metadataModule]]),
    plugins: [
      cloudflareServerSourceTransformPlugin({
        projectRoot: options.projectRoot,
        serverOutput: options.serverOutput,
        serverModules: options.serverModules,
        vitePlugins: options.vitePlugins,
      }),
      cloudflareWorkspaceRuntimePlugin(),
    ],
    resolveDir: dirname(options.filename),
    root: options.projectRoot,
    vitePlugins: options.vitePlugins,
  });
}

async function writeCloudflareBatchedRouteModuleChunks(
  cloudflareDir: string,
  modules: CloudflareBatchedRouteModules,
): Promise<void> {
  if (modules.chunks.some((chunk) => chunk.fileName.startsWith("routes/chunks/"))) {
    await mkdir(join(cloudflareDir, "routes", "chunks"), { recursive: true });
  }

  await Promise.all(
    modules.chunks.map((chunk) => writeFile(join(cloudflareDir, chunk.fileName), chunk.code)),
  );
}

async function buildCloudflareRouteLoaderModuleBatch(options: {
  cacheDir?: string | undefined;
  define?: UserConfig["define"] | undefined;
  routes: readonly { filename: string; routeId: string }[];
  root: string;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<CloudflareBatchedRouteModules> {
  return await bundleCloudflareModuleBatch({
    cacheDir: options.cacheDir,
    define: options.define,
    entries: options.routes.map((route) => ({
      code: cloudflareRouteLoaderModuleEntry(route.filename),
      filename: `${route.filename}.mreact-cloudflare-loader.js`,
      name: `${route.routeId}.loader`,
      routeId: route.routeId,
    })),
    root: options.root,
    vitePlugins: options.vitePlugins,
  });
}

export async function __buildCloudflareRouteLoaderModuleBatchForTests(options: {
  cacheDir?: string | undefined;
  define?: UserConfig["define"] | undefined;
  projectRoot: string;
  routes: readonly { filename: string; routeId: string }[];
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<Record<string, string>> {
  const output = await buildCloudflareRouteLoaderModuleBatch({
    cacheDir: options.cacheDir,
    define: options.define,
    root: options.projectRoot,
    routes: options.routes,
    vitePlugins: options.vitePlugins,
  });

  return Object.fromEntries(
    options.routes.map((route) => [route.routeId, output.entries.get(route.routeId)?.code ?? ""]),
  );
}

async function buildCloudflareServerRouteModuleBatch(options: {
  cacheDir?: string | undefined;
  define?: UserConfig["define"] | undefined;
  routes: readonly { filename: string; routeId: string }[];
  root: string;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<CloudflareBatchedRouteModules> {
  return await bundleCloudflareModuleBatch({
    cacheDir: options.cacheDir,
    define: options.define,
    entries: options.routes.map((route) => ({
      code: cloudflareServerRouteModuleEntry(route.filename),
      filename: `${route.filename}.mreact-cloudflare-server-route.js`,
      name: `${route.routeId}.server`,
      routeId: route.routeId,
    })),
    root: options.root,
    vitePlugins: options.vitePlugins,
  });
}

async function bundleCloudflareModuleBatch(options: {
  cacheDir?: string | undefined;
  define?: UserConfig["define"] | undefined;
  entries: readonly {
    code: string;
    filename: string;
    name: string;
    routeId: string;
  }[];
  root: string;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<CloudflareBatchedRouteModules> {
  if (options.entries.length === 0) {
    return { chunks: [], entries: new Map() };
  }

  const output = await bundleRouterModules({
    cacheDir: options.cacheDir,
    chunkFileNames: "routes/chunks/[name].[hash].mjs",
    define: options.define,
    entries: options.entries,
    entryFileNames: "routes/[name].[hash].mjs",
    minify: true,
    platform: "node",
    plugins: [cloudflareWorkspaceRuntimePlugin()],
    root: options.root,
    target: "es2022",
    vitePlugins: options.vitePlugins,
  });
  const entriesByName = new Map(options.entries.map((entry) => [entry.name, entry]));
  const entries = new Map<string, CloudflareBatchedRouteModule>();

  for (const chunk of output.chunks) {
    if (!chunk.isEntry) {
      continue;
    }

    const entry = entriesByName.get(chunk.name);

    if (entry === undefined) {
      continue;
    }

    entries.set(entry.routeId, {
      code: chunk.code,
      fileName: chunk.fileName,
    });
  }

  return { chunks: output.chunks, entries };
}

function cloudflareRouteLoaderModuleEntry(filename: string): string {
  return `export { loader } from ${JSON.stringify(filename)};`;
}

async function buildCloudflareRouteMetadataExportModule(options: {
  cacheDir?: string | undefined;
  define?: UserConfig["define"] | undefined;
  filename: string;
  hasMetadata?: boolean | undefined;
  root?: string | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string | undefined> {
  if (options.hasMetadata !== true) {
    return undefined;
  }

  const entry = `import * as routeMetadataModule from ${JSON.stringify(options.filename)};
export const generateMetadata = routeMetadataModule.generateMetadata;
export const metadata = routeMetadataModule.metadata;`;

  return bundleCloudflareModule({
    entry,
    cacheDir: options.cacheDir,
    define: options.define,
    filename: `${options.filename}.mreact-cloudflare-metadata.js`,
    plugins: [cloudflareWorkspaceRuntimePlugin()],
    resolveDir: dirname(options.filename),
    root: options.root,
    vitePlugins: options.vitePlugins,
  });
}

function cloudflareServerRouteModuleEntry(filename: string): string {
  return `import * as routeModule from ${JSON.stringify(filename)};

export const GET = routeModule.GET;
export const HEAD = routeModule.HEAD;
export const POST = routeModule.POST;
export const PUT = routeModule.PUT;
export const PATCH = routeModule.PATCH;
export const DELETE = routeModule.DELETE;
export const OPTIONS = routeModule.OPTIONS;
export const ALL = routeModule.ALL;
const defaultHandler = routeModule.default;
export default defaultHandler;`;
}

async function bundleCloudflareModule(options: {
  cacheDir?: string | undefined;
  define?: UserConfig["define"] | undefined;
  entry: string;
  filename: string;
  plugins: RouterCompatPlugin[];
  resolveDir: string;
  root?: string | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  const output = await bundleRouterModule({
    cacheDir: options.cacheDir,
    code: options.entry,
    define: options.define,
    filename: options.filename,
    minify: true,
    platform: "node",
    preserveExports: true,
    plugins: options.plugins,
    root: options.root,
    target: "es2022",
    vitePlugins: options.vitePlugins,
  });
  const code = output.code;

  if (code === undefined) {
    throw new Error(`Failed to build Cloudflare route module for ${options.filename}.`);
  }

  return code;
}

async function bundleCloudflareVirtualModule(options: {
  cacheDir?: string | undefined;
  define?: UserConfig["define"] | undefined;
  entry: string;
  filename: string;
  modules: ReadonlyMap<string, string>;
  plugins: RouterCompatPlugin[];
  resolveDir: string;
  root?: string | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  return bundleCloudflareModule({
    cacheDir: options.cacheDir,
    define: options.define,
    entry: options.entry,
    filename: options.filename,
    plugins: [
      cloudflareVirtualModulesPlugin(
        new Map(
          Array.from(options.modules, ([id, contents]) => [
            id,
            { contents, resolveDir: options.resolveDir },
          ]),
        ),
      ),
      ...options.plugins,
    ],
    resolveDir: options.resolveDir,
    root: options.root,
    vitePlugins: options.vitePlugins,
  });
}

interface CloudflareVirtualModule {
  contents: string;
  resolveDir: string;
}

function cloudflareVirtualModulesPlugin(
  modules: ReadonlyMap<string, CloudflareVirtualModule>,
): RouterCompatPlugin {
  return {
    name: "mreact-cloudflare-virtual-modules",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^mreact:/ }, (args) => ({
        namespace: "mreact-cloudflare-virtual",
        path: args.path,
      }));
      buildApi.onLoad({ filter: /.*/, namespace: "mreact-cloudflare-virtual" }, (args) => {
        const module = modules.get(args.path);

        if (module === undefined) {
          throw new Error(`Missing virtual Cloudflare module ${args.path}.`);
        }

        return {
          contents: module.contents,
          loader: "js",
          resolveDir: module.resolveDir,
        };
      });
    },
  };
}

async function cloudflareShellFilesForPage(
  routesDir: string,
  pageFile: string,
): Promise<CloudflareShellFile[]> {
  const shells = await existingRouteShellCandidates(routesDir, pageFile, async (file) => {
    try {
      return (await stat(file)).isFile();
    } catch {
      return false;
    }
  });

  return shells.map((shell) => ({
    file: shell.file,
    id: cloudflareShellBoundaryId(routesDir, shell.directory),
    kind: shell.kind,
  }));
}

function cloudflareShellBoundaryId(routesDir: string, directory: string): string {
  const relativeDirectory = relative(routesDir, directory);

  return relativeDirectory === ""
    ? "root"
    : relativeDirectory.replaceAll(sep, "/").replace(/[^A-Za-z0-9_$/-]/g, "_");
}

function cloudflareServerSourceTransformPlugin(options: {
  projectRoot: string;
  serverOutput: ServerOutputMode;
  serverModules: Record<string, BuiltServerModuleArtifact>;
  vitePlugins?: readonly PluginOption[] | undefined;
}): RouterCompatPlugin {
  const clientRouteInferenceCache = createClientRouteInferenceCache();

  return {
    name: "mreact-cloudflare-server-source-transform",
    setup(buildApi) {
      buildApi.onLoad({ filter: /(?:\.mreact)?\.[cm]?[jt]sx$/ }, async (args) => {
        if (args.path.includes(`${sep}node_modules${sep}`)) {
          return undefined;
        }

        const source = await readFile(args.path, "utf8");
        const serverSource = isServerComponentFile(args.path)
          ? stripRouteBuildExports(source, args.path)
          : source;
        const sourceHash = hashText(serverSource);
        const routeFile = relative(options.projectRoot, args.path).replaceAll(sep, "/");
        const artifact = options.serverModules[routeFile]?.[options.serverOutput];
        const contents =
          artifact !== undefined && artifact.sourceHash === sourceHash
            ? artifact.code
            : await transformCloudflareServerSource({
                cache: clientRouteInferenceCache,
                filename: args.path,
                serverOutput: options.serverOutput,
                source: serverSource,
                vitePlugins: options.vitePlugins,
              });

        return {
          contents,
          loader: "js",
          resolveDir: dirname(args.path),
        };
      });
    },
  };
}

async function transformCloudflareServerSource(options: {
  cache: ClientRouteInferenceCache;
  filename: string;
  serverOutput: ServerOutputMode;
  source: string;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  const moduleContext = await compilerModuleContextForSource({
    cache: options.cache,
    code: options.source,
    filename: options.filename,
  });
  const clientInference = await inferClientRouteModule({
    cache: options.cache,
    code: options.source,
    filename: options.filename,
    moduleContext,
    vitePlugins: options.vitePlugins,
  });

  for (const diagnostic of clientInference.diagnostics) {
    console.warn(formatClientRouteInferenceDiagnostic(diagnostic));
  }

  const output = transformCompilerModuleContext({
    code: options.source,
    clientBoundaryImports: clientInference.clientBoundaryImports,
    dev: false,
    filename: options.filename,
    moduleContext,
    serverEscape: nativeEscapeTransform,
    serverOutput: options.serverOutput,
    target: "server",
  });
  const fatalDiagnostics = output.diagnostics.filter(
    (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
  );

  if (fatalDiagnostics.length > 0) {
    throw new Error(
      fatalDiagnostics.map((diagnostic) => formatDiagnostic(options.filename, diagnostic)).join("\n"),
    );
  }

  return output.code;
}

function cloudflareWorkspaceRuntimePlugin(): RouterCompatPlugin {
  const packageFile = (
    monorepoDir: string,
    packageName: string,
    entry: string,
    sourceExtension?: "ts" | "tsx" | undefined,
  ): string =>
    workspacePackageFile({
      currentFileUrl: import.meta.url,
      entry,
      monorepoDir,
      packageName,
      ...(sourceExtension === undefined ? {} : { sourceExtension }),
    });
  const routerCachePath = packageFile("router", "@reckona/mreact-router", "cache");
  const routerCookiesPath = packageFile("router", "@reckona/mreact-router", "cookies");
  const routerCsrfPath = packageFile("router", "@reckona/mreact-router", "csrf");
  const routerDeferredPath = packageFile("router", "@reckona/mreact-router", "deferred");
  const routerI18nPath = packageFile("router", "@reckona/mreact-router", "i18n");
  const routerLinkPath = packageFile("router", "@reckona/mreact-router", "link");
  const routerMultipartPath = packageFile("router", "@reckona/mreact-router", "multipart");
  const routerNavigationPath = packageFile("router", "@reckona/mreact-router", "navigation");
  const routerRuntimeStatePath = packageFile("router", "@reckona/mreact-router", "runtime-state");
  const routerStreamListPath = packageFile("router", "@reckona/mreact-router", "stream-list");
  const runtimePaths = new Map([
    ["@reckona/mreact", packageFile("react", "@reckona/mreact", "index")],
    ["@reckona/mreact/jsx-dev-runtime", packageFile("react", "@reckona/mreact", "jsx-dev-runtime")],
    ["@reckona/mreact/jsx-runtime", packageFile("react", "@reckona/mreact", "jsx-runtime")],
    ["@reckona/mreact-auth", packageFile("auth", "@reckona/mreact-auth", "index")],
    ["@reckona/mreact-compat", packageFile("react-compat", "@reckona/mreact-compat", "index")],
    [
      "@reckona/mreact-compat/event-priority",
      packageFile("react-compat", "@reckona/mreact-compat", "event-priority"),
    ],
    ["@reckona/mreact-compat/flight", packageFile("react-compat", "@reckona/mreact-compat", "flight")],
    ["@reckona/mreact-compat/hooks", packageFile("react-compat", "@reckona/mreact-compat", "hooks-entry")],
    ["@reckona/mreact-compat/internal", packageFile("react-compat", "@reckona/mreact-compat", "internal")],
    [
      "@reckona/mreact-compat/jsx-dev-runtime",
      packageFile("react-compat", "@reckona/mreact-compat", "jsx-dev-runtime"),
    ],
    [
      "@reckona/mreact-compat/jsx-runtime",
      packageFile("react-compat", "@reckona/mreact-compat", "jsx-runtime"),
    ],
    ["@reckona/mreact-compat/scheduler", packageFile("react-compat", "@reckona/mreact-compat", "scheduler")],
    ["@reckona/mreact-query", packageFile("query", "@reckona/mreact-query", "index")],
    ["@reckona/mreact-reactive-core", packageFile("reactive-core", "@reckona/mreact-reactive-core", "index")],
    [
      "@reckona/mreact-router/adapters/cloudflare",
      packageFile("router", "@reckona/mreact-router", "adapters/cloudflare"),
    ],
    ["@reckona/mreact-router/link", routerLinkPath],
    ["@reckona/mreact-router/runtime-state", routerRuntimeStatePath],
    ["@reckona/mreact-router/session", packageFile("router", "@reckona/mreact-router", "session")],
    ["@reckona/mreact-router/stream-list", routerStreamListPath],
    ["@reckona/mreact-server", packageFile("server", "@reckona/mreact-server", "index")],
    [
      "@reckona/mreact-shared/html-escape",
      packageFile("shared", "@reckona/mreact-shared", "html-escape"),
    ],
  ]);

  return {
    name: "mreact-cloudflare-workspace-runtime",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@reckona\/mreact-router\/(?:internal\/)?native-escape$/ }, () => ({
        namespace: "mreact-cloudflare-native-escape",
        path: "native-escape",
      }));
      buildApi.onResolve({ filter: /^@reckona\/mreact-router$/ }, () => ({
        namespace: "mreact-cloudflare-router-index",
        path: "index",
      }));
      buildApi.onResolve({ filter: /^@reckona\/mreact(?:-[\w-]+)?(?:\/[\w/-]+)?$/ }, (args) => {
        const path = runtimePaths.get(args.path);

        return path === undefined ? undefined : { path };
      });
      buildApi.onLoad({ filter: /^native-escape$/, namespace: "mreact-cloudflare-native-escape" }, () => ({
        contents: `function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : "&#39;"
  );
}
export function escapeHtmlBatch(values) {
  return values.map(escapeHtml);
}`,
        loader: "js",
      }));
      buildApi.onLoad({ filter: /^index$/, namespace: "mreact-cloudflare-router-index" }, () => ({
        contents: `export { cacheControl, revalidatePath } from ${JSON.stringify(routerCachePath)};
export { deleteCookie, parseCookieHeader, serializeCookie, setCookie } from ${JSON.stringify(routerCookiesPath)};
export { createFormCsrfToken, formCsrfCookie, formCsrfFieldName, serverActionCookie, validateFormCsrf } from ${JSON.stringify(routerCsrfPath)};
export { defer, isDeferredLoaderData } from ${JSON.stringify(routerDeferredPath)};
export { defineMessages, detectLocale } from ${JSON.stringify(routerI18nPath)};
export { Link, linkProps } from ${JSON.stringify(routerLinkPath)};
export { parseMultipartStream } from ${JSON.stringify(routerMultipartPath)};
export { cookies, headers, html, json, next, notFound, redirect, redirectExternal, rewrite } from ${JSON.stringify(routerNavigationPath)};
export { getServerRuntimeState } from ${JSON.stringify(routerRuntimeStatePath)};`,
        loader: "js",
        resolveDir: dirname(routerNavigationPath),
      }));
      buildApi.onLoad({ filter: /(?:^|[/\\])packages[/\\]server[/\\](?:src|dist)[/\\]native-flight\.[jt]s$/ }, () => ({
        contents: `export function getNativeFlight() {
  return undefined;
}`,
        loader: "js",
      }));
    },
  };
}

function cloudflareRouteRequiresGeneratedModule(
  route: AppRoute,
  prerenderedRoutes: Record<string, BuiltPrerenderedRoute>,
): boolean {
  return (
    route.kind === "metadata" ||
    route.kind === "server" ||
    (route.kind === "page" &&
      (route.segments.some((segment) => segment.kind !== "static") ||
        prerenderedRoutes[route.path] === undefined))
  );
}

function isServerComponentFile(file: string): boolean {
  return /(?:^|\/)(?:page|layout|template|loading|error|not-found)(?:\.mreact)?\.tsx$/.test(file);
}

function viteManifestFromClientRoutes(routes: ClientRouteManifestEntry[]): Record<
  string,
  {
    css?: readonly string[];
    file: string;
    imports?: readonly string[];
    isEntry: true;
    name: string;
    src: string;
  }
> {
  const manifest: Record<
    string,
    {
      file: string;
      imports?: readonly string[];
      isEntry: true;
      name: string;
      src: string;
    }
  > = {};

  for (const route of routes) {
    if (!route.client || route.script === undefined || route.devScript === undefined) {
      continue;
    }

    manifest[route.devScript] = {
      ...(route.css === undefined ? {} : { css: route.css }),
      file: route.script,
      ...(route.imports === undefined ? {} : { imports: route.imports }),
      isEntry: true,
      name: route.routeId ?? routeIdForPath(route.path),
      src: route.devScript,
    };
  }

  return manifest;
}

interface ClientRouteBundleManifest {
  assets: string[];
  routes: ClientRouteManifestEntry[];
}

async function writeClientRouteBundles(options: {
  appDir: string;
  assetBaseUrl?: string | undefined;
  cacheDir?: string | undefined;
  clientDir: string;
  clientConsolePureFunctions?: readonly string[] | undefined;
  clientRouteInferenceCache: ClientRouteInferenceCache;
  projectRoot: string;
  routes: readonly AppRoute[];
  sourceAnalysis: BuildSourceAnalysisScope;
  sourceMapDir: string;
  sourceMaps: AppRouterClientSourceMapMode;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<ClientRouteBundleManifest> {
  type PreparedClientRouteEntry = {
    build: BuildClientRouteOutputOptions;
    css: string[];
    navigation: boolean;
    route: AppRoute & { kind: "page" };
  };
  type PreparedClientManifestEntry = { manifest: ClientRouteManifestEntry };
  type PreparedRouteEntry = PreparedClientRouteEntry | PreparedClientManifestEntry;
  const pageRoutes = options.routes.filter(
    (route): route is AppRoute & { kind: "page" } => route.kind === "page",
  );
  const routeCssAssets = await writeRouteCssAssetBatches({
    appDir: options.appDir,
    cacheDir: options.cacheDir,
    clientDir: options.clientDir,
    pageRoutes,
    projectRoot: options.projectRoot,
    sourceAnalysis: options.sourceAnalysis,
    vitePlugins: options.vitePlugins,
  });
  const entries: PreparedRouteEntry[] = await Promise.all(
    options.routes.map(async (route) => {
      if (route.kind !== "page") {
        return {
          manifest: { path: route.path, kind: route.kind, client: false },
        };
      }

      const css = routeCssAssets.get(route.file) ?? [];
      const source = buildSourceAnalysisForFile(
        options.sourceAnalysis,
        options.projectRoot,
        route.file,
      )?.source;

      if (source === undefined) {
        return {
          manifest: { path: route.path, kind: route.kind, client: false },
        };
      }

      const clientSource = stripRouteClientSource({ code: source, filename: route.file });
      const references = await collectClientRouteReferences({
        appDir: options.appDir,
        cache: options.clientRouteInferenceCache,
        code: clientSource,
        filename: route.file,
        routePath: route.path,
        vitePlugins: options.vitePlugins,
      });
      const navigation = await resolveNavigationRuntime({
        cache: options.clientRouteInferenceCache,
        code: source,
        filename: route.file,
        references,
        vitePlugins: options.vitePlugins,
      });

      for (const diagnostic of references.diagnostics) {
        console.warn(formatClientRouteInferenceDiagnostic(diagnostic));
      }

      if (!references.client) {
        return {
          manifest: {
            path: route.path,
            kind: route.kind,
            client: false,
            ...(css.length === 0 ? {} : { css }),
            ...(navigation ? { navigation } : {}),
          },
        };
      }

      return {
        css,
        navigation,
        route: route as AppRoute & { kind: "page" },
        build: {
          code: clientSource,
          clientBoundaryImports: references.clientBoundaryImports,
          clientReferenceImports: references.clientReferenceImports,
          clientReferenceManifest: references.clientReferenceManifest,
          clientNavigation: detectClientNavigationHint(source),
          cacheDir: options.cacheDir,
          dropConsoleFunctions: options.clientConsolePureFunctions,
          filename: route.file,
          minify: true,
          routePath: route.path,
          sourceMap: options.sourceMaps !== "none",
          vitePlugins: options.vitePlugins,
        },
      };
    }),
  );
  const clientEntries = entries.filter(
    (entry): entry is PreparedClientRouteEntry => "build" in entry,
  );

  if (clientEntries.length === 0) {
    return {
      assets: [],
      routes: entries.flatMap((entry) => ("manifest" in entry ? [entry.manifest] : [])),
    };
  }

  let output: Awaited<ReturnType<typeof buildClientRouteBatchOutput>>;

  try {
    output = await buildClientRouteBatchOutput({
      assetBaseUrl: options.assetBaseUrl,
      cacheDir: options.cacheDir,
      dropConsoleFunctions: options.clientConsolePureFunctions,
      minify: true,
      projectRoot: options.projectRoot,
      routes: clientEntries.map((entry) => entry.build),
      sourceMap: options.sourceMaps !== "none",
      vitePlugins: options.vitePlugins,
    });
  } catch (error) {
    const routeContexts = clientEntries
      .map((entry) => `Failed to build client bundle for ${entry.route.path} (${entry.route.file}).`)
      .join("\n");

    throw new Error(`${routeContexts}\nFailed to build client route bundles.\n${errorMessage(error)}`, {
      cause: error,
    });
  }

  const routeOutputs = new Map(output.routes.map((route) => [route.routePath, route]));
  const mapAssets = new Map(
    output.chunks.flatMap((chunk) =>
      chunk.map === undefined ? [] : [[`${chunk.fileName}.map`, chunk.map] as const]
    ),
  );

  for (const chunk of output.chunks) {
    const scriptBasename = chunk.fileName.split("/").pop() ?? "chunk.js";
    const code = applyClientSourceMapReference({
      code: chunk.code,
      scriptBasename,
      sourceMaps: options.sourceMaps,
    });

    await mkdir(dirname(join(options.clientDir, chunk.fileName)), { recursive: true });
    await writeFile(join(options.clientDir, chunk.fileName), code);
  }

  for (const [sourceMap, map] of mapAssets) {
    const mapBaseDir = options.sourceMaps === "hidden" ? options.sourceMapDir : options.clientDir;

    await mkdir(dirname(join(mapBaseDir, sourceMap)), { recursive: true });
    await writeFile(join(mapBaseDir, sourceMap), map);
  }

  for (const asset of output.assets ?? []) {
    const source =
      typeof asset.source === "string"
        ? asset.source
        : Buffer.from(asset.source).toString("utf8");

    await mkdir(dirname(join(options.clientDir, asset.fileName)), { recursive: true });
    await writeFile(join(options.clientDir, asset.fileName), source);
  }

  const generatedAssets = new Set<string>();

  for (const chunk of output.chunks) {
    generatedAssets.add(chunk.fileName);
    if (options.sourceMaps === "linked" && chunk.map !== undefined) {
      generatedAssets.add(`${chunk.fileName}.map`);
    }
  }

  for (const asset of output.assets ?? []) {
    generatedAssets.add(asset.fileName);
  }

  const routes = entries.map((entry) => {
    if (!("build" in entry)) {
      return entry.manifest;
    }

    const routeOutput = routeOutputs.get(entry.route.path);

    if (routeOutput === undefined) {
      throw new Error(`Failed to build client bundle for ${entry.route.path}: missing output.`);
    }

    const routeId = routeIdForPath(entry.route.path);
    const sourceMap = `${routeOutput.chunk.fileName}.map`;
    const code = applyClientSourceMapReference({
      code: routeOutput.chunk.code,
      scriptBasename: routeOutput.chunk.fileName.split("/").pop() ?? "route.js",
      sourceMaps: options.sourceMaps,
    });

    return {
      bytes: Buffer.byteLength(code),
      path: entry.route.path,
      kind: entry.route.kind,
      client: true,
      ...(entry.build.clientReferenceManifest === undefined ||
      entry.build.clientReferenceManifest.length === 0
        ? {}
        : { clientReferenceManifest: entry.build.clientReferenceManifest }),
      ...(entry.css.length === 0 ? {} : { css: entry.css }),
      ...(routeOutput.chunk.imports.length === 0 ? {} : { imports: routeOutput.chunk.imports }),
      ...(entry.navigation ? { navigation: entry.navigation } : {}),
      routeId,
      script: routeOutput.chunk.fileName,
      ...(options.sourceMaps === "linked" ? { sourceMap } : {}),
      devScript: clientScriptForPath(entry.route.path),
    };
  });

  return {
    assets: Array.from(generatedAssets).sort(),
    routes,
  };
}

async function writeRouteCssAssetBatches(options: {
  appDir: string;
  cacheDir?: string | undefined;
  clientDir: string;
  pageRoutes: readonly (AppRoute & { kind: "page" })[];
  projectRoot: string;
  sourceAnalysis: BuildSourceAnalysisScope;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<Map<string, string[]>> {
  const cssInputs = await mapWithBuildConcurrency(options.pageRoutes, async (route) => {
    const cssFiles = await collectRouteCssFilesFromSources({
      appDir: options.appDir,
      pageFile: route.file,
      projectRoot: options.projectRoot,
      readSource: (file) => buildSourceAnalysisForFile(options.sourceAnalysis, options.projectRoot, file)?.source,
    });

    return { cssFiles, route };
  });
  const groups = new Map<string, { cssFiles: string[]; routeIds: string[]; routeFiles: string[] }>();

  for (const { cssFiles, route } of cssInputs) {
    if (cssFiles.length === 0) {
      continue;
    }

    const key = cssFiles.join("\0");
    const group = groups.get(key) ?? { cssFiles, routeFiles: [], routeIds: [] };
    group.routeFiles.push(route.file);
    group.routeIds.push(routeIdForPath(route.path));
    groups.set(key, group);
  }

  const writtenGroups = await mapWithBuildConcurrency([...groups.entries()], async ([key, group]) => [
    key,
    await writeRouteCssAssetsForFiles({
      cacheDir: options.cacheDir,
      clientDir: options.clientDir,
      cssFiles: group.cssFiles,
      pageFile: group.routeFiles[0] ?? options.appDir,
      projectRoot: options.projectRoot,
      routeIds: group.routeIds,
      vitePlugins: options.vitePlugins,
    }),
  ] as const);
  const cssByGroup = new Map(writtenGroups);
  const cssByRoute = new Map<string, string[]>();

  for (const [key, group] of groups) {
    const css = cssByGroup.get(key) ?? [];

    for (const routeFile of group.routeFiles) {
      cssByRoute.set(routeFile, css);
    }
  }

  return cssByRoute;
}

async function writeRouteCssAssetsForFiles(options: {
  cacheDir?: string | undefined;
  clientDir: string;
  cssFiles: readonly string[];
  pageFile: string;
  projectRoot: string;
  routeIds: readonly string[];
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string[]> {
  const cssFiles = [...options.cssFiles];
  if (cssFiles.length === 0) {
    return [];
  }

  const code = [
    ...cssFiles.map((file) => `import ${JSON.stringify(file)};`),
    "export default undefined;",
  ].join("\n");
  const output = await bundleRouterModule({
    cacheDir: options.cacheDir,
    code,
    filename: options.pageFile,
    minify: true,
    platform: "browser",
    root: options.projectRoot,
    vitePlugins: options.vitePlugins,
  });
  const cssAssets = (output.assets ?? []).filter((asset) => asset.fileName.endsWith(".css"));
  const written: string[] = [];
  const routeStem = options.routeIds.length === 1
    ? (options.routeIds[0] ?? "index")
    : `shared.${hashText(cssFiles.join("\0")).slice(0, 8)}`;

  for (const [index, asset] of cssAssets.entries()) {
    const source =
      typeof asset.source === "string"
        ? asset.source
        : Buffer.from(asset.source).toString("utf8");
    const hash = createHash("sha256").update(source).digest("hex").slice(0, 8);
    const cssFile = `assets/routes/${routeStem}${cssAssets.length === 1 ? "" : `.${index}`}.${hash}.css`;

    await mkdir(dirname(join(options.clientDir, cssFile)), { recursive: true });
    await writeFile(join(options.clientDir, cssFile), source);
    written.push(cssFile);
  }

  return written;
}

function applyClientSourceMapReference(options: {
  code: string;
  scriptBasename: string;
  sourceMaps: AppRouterClientSourceMapMode;
}): string {
  const sourceMappingUrlPattern = /\n?\/\/# sourceMappingURL=route\.js\.map\s*$/;

  if (options.sourceMaps === "none") {
    return options.code;
  }

  if (options.sourceMaps === "hidden") {
    return options.code.replace(sourceMappingUrlPattern, "");
  }

  const code = options.code.replace(
    sourceMappingUrlPattern,
    `\n//# sourceMappingURL=${options.scriptBasename}.map`,
  );

  return code.includes("sourceMappingURL=")
    ? code
    : `${code}\n//# sourceMappingURL=${options.scriptBasename}.map`;
}

async function writeNavigationRuntimeBundle(
  clientDir: string,
  dropConsoleFunctions: readonly string[] | undefined,
): Promise<string> {
  const output = await buildNavigationRuntimeBundle({
    dropConsoleFunctions,
    minify: true,
    sourceMap: false,
  });
  const hash = createHash("sha256").update(output.code).digest("hex").slice(0, 8);
  const script = `assets/navigation.${hash}.js`;

  await mkdir(dirname(join(clientDir, script)), { recursive: true });
  await writeFile(join(clientDir, script), output.code);

  return script;
}

async function writeAwsLambdaHandlerArtifact(outDir: string): Promise<void> {
  const awsLambdaDir = join(outDir, "aws-lambda");
  await mkdir(awsLambdaDir, { recursive: true });
  await writeFile(join(awsLambdaDir, "mreact-handler.mjs"), awsLambdaHandlerSource(".."));
}

async function writeCloudflareWorkerArtifact(options: {
  cloudflareDir: string;
  clientManifest: { publicAssets?: readonly string[]; routes: readonly ClientRouteManifestEntry[] };
  modulesFile: string;
  serverManifest: BuiltServerManifest;
}): Promise<void> {
  await writeFile(
    join(options.cloudflareDir, "worker.mjs"),
    [
      `import { createCloudflareBuiltRequestHandler, createCloudflareRouteModuleRenderer, createCloudflareStaticAssetLoader } from "@reckona/mreact-router/adapters/cloudflare";`,
      `import { routeModules } from ${JSON.stringify(`./${options.modulesFile}`)};`,
      ``,
      `const serverManifest = ${JSON.stringify(options.serverManifest, null, 2)};`,
      `const clientManifest = ${JSON.stringify(options.clientManifest, null, 2)};`,
      ``,
      `export default createCloudflareBuiltRequestHandler({`,
      `  assets: createCloudflareStaticAssetLoader({`,
      `    binding: (env) => env?.ASSETS,`,
      `    clientManifest,`,
      `  }),`,
      `  clientManifest,`,
      `  renderRoute: createCloudflareRouteModuleRenderer({ modules: routeModules }),`,
      `  serverManifest,`,
      `});`,
      ``,
    ].join("\n"),
  );
}

export async function packageAwsLambdaArtifact(
  options: PackageAwsLambdaArtifactOptions,
): Promise<AwsLambdaArtifactManifest> {
  await assertRequiredBuildFile(join(options.fromDir, "server", "manifest.json"));
  await assertRequiredBuildFile(join(options.fromDir, "server", "import-policy.json"));
  await assertRequiredBuildFile(join(options.fromDir, "client", "manifest.json"));

  await rm(options.outDir, { force: true, recursive: true });
  await mkdir(options.outDir, { recursive: true });
  await cp(options.fromDir, join(options.outDir, ".mreact"), {
    force: true,
    recursive: true,
  });
  await copyAwsLambdaProjectMetadata({
    fromDir: dirname(options.fromDir),
    outDir: options.outDir,
  });
  if (options.handlerEntry === undefined) {
    await writeFile(join(options.outDir, "mreact-handler.mjs"), awsLambdaHandlerSource(".mreact"));
  } else {
    await writeAwsLambdaCustomHandlerArtifact({
      entry: options.handlerEntry,
      projectRoot: dirname(options.fromDir),
      outDir: options.outDir,
    });
  }

  if (options.skipRuntimeDependencyCheck !== true) {
    await assertAwsLambdaRuntimeDependencies(options.outDir);
  }

  const files = await collectArtifactFiles(options.outDir, "");
  const manifest = {
    files,
    handler: "mreact-handler.handler",
    runtime: "aws-lambda",
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    version: 1,
  } satisfies AwsLambdaArtifactManifest;

  await writeFile(
    join(options.outDir, "mreact-lambda-artifact.json"),
    JSON.stringify(manifest, null, 2),
  );

  return manifest;
}

async function writeAwsLambdaCustomHandlerArtifact(options: {
  entry: string;
  outDir: string;
  projectRoot: string;
}): Promise<void> {
  const entry = resolve(options.entry);
  const output = await bundleRouterModule({
    code: await readFile(entry, "utf8"),
    filename: entry,
    outfile: "mreact-handler.mjs",
    platform: "node",
    plugins: [externalizePackageImportsPlugin()],
    preserveExports: true,
    root: options.projectRoot,
    target: "node24",
  });

  await writeFile(join(options.outDir, "mreact-handler.mjs"), output.code);
}

function externalizePackageImportsPlugin(): RouterCompatPlugin {
  return {
    name: "mreact-router-externalize-package-imports",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^(?:node:|[A-Za-z@])/ }, (args) =>
        isBarePackageImport(args.path) ? { external: true, path: args.path } : undefined,
      );
    },
  };
}

function isBarePackageImport(specifier: string): boolean {
  return (
    specifier.startsWith("node:") ||
    (!specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.includes("\\"))
  );
}

async function assertAwsLambdaRuntimeDependencies(outDir: string): Promise<void> {
  try {
    const info = await stat(join(outDir, "node_modules", "@reckona", "mreact-router", "package.json"));
    if (info.isFile()) {
      return;
    }
  } catch {
    // Throw the actionable error below.
  }

  throw new Error(
    [
      "AWS Lambda artifact is missing production runtime dependencies.",
      "Install production dependencies into the package directory before deployment,",
      "or rerun with --skip-runtime-dependency-check only when a later deploy step installs them into .lambda/node_modules.",
    ].join(" "),
  );
}

export async function packageCloudflarePagesArtifact(
  options: PackageCloudflarePagesArtifactOptions,
): Promise<CloudflarePagesArtifactManifest> {
  const clientManifestPath = join(options.fromDir, "client", "manifest.json");
  const workerPath = join(options.fromDir, "cloudflare", "worker.mjs");

  await assertRequiredBuildFile(clientManifestPath);
  await assertRequiredBuildFile(workerPath);
  await assertRequiredBuildFile(join(options.fromDir, "cloudflare", "route-modules.mjs"));
  assertPackageOutputDoesNotReplaceBuildOutput(options);

  const clientManifest = JSON.parse(await readFile(clientManifestPath, "utf8")) as {
    publicAssets?: readonly string[] | undefined;
  };

  await rm(options.outDir, { force: true, recursive: true });
  await mkdir(options.outDir, { recursive: true });
  await cp(join(options.fromDir, "client"), join(options.outDir, "_mreact", "client"), {
    force: true,
    recursive: true,
  });
  await copyCloudflarePagesPublicAssets({
    clientDir: join(options.fromDir, "client"),
    outDir: options.outDir,
    publicAssets: clientManifest.publicAssets ?? [],
  });

  const bundledWorker = await bundleRouterModule({
    code: await readFile(workerPath, "utf8"),
    filename: workerPath,
    minify: true,
    modulePreload: false,
    nodeBuiltins: "externalize",
    outfile: "_worker.js",
    platform: "browser",
    plugins: [cloudflareWorkspaceRuntimePlugin()],
    preserveExports: true,
    target: "es2022",
  });
  await writeFile(join(options.outDir, "_worker.js"), bundledWorker.code);

  const files = await collectArtifactFiles(options.outDir, "");
  const manifest = {
    files,
    runtime: "cloudflare-pages",
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    version: 1,
    worker: "_worker.js",
  } satisfies CloudflarePagesArtifactManifest;

  await writeFile(
    join(options.outDir, "mreact-cloudflare-pages-artifact.json"),
    JSON.stringify(manifest, null, 2),
  );

  return manifest;
}

async function assertRequiredBuildFile(path: string): Promise<void> {
  try {
    const info = await stat(path);
    if (info.isFile()) {
      return;
    }
  } catch {
    // Throw the actionable error below.
  }

  throw new Error(`Missing required mreact build artifact: ${path}`);
}

function assertPackageOutputDoesNotReplaceBuildOutput(options: {
  fromDir: string;
  outDir: string;
}): void {
  if (resolve(options.fromDir) === resolve(options.outDir)) {
    throw new Error("Package output directory must be different from the mreact build output directory.");
  }
}

async function copyCloudflarePagesPublicAssets(options: {
  clientDir: string;
  outDir: string;
  publicAssets: readonly string[];
}): Promise<void> {
  for (const asset of options.publicAssets) {
    if (!asset.startsWith("/") || asset.startsWith("//") || asset.includes("..")) {
      continue;
    }

    const relativeAsset = asset.slice(1);
    await mkdir(dirname(join(options.outDir, relativeAsset)), { recursive: true });
    await copyFile(join(options.clientDir, relativeAsset), join(options.outDir, relativeAsset));
  }
}

async function copyAwsLambdaProjectMetadata(options: {
  fromDir: string;
  outDir: string;
}): Promise<void> {
  for (const file of [
    "package.json",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "bun.lock",
  ]) {
    try {
      await cp(join(options.fromDir, file), join(options.outDir, file), { force: true });
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

async function collectArtifactFiles(
  rootDir: string,
  relativeDir: string,
): Promise<Array<{ bytes: number; path: string }>> {
  const entries = await readdir(join(rootDir, relativeDir), { withFileTypes: true });
  const files: Array<{ bytes: number; path: string }> = [];

  for (const entry of entries) {
    const relativePath = relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`;
    const absolutePath = join(rootDir, relativePath);

    if (entry.isDirectory()) {
      files.push(...(await collectArtifactFiles(rootDir, relativePath)));
      continue;
    }

    if (entry.isFile()) {
      const info = await stat(absolutePath);
      files.push({ bytes: info.size, path: relativePath });
    }
  }

  return files.sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path));
}

function awsLambdaHandlerSource(outDirRelativeToHandler: string): string {
  return `import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createPreloadedAwsLambdaRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";

const here = dirname(fileURLToPath(import.meta.url));

export const handler = await createPreloadedAwsLambdaRequestHandler({
  importPolicy: "generated",
  outDir: resolve(here, ${JSON.stringify(outDirRelativeToHandler)}),
  preload: { mode: "all" },
  timings: process.env.MREACT_ROUTER_TIMINGS === "1",
});
`;
}

async function validateProductionRoutes(options: {
  clientRouteInferenceCache: ClientRouteInferenceCache;
  files: Record<string, string>;
  project: ResolvedAppRouterProject;
  projectRoot: string;
  routes: readonly AppRoute[];
  sourceAnalysis: BuildSourceAnalysisScope;
  serverTransformCache: ServerTransformCache;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<void> {
  for (const route of options.routes) {
    if (route.kind !== "page") {
      continue;
    }

    const filename = relative(options.projectRoot, route.file);
    const analysis = options.sourceAnalysis.byRouteFile.get(filename.split(sep).join("/"));

    if (analysis === undefined) {
      continue;
    }

    const output = await transformServerRouteSource({
      cache: options.serverTransformCache,
      code: analysis.routeCode,
      clientBoundaryImports: analysis.clientBoundaryImports,
      filename: route.file,
      moduleContextCache: options.clientRouteInferenceCache,
      serverOutput: analysis.streamRoute ? "stream" : "string",
    });
    const fatalDiagnostics = output.diagnostics.filter(
      (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
    );

    if (fatalDiagnostics.length > 0) {
      throw new Error(
        fatalDiagnostics.map((diagnostic) => formatDiagnostic(route.file, diagnostic)).join("\n"),
      );
    }
  }
}

async function collectBuildFiles(
  projectRoot: string,
  allowedSourceDirs: readonly string[],
  appDir: string,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  for (const directory of allowedSourceDirs) {
    const sourceFiles = (await collectFiles(directory)).flatMap((file) => {
      const relativeFile = relative(projectRoot, file);

      if (
        relativeFile === "" ||
        relativeFile.startsWith("..") ||
        relativeFile.startsWith(sep) ||
        isAppFileConventionAsset(file, appDir) ||
        isProductionBuildIgnoredSourceFile(relativeFile)
      ) {
        return [];
      }

      return [{ file, relativeFile }];
    });
    const fileContents = await mapWithBuildConcurrency(sourceFiles, async ({ file, relativeFile }) => [
      relativeFile,
      await readFile(file, "utf8"),
    ] as const);

    for (const [relativeFile, source] of fileContents) {
      files[relativeFile] = source;
    }
  }

  return files;
}

function isProductionBuildIgnoredSourceFile(relativeFile: string): boolean {
  return /(?:^|[/\\])[^/\\]+\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(relativeFile);
}

function isAppFileConventionAsset(file: string, appDir: string): boolean {
  const relativeFile = relative(appDir, file);
  if (relativeFile === "" || relativeFile.startsWith("..") || relativeFile.includes(sep)) {
    return false;
  }

  return appFileConventionForRootFilename(relativeFile)?.kind === "asset";
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await mapWithBuildConcurrency(entries, async (entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return await collectFiles(path);
    }

    if (entry.isFile()) {
      return [path];
    }

    return [];
  });

  return nestedFiles.flat();
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
