import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { formatDiagnostic, transform } from "@reckona/mreact-compiler";
import type {
  ClientReferenceMetadata,
  ServerOutputMode,
  TransformOutput,
} from "@reckona/mreact-shared/compiler-contract";
import {
  createQueryClient,
  dehydrate,
  __MREACT_QUERY_STATE_SCRIPT_ID,
  installQueryAsyncStorage,
  runWithQueryClient,
  type DehydratedQueryClient,
  type DehydrateOptions,
  type QueryClient,
} from "@reckona/mreact-query";
import {
  createStringSink,
  type HtmlSink,
  renderOutOfOrderBoundary,
  renderOutOfOrderReorderScript,
  renderReactNodeToString,
  renderToReadableStream,
} from "@reckona/mreact-server";
import {
  createClientRouteInferenceCache,
  formatClientRouteInferenceDiagnostic,
  inferClientRouteModule,
  type ClientRouteInferenceCache,
  type ClientRouteInferenceResult,
} from "./client-route-inference.js";
import {
  hydrationMarkerParts,
  routeMarkerParts,
  routeIdForPath,
  withHydrationMarkers,
} from "./navigation-runtime.js";
import { assetPath } from "./assets.js";
import { escapeHtmlAttribute } from "@reckona/mreact-shared/html-escape";
import { matchRoute, scanAppRoutes } from "./routes.js";
import type { AppRoute, MatchedRoute, RouteMatcher } from "./routes.js";
import { appFileConventionContentType } from "./file-conventions.js";
import {
  type AppRouterServerActionOptions,
  type PreparedFormActionReference,
  dispatchServerActionRequest,
  prepareRouteServerActionPlaceholders,
  prepareRouteServerActions,
} from "./actions.js";
import { serverActionCookie } from "./csrf.js";
import {
  type AppRouterCache,
  activeRouteCacheContext,
  withRouteCacheContext,
  cachedRouteResponse,
  cacheRouteResponse,
  routeCacheKey,
  routeCachePolicyFromSource,
} from "./cache.js";
import {
  trackRequestHeaderReads,
  routeLocationFromRequest,
  routeLocationForHydration,
  routeLocationFromUrl,
  type TrackedHeaderRequest,
  withTrackedRouteLocation,
  withTrackedRequest,
} from "./request-header-tracking.js";
import { configuredHstsHeader, hasInvalidConfiguredHsts } from "./security-headers.js";
import { resolveRouterCacheLimit } from "./cache-config.js";
import { protectNonceBearingResponse } from "./prerender-entry.js";
import {
  importAppRouterBuiltFileModule,
  importAppRouterFileModule,
  importAppRouterSourceModule,
  fileImportMetaUrlPlugin,
  rewriteCompatVendorPlaceholderImportsForRunner,
} from "./module-runner.js";
import { bytesResponse, htmlResponse } from "./http.js";
import { isNotFoundError, isRedirectError, rewriteLocation } from "./navigation.js";
import { createAppRouterImportPolicyPlugin, type AppRouterImportPolicy } from "./import-policy.js";
import { existingRouteShellCandidates } from "./route-shells.js";
import type { PluginOption, UserConfig } from "vite";
import type { BuiltRouteSourceAnalysisSummary, BuiltServerModuleArtifact } from "./build.js";
import {
  hasLoaderExport,
  isStreamRouteSource,
  routeClosureMayUseAwaitBoundary,
  routeClosureMayUseRequestInput,
  stripRouteBuildExports,
  stripRouteModuleExports,
  stripRouteClientOnlyExports,
  stripRouteClientSource,
  stripRouteLoaderOnlyExports,
  stripRouteMetadataOnlyExports,
} from "./route-source.js";
import { emitRouterLog, logDurationMs, logNow, type AppRouterLogger } from "./logger.js";
import {
  createRouterRuntimeCacheCounters,
  readRouterRuntimeCacheEntry,
  routerRuntimeCacheStat,
  type RouterRuntimeCacheCounters,
  type RouterRuntimeCacheStat,
} from "./cache-stats.js";
import { bundleRouterModule } from "./bundle-pipeline.js";
import { viteDefineCacheKey, vitePluginsCacheKey } from "./vite-plugin-cache-key.js";
import type {
  ManifestDescriptor,
  RobotsManifest,
  RouteLocation,
  RouteParams,
  RouteMetadata,
  SitemapEntry,
} from "./types.js";
import {
  invokeRouterInstrumentation,
  traceContextFromRequest,
  type RouterInstrumentation,
} from "./trace.js";
import {
  mergeRouteMiddlewareControls,
  middlewareMatches,
  parseRouteMiddlewareControl,
  parseStaticMiddlewareConfig,
  shouldSkipMiddleware,
  validateRouteMiddlewareControl,
  type MiddlewareModule,
  type RouteMiddlewareControl,
} from "./middleware.js";
import {
  applyFileConventionMetadataTemplate,
  fileConventionMetadataTemplate,
  injectHeadMetadata,
  mergeRouteMetadata,
  responseHeadersForMetadata,
  serializeRobots,
  serializeSitemap,
  validateRouteMetadata,
  type FileConventionMetadataTemplate,
} from "./metadata.js";
import {
  createSlotRenderContext,
  markShellBoundary,
  shellBoundaryId,
  splitLayoutSlot,
  warnUnconsumedRouteSlots,
  type ShellFile,
  type SlotRenderContext,
} from "./layout-composer.js";
import {
  importPolicyCacheKey,
  memoizedHashText,
  prebuiltRequestModuleArtifact,
  prebuiltRouteLoaderModuleArtifact,
  prebuiltServerComponentModuleCode,
  prebuiltServerModuleOutputMatches,
  prebuiltServerModuleOutputOptionsMatch,
  type BuiltServerModuleOutputLike,
} from "./route-module-loader.js";
import {
  loadRouteDataFromModule,
  type RouteDataContext,
  type RouteLoaderModule,
} from "./route-loader-runtime.js";
import { pageRouteMethodResponse } from "./route-dispatch.js";

const nativeEscapeTransform = {
  batchImportName: "escapeHtmlBatch",
  batchImportSource: "@reckona/mreact-router/native-escape",
} as const;
const authRuntimeStateKey = "__mreactAuthRuntimeState";
const authSessionScriptId = "__mreact_auth_session";

installQueryAsyncStorage(new AsyncLocalStorage<QueryClient>());

interface AuthRuntimeRequestState {
  claims?: unknown;
}

interface AuthRuntimeState {
  storage?: AsyncLocalStorage<AuthRuntimeRequestState> | undefined;
}

interface RenderTiming {
  phases: Record<string, number>;
}

/**
 * Loads prebuilt server render artifacts immediately before a route render needs them.
 */
export interface AppRouterServerRenderArtifactLoader {
  load(routeFile: string): Promise<void>;
}

/**
 * Configures server rendering for a source app-router request.
 */
export interface RenderAppRequestOptions {
  appDir: string;
  assetBaseUrl?: string | undefined;
  clientRouteInferenceCache?: ClientRouteInferenceCache | undefined;
  clientScripts?: ReadonlyMap<string, string>;
  clientStylesByFile?: ReadonlyMap<string, readonly string[]>;
  clientStyles?: ReadonlyMap<string, readonly string[]>;
  define?: UserConfig["define"] | undefined;
  dehydrateOptions?: DehydrateOptions | undefined;
  env?: unknown;
  importPolicy?: AppRouterImportPolicy | undefined;
  instrumentation?: RouterInstrumentation | undefined;
  logger?: AppRouterLogger | undefined;
  navigationScripts?: ReadonlyMap<string, string> | undefined;
  onRenderError?: ((error: unknown) => void) | undefined;
  onResponse?: AppRouterResponseHook | undefined;
  queryClient?: QueryClient | undefined;
  request: Request;
  requestUrl?: URL | undefined;
  matchedRoute?: MatchedRoute | undefined;
  routeCache?: AppRouterCache | undefined;
  routeMatcher?: RouteMatcher | undefined;
  routes?: readonly AppRoute[] | undefined;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverRenderArtifactLoader?: AppRouterServerRenderArtifactLoader | undefined;
  serverModuleCacheVersion?: string | undefined;
  devServerModuleCacheVersion?: string | undefined;
  // True when serving through a dev server: request-time server transforms
  // are expected there and must not trigger the production prebuild warning.
  dev?: boolean | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
  serverActionReferencesByFile?:
    | ReadonlyMap<string, readonly PreparedFormActionReference[]>
    | undefined;
  skipMiddleware?: boolean | undefined;
  preload?: AppRouterRenderPreload | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}

export interface RenderAppRequestRuntimeOptions extends RenderAppRequestOptions {
  /**
   * Wraps a server-only page with build-time variant capture comments.
   *
   * This is an in-process render signal. It must not be derived from request
   * headers because network clients are not allowed to change response shape
   * outside the route-cache key.
   */
  prerenderVariantCapture?: boolean | undefined;
  /**
   * Receives whether the render depended on the incoming request headers.
   *
   * Callers that store the rendered HTML under a key which ignores headers,
   * such as prerender regeneration, pass this to learn whether the result is
   * only correct for the current visitor. Initialize it to a function returning
   * `true`: a render that returns without reporting back stays header
   * dependent. Call it only after draining the response body, because a
   * streamed render can read headers while its deferred parts resolve.
   */
  renderSignals?:
    | {
        headerDependent: () => boolean;
        strictTransportSecurity: () => string | undefined;
      }
    | undefined;
}

export interface AppRouterRenderPreload {
  promise: Promise<void>;
  wait: "before-render";
}

/**
 * Allows callers to inspect or replace an app-router response before it is returned.
 */
export type AppRouterResponseHook = (
  response: Response,
  context: AppRouterResponseHookContext,
) => Response | undefined | void | Promise<Response | undefined | void>;

/**
 * Provides request context to an app-router response hook.
 */
export interface AppRouterResponseHookContext {
  request: Request;
}

export async function preloadBuiltRequestModules(options: {
  appDir: string;
  define?: UserConfig["define"] | undefined;
  includeRenderModules?: boolean | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
  routes: readonly AppRoute[];
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion: string;
  serverSourceFiles: ReadonlyMap<string, string>;
  serverActionReferencesByFile?:
    | ReadonlyMap<string, readonly PreparedFormActionReference[]>
    | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<void> {
  const clientRouteInferenceCache = createClientRouteInferenceCache();
  const middlewareFiles = [
    join(options.appDir, "middleware.ts"),
    join(options.appDir, "middleware.mreact.ts"),
  ];

  for (const file of middlewareFiles) {
    if (options.serverSourceFiles.has(file)) {
      await loadMiddlewareModule({
        appDir: options.appDir,
        file,
        importPolicy: options.importPolicy,
        serverModules: options.serverModules,
        serverModuleCacheVersion: options.serverModuleCacheVersion,
        serverSourceFiles: options.serverSourceFiles,
        define: options.define,
        vitePlugins: options.vitePlugins,
      });
    }
  }

  for (const route of options.routes) {
    const code = await readServerSourceFile(
      route.file,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
    );

    if (route.kind === "server") {
      await loadServerRouteModule({
        appDir: options.appDir,
        file: route.file,
        importPolicy: options.importPolicy,
        serverModules: options.serverModules,
        serverModuleCacheVersion: options.serverModuleCacheVersion,
        serverSourceFiles: options.serverSourceFiles,
        define: options.define,
        vitePlugins: options.vitePlugins,
      });
      continue;
    }

    if (options.includeRenderModules !== false) {
      const actionReferences = options.serverActionReferencesByFile?.get(route.file) ?? [];
      const analysisCode =
        actionReferences.length === 0
          ? code
          : prepareRouteServerActionPlaceholders({
              code,
              formActionReferences: actionReferences,
            });
      const analysis = await analyzeRouteSource({
        appDir: options.appDir,
        artifact: options.serverModules?.get(route.file)?.analysis,
        buildRenderCode: analysisCode !== code,
        code: analysisCode,
        filename: route.file,
        routePath: route.path,
        clientRouteInferenceCache,
        serverModuleCacheVersion:
          actionReferences.length === 0 ? options.serverModuleCacheVersion : undefined,
        serverSourceFiles: options.serverSourceFiles,
        vitePlugins: options.vitePlugins,
      });
      await preloadBuiltPageRouteModules({
        ...options,
        analysis,
        code: analysisCode,
        file: route.file,
      });
    }

    if (hasLoaderExport(code)) {
      await loadRouteLoaderModule({
        appDir: options.appDir,
        code,
        filename: route.file,
        importPolicy: options.importPolicy,
        serverModules: options.serverModules,
        serverModuleCacheVersion: options.serverModuleCacheVersion,
        define: options.define,
        vitePlugins: options.vitePlugins,
      });
    }
  }
}

async function preloadBuiltPageRouteModules(options: {
  analysis: RouteSourceAnalysis;
  appDir: string;
  code: string;
  define?: UserConfig["define"] | undefined;
  file: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion: string;
  serverSourceFiles: ReadonlyMap<string, string>;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<void> {
  const routeCode = options.analysis.routeCode;
  const stringArtifact = options.serverModules?.get(options.file)?.string;
  const shouldPreloadString =
    !options.analysis.streamRoute ||
    options.serverModules === undefined ||
    stringArtifact !== undefined;

  if (shouldPreloadString) {
    const stringOutput = transformServerModule({
      code: routeCode,
      clientBoundaryImports: options.analysis.clientInference.clientBoundaryImports,
      clientBoundaryFallbackImports: options.analysis.clientInference.clientBoundaryFallbackImports,
      filename: options.file,
      serverModules: options.serverModules,
      serverOutput: "string",
    });
    assertNoFatalServerDiagnostics(options.file, stringOutput.diagnostics);
    await loadServerModule(
      stringOutput.code,
      options.file,
      options.serverModules,
      options.serverModuleCacheVersion,
      options.define,
      options.vitePlugins,
    );
  }

  if (options.analysis.streamRoute) {
    const streamOutput = transformServerModule({
      code: routeCode,
      clientBoundaryImports: options.analysis.clientInference.clientBoundaryImports,
      clientBoundaryFallbackImports: options.analysis.clientInference.clientBoundaryFallbackImports,
      filename: options.file,
      serverModules: options.serverModules,
      serverOutput: "stream",
      serverAwaitHydration: options.analysis.clientInference.client,
    });
    assertNoFatalServerDiagnostics(options.file, streamOutput.diagnostics);
    await loadServerStreamModule(
      streamOutput.code,
      options.file,
      options.serverModules,
      options.serverModuleCacheVersion,
      options.define,
      options.vitePlugins,
      undefined,
      { serverAwaitHydration: options.analysis.clientInference.client },
    );
  }

  await preloadShellModulesForPage({
    appDir: options.appDir,
    pageFile: options.file,
    serverModules: options.serverModules,
    serverModuleCacheVersion: options.serverModuleCacheVersion,
    serverSourceFiles: options.serverSourceFiles,
    define: options.define,
    vitePlugins: options.vitePlugins,
  });
  if (!hasGenerateMetadataExport(options.code)) {
    await loadComposedRouteMetadata({
      appDir: options.appDir,
      code: options.code,
      context: {
        data: undefined,
        params: {},
        request: new Request("http://mreact.local/"),
      },
      filename: options.file,
      importPolicy: options.importPolicy,
      routes: [],
      serverModules: options.serverModules,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
      serverSourceFiles: options.serverSourceFiles,
      define: options.define,
      vitePlugins: options.vitePlugins,
    });
  }
}

async function preloadShellModulesForPage(options: {
  appDir: string;
  define?: UserConfig["define"] | undefined;
  pageFile: string;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion: string;
  serverSourceFiles: ReadonlyMap<string, string>;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<void> {
  const shellFiles = await shellFilesForPage(
    options.appDir,
    options.pageFile,
    options.serverModuleCacheVersion,
  );

  for (const shell of shellFiles) {
    const code = await readServerSourceFile(
      shell.file,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
    );
    const output = transformServerModule({
      code,
      filename: shell.file,
      serverModules: options.serverModules,
      serverOutput: "string",
    });
    assertNoFatalServerDiagnostics(shell.file, output.diagnostics);
    await loadServerModule(
      output.code,
      shell.file,
      options.serverModules,
      options.serverModuleCacheVersion,
      options.define,
      options.vitePlugins,
    );
  }
}

function fatalServerDiagnostics(
  diagnostics: TransformOutput["diagnostics"],
): TransformOutput["diagnostics"] {
  return diagnostics.filter(
    (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
  );
}

function formatServerDiagnostics(
  filename: string,
  diagnostics: TransformOutput["diagnostics"],
): string {
  return diagnostics.map((diagnostic) => formatDiagnostic(filename, diagnostic)).join("\n");
}

function assertNoFatalServerDiagnostics(
  filename: string,
  diagnostics: TransformOutput["diagnostics"],
): void {
  const fatalDiagnostics = fatalServerDiagnostics(diagnostics);
  if (fatalDiagnostics.length > 0) {
    throw new Error(formatServerDiagnostics(filename, fatalDiagnostics));
  }
}

interface ServerComponentProps {
  data: unknown;
  params: RouteParams;
  queryClient: QueryClient;
  request: RouteLocation;
}

type ServerComponent = (props: ServerComponentProps) => string | PromiseLike<string>;
type RouteSlotValue = string | ServerComponent;
type RouteSlotExports = Record<string, RouteSlotValue>;
type ServerModuleExports = Record<string, unknown> & {
  App?: ServerComponent;
  default?: ServerComponent;
  slots?: RouteSlotExports;
};
type StreamComponent = (sink: HtmlSink, props: ServerComponentProps) => void | PromiseLike<void>;
type StreamRouteSlotValue = string | StreamComponent;
type StreamRouteSlotExports = Record<string, StreamRouteSlotValue>;
type StreamModuleExports = Record<string, unknown> & {
  App?: StreamComponent;
  default?: StreamComponent;
  slots?: StreamRouteSlotExports;
};

const serverTransformCache = new Map<string, TransformOutput>();
const serverTransformCacheCounters = createRouterRuntimeCacheCounters();
const productionDynamicServerTransformWarned = new Set<string>();
const serverSourceFileCache = new Map<string, Promise<string>>();
const serverSourceFileCacheCounters = createRouterRuntimeCacheCounters();
const routeSourceAnalysisCache = new Map<string, Promise<RouteSourceAnalysis>>();
const routeSourceAnalysisCacheCounters = createRouterRuntimeCacheCounters();
const routeOutOfOrderBoundaryAnalysisCache = new Map<string, Promise<boolean>>();
const routeOutOfOrderBoundaryAnalysisCacheCounters = createRouterRuntimeCacheCounters();
const routeLoaderModuleCache = new Map<string, Promise<RouteLoaderModule>>();
const routeLoaderModuleCacheCounters = createRouterRuntimeCacheCounters();
const routeMetadataModuleCache = new Map<string, Promise<RouteMetadataModule>>();
const routeMetadataModuleCacheCounters = createRouterRuntimeCacheCounters();
const middlewareModuleCache = new Map<string, Promise<MiddlewareModule>>();
const middlewareModuleCacheCounters = createRouterRuntimeCacheCounters();
const serverRouteModuleCache = new Map<string, Promise<Record<string, unknown>>>();
const serverRouteModuleCacheCounters = createRouterRuntimeCacheCounters();
interface ComposedRouteMetadataCacheEntry {
  metadata: RouteMetadata | undefined;
  template: FileConventionMetadataTemplate;
}

const composedRouteMetadataCache = new Map<string, Promise<ComposedRouteMetadataCacheEntry>>();
const composedRouteMetadataCacheCounters = createRouterRuntimeCacheCounters();
const maxServerTransformCacheEntries = resolveRouterCacheLimit("SERVER_TRANSFORM", 512);
const maxServerSourceFileCacheEntries = resolveRouterCacheLimit("SERVER_SOURCE_FILE", 512);
const maxRouteSourceAnalysisCacheEntries = resolveRouterCacheLimit("ROUTE_SOURCE_ANALYSIS", 512);
const maxRouteOutOfOrderBoundaryAnalysisCacheEntries = resolveRouterCacheLimit(
  "ROUTE_OUT_OF_ORDER_BOUNDARY_ANALYSIS",
  512,
);
const maxRouteLoaderModuleCacheEntries = resolveRouterCacheLimit("ROUTE_LOADER_MODULE", 512);
const maxRouteMetadataModuleCacheEntries = resolveRouterCacheLimit("ROUTE_METADATA_MODULE", 512);
const maxMiddlewareModuleCacheEntries = resolveRouterCacheLimit("MIDDLEWARE_MODULE", 64);
const maxServerRouteModuleCacheEntries = resolveRouterCacheLimit("SERVER_ROUTE_MODULE", 512);
const maxComposedRouteMetadataCacheEntries = resolveRouterCacheLimit(
  "COMPOSED_ROUTE_METADATA",
  512,
);

export function routerRenderRuntimeCacheStats(): RouterRuntimeCacheStat[] {
  return [
    routerRuntimeCacheStat(
      "server-transform",
      serverTransformCache,
      maxServerTransformCacheEntries,
      serverTransformCacheCounters,
    ),
    routerRuntimeCacheStat(
      "server-source-file",
      serverSourceFileCache,
      maxServerSourceFileCacheEntries,
      serverSourceFileCacheCounters,
    ),
    routerRuntimeCacheStat(
      "route-source-analysis",
      routeSourceAnalysisCache,
      maxRouteSourceAnalysisCacheEntries,
      routeSourceAnalysisCacheCounters,
    ),
    routerRuntimeCacheStat(
      "route-out-of-order-boundary-analysis",
      routeOutOfOrderBoundaryAnalysisCache,
      maxRouteOutOfOrderBoundaryAnalysisCacheEntries,
      routeOutOfOrderBoundaryAnalysisCacheCounters,
    ),
    routerRuntimeCacheStat(
      "route-loader-module",
      routeLoaderModuleCache,
      maxRouteLoaderModuleCacheEntries,
      routeLoaderModuleCacheCounters,
    ),
    routerRuntimeCacheStat(
      "route-metadata-module",
      routeMetadataModuleCache,
      maxRouteMetadataModuleCacheEntries,
      routeMetadataModuleCacheCounters,
    ),
    routerRuntimeCacheStat(
      "middleware-module",
      middlewareModuleCache,
      maxMiddlewareModuleCacheEntries,
      middlewareModuleCacheCounters,
    ),
    routerRuntimeCacheStat(
      "server-route-module",
      serverRouteModuleCache,
      maxServerRouteModuleCacheEntries,
      serverRouteModuleCacheCounters,
    ),
    routerRuntimeCacheStat(
      "composed-route-metadata",
      composedRouteMetadataCache,
      maxComposedRouteMetadataCacheEntries,
      composedRouteMetadataCacheCounters,
    ),
    // Preserve the public diagnostics entry while making explicit that rendered HTML reuse is disabled.
    {
      evictions: 0,
      hits: 0,
      maxEntries: 0,
      misses: 0,
      name: "rendered-shell",
      size: 0,
    },
  ];
}

interface RenderedShell {
  hasOutOfOrderBoundary: boolean;
  prefix: string;
  suffix: string;
}

interface RouteSourceAnalysis {
  authIncludesClaims: boolean;
  cachePolicy: ReturnType<typeof routeCachePolicyFromSource>;
  clientInference: ClientRouteInferenceResult;
  hasLoader: boolean;
  routeCode: string;
  streamRoute: boolean;
  usesRequestInput: boolean;
  usesRuntimeCacheControl: boolean;
}

/**
 * Renders a source app-router request into a `Response`.
 */
export async function renderAppRequest(options: RenderAppRequestOptions): Promise<Response> {
  const authStorage = authRequestStorage();

  if (authStorage.getStore() === undefined) {
    return authStorage.run({}, () => renderAppRequest(options));
  }

  const trace = traceContextFromRequest(options.request);
  const url = options.requestUrl ?? new URL(options.request.url);
  const requestEvent = {
    method: options.request.method,
    path: url.pathname,
    request: options.request,
    ...(trace === undefined ? {} : { trace }),
  };
  invokeRouterInstrumentation(options.instrumentation?.onRequestStart, requestEvent);
  const response = await renderAppRequestInternal({ ...options, requestUrl: url });
  const finalResponse = protectNonceBearingResponse(
    await applyAppRouterResponseHook(response, options),
  );
  invokeRouterInstrumentation(options.instrumentation?.onRequestEnd, {
    ...requestEvent,
    status: finalResponse.status,
  });

  return finalResponse;
}

function createRenderTiming(logger: AppRouterLogger | undefined): RenderTiming | undefined {
  return logger?.debug === undefined ? undefined : { phases: {} };
}

function renderTimingPhaseStartedAt(timing: RenderTiming | undefined): number | undefined {
  return timing === undefined ? undefined : logNow();
}

function finishRenderTimingPhase(
  timing: RenderTiming | undefined,
  startedAt: number | undefined,
  phaseName: string,
): void {
  if (timing === undefined || startedAt === undefined) {
    return;
  }

  timing.phases[phaseName] = logDurationMs(startedAt);
}

type ObservedPromiseSettlement<T> =
  | { status: "pending" }
  | { status: "fulfilled"; value: T }
  | { error: unknown; status: "rejected" };

function observePromiseSettlement<T>(promise: Promise<T>): () => ObservedPromiseSettlement<T> {
  let settlement: ObservedPromiseSettlement<T> = { status: "pending" };

  void promise.then(
    (value) => {
      settlement = { status: "fulfilled", value };
    },
    (error: unknown) => {
      settlement = { error, status: "rejected" };
    },
  );

  return () => settlement;
}

function addRenderTimingPhaseDuration(
  timing: RenderTiming | undefined,
  startedAt: number | undefined,
  phaseName: string,
): void {
  if (timing === undefined || startedAt === undefined) {
    return;
  }

  timing.phases[phaseName] = (timing.phases[phaseName] ?? 0) + logDurationMs(startedAt);
}

async function waitForRenderPreload(
  options: Pick<RenderAppRequestOptions, "preload">,
  timing: RenderTiming | undefined,
): Promise<void> {
  if (options.preload?.wait !== "before-render") {
    return;
  }

  const phaseStartedAt = renderTimingPhaseStartedAt(timing);
  try {
    await options.preload.promise;
  } finally {
    finishRenderTimingPhase(timing, phaseStartedAt, "preloadWaitMs");
  }
}

async function loadServerRenderArtifacts(
  options: RenderAppRequestRuntimeOptions,
  routeFile: string,
  timing: RenderTiming | undefined,
): Promise<void> {
  const loader = options.serverRenderArtifactLoader;

  if (loader === undefined) {
    return;
  }

  const phaseStartedAt = renderTimingPhaseStartedAt(timing);
  try {
    await loader.load(routeFile);
  } finally {
    finishRenderTimingPhase(timing, phaseStartedAt, "renderArtifactLoadMs");
  }
}

function emitRenderTiming(
  options: RenderAppRequestRuntimeOptions,
  timing: RenderTiming | undefined,
  status: number,
): void {
  if (timing === undefined) {
    return;
  }

  emitRouterLog(options.logger, "debug", {
    method: options.request.method,
    path: new URL(options.request.url).pathname,
    phases: timing.phases,
    status,
    type: "router:render:timing",
  });
}

export type AppRouterMiddlewareResult =
  | { request: Request; type: "continue" }
  | { response: Response; type: "response" };

export async function resolveAppRouterMiddleware(options: {
  appDir: string;
  define?: UserConfig["define"] | undefined;
  devServerModuleCacheVersion?: string | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
  instrumentation?: RouterInstrumentation | undefined;
  middlewareControl?: RouteMiddlewareControl | undefined;
  request: Request;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
  timing?: RenderTiming | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<AppRouterMiddlewareResult> {
  const middlewareResponse = await runMiddleware(options);

  if (middlewareResponse === undefined) {
    return { request: options.request, type: "continue" };
  }

  const location = rewriteLocation(middlewareResponse);

  if (location !== undefined) {
    return {
      request: new Request(new URL(location, options.request.url), options.request),
      type: "continue",
    };
  }

  return { response: middlewareResponse, type: "response" };
}

async function renderAppRequestInternal(
  options: RenderAppRequestRuntimeOptions,
): Promise<Response> {
  warnProductionRenderWithoutPrebuiltModules(options);
  const timing = createRenderTiming(options.logger);
  const clientRouteInferenceCache =
    options.clientRouteInferenceCache ?? createClientRouteInferenceCache();
  let phaseStartedAt = renderTimingPhaseStartedAt(timing);
  const routes = options.routes ?? (await scanAppRoutes({ appDir: options.appDir }));
  finishRenderTimingPhase(timing, phaseStartedAt, "routeScanMs");
  const url = options.requestUrl ?? new URL(options.request.url);
  phaseStartedAt = renderTimingPhaseStartedAt(timing);
  const matched =
    options.matchedRoute ??
    options.routeMatcher?.match(url.pathname) ??
    matchRoute(routes, url.pathname);
  finishRenderTimingPhase(timing, phaseStartedAt, "routeMatchMs");
  const hasMiddleware =
    options.skipMiddleware === true
      ? false
      : await hasAppMiddleware({
          appDir: options.appDir,
          serverModuleCacheVersion: options.serverModuleCacheVersion,
          serverSourceFiles: options.serverSourceFiles,
        });
  const middlewareControl =
    hasMiddleware && matched?.route.kind === "page"
      ? await loadRouteMiddlewareControl({
          appDir: options.appDir,
          pageFile: matched.route.file,
          serverModuleCacheVersion: options.serverModuleCacheVersion,
          serverSourceFiles: options.serverSourceFiles,
        })
      : undefined;
  phaseStartedAt = renderTimingPhaseStartedAt(timing);
  const middlewareResult =
    options.skipMiddleware === true || !hasMiddleware
      ? ({ request: options.request, type: "continue" } satisfies AppRouterMiddlewareResult)
      : await resolveAppRouterMiddleware({
          appDir: options.appDir,
          devServerModuleCacheVersion: options.devServerModuleCacheVersion,
          importPolicy: options.importPolicy,
          instrumentation: options.instrumentation,
          middlewareControl,
          request: options.request,
          serverModules: options.serverModules,
          serverModuleCacheVersion: options.serverModuleCacheVersion,
          serverSourceFiles: options.serverSourceFiles,
          timing,
          define: options.define,
          vitePlugins: options.vitePlugins,
        });
  finishRenderTimingPhase(timing, phaseStartedAt, "middlewareMs");

  if (middlewareResult.type === "response") {
    emitRenderTiming(options, timing, middlewareResult.response.status);
    return middlewareResult.response;
  }

  if (middlewareResult.request !== options.request) {
    return renderAppRequestInternal({
      ...options,
      matchedRoute: undefined,
      request: middlewareResult.request,
      requestUrl: new URL(middlewareResult.request.url),
      skipMiddleware: true,
    });
  }

  if (url.pathname === "/_mreact/actions") {
    return dispatchServerActionRequest({
      appDir: options.appDir,
      importPolicy: options.importPolicy,
      request: options.request,
      renderSingleFlightNavigation: async (singleFlight) =>
        renderAppRequestInternal({
          ...options,
          matchedRoute: undefined,
          // This renders a different route than the caller asked about, so its
          // header dependence says nothing about the caller's request.
          renderSignals: undefined,
          request: singleFlightNavigationRequest({
            path: singleFlight.path,
            request: singleFlight.request,
          }),
          requestUrl: undefined,
        }),
      routeCache: options.routeCache,
      ...(options.serverModuleCacheVersion === undefined
        ? {}
        : { serverActionCacheVersion: options.serverModuleCacheVersion }),
      serverActions: options.serverActions,
    });
  }

  if (matched === undefined) {
    const notFoundFile = await nearestBoundaryFileForPath({
      appDir: options.appDir,
      filename: "not-found.mreact.tsx",
      pathname: url.pathname,
      serverSourceFiles: options.serverSourceFiles,
    });

    const response = await renderSpecialRoute({
      appDir: options.appDir,
      assetBaseUrl: options.assetBaseUrl,
      currentStyleSheets: options.clientStylesByFile?.get(notFoundFile),
      error: undefined,
      request: options.request,
      routePath: url.pathname,
      routeFile: notFoundFile,
      routeScripts: options.clientScripts,
      serverModules: options.serverModules,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
      serverSourceFiles: options.serverSourceFiles,
      vitePlugins: options.vitePlugins,
      status: 404,
      textFallback: "Not Found",
    });
    emitRenderTiming(options, timing, response.status);
    return response;
  }

  const queryClient = options.queryClient ?? createQueryClient();
  let recoveryRoute:
    | {
        clientRoute: boolean;
        props: unknown;
        routePath: string;
        script: string | undefined;
      }
    | undefined;
  let trackedRequest: TrackedHeaderRequest | undefined;
  let sourceUsesRequestInput = true;
  let invalidConfiguredHsts = false;
  let renderedStrictTransportSecurity: string | undefined;
  return (
    await withRouteCacheContext(options.routeCache, async () => {
      try {
        if (matched.route.kind === "asset") {
          return await dispatchConventionAssetRoute({
            file: matched.route.file,
            request: options.request,
          });
        }

        if (matched.route.kind === "metadata") {
          return await dispatchMetadataRoute({
            appDir: options.appDir,
            file: matched.route.file,
            importPolicy: options.importPolicy,
            params: matched.params,
            request: options.request,
            route: matched.route,
            serverModules: options.serverModules,
            serverModuleCacheVersion: options.serverModuleCacheVersion,
            serverSourceFiles: options.serverSourceFiles,
            vitePlugins: options.vitePlugins,
          });
        }

        if (matched.route.kind === "server") {
          return await dispatchServerRoute({
            appDir: options.appDir,
            env: options.env,
            file: matched.route.file,
            importPolicy: options.importPolicy,
            params: matched.params,
            request: options.request,
            route: matched.route,
            serverModules: options.serverModules,
            serverModuleCacheVersion: options.serverModuleCacheVersion,
            serverSourceFiles: options.serverSourceFiles,
            vitePlugins: options.vitePlugins,
          });
        }

        // Issue 080: page routes render HTML for GET / HEAD only. Other
        // methods (PUT, PATCH, DELETE, PROPFIND, ...) get 405 with an
        // Allow header so the response shape complies with RFC 9110 §9
        // and so caching intermediaries do not cross-cache method results.
        const methodResponse = pageRouteMethodResponse(options.request.method);
        if (methodResponse !== undefined) {
          return methodResponse;
        }

        const clientScript = options.clientScripts?.get(matched.route.path);
        const clientStyleSheets = options.clientStyles?.get(matched.route.path);
        phaseStartedAt = renderTimingPhaseStartedAt(timing);
        const originalCode = await readServerSourceFile(
          matched.route.file,
          options.serverModuleCacheVersion,
          options.serverSourceFiles,
        );
        finishRenderTimingPhase(timing, phaseStartedAt, "readSourceMs");
        phaseStartedAt = renderTimingPhaseStartedAt(timing);
        const originalAnalysis = await analyzeRouteSource({
          appDir: options.appDir,
          artifact: options.serverModules?.get(matched.route.file)?.analysis,
          code: originalCode,
          filename: matched.route.file,
          routePath: matched.route.path,
          clientRouteInferenceCache,
          serverModuleCacheVersion: options.serverModuleCacheVersion,
          serverSourceFiles: options.serverSourceFiles,
          define: options.define,
          timing,
          vitePlugins: options.vitePlugins,
        });
        sourceUsesRequestInput = originalAnalysis.usesRequestInput;
        finishRenderTimingPhase(timing, phaseStartedAt, "sourceAnalysisMs");
        const cachePolicy = originalAnalysis.cachePolicy;
        const navigationScript = options.navigationScripts?.get(matched.route.path);
        const navigationRequest = isNavigationRequest(options.request);
        const cacheKey = routeCacheKey(
          options.appDir,
          matched.route.path,
          url,
          navigationRequest ? "navigation" : "document",
        );
        const mayUseRouteCache =
          !sourceUsesRequestInput &&
          (cachePolicy === undefined
            ? originalAnalysis.usesRuntimeCacheControl
            : cachePolicy.revalidateSeconds !== 0);
        const reloadRouteCache = isNavigationRouteCacheReloadRequest(options.request);
        phaseStartedAt = renderTimingPhaseStartedAt(timing);
        const cachedResponse =
          !mayUseRouteCache || reloadRouteCache
            ? undefined
            : await cachedRouteResponse({
                cache: options.routeCache,
                key: cacheKey,
                request: options.request,
              });
        finishRenderTimingPhase(timing, phaseStartedAt, "routeCacheMs");

        if (cachedResponse !== undefined) {
          return cachedResponse;
        }

        // Only a route whose result may be stored pays for header-read tracking;
        // cache hits returned above never construct it. Application code reads
        // headers through this request so that a render depending on one is never
        // stored under a key that ignores it. Callers that store by path alone ask
        // for tracking through `renderSignals` even when the route itself declares
        // no cache policy.
        trackedRequest =
          mayUseRouteCache || options.renderSignals !== undefined
            ? trackRequestHeaderReads(options.request)
            : undefined;
        const appRequest = trackedRequest?.request ?? options.request;

        phaseStartedAt = renderTimingPhaseStartedAt(timing);
        const preparedActions = await prepareRouteServerActions({
          appDir: options.appDir,
          code: originalCode,
          formActionReferences: options.serverActionReferencesByFile?.get(matched.route.file),
          placeholders: true,
          pageFile: matched.route.file,
          request: options.request,
        });
        for (const diagnostic of preparedActions.diagnostics ?? []) {
          console.warn(`${diagnostic.code}: ${diagnostic.message}`);
        }
        finishRenderTimingPhase(timing, phaseStartedAt, "serverActionsMs");
        const code = preparedActions.code;
        phaseStartedAt = renderTimingPhaseStartedAt(timing);
        const routeAnalysis =
          code === originalCode
            ? originalAnalysis
            : await analyzeRouteSource({
                appDir: options.appDir,
                buildRenderCode: preparedActions.htmlReplacements !== undefined,
                code,
                filename: matched.route.file,
                routePath: matched.route.path,
                clientRouteInferenceCache,
                serverModuleCacheVersion: undefined,
                serverSourceFiles: options.serverSourceFiles,
                define: options.define,
                vitePlugins: options.vitePlugins,
              });
        finishRenderTimingPhase(timing, phaseStartedAt, "routeCodeAnalysisMs");
        const routeCode = routeAnalysis.routeCode;
        const streamRoute = routeAnalysis.streamRoute;
        const clientInference = routeAnalysis.clientInference;
        const clientRoute = clientInference.client;
        phaseStartedAt = renderTimingPhaseStartedAt(timing);
        const dataPromise = routeAnalysis.hasLoader
          ? loadRouteDataWithInstrumentation({
              appDir: options.appDir,
              code: originalCode,
              context: withTrackedRequest(
                {
                  env: options.env,
                  params: matched.params,
                  queryClient,
                },
                appRequest,
                trackedRequest,
              ),
              filename: matched.route.file,
              importPolicy: options.importPolicy,
              instrumentation: options.instrumentation,
              devServerModuleCacheVersion: options.devServerModuleCacheVersion,
              request: options.request,
              routeId: routeIdForPath(matched.route.path),
              routePath: matched.route.path,
              serverModules: options.serverModules,
              serverModuleCacheVersion: options.serverModuleCacheVersion,
              define: options.define,
              vitePlugins: options.vitePlugins,
              timing,
            })
          : undefined;
        // Route analysis and loading-boundary discovery can continue before the loader is awaited.
        // Observe an early rejection immediately so strict unhandled-rejection runtimes do not
        // terminate before the request-level control/error handler receives the same promise.
        void dataPromise?.catch(() => {});
        finishRenderTimingPhase(timing, phaseStartedAt, "loaderStartMs");
        recoveryRoute = {
          clientRoute,
          props: {
            params: matched.params,
            request: routeLocationForHydration(url),
          },
          routePath: matched.route.path,
          script: clientScript,
        };
        if (streamRoute) {
          phaseStartedAt = renderTimingPhaseStartedAt(timing);
          const loadingFile = await nearestExistingBoundaryFileForPage({
            appDir: options.appDir,
            filename: "loading.mreact.tsx",
            pageFile: matched.route.file,
            serverSourceFiles: options.serverSourceFiles,
          });
          finishRenderTimingPhase(timing, phaseStartedAt, "loadingBoundaryLookupMs");
          const streamShellResponseHeaders = {
            "content-type": "text/html; charset=utf-8",
            "x-mreact-stream": "1",
          };

          phaseStartedAt = renderTimingPhaseStartedAt(timing);
          const mayRenderOutOfOrder = await mayRenderOutOfOrderBoundaryDeep({
            code: routeCode,
            filename: matched.route.file,
            serverModuleCacheVersion: options.serverModuleCacheVersion,
            serverSourceFiles: options.serverSourceFiles,
          });
          finishRenderTimingPhase(timing, phaseStartedAt, "outOfOrderAnalysisMs");

          if (loadingFile === undefined && !mayRenderOutOfOrder) {
            phaseStartedAt = renderTimingPhaseStartedAt(timing);
            let data: unknown;
            try {
              data = dataPromise === undefined ? undefined : await dataPromise;
            } finally {
              finishRenderTimingPhase(timing, phaseStartedAt, "loaderWaitMs");
            }
            if (data instanceof Response) {
              emitRenderTiming(options, timing, data.status);
              return data;
            }
            await waitForRenderPreload(options, timing);
            await loadServerRenderArtifacts(options, matched.route.file, timing);
            phaseStartedAt = renderTimingPhaseStartedAt(timing);
            const stringOutput = transformServerModule({
              code: routeCode,
              clientBoundaryImports: clientInference.clientBoundaryImports,
              clientBoundaryFallbackImports: clientInference.clientBoundaryFallbackImports,
              filename: matched.route.file,
              serverModules: options.serverModules,
              serverOutput: "string",
            });
            finishRenderTimingPhase(timing, phaseStartedAt, "stringTransformMs");
            const stringFatalDiagnostics = fatalServerDiagnostics(stringOutput.diagnostics);

            if (stringFatalDiagnostics.length > 0) {
              return new Response(
                formatServerDiagnostics(matched.route.file, stringFatalDiagnostics),
                {
                  status: 500,
                  headers: { "content-type": "text/plain; charset=utf-8" },
                },
              );
            }

            const renderedPage = await runWithQueryClient(queryClient, () =>
              runServerModuleWithSlots(
                stringOutput.code,
                withTrackedRouteLocation(
                  {
                    data,
                    params: matched.params,
                    queryClient,
                  },
                  appRequest,
                  trackedRequest,
                  routeLocationFromUrl(url),
                ),
                matched.route.file,
                options.serverModules,
                options.serverModuleCacheVersion,
                options.define,
                options.vitePlugins,
                undefined,
                options.importPolicy,
                options.devServerModuleCacheVersion,
              ),
            );
            const pageHtml = renderedPage.html;
            const pageHtmlForLayout = clientRoute
              ? withHydrationMarkers({
                  assetBaseUrl: options.assetBaseUrl,
                  clientReferenceManifest: stringOutput.metadata.clientReferenceManifest,
                  html: pageHtml,
                  routePath: matched.route.path,
                  script: clientScript,
                  props: {
                    params: matched.params,
                    request: routeLocationForHydration(url),
                    data,
                  },
                })
              : withServerOnlyRouteMarkers(
                  pageHtml,
                  matched.route.path,
                  options.request,
                  options.prerenderVariantCapture === true,
                );
            let html = await runWithQueryClient(queryClient, () =>
              applyLayouts({
                appDir: options.appDir,
                pageFile: matched.route.file,
                html: pageHtmlForLayout,
                props: withTrackedRouteLocation(
                  {
                    data,
                    params: matched.params,
                    queryClient,
                  },
                  appRequest,
                  trackedRequest,
                  routeLocationFromUrl(url),
                ),
                slots: renderedPage.slots,
                serverModules: options.serverModules,
                serverModuleCacheVersion: options.serverModuleCacheVersion,
                serverSourceFiles: options.serverSourceFiles,
                clientRouteInferenceCache,
                timing,
                vitePlugins: options.vitePlugins,
                importPolicy: options.importPolicy,
              }),
            );
            const metadata = await loadComposedRouteMetadata({
              appDir: options.appDir,
              code: originalCode,
              context: withTrackedRequest(
                {
                  data,
                  params: matched.params,
                },
                appRequest,
                trackedRequest,
              ),
              filename: matched.route.file,
              importPolicy: options.importPolicy,
              routes,
              serverModules: options.serverModules,
              serverModuleCacheVersion: options.serverModuleCacheVersion,
              devServerModuleCacheVersion: options.devServerModuleCacheVersion,
              serverSourceFiles: options.serverSourceFiles,
              define: options.define,
              vitePlugins: options.vitePlugins,
            });
            html = injectHeadMetadata(html, metadata);
            warnIfCspNonceWouldBlockInlineTags({
              html,
              logger: options.logger,
              metadata,
              request: options.request,
              serverModuleCacheVersion: options.serverModuleCacheVersion,
            });
            html = injectAuthSessionClaims(
              html,
              originalAnalysis.authIncludesClaims ? currentAuthClaims() : undefined,
            );
            html = injectQueryState(html, dehydrate(queryClient, options.dehydrateOptions));
            const response = withOptionalActionCookie(
              htmlResponse(
                applyActionHtmlReplacements(
                  `<!DOCTYPE html>${clientNavigationHeadTags({
                    assetBaseUrl: options.assetBaseUrl,
                    currentStyleSheets: clientStyleSheets,
                    currentScript: clientRoute ? clientScript : undefined,
                    currentNavigationScript: navigationScript,
                    routeScripts: options.clientScripts,
                  })}${html}`,
                  preparedActions.htmlReplacements,
                ),
                {
                  headers: responseHeadersForMetadata(metadata, options.request, {
                    "x-mreact-stream": "1",
                  }),
                },
              ),
              preparedActions.csrfToken,
              preparedActions.csrfTokenIsNew === true,
            );
            appendNavigationVary(response.headers);
            emitRenderTiming(options, timing, response.status);
            return response;
          }

          let streamData: unknown;
          phaseStartedAt = renderTimingPhaseStartedAt(timing);
          try {
            streamData = dataPromise === undefined ? undefined : await dataPromise;
          } finally {
            finishRenderTimingPhase(timing, phaseStartedAt, "loaderWaitMs");
          }
          if (streamData instanceof Response) {
            emitRenderTiming(options, timing, streamData.status);
            return streamData;
          }
          const streamDataPromise = Promise.resolve(streamData);

          const streamDataSettlement =
            loadingFile === undefined ? undefined : observePromiseSettlement(streamDataPromise);

          await waitForRenderPreload(options, timing);
          await loadServerRenderArtifacts(options, matched.route.file, timing);
          phaseStartedAt = renderTimingPhaseStartedAt(timing);
          const output = transformServerModule({
            code: routeCode,
            clientBoundaryImports: clientInference.clientBoundaryImports,
            clientBoundaryFallbackImports: clientInference.clientBoundaryFallbackImports,
            filename: matched.route.file,
            serverModules: options.serverModules,
            serverOutput: "stream",
            serverAwaitHydration: clientRoute,
          });
          finishRenderTimingPhase(timing, phaseStartedAt, "streamTransformMs");
          const fatalDiagnostics = fatalServerDiagnostics(output.diagnostics);

          if (fatalDiagnostics.length > 0) {
            return new Response(formatServerDiagnostics(matched.route.file, fatalDiagnostics), {
              status: 500,
              headers: { "content-type": "text/plain; charset=utf-8" },
            });
          }

          if (loadingFile !== undefined && streamDataSettlement !== undefined) {
            phaseStartedAt = renderTimingPhaseStartedAt(timing);
            const errorFile = await nearestExistingBoundaryFileForPage({
              appDir: options.appDir,
              filename: "error.mreact.tsx",
              pageFile: matched.route.file,
              serverSourceFiles: options.serverSourceFiles,
            });
            const streamResult = await runServerStreamModuleWithLoading(output.code, {
              appDir: options.appDir,
              assetBaseUrl: options.assetBaseUrl,
              clientRoute,
              data: streamDataPromise,
              dataSettlement: streamDataSettlement,
              define: options.define,
              errorFile,
              loadingFile,
              markerRequest: options.request,
              onRenderError: options.onRenderError,
              prerenderVariantCapture: options.prerenderVariantCapture,
              pageFile: matched.route.file,
              params: matched.params,
              queryClient,
              request: appRequest,
              requestUrl: url.href,
              trackedRequest,
              routePath: matched.route.path,
              routeScripts: options.clientScripts,
              serverModules: options.serverModules,
              serverModuleCacheVersion: options.serverModuleCacheVersion,
              serverSourceFiles: options.serverSourceFiles,
              vitePlugins: options.vitePlugins,
              clientRouteInferenceCache,
              importPolicy: options.importPolicy,
              script: clientScript,
              clientReferenceManifest: output.metadata.clientReferenceManifest,
            });
            finishRenderTimingPhase(timing, phaseStartedAt, "streamConstructionMs");

            if (streamResult instanceof Response) {
              emitRenderTiming(options, timing, streamResult.status);
              return streamResult;
            }

            const response = withOptionalActionCookie(
              new Response(streamResult, {
                headers: streamShellResponseHeaders,
              }),
              preparedActions.csrfToken,
              preparedActions.csrfTokenIsNew === true,
            );
            appendNavigationVary(response.headers);
            emitRenderTiming(options, timing, response.status);
            return response;
          }

          const data = streamData;
          const props = withTrackedRouteLocation(
            {
              data,
              params: matched.params,
              queryClient,
            },
            appRequest,
            trackedRequest,
            routeLocationFromUrl(url),
          );
          phaseStartedAt = renderTimingPhaseStartedAt(timing);
          const stream = runServerStreamModule(output.code, {
            appDir: options.appDir,
            assetBaseUrl: options.assetBaseUrl,
            pageFile: matched.route.file,
            markerRequest: options.request,
            prerenderVariantCapture: options.prerenderVariantCapture,
            props,
            requestUrl: url.href,
            routePath: matched.route.path,
            routeScripts: options.clientScripts,
            serverModules: options.serverModules,
            serverModuleCacheVersion: options.serverModuleCacheVersion,
            serverSourceFiles: options.serverSourceFiles,
            define: options.define,
            vitePlugins: options.vitePlugins,
            clientRouteInferenceCache,
            importPolicy: options.importPolicy,
            clientRoute,
            script: clientScript,
            clientReferenceManifest: output.metadata.clientReferenceManifest,
          });
          finishRenderTimingPhase(timing, phaseStartedAt, "streamConstructionMs");

          const response = withOptionalActionCookie(
            new Response(stream, {
              headers: streamShellResponseHeaders,
            }),
            preparedActions.csrfToken,
            preparedActions.csrfTokenIsNew === true,
          );
          appendNavigationVary(response.headers);
          emitRenderTiming(options, timing, response.status);
          return response;
        }

        phaseStartedAt = renderTimingPhaseStartedAt(timing);
        let data: unknown;
        try {
          data = dataPromise === undefined ? undefined : await dataPromise;
        } finally {
          finishRenderTimingPhase(timing, phaseStartedAt, "loaderWaitMs");
        }
        if (data instanceof Response) {
          emitRenderTiming(options, timing, data.status);
          return data;
        }
        sourceUsesRequestInput ||= await routeShellsMayUseRequestInput({
          appDir: options.appDir,
          pageFile: matched.route.file,
          serverModuleCacheVersion: options.serverModuleCacheVersion,
          serverSourceFiles: options.serverSourceFiles,
        });
        await waitForRenderPreload(options, timing);
        await loadServerRenderArtifacts(options, matched.route.file, timing);
        phaseStartedAt = renderTimingPhaseStartedAt(timing);
        const output = transformServerModule({
          code: routeCode,
          clientBoundaryImports: clientInference.clientBoundaryImports,
          clientBoundaryFallbackImports: clientInference.clientBoundaryFallbackImports,
          filename: matched.route.file,
          serverModules: options.serverModules,
          serverOutput: "string",
        });
        finishRenderTimingPhase(timing, phaseStartedAt, "stringTransformMs");
        const fatalDiagnostics = fatalServerDiagnostics(output.diagnostics);

        if (fatalDiagnostics.length > 0) {
          return new Response(formatServerDiagnostics(matched.route.file, fatalDiagnostics), {
            status: 500,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }

        phaseStartedAt = renderTimingPhaseStartedAt(timing);
        const renderedPage = await runWithQueryClient(queryClient, () =>
          runServerModuleWithSlots(
            output.code,
            withTrackedRouteLocation(
              {
                data,
                params: matched.params,
                queryClient,
              },
              appRequest,
              trackedRequest,
              routeLocationFromUrl(url),
            ),
            matched.route.file,
            options.serverModules,
            options.serverModuleCacheVersion,
            options.define,
            options.vitePlugins,
            timing,
            options.importPolicy,
            options.devServerModuleCacheVersion,
          ),
        );
        finishRenderTimingPhase(timing, phaseStartedAt, "pageRenderMs");
        const pageHtml = renderedPage.html;
        // Wrap the page (not the full document) with the hydration marker so
        // the marker sits inside <body>, not around <html>. Wrapping <html>
        // forces the browser HTML parser to strip the wrappers and promote
        // <head> / <body> children up to the marker, which flattens the
        // layout into the marker and breaks the hydration target lookup.
        const pageHtmlForLayout = clientRoute
          ? withHydrationMarkers({
              assetBaseUrl: options.assetBaseUrl,
              clientReferenceManifest: output.metadata.clientReferenceManifest,
              html: pageHtml,
              routePath: matched.route.path,
              script: clientScript,
              props: {
                params: matched.params,
                request: routeLocationForHydration(url),
                data,
              },
            })
          : withServerOnlyRouteMarkers(
              pageHtml,
              matched.route.path,
              options.request,
              options.prerenderVariantCapture === true,
            );
        phaseStartedAt = renderTimingPhaseStartedAt(timing);
        let html = await runWithQueryClient(queryClient, () =>
          applyLayouts({
            appDir: options.appDir,
            pageFile: matched.route.file,
            html: pageHtmlForLayout,
            props: withTrackedRouteLocation(
              {
                data,
                params: matched.params,
                queryClient,
              },
              appRequest,
              trackedRequest,
              routeLocationFromUrl(url),
            ),
            slots: renderedPage.slots,
            serverModules: options.serverModules,
            serverModuleCacheVersion: options.serverModuleCacheVersion,
            serverSourceFiles: options.serverSourceFiles,
            clientRouteInferenceCache,
            timing,
            vitePlugins: options.vitePlugins,
          }),
        );
        finishRenderTimingPhase(timing, phaseStartedAt, "layoutRenderMs");
        phaseStartedAt = renderTimingPhaseStartedAt(timing);
        const metadata = await loadComposedRouteMetadata({
          appDir: options.appDir,
          code: originalCode,
          context: withTrackedRequest(
            {
              data,
              params: matched.params,
            },
            appRequest,
            trackedRequest,
          ),
          filename: matched.route.file,
          importPolicy: options.importPolicy,
          routes,
          serverModules: options.serverModules,
          serverModuleCacheVersion: options.serverModuleCacheVersion,
          devServerModuleCacheVersion: options.devServerModuleCacheVersion,
          serverSourceFiles: options.serverSourceFiles,
          define: options.define,
          vitePlugins: options.vitePlugins,
        });
        finishRenderTimingPhase(timing, phaseStartedAt, "metadataMs");
        phaseStartedAt = renderTimingPhaseStartedAt(timing);
        html = injectHeadMetadata(html, metadata);
        warnIfCspNonceWouldBlockInlineTags({
          html,
          logger: options.logger,
          metadata,
          request: options.request,
          serverModuleCacheVersion: options.serverModuleCacheVersion,
        });
        html = injectAuthSessionClaims(
          html,
          originalAnalysis.authIncludesClaims ? currentAuthClaims() : undefined,
        );
        html = injectQueryState(html, dehydrate(queryClient, options.dehydrateOptions));

        const response = withOptionalActionCookie(
          htmlResponse(
            applyActionHtmlReplacements(
              `<!DOCTYPE html>${clientNavigationHeadTags({
                assetBaseUrl: options.assetBaseUrl,
                currentStyleSheets: clientStyleSheets,
                currentScript: clientRoute ? clientScript : undefined,
                currentNavigationScript: navigationScript,
                routeScripts: options.clientScripts,
              })}${html}`,
              preparedActions.htmlReplacements,
            ),
            {
              headers: responseHeadersForMetadata(metadata, options.request),
            },
          ),
          preparedActions.csrfToken,
          preparedActions.csrfTokenIsNew === true,
        );
        appendNavigationVary(response.headers);

        const effectiveCachePolicy = cachePolicy ?? activeRouteCacheContext()?.cachePolicy;
        const configuredHsts = configuredHstsHeader(metadata?.security);
        renderedStrictTransportSecurity = configuredHsts;
        invalidConfiguredHsts = hasInvalidConfiguredHsts(metadata?.security);

        const finalResponse = preparedActions.hasFormActions
          ? withRouteCacheHeader(response, effectiveCachePolicy)
          : await cacheRouteResponse({
              key: cacheKey,
              cache: options.routeCache,
              // A policy can still arrive from a runtime cacheControl() call made
              // outside the page source, which is what `mayUseRouteCache` scans.
              // Without a tracker there is no evidence the render ignored request
              // headers, so the entry is treated as header dependent.
              headerDependent:
                sourceUsesRequestInput ||
                invalidConfiguredHsts ||
                (trackedRequest?.requestDependent() ?? true),
              ...(configuredHsts === undefined ? {} : { strictTransportSecurity: configuredHsts }),
              path: matched.route.path,
              policy: effectiveCachePolicy,
              request: options.request,
              response,
            });
        finishRenderTimingPhase(timing, phaseStartedAt, "responseBuildMs");
        emitRenderTiming(options, timing, finalResponse.status);
        return finalResponse;
      } catch (error) {
        if (isRedirectError(error)) {
          const response = new Response(null, {
            headers: { location: error.location },
            status: error.status,
          });
          emitRenderTiming(options, timing, response.status);
          return response;
        }

        if (isNotFoundError(error)) {
          const notFoundFile = await nearestBoundaryFileForPage({
            appDir: options.appDir,
            filename: "not-found.mreact.tsx",
            pageFile: matched.route.file,
          });

          const response = await renderSpecialRoute({
            appDir: options.appDir,
            assetBaseUrl: options.assetBaseUrl,
            currentStyleSheets: options.clientStylesByFile?.get(notFoundFile),
            error: undefined,
            request: options.request,
            routePath: matched.route.path,
            routeFile: notFoundFile,
            routeScripts: options.clientScripts,
            serverModules: options.serverModules,
            serverModuleCacheVersion: options.serverModuleCacheVersion,
            serverSourceFiles: options.serverSourceFiles,
            vitePlugins: options.vitePlugins,
            navigation: recoveryRoute,
            status: 404,
            textFallback: "Not Found",
          });
          emitRenderTiming(options, timing, response.status);
          return response;
        }

        const errorFile = await nearestBoundaryFileForPage({
          appDir: options.appDir,
          filename: "error.mreact.tsx",
          pageFile: matched.route.file,
        });
        options.onRenderError?.(error);

        const response = await renderSpecialRoute({
          appDir: options.appDir,
          assetBaseUrl: options.assetBaseUrl,
          currentStyleSheets: options.clientStylesByFile?.get(errorFile),
          error,
          request: options.request,
          routePath: matched.route.path,
          routeFile: errorFile,
          routeScripts: options.clientScripts,
          serverModules: options.serverModules,
          serverModuleCacheVersion: options.serverModuleCacheVersion,
          serverSourceFiles: options.serverSourceFiles,
          vitePlugins: options.vitePlugins,
          navigation: recoveryRoute,
          status: 500,
          textFallback: "Internal Server Error",
        });
        emitRenderTiming(options, timing, response.status);
        return response;
      } finally {
        // Reported from every return path, including the streaming ones, so that a
        // caller storing by path alone never mistakes an unreported render for a
        // shareable one. The value stays lazy because a streamed render can still
        // read request headers while its deferred parts resolve; callers read it
        // after draining the body.
        if (options.renderSignals !== undefined) {
          const tracked = trackedRequest;
          options.renderSignals.headerDependent = () =>
            sourceUsesRequestInput ||
            invalidConfiguredHsts ||
            (tracked?.requestDependent() ?? true);
          options.renderSignals.strictTransportSecurity = () => renderedStrictTransportSecurity;
        }
      }
    })
  ).value;
}

async function applyAppRouterResponseHook(
  response: Response,
  options: RenderAppRequestOptions,
): Promise<Response> {
  const onResponse = await resolveAppRouterResponseHook(options);

  if (onResponse === undefined) {
    return response;
  }

  const renderSignals = (options as RenderAppRequestRuntimeOptions).renderSignals;
  const trackedRequest =
    renderSignals === undefined ? undefined : trackRequestHeaderReads(options.request);
  const hooked = await onResponse(
    response,
    withTrackedRequest({}, trackedRequest?.request ?? options.request, trackedRequest),
  );

  if (renderSignals !== undefined && trackedRequest !== undefined) {
    const renderHeaderDependent = renderSignals.headerDependent;
    renderSignals.headerDependent = () =>
      renderHeaderDependent() || trackedRequest.requestDependent();
  }

  return hooked instanceof Response ? hooked : response;
}

export async function resolveAppRouterResponseHook(
  options: Pick<
    RenderAppRequestOptions,
    | "appDir"
    | "define"
    | "devServerModuleCacheVersion"
    | "importPolicy"
    | "onResponse"
    | "serverModules"
    | "serverModuleCacheVersion"
    | "serverSourceFiles"
    | "vitePlugins"
  >,
): Promise<AppRouterResponseHook | undefined> {
  if (options.onResponse !== undefined) {
    return options.onResponse;
  }

  const candidates = [
    join(options.appDir, "on-response.ts"),
    join(options.appDir, "on-response.mreact.ts"),
  ];

  for (const file of candidates) {
    const embedded =
      options.serverSourceFiles?.has(file) === true || options.serverModules?.has(file) === true;
    if (!embedded) {
      try {
        await access(file);
      } catch {
        continue;
      }
    }

    const code = await readServerSourceFile(
      file,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
    );
    const loaded = (await loadBundledMiddlewareModule({
      appDir: options.appDir,
      code,
      define: options.define,
      devServerModuleCacheVersion: options.devServerModuleCacheVersion,
      file,
      importPolicy: options.importPolicy,
      prebuiltArtifact: prebuiltRequestModuleArtifact(options.serverModules, file, code),
      serverModuleCacheVersion: options.serverModuleCacheVersion,
      vitePlugins: options.vitePlugins,
    })) as unknown as { onResponse?: unknown };

    if (typeof loaded.onResponse !== "function") {
      throw new Error(
        `Invalid on-response convention ${file}: expected a callable onResponse export.`,
      );
    }

    return loaded.onResponse as AppRouterResponseHook;
  }

  return undefined;
}

function withOptionalActionCookie(
  response: Response,
  csrfToken: string | undefined,
  csrfTokenIsNew: boolean,
): Response {
  // Only re-issue Set-Cookie when this render minted the token. Reusing
  // an incoming cookie value (Issue 070) means no Set-Cookie is needed
  // and avoids stomping on a concurrent tab's hidden form input.
  if (csrfToken !== undefined && csrfTokenIsNew) {
    response.headers.append("set-cookie", serverActionCookie(csrfToken));
  }

  return response;
}

function applyActionHtmlReplacements(
  html: string,
  replacements: readonly (readonly [string, string])[] | undefined,
): string {
  if (replacements === undefined || replacements.length === 0) {
    return html;
  }

  let next = html;

  for (const [placeholder, value] of replacements) {
    next = next.replaceAll(placeholder, escapeHtmlAttribute(value));
  }

  return next;
}

function modulePreloadTags(script: string | undefined, assetBaseUrl: string | undefined): string {
  return script === undefined
    ? ""
    : `<link rel="modulepreload" href="${escapeHtmlAttribute(
        assetPath(script, assetBaseUrl ?? "/_mreact/client/"),
      )}">`;
}

function clientNavigationHeadTags(options: {
  assetBaseUrl: string | undefined;
  currentStyleSheets?: readonly string[] | undefined;
  currentNavigationScript?: string | undefined;
  currentScript: string | undefined;
  routeScripts: ReadonlyMap<string, string> | undefined;
}): string {
  return [
    styleSheetTags(options.currentStyleSheets, options.assetBaseUrl),
    modulePreloadTags(options.currentScript, options.assetBaseUrl),
    navigationRuntimeScriptTag(options.currentNavigationScript, options.assetBaseUrl),
    routePrefetchManifestScript(options.routeScripts, options.assetBaseUrl),
  ].join("");
}

function styleSheetTags(
  styleSheets: readonly string[] | undefined,
  assetBaseUrl: string | undefined,
): string {
  return (styleSheets ?? [])
    .map(
      (styleSheet) =>
        `<link rel="stylesheet" href="${escapeHtmlAttribute(
          styleSheetHref(styleSheet, assetBaseUrl),
        )}">`,
    )
    .join("");
}

function styleSheetHref(styleSheet: string, assetBaseUrl: string | undefined): string {
  if (styleSheet.startsWith("/") || hasUrlScheme(styleSheet)) {
    return styleSheet;
  }

  return assetPath(styleSheet, assetBaseUrl ?? "/_mreact/client/");
}

function hasUrlScheme(value: string): boolean {
  const colon = value.indexOf(":");

  if (colon <= 0) {
    return false;
  }

  for (let index = 0; index < colon; index += 1) {
    const code = value.charCodeAt(index);
    const letter = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    const digit = code >= 48 && code <= 57;
    const allowedSymbol = code === 43 || code === 45 || code === 46;

    if (index === 0 ? !letter : !letter && !digit && !allowedSymbol) {
      return false;
    }
  }

  return true;
}

function navigationRuntimeScriptTag(
  script: string | undefined,
  assetBaseUrl: string | undefined,
): string {
  if (script === undefined) {
    return "";
  }

  const json = JSON.stringify({
    script: assetPath(script, assetBaseUrl ?? "/_mreact/client/"),
  }).replaceAll("<", "\\u003c");

  return `<script type="application/json" id="mreact-navigation-runtime">${json}</script>`;
}

function routePrefetchManifestScript(
  routeScripts: ReadonlyMap<string, string> | undefined,
  assetBaseUrl: string | undefined,
): string {
  if (routeScripts === undefined || routeScripts.size === 0) {
    return "";
  }

  const routes = Array.from(routeScripts.entries(), ([path, script]) => ({
    path,
    script: assetPath(script, assetBaseUrl ?? "/_mreact/client/"),
  }));
  const json = JSON.stringify(routes).replaceAll("<", "\\u003c");

  return `<script type="application/json" id="mreact-route-prefetch-manifest">${json}</script>`;
}

function isNavigationRequest(request: Request): boolean {
  return request.headers.get("x-mreact-navigation") === "1";
}

function withServerOnlyRouteMarkers(
  html: string,
  routePath: string,
  request: Request,
  prerenderVariantCapture: boolean,
): string {
  const marker = serverOnlyRouteMarkerParts(routePath, request, prerenderVariantCapture);
  return marker === undefined ? html : `${marker.prefix}${html}${marker.suffix}`;
}

function serverOnlyRouteMarkerParts(
  routePath: string,
  request: Request,
  prerenderVariantCapture: boolean,
): { prefix: string; suffix: string } | undefined {
  if (prerenderVariantCapture) {
    return prerenderVariantMarkerParts(routePath);
  }
  return isNavigationRequest(request) ? routeMarkerParts(routePath) : undefined;
}

export function prerenderVariantMarkerParts(routePath: string): {
  prefix: string;
  suffix: string;
} {
  const routeId = routeIdForPath(routePath);
  return {
    prefix: `<!--mreact-route-variant-start:${routeId}-->`,
    suffix: `<!--mreact-route-variant-end:${routeId}-->`,
  };
}

function appendNavigationVary(headers: Headers): void {
  const vary = headers.get("vary");
  if (
    vary?.split(",").some((value) => value.trim().toLowerCase() === "x-mreact-navigation") === true
  ) {
    return;
  }
  headers.append("vary", "x-mreact-navigation");
}

function isNavigationRouteCacheReloadRequest(request: Request): boolean {
  return (
    isNavigationRequest(request) && request.headers.get("x-mreact-navigation-cache") === "reload"
  );
}

function singleFlightNavigationRequest(options: { path: string; request: Request }): Request {
  const actionUrl = new URL(options.request.url);
  const targetUrl = new URL(options.path, actionUrl);
  const headers = new Headers();
  const cookie = options.request.headers.get("cookie");

  if (cookie !== null) {
    headers.set("cookie", cookie);
  }

  headers.set("x-mreact-navigation", "1");
  headers.set("x-mreact-navigation-cache", "reload");

  return new Request(targetUrl, {
    headers,
    method: "GET",
  });
}

async function nearestBoundaryFileForPage(options: {
  appDir: string;
  filename: string;
  pageFile: string;
}): Promise<string> {
  const relativeDir = relative(options.appDir, dirname(options.pageFile));
  const parts = relativeDir === "" ? [] : relativeDir.split(sep);

  return nearestBoundaryFileFromParts({
    appDir: options.appDir,
    filename: options.filename,
    parts,
  });
}

async function nearestExistingBoundaryFileForPage(options: {
  appDir: string;
  filename: string;
  pageFile: string;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
}): Promise<string | undefined> {
  const relativeDir = relative(options.appDir, dirname(options.pageFile));
  const parts = relativeDir === "" ? [] : relativeDir.split(sep);

  return nearestExistingBoundaryFileFromParts({
    appDir: options.appDir,
    filename: options.filename,
    parts,
    serverSourceFiles: options.serverSourceFiles,
  });
}

async function nearestBoundaryFileForPath(options: {
  appDir: string;
  filename: string;
  pathname: string;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
}): Promise<string> {
  const parts = options.pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter((part) => part.length > 0 && part !== "." && part !== "..");

  return await nearestBoundaryFileFromParts({
    appDir: options.appDir,
    filename: options.filename,
    parts,
    serverSourceFiles: options.serverSourceFiles,
  });
}

async function nearestBoundaryFileFromParts(options: {
  appDir: string;
  filename: string;
  parts: string[];
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
}): Promise<string> {
  for (let count = options.parts.length; count >= 0; count -= 1) {
    for (const filename of boundaryFilenameCandidates(options.filename)) {
      const candidate = join(options.appDir, ...options.parts.slice(0, count), filename);

      if (options.serverSourceFiles !== undefined) {
        if (options.serverSourceFiles.has(candidate)) {
          return candidate;
        }
        continue;
      }

      try {
        await access(candidate);
        return candidate;
      } catch {
        // Keep walking toward the root boundary.
      }
    }
  }

  return join(options.appDir, boundaryFilenameCandidates(options.filename)[0] ?? options.filename);
}

async function nearestExistingBoundaryFileFromParts(options: {
  appDir: string;
  filename: string;
  parts: string[];
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
}): Promise<string | undefined> {
  for (let count = options.parts.length; count >= 0; count -= 1) {
    for (const filename of boundaryFilenameCandidates(options.filename)) {
      const candidate = join(options.appDir, ...options.parts.slice(0, count), filename);

      if (options.serverSourceFiles !== undefined) {
        if (options.serverSourceFiles.has(candidate)) {
          return candidate;
        }
        continue;
      }

      try {
        await access(candidate);
        return candidate;
      } catch {
        // Keep walking toward the root boundary.
      }
    }
  }

  return undefined;
}

function boundaryFilenameCandidates(filename: string): string[] {
  if (!filename.endsWith(".mreact.tsx")) {
    return [filename];
  }

  const standardFilename = filename.replace(".mreact.tsx", ".tsx");

  return [standardFilename, filename];
}

async function renderSpecialRoute(options: {
  appDir: string;
  assetBaseUrl?: string | undefined;
  currentStyleSheets?: readonly string[] | undefined;
  error: unknown;
  navigation?:
    | {
        clientRoute: boolean;
        props: unknown;
        routePath: string;
        script: string | undefined;
      }
    | undefined;
  request: Request;
  routePath?: string | undefined;
  routeFile: string;
  routeScripts?: ReadonlyMap<string, string> | undefined;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
  define?: UserConfig["define"] | undefined;
  status: number;
  textFallback: string;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<Response> {
  if (options.serverSourceFiles !== undefined) {
    if (!options.serverSourceFiles.has(options.routeFile)) {
      return new Response(options.textFallback, { status: options.status });
    }
  } else {
    try {
      await access(options.routeFile);
    } catch {
      return new Response(options.textFallback, { status: options.status });
    }
  }

  const props = {
    ...errorBoundaryProps(options.error, options.request, options.routePath),
  };
  const pageHtml = await renderServerFileToHtml(
    options.routeFile,
    props,
    options.serverModules,
    options.serverModuleCacheVersion,
    options.serverSourceFiles,
    options.define,
    options.vitePlugins,
  );
  const pageHtmlForLayout =
    options.navigation?.clientRoute === true
      ? withHydrationMarkers({
          assetBaseUrl: options.assetBaseUrl,
          clientReferenceManifest: undefined,
          html: pageHtml,
          props: options.navigation.props,
          routePath: options.navigation.routePath,
          script: options.navigation.script,
        })
      : pageHtml;
  const html = await applyLayouts({
    appDir: options.appDir,
    pageFile: options.routeFile,
    html: pageHtmlForLayout,
    props,
    serverModules: options.serverModules,
    serverModuleCacheVersion: options.serverModuleCacheVersion,
    serverSourceFiles: options.serverSourceFiles,
    define: options.define,
    vitePlugins: options.vitePlugins,
  });

  return new Response(
    `<!DOCTYPE html>${clientNavigationHeadTags({
      assetBaseUrl: options.assetBaseUrl,
      currentStyleSheets: options.currentStyleSheets,
      currentScript:
        options.navigation?.clientRoute === true ? options.navigation.script : undefined,
      routeScripts: options.routeScripts,
    })}${html}`,
    {
      headers: { "content-type": "text/html; charset=utf-8" },
      status: options.status,
    },
  );
}

function errorBoundaryProps(error: unknown, request: Request, routePath: string | undefined) {
  return {
    data: undefined,
    debug: errorDebugContext(error, routePath),
    error: normalizeErrorForProps(error),
    params: {},
    queryClient: createQueryClient(),
    request: routeLocationFromRequest(request),
    requestId: requestIdForErrorContext(request),
    routeId: routeIdForPath(routePath ?? new URL(request.url).pathname),
    traceId: traceContextFromRequest(request)?.traceId,
  };
}

async function renderServerFileToHtml(
  file: string,
  props: ServerComponentProps,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
  serverSourceFiles: ReadonlyMap<string, string> | undefined,
  define?: UserConfig["define"] | undefined,
  vitePlugins?: readonly PluginOption[] | undefined,
): Promise<string> {
  const code = await readServerSourceFile(file, serverModuleCacheVersion, serverSourceFiles);
  const output = transformServerModule({
    code,
    filename: file,
    serverModules,
    serverOutput: "string",
  });
  const fatalDiagnostics = fatalServerDiagnostics(output.diagnostics);

  if (fatalDiagnostics.length > 0) {
    throw new Error(formatServerDiagnostics(file, fatalDiagnostics));
  }

  return runServerModule(
    output.code,
    props,
    file,
    serverModules,
    serverModuleCacheVersion,
    define,
    vitePlugins,
  );
}

function normalizeErrorForProps(error: unknown): { message: string } {
  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: String(error) };
}

function requestIdForErrorContext(request: Request): string {
  return request.headers.get("x-request-id") ?? randomUUID();
}

function errorDebugContext(
  error: unknown,
  routePath: string | undefined,
):
  | {
      cause?: unknown;
      route?: { matched: string };
      stack?: string;
    }
  | undefined {
  if (process.env.NODE_ENV === "production" || !(error instanceof Error)) {
    return undefined;
  }

  return {
    ...(error.cause === undefined ? {} : { cause: error.cause }),
    ...(routePath === undefined ? {} : { route: { matched: routePath } }),
    ...(error.stack === undefined ? {} : { stack: error.stack }),
  };
}

async function dispatchServerRoute(options: {
  appDir: string;
  env?: unknown;
  file: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  params: RouteParams;
  request: Request;
  route: AppRoute;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<Response> {
  const module = await loadServerRouteModule(options);
  const handler = module[options.request.method] ?? module.ALL ?? module.default;

  if (typeof handler !== "function") {
    return new Response("Method Not Allowed", {
      headers: { allow: allowedServerRouteMethods(module).join(", ") },
      status: 405,
    });
  }

  let response: unknown;

  try {
    response = await handler(options.request, {
      env: options.env,
      params: options.params,
      request: options.request,
      route: options.route,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    throw error;
  }

  return response instanceof Response
    ? response
    : new Response("Invalid route response", { status: 500 });
}

function allowedServerRouteMethods(module: Record<string, unknown>): string[] {
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].filter(
    (method) => typeof module[method] === "function",
  );
}

async function dispatchConventionAssetRoute(options: {
  file: string;
  request: Request;
}): Promise<Response> {
  if (options.request.method !== "GET" && options.request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  }

  const bytes = await readFile(options.file);
  return bytesResponse(options.request.method === "HEAD" ? new Uint8Array() : bytes, {
    headers: {
      "cache-control": "public, max-age=3600",
      "content-type": appFileConventionContentType(options.file),
    },
  });
}

function textConventionResponse(body: string): Response {
  return htmlResponse(body, {
    headers: {
      "cache-control": "public, max-age=3600",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

function xmlConventionResponse(body: string): Response {
  return htmlResponse(body, {
    headers: {
      "cache-control": "no-cache",
      "content-type": "application/xml; charset=utf-8",
    },
  });
}

function jsonConventionResponse(body: ManifestDescriptor): Response {
  return htmlResponse(JSON.stringify(body), {
    headers: {
      "cache-control": "public, max-age=3600",
      "content-type": "application/manifest+json; charset=utf-8",
    },
  });
}

async function dispatchMetadataRoute(options: {
  appDir: string;
  file: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  params: RouteParams;
  request: Request;
  route: Extract<AppRoute, { kind: "metadata" }>;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<Response> {
  if (options.request.method !== "GET" && options.request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  }

  const module = await loadServerRouteModule(options);
  const handler = module.default;
  if (typeof handler !== "function") {
    return new Response("Invalid metadata route response", { status: 500 });
  }

  const url = new URL(options.request.url);
  const context = {
    baseUrl: url.origin,
    host: url.host,
    params: options.params,
    request: options.request,
  };
  const value = await handler(context);

  if (value instanceof Response) {
    return value;
  }

  if (options.route.convention === "robots") {
    return textConventionResponse(serializeRobots(value as RobotsManifest));
  }
  if (options.route.convention === "sitemap") {
    return xmlConventionResponse(serializeSitemap(value as readonly SitemapEntry[]));
  }
  if (options.route.convention === "manifest") {
    return jsonConventionResponse(value as ManifestDescriptor);
  }
  if (options.route.convention === "opengraph-image") {
    const body =
      value instanceof Uint8Array
        ? value
        : new TextEncoder().encode(typeof value === "string" ? value : String(value));
    return bytesResponse(body, {
      headers: {
        "cache-control": "public, max-age=3600",
        "content-type":
          typeof value === "string" && value.trimStart().startsWith("<svg")
            ? "image/svg+xml"
            : "application/octet-stream",
      },
    });
  }

  return new Response("Invalid metadata route convention", { status: 500 });
}

async function loadServerRouteModule(options: {
  appDir: string;
  define?: UserConfig["define"] | undefined;
  file: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<Record<string, unknown>> {
  const code = await readServerSourceFile(
    options.file,
    options.serverModuleCacheVersion,
    options.serverSourceFiles,
  );
  const externalSourceDirs = devExternalSourceDirs(options.file, options.importPolicy);

  if (
    options.serverModuleCacheVersion === undefined &&
    options.define === undefined &&
    (options.vitePlugins === undefined || options.vitePlugins.length === 0) &&
    (externalSourceDirs === undefined || !hasRelativeSourceImport(code))
  ) {
    return await importAppRouterFileModule<Record<string, unknown>>(options.file);
  }

  const artifactCode = options.serverModules?.get(options.file)?.request;
  const codeHash = memoizedHashText(code);
  if (
    artifactCode !== undefined &&
    artifactCode.sourceHash === codeHash &&
    artifactCode.moduleFile !== undefined
  ) {
    return await importBuiltServerModuleFile<Record<string, unknown>>({
      file: artifactCode.moduleFile,
      label: `server-route:${options.file}`,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
    });
  }

  const moduleCode =
    artifactCode !== undefined && artifactCode.sourceHash === codeHash ? artifactCode.code : code;
  const cacheKey = `server-route\0${options.file}\0${options.serverModuleCacheVersion}\0${codeHash}\0${memoizedHashText(moduleCode)}\0${viteDefineCacheKey(options.define)}\0${vitePluginsCacheKey(options.vitePlugins)}`;
  const cached = readRouterRuntimeCacheEntry(
    serverRouteModuleCache,
    cacheKey,
    serverRouteModuleCacheCounters,
  );

  if (cached !== undefined) {
    return cached;
  }

  const loaded = importAppRouterSourceModule<Record<string, unknown>>({
    cacheKey,
    code: moduleCode,
    define: options.define,
    externalizeAppSourceModuleDirs: externalSourceDirs,
    label: `server-route:${options.file}`,
    plugins: [
      createAppRouterImportPolicyPlugin({
        appDir: options.appDir,
        importPolicy: options.importPolicy,
        label: "Route handler",
      }),
    ],
    ...(moduleCode === code ? { resolveDir: dirname(options.file) } : {}),
    sourcefile: options.file,
    vitePlugins: options.vitePlugins,
  }).catch((error) => {
    serverRouteModuleCache.delete(cacheKey);
    throw error;
  });
  setBoundedCacheEntry(
    serverRouteModuleCache,
    cacheKey,
    loaded,
    maxServerRouteModuleCacheEntries,
    serverRouteModuleCacheCounters,
  );

  return loaded;
}

function hasRelativeSourceImport(code: string): boolean {
  return (
    /\b(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["']\.{1,2}\//u.test(code) ||
    /\bimport\s*\(\s*["']\.{1,2}\//u.test(code)
  );
}

function devExternalSourceDirs(
  baseDir: string,
  importPolicy: AppRouterImportPolicy | undefined,
): readonly string[] | undefined {
  if (importPolicy?.allowedSourceDirs === undefined) {
    return undefined;
  }

  const projectRoot = resolve(importPolicy.projectRoot ?? baseDir);
  return importPolicy.allowedSourceDirs.map((directory) => resolve(projectRoot, directory));
}

async function runMiddleware(options: {
  appDir: string;
  define?: UserConfig["define"] | undefined;
  devServerModuleCacheVersion?: string | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
  instrumentation?: RouterInstrumentation | undefined;
  middlewareControl?: RouteMiddlewareControl | undefined;
  request: Request;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
  timing?: RenderTiming | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<Response | undefined> {
  if (options.middlewareControl?.skip === true) {
    return undefined;
  }

  const candidates = [
    join(options.appDir, "middleware.ts"),
    join(options.appDir, "middleware.mreact.ts"),
  ];
  const pathname = new URL(options.request.url).pathname;

  if (Array.isArray(options.middlewareControl?.skip)) {
    validateRouteMiddlewareControl({
      availableIds: await collectAvailableMiddlewareIds({
        candidates,
        serverModuleCacheVersion: options.serverModuleCacheVersion,
        serverSourceFiles: options.serverSourceFiles,
      }),
      control: options.middlewareControl,
      routePath: pathname,
    });
  }

  for (const file of candidates) {
    try {
      await access(file);
    } catch {
      continue;
    }

    const code = await readServerSourceFile(
      file,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
    );
    const staticConfig = parseStaticMiddlewareConfig(code);

    if (shouldSkipMiddleware(staticConfig, options.middlewareControl)) {
      return undefined;
    }

    if (
      staticConfig.hasMatcher &&
      staticConfig.matcher !== undefined &&
      !middlewareMatches(staticConfig, pathname)
    ) {
      return undefined;
    }

    let module: MiddlewareModule;
    const moduleLoadStartedAt = renderTimingPhaseStartedAt(options.timing);
    try {
      module = await loadMiddlewareModule({
        appDir: options.appDir,
        code,
        define: options.define,
        file,
        importPolicy: options.importPolicy,
        serverModules: options.serverModules,
        serverModuleCacheVersion: options.serverModuleCacheVersion,
        serverSourceFiles: options.serverSourceFiles,
        devServerModuleCacheVersion: options.devServerModuleCacheVersion,
        vitePlugins: options.vitePlugins,
      });
    } finally {
      finishRenderTimingPhase(options.timing, moduleLoadStartedAt, "middlewareModuleLoadMs");
    }

    if (shouldSkipMiddleware(module.config, options.middlewareControl)) {
      return undefined;
    }

    if (!middlewareMatches(module.config, pathname)) {
      return undefined;
    }

    const middleware = module.middleware ?? module.default;

    if (typeof middleware !== "function") {
      return undefined;
    }

    const trace = traceContextFromRequest(options.request);
    const event = {
      method: options.request.method,
      name: "middleware",
      path: new URL(options.request.url).pathname,
      request: options.request,
      ...(trace === undefined ? {} : { trace }),
    };
    invokeRouterInstrumentation(options.instrumentation?.onMiddlewareStart, event);

    try {
      const executionStartedAt = renderTimingPhaseStartedAt(options.timing);
      let response: unknown;
      try {
        response = await middleware(options.request);
      } finally {
        finishRenderTimingPhase(options.timing, executionStartedAt, "middlewareExecutionMs");
      }
      invokeRouterInstrumentation(options.instrumentation?.onMiddlewareEnd, event);

      return response instanceof Response ? response : undefined;
    } catch (error) {
      invokeRouterInstrumentation(options.instrumentation?.onMiddlewareEnd, {
        ...event,
        error,
      });

      if (isRedirectError(error)) {
        return new Response(null, {
          headers: { location: error.location },
          status: error.status,
        });
      }

      if (isNotFoundError(error)) {
        return new Response("Not Found", { status: 404 });
      }

      throw error;
    }
  }

  return undefined;
}

async function collectAvailableMiddlewareIds(options: {
  candidates: readonly string[];
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
}): Promise<ReadonlySet<string>> {
  const ids = new Set<string>();

  for (const file of options.candidates) {
    try {
      await access(file);
    } catch {
      continue;
    }

    const code = await readServerSourceFile(
      file,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
    );
    const id = parseStaticMiddlewareConfig(code).id;

    if (id !== undefined) {
      ids.add(id);
    }
  }

  return ids;
}

async function loadMiddlewareModule(options: {
  appDir: string;
  code?: string | undefined;
  define?: UserConfig["define"] | undefined;
  devServerModuleCacheVersion?: string | undefined;
  file: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<MiddlewareModule> {
  const code =
    options.code ??
    (await readServerSourceFile(
      options.file,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
    ));
  const moduleCacheVersion =
    options.serverModuleCacheVersion ?? options.devServerModuleCacheVersion;
  const cacheKey =
    moduleCacheVersion === undefined
      ? undefined
      : `middleware\0${options.serverModuleCacheVersion === undefined ? "dev" : "build"}\0${options.appDir}\0${options.file}\0${moduleCacheVersion}\0${memoizedHashText(code)}\0${importPolicyCacheKey(options.importPolicy)}\0${viteDefineCacheKey(options.define)}\0${vitePluginsCacheKey(options.vitePlugins)}`;

  if (cacheKey !== undefined) {
    const cached = readRouterRuntimeCacheEntry(
      middlewareModuleCache,
      cacheKey,
      middlewareModuleCacheCounters,
    );

    if (cached !== undefined) {
      return cached;
    }
  }

  const loaded = loadBundledMiddlewareModule({
    appDir: options.appDir,
    code,
    define: options.define,
    file: options.file,
    importPolicy: options.importPolicy,
    prebuiltArtifact: prebuiltRequestModuleArtifact(options.serverModules, options.file, code),
    devServerModuleCacheVersion: options.devServerModuleCacheVersion,
    serverModuleCacheVersion: options.serverModuleCacheVersion,
    vitePlugins: options.vitePlugins,
  }).catch((error) => {
    if (cacheKey !== undefined) {
      middlewareModuleCache.delete(cacheKey);
    }
    throw error;
  });

  if (cacheKey !== undefined) {
    setBoundedCacheEntry(
      middlewareModuleCache,
      cacheKey,
      loaded,
      maxMiddlewareModuleCacheEntries,
      middlewareModuleCacheCounters,
    );
  }

  return loaded;
}

export async function bundleMiddlewareModuleCode(options: {
  appDir: string;
  code: string;
  define?: UserConfig["define"] | undefined;
  externalizeAllowedPackages?: boolean | undefined;
  file: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  const output = await bundleRouterModule({
    code: options.code,
    define: options.define,
    filename: options.file,
    externalizeMreactRuntimeAliases: true,
    platform: "node",
    root: options.importPolicy?.projectRoot,
    plugins: [
      fileImportMetaUrlPlugin(),
      createAppRouterImportPolicyPlugin({
        appDir: options.appDir,
        externalizeAllowedPackages: options.externalizeAllowedPackages,
        importPolicy: options.importPolicy,
        label: "Middleware",
      }),
    ],
    vitePlugins: options.vitePlugins,
  });
  const compiled = output.code;

  if (compiled === undefined) {
    throw new Error(`Failed to compile middleware for ${options.file}.`);
  }

  return compiled;
}

async function loadBundledMiddlewareModule(options: {
  appDir: string;
  code: string;
  define?: UserConfig["define"] | undefined;
  devServerModuleCacheVersion?: string | undefined;
  file: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  prebuiltArtifact?: BuiltServerModuleOutputLike | undefined;
  serverModuleCacheVersion?: string | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<MiddlewareModule> {
  if (options.prebuiltArtifact?.moduleFile !== undefined) {
    return await importBuiltServerModuleFile<MiddlewareModule>({
      file: options.prebuiltArtifact.moduleFile,
      label: `middleware:${options.file}`,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
    });
  }

  const compiled =
    options.prebuiltArtifact?.code ??
    (await bundleMiddlewareModuleCode({
      appDir: options.appDir,
      code: options.code,
      define: options.define,
      file: options.file,
      importPolicy: options.importPolicy,
      vitePlugins: options.vitePlugins,
    }));

  return importAppRouterSourceModule<MiddlewareModule>({
    ...((options.serverModuleCacheVersion ?? options.devServerModuleCacheVersion) === undefined
      ? {}
      : {
          cacheKey: `middleware:${options.serverModuleCacheVersion === undefined ? "dev" : "build"}:${options.file}:${options.serverModuleCacheVersion ?? options.devServerModuleCacheVersion}:${memoizedHashText(compiled)}:${viteDefineCacheKey(options.define)}:${vitePluginsCacheKey(options.vitePlugins)}`,
        }),
    code: compiled,
    define: options.define,
    label: `middleware:${options.file}`,
    vitePlugins: options.vitePlugins,
  });
}

function transformServerModule(options: {
  code: string;
  clientBoundaryImports?: readonly string[];
  clientBoundaryFallbackImports?: readonly string[];
  filename: string;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverOutput: ServerOutputMode;
  serverAwaitHydration?: boolean;
}): TransformOutput {
  const sourceHash = memoizedHashText(options.code);
  const artifact = options.serverModules?.get(options.filename)?.[options.serverOutput];

  if (
    artifact !== undefined &&
    artifact.sourceHash === sourceHash &&
    prebuiltServerModuleOutputOptionsMatch(
      artifact,
      options.serverAwaitHydration === true ? { serverAwaitHydration: true } : {},
    )
  ) {
    return {
      code: artifact.code,
      diagnostics: [],
      map: null,
      metadata: artifact.metadata ?? {
        compiler: {
          frontend: "oxc",
          typescriptFallback: false,
        },
        components: [],
        filename: options.filename,
        imports: [],
        serverOutput: options.serverOutput,
        target: "server",
      },
    };
  }

  const awaitHydrationKey = options.serverAwaitHydration === true ? "1" : "0";
  const boundaryKey = options.clientBoundaryImports?.join("\0") ?? "";
  const fallbackKey = options.clientBoundaryFallbackImports?.join("\0") ?? "";
  const key = `${options.filename}\0${options.serverOutput}\0${sourceHash}\0${awaitHydrationKey}\0${boundaryKey}\0${fallbackKey}`;
  const cached = readRouterRuntimeCacheEntry(
    serverTransformCache,
    key,
    serverTransformCacheCounters,
  );

  if (cached !== undefined) {
    return cached;
  }

  // Only renders that were handed a prebuild map can have a prebuild gap;
  // dev servers pass no serverModules and transform at request time by design.
  if (options.serverModules !== undefined) {
    warnProductionDynamicServerTransform(
      options.filename,
      options.serverOutput,
      artifact === undefined
        ? "no prebuilt server module for this output mode"
        : !prebuiltServerModuleOutputOptionsMatch(
              artifact,
              options.serverAwaitHydration === true ? { serverAwaitHydration: true } : {},
            )
          ? `serverAwaitHydration mismatch (artifact=${artifact.metadata?.serverAwaitHydration === true}, requested=${options.serverAwaitHydration === true})`
          : "stale prebuilt server module (source hash changed)",
    );
  }

  const output = transform({
    code: options.code,
    ...(options.clientBoundaryImports === undefined
      ? {}
      : { clientBoundaryImports: options.clientBoundaryImports }),
    ...(options.clientBoundaryFallbackImports === undefined
      ? {}
      : { clientBoundaryFallbackImports: options.clientBoundaryFallbackImports }),
    dev: true,
    filename: options.filename,
    serverEscape: nativeEscapeTransform,
    serverOutput: options.serverOutput,
    target: "server",
    ...(options.serverAwaitHydration === true ? { serverAwaitHydration: true } : {}),
  });

  setBoundedCacheEntry(
    serverTransformCache,
    key,
    output,
    maxServerTransformCacheEntries,
    serverTransformCacheCounters,
  );

  return output;
}

export const __transformServerModuleForTesting = transformServerModule;

let productionRenderWithoutPrebuiltModulesWarned = false;

export function __resetProductionRenderWarningsForTesting(): void {
  productionRenderWithoutPrebuiltModulesWarned = false;
  productionDynamicServerTransformWarned.clear();
}

// Covers the deployment that forgot prebuilt modules entirely; per-module
// gaps inside a provided prebuild map are reported by
// warnProductionDynamicServerTransform with the affected file instead.
export function __warnProductionRenderWithoutPrebuiltModulesForTesting(options: {
  dev?: boolean | undefined;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
}): void {
  warnProductionRenderWithoutPrebuiltModules(options);
}

function warnProductionRenderWithoutPrebuiltModules(options: {
  dev?: boolean | undefined;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
}): void {
  if (
    process.env.NODE_ENV !== "production" ||
    options.dev === true ||
    options.serverModules !== undefined ||
    productionRenderWithoutPrebuiltModulesWarned
  ) {
    return;
  }

  productionRenderWithoutPrebuiltModulesWarned = true;
  console.warn(
    "mreact router: production render without prebuilt serverModules. Request-time transforms use development compiler settings; pass the build output's serverModules (or set dev: true for dev servers).",
  );
}

function warnProductionDynamicServerTransform(
  filename: string,
  serverOutput: ServerOutputMode,
  reason: string,
): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const warnedKey = `${filename}\0${serverOutput}`;

  if (productionDynamicServerTransformWarned.has(warnedKey)) {
    return;
  }

  productionDynamicServerTransformWarned.add(warnedKey);
  console.warn(
    `mreact router: dynamic server transform path ran in production for ${filename} (serverOutput=${serverOutput}): ${reason}. Production deployments should provide prebuilt serverModules; otherwise request-time transforms use development compiler settings.`,
  );
}

async function analyzeRouteSource(options: {
  appDir: string;
  artifact?: BuiltRouteSourceAnalysisSummary | undefined;
  buildRenderCode?: boolean | undefined;
  clientRouteInferenceCache: ClientRouteInferenceCache;
  code: string;
  define?: UserConfig["define"] | undefined;
  filename: string;
  routePath: string;
  serverModuleCacheVersion: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
  timing?: RenderTiming | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<RouteSourceAnalysis> {
  const sourceHash = memoizedHashText(options.code);
  if (
    options.artifact !== undefined &&
    options.serverModuleCacheVersion !== undefined &&
    options.artifact.sourceHash === sourceHash &&
    options.artifact.routePath === options.routePath
  ) {
    const artifactStartedAt = renderTimingPhaseStartedAt(options.timing);
    const analysis = routeSourceAnalysisFromArtifact(options.artifact);
    finishRenderTimingPhase(options.timing, artifactStartedAt, "sourceAnalysisArtifactMs");
    return analysis;
  }

  const cacheKey = `${options.serverModuleCacheVersion ?? "dev"}\0${options.filename}\0${sourceHash}\0${options.buildRenderCode === true ? "build-render" : "render"}\0${viteDefineCacheKey(options.define)}\0${vitePluginsCacheKey(options.vitePlugins)}`;
  const cached = readRouterRuntimeCacheEntry(
    routeSourceAnalysisCache,
    cacheKey,
    routeSourceAnalysisCacheCounters,
  );

  if (cached !== undefined) {
    return cached;
  }

  const pending = analyzeRouteSourceUncached(options).catch((error) => {
    routeSourceAnalysisCache.delete(cacheKey);
    throw error;
  });
  setBoundedCacheEntry(
    routeSourceAnalysisCache,
    cacheKey,
    pending,
    maxRouteSourceAnalysisCacheEntries,
    routeSourceAnalysisCacheCounters,
  );

  return pending;
}

function routeSourceAnalysisFromArtifact(
  artifact: BuiltRouteSourceAnalysisSummary,
): RouteSourceAnalysis {
  return {
    authIncludesClaims: artifact.authIncludesClaims,
    cachePolicy: artifact.cachePolicy,
    clientInference: {
      client: artifact.clientRoute,
      clientBoundaryImports: [...artifact.clientBoundaryImports],
      clientBoundaryFallbackImports: [...(artifact.clientBoundaryFallbackImports ?? [])],
      diagnostics: [],
    },
    hasLoader: artifact.hasLoader,
    routeCode: artifact.routeCode,
    streamRoute: artifact.streamRoute,
    // Older built artifacts predate request-input safety analysis. Treat them
    // as dependent until rebuilt rather than trusting an absent safety signal.
    usesRequestInput: artifact.usesRequestInput ?? true,
    usesRuntimeCacheControl: artifact.usesRuntimeCacheControl,
  };
}

async function analyzeRouteSourceUncached(options: {
  appDir: string;
  buildRenderCode?: boolean | undefined;
  clientRouteInferenceCache: ClientRouteInferenceCache;
  code: string;
  define?: UserConfig["define"] | undefined;
  filename: string;
  routePath: string;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<RouteSourceAnalysis> {
  const routeCode =
    options.buildRenderCode === true
      ? stripRouteBuildExports(options.code, options.filename)
      : stripRouteModuleExports(options.code, options.filename);
  const clientInference = await inferClientRouteModule({
    appDir: options.appDir,
    cache: options.clientRouteInferenceCache,
    code: stripRouteClientSource({ code: options.code, filename: options.filename }),
    filename: options.filename,
    routePath: options.routePath,
    vitePlugins: options.vitePlugins,
  });

  return {
    authIncludesClaims: authIncludesClaims(options.code),
    cachePolicy: routeCachePolicyFromSource(options.code),
    clientInference,
    hasLoader: hasLoaderExport(options.code),
    routeCode,
    streamRoute:
      isStreamRouteSource(options.code) ||
      routeClosureMayUseAwaitBoundary({
        filename: options.filename,
        files: routeSourceFilesForAnalysis(options),
        projectRoot: options.appDir,
        source: options.code,
      }),
    usesRequestInput: routeClosureMayUseRequestInput({
      filename: options.filename,
      files: routeSourceFilesForAnalysis(options),
      projectRoot: options.appDir,
      source: options.code,
    }),
    usesRuntimeCacheControl: usesRuntimeCacheControl(options.code),
  };
}

function routeSourceFilesForAnalysis(options: {
  appDir: string;
  code: string;
  filename: string;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
}): (file: string) => string | undefined {
  return (file) => {
    const known = file === options.filename ? options.code : options.serverSourceFiles?.get(file);
    if (known !== undefined) {
      return known;
    }

    const relativeFile = relative(resolve(options.appDir), resolve(file));
    if (relativeFile === "" || relativeFile === ".." || relativeFile.startsWith(`..${sep}`)) {
      return undefined;
    }

    try {
      return readFileSync(file, "utf8");
    } catch {
      return undefined;
    }
  };
}

async function routeShellsMayUseRequestInput(options: {
  appDir: string;
  pageFile: string;
  serverModuleCacheVersion: string | undefined;
  serverSourceFiles: ReadonlyMap<string, string> | undefined;
}): Promise<boolean> {
  const shells = await shellFilesForPage(
    options.appDir,
    options.pageFile,
    options.serverModuleCacheVersion,
  );

  for (const shell of shells) {
    const source = await readServerSourceFile(
      shell.file,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
    );
    if (
      routeClosureMayUseRequestInput({
        filename: shell.file,
        files: routeSourceFilesForAnalysis({
          appDir: options.appDir,
          code: source,
          filename: shell.file,
          serverSourceFiles: options.serverSourceFiles,
        }),
        projectRoot: options.appDir,
        source,
      })
    ) {
      return true;
    }
  }

  return false;
}

async function runServerModule(
  code: string,
  props: ServerComponentProps,
  sourcefile: string,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
  define: UserConfig["define"] | undefined,
  vitePlugins: readonly PluginOption[] | undefined,
): Promise<string> {
  const component = await loadServerComponent(
    code,
    sourcefile,
    serverModules,
    serverModuleCacheVersion,
    define,
    vitePlugins,
  );

  return renderServerComponentResult(await component(props));
}

async function renderServerComponentResult(value: unknown): Promise<string> {
  return typeof value === "string" ? value : renderReactNodeToString(value);
}

async function runServerModuleWithSlots(
  code: string,
  props: ServerComponentProps,
  sourcefile: string,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
  define?: UserConfig["define"] | undefined,
  vitePlugins?: readonly PluginOption[] | undefined,
  timing?: RenderTiming | undefined,
  importPolicy?: AppRouterImportPolicy | undefined,
  devServerModuleCacheVersion?: string | undefined,
): Promise<{ html: string; slots: Record<string, string> }> {
  const moduleLoadStartedAt = renderTimingPhaseStartedAt(timing);
  const module = await loadServerModule(
    code,
    sourcefile,
    serverModules,
    serverModuleCacheVersion,
    define,
    vitePlugins,
    importPolicy,
    devServerModuleCacheVersion,
  );
  finishRenderTimingPhase(timing, moduleLoadStartedAt, "pageModuleLoadMs");
  const component = selectServerComponent(module);
  const componentStartedAt = renderTimingPhaseStartedAt(timing);
  const html = await renderServerComponentResult(await component(props));
  finishRenderTimingPhase(timing, componentStartedAt, "pageComponentRenderMs");
  const slotsStartedAt = renderTimingPhaseStartedAt(timing);
  const slots = await renderRouteSlots(module.slots, props);
  finishRenderTimingPhase(timing, slotsStartedAt, "routeSlotsRenderMs");

  return {
    html,
    slots,
  };
}

async function loadServerModule(
  code: string,
  sourcefile: string,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
  define?: UserConfig["define"] | undefined,
  vitePlugins?: readonly PluginOption[] | undefined,
  importPolicy?: AppRouterImportPolicy | undefined,
  devServerModuleCacheVersion?: string | undefined,
): Promise<ServerModuleExports> {
  const artifact = serverModules?.get(sourcefile)?.string;
  const codeHash = memoizedHashText(code);
  const prebuiltCode = prebuiltServerComponentModuleCode(artifact, code, codeHash);
  const usesPrebuiltCompiledCode = artifact?.code === code;
  if (
    artifact !== undefined &&
    prebuiltServerModuleOutputMatches(artifact, code, codeHash) &&
    artifact.moduleFile !== undefined
  ) {
    return await importBuiltServerModuleFile<ServerModuleExports>({
      file: artifact.moduleFile,
      label: `server-component:${sourcefile}`,
      serverModuleCacheVersion,
    });
  }
  const moduleCode =
    prebuiltCode === undefined
      ? code
      : rewriteCompatVendorPlaceholderImportsForRunner(prebuiltCode);
  const sourceModuleCacheVersion = serverModuleCacheVersion ?? devServerModuleCacheVersion;
  const cacheKey =
    sourceModuleCacheVersion === undefined
      ? undefined
      : `server-component:${serverModuleCacheVersion === undefined ? "dev" : "build"}:${sourceModuleCacheVersion}:${sourcefile}:${
          moduleCode === code ? codeHash : memoizedHashText(moduleCode)
        }:${importPolicyCacheKey(importPolicy)}:${viteDefineCacheKey(define)}:${vitePluginsCacheKey(vitePlugins)}`;
  return await importAppRouterSourceModule<ServerModuleExports>({
    cacheKey,
    code: moduleCode,
    define,
    label: `server-component:${sourcefile}`,
    plugins:
      importPolicy === undefined
        ? undefined
        : [
            createAppRouterImportPolicyPlugin({
              appDir: dirname(sourcefile),
              importPolicy,
              label: "Server component",
            }),
          ],
    ...(prebuiltCode === undefined && !usesPrebuiltCompiledCode
      ? {
          resolveDir: dirname(sourcefile),
          serverSourceTransform: {
            dev: serverModuleCacheVersion === undefined,
            serverModules,
            serverOutput: "string" as const,
            define,
            vitePlugins,
          },
        }
      : {}),
    ...(usesPrebuiltCompiledCode ? { resolveDir: dirname(sourcefile) } : {}),
    sourcefile,
    vitePlugins,
  });
}

async function importBuiltServerModuleFile<T>(options: {
  file: string;
  label: string;
  serverModuleCacheVersion?: string | undefined;
}): Promise<T> {
  return await importAppRouterBuiltFileModule<T>({
    ...(options.serverModuleCacheVersion === undefined
      ? {}
      : {
          cacheKey: `${options.label}:${options.serverModuleCacheVersion}:${options.file}`,
        }),
    file: options.file,
  });
}

async function loadServerComponent(
  code: string,
  sourcefile: string,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
  define?: UserConfig["define"] | undefined,
  vitePlugins?: readonly PluginOption[] | undefined,
  importPolicy?: AppRouterImportPolicy | undefined,
): Promise<ServerComponent> {
  const module = await loadServerModule(
    code,
    sourcefile,
    serverModules,
    serverModuleCacheVersion,
    define,
    vitePlugins,
    importPolicy,
  );
  return selectServerComponent(module);
}

function selectServerComponent(module: ServerModuleExports): ServerComponent {
  const component = module.default ?? module.App ?? Object.values(module)[0];

  if (typeof component !== "function") {
    throw new Error("No page component export was found.");
  }

  return component as ServerComponent;
}

async function renderRouteSlots(
  slots: RouteSlotExports | undefined,
  props: ServerComponentProps,
): Promise<Record<string, string>> {
  if (slots === undefined) {
    return {};
  }

  const rendered: Record<string, string> = {};

  for (const [name, value] of Object.entries(slots)) {
    rendered[name] =
      typeof value === "function"
        ? await renderServerComponentResult(await value(props))
        : await renderServerComponentResult(value);
  }

  return rendered;
}

function runServerStreamModule(
  code: string,
  options: {
    appDir: string;
    assetBaseUrl?: string | undefined;
    clientRouteInferenceCache: ClientRouteInferenceCache;
    markerRequest: Request;
    prerenderVariantCapture?: boolean | undefined;
    pageFile: string;
    props: ServerComponentProps;
    requestUrl: string;
    routePath: string;
    routeScripts?: ReadonlyMap<string, string> | undefined;
    clientRoute: boolean;
    clientReferenceManifest?: readonly ClientReferenceMetadata[] | undefined;
    define?: UserConfig["define"] | undefined;
    serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
    serverModuleCacheVersion?: string | undefined;
    serverSourceFiles?: ReadonlyMap<string, string> | undefined;
    script?: string | undefined;
    vitePlugins?: readonly PluginOption[] | undefined;
    importPolicy?: AppRouterImportPolicy | undefined;
  },
): ReadableStream<Uint8Array> {
  return renderToReadableStream(async (sink) => {
    const slots = await renderServerStreamSlots(code, {
      pageFile: options.pageFile,
      props: options.props,
      serverModules: options.serverModules,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
      define: options.define,
      vitePlugins: options.vitePlugins,
      importPolicy: options.importPolicy,
    });
    const layoutShells = await layoutShellsForPage(
      options.appDir,
      options.pageFile,
      options.props,
      slots,
      options.serverModules,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
      options.clientRouteInferenceCache,
      options.define,
      options.vitePlugins,
      options.importPolicy,
    );
    const marker = options.clientRoute
      ? hydrationMarkerParts({
          assetBaseUrl: options.assetBaseUrl,
          clientReferenceManifest: options.clientReferenceManifest,
          routePath: options.routePath,
          script: options.script,
          props: {
            params: options.props.params,
            request: routeLocationForHydration(
              new URL(options.requestUrl, options.markerRequest.url),
            ),
            data: options.props.data,
          },
        })
      : serverOnlyRouteMarkerParts(
          options.routePath,
          options.markerRequest,
          options.prerenderVariantCapture === true,
        );

    sink.append("<!DOCTYPE html>");
    sink.append(
      clientNavigationHeadTags({
        assetBaseUrl: options.assetBaseUrl,
        currentScript: options.clientRoute ? options.script : undefined,
        routeScripts: options.routeScripts,
      }),
    );

    for (const shell of layoutShells) {
      sink.append(shell.prefix);
    }

    sink.append(marker?.prefix ?? "");

    await appendServerStreamModule(
      code,
      sink,
      options.props,
      options.pageFile,
      options.serverModules,
      options.serverModuleCacheVersion,
      options.define,
      options.vitePlugins,
      options.importPolicy,
    );

    sink.append(marker?.suffix ?? "");

    for (const shell of [...layoutShells].reverse()) {
      sink.append(shell.suffix);
    }

    if (hasOutOfOrderBoundary(code) || layoutShells.some((shell) => shell.hasOutOfOrderBoundary)) {
      renderOutOfOrderReorderScript(sink);
    }
  });
}

function hasOutOfOrderBoundary(code: string): boolean {
  return code.includes("renderOutOfOrderBoundary");
}

function mayRenderOutOfOrderBoundary(code: string): boolean {
  return (
    code.includes("<Await") || code.includes("Await(") || code.includes("renderOutOfOrderBoundary")
  );
}

async function mayRenderOutOfOrderBoundaryDeep(options: {
  code: string;
  filename: string;
  serverModuleCacheVersion: string | undefined;
  serverSourceFiles: ReadonlyMap<string, string> | undefined;
}): Promise<boolean> {
  const seen = new Set<string>();

  return await mayRenderOutOfOrderBoundaryDeepInner(options, seen);
}

async function mayRenderOutOfOrderBoundaryDeepInner(
  options: {
    code: string;
    filename: string;
    serverModuleCacheVersion: string | undefined;
    serverSourceFiles: ReadonlyMap<string, string> | undefined;
  },
  seen: Set<string>,
): Promise<boolean> {
  if (mayRenderOutOfOrderBoundary(options.code)) {
    return true;
  }

  if (seen.has(options.filename)) {
    return false;
  }
  seen.add(options.filename);

  const sourceHash = memoizedHashText(options.code);
  const cacheKey = `${options.serverModuleCacheVersion ?? "dev"}\0${options.filename}\0${sourceHash}`;
  const cached = readRouterRuntimeCacheEntry(
    routeOutOfOrderBoundaryAnalysisCache,
    cacheKey,
    routeOutOfOrderBoundaryAnalysisCacheCounters,
  );

  if (cached !== undefined) {
    return cached;
  }

  const pending = mayRenderImportedOutOfOrderBoundary(options, seen).catch((error) => {
    routeOutOfOrderBoundaryAnalysisCache.delete(cacheKey);
    throw error;
  });
  setBoundedCacheEntry(
    routeOutOfOrderBoundaryAnalysisCache,
    cacheKey,
    pending,
    maxRouteOutOfOrderBoundaryAnalysisCacheEntries,
    routeOutOfOrderBoundaryAnalysisCacheCounters,
  );

  return pending;
}

async function mayRenderImportedOutOfOrderBoundary(
  options: {
    code: string;
    filename: string;
    serverModuleCacheVersion: string | undefined;
    serverSourceFiles: ReadonlyMap<string, string> | undefined;
  },
  seen: Set<string>,
): Promise<boolean> {
  for (const specifier of localModuleSpecifiers(options.code)) {
    const file = await resolveLocalServerSourceImport(options.filename, specifier);

    if (file === undefined) {
      continue;
    }

    const code = await readServerSourceFile(
      file,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
    );

    if (
      await mayRenderOutOfOrderBoundaryDeepInner(
        {
          code,
          filename: file,
          serverModuleCacheVersion: options.serverModuleCacheVersion,
          serverSourceFiles: options.serverSourceFiles,
        },
        seen,
      )
    ) {
      return true;
    }
  }

  return false;
}

function localModuleSpecifiers(code: string): string[] {
  const specifiers = new Set<string>();
  const importPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s*)?["'](?<source>\.{1,2}\/[^"']+)["']/g;

  for (const match of code.matchAll(importPattern)) {
    const source = match.groups?.source;

    if (source !== undefined) {
      specifiers.add(source);
    }
  }

  return Array.from(specifiers);
}

async function resolveLocalServerSourceImport(
  fromFile: string,
  specifier: string,
): Promise<string | undefined> {
  const base = join(dirname(fromFile), specifier);
  const candidates = localServerSourceImportCandidates(base);

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next TypeScript route/source extension.
    }
  }

  return undefined;
}

function localServerSourceImportCandidates(base: string): string[] {
  const candidates = [base];

  if (base.endsWith(".js")) {
    const withoutJs = base.slice(0, -".js".length);
    candidates.push(`${withoutJs}.ts`, `${withoutJs}.tsx`, `${withoutJs}.mreact.tsx`);
  } else if (base.endsWith(".jsx")) {
    const withoutJsx = base.slice(0, -".jsx".length);
    candidates.push(`${withoutJsx}.tsx`, `${withoutJsx}.mreact.tsx`);
  } else if (base.endsWith(".mreact")) {
    candidates.push(`${base}.tsx`);
  } else {
    candidates.push(
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.mreact.tsx`,
      join(base, "index.ts"),
      join(base, "index.tsx"),
      join(base, "index.mreact.tsx"),
    );
  }

  return candidates;
}

async function runServerStreamModuleWithLoading(
  code: string,
  options: {
    appDir: string;
    assetBaseUrl?: string | undefined;
    clientRouteInferenceCache: ClientRouteInferenceCache;
    clientRoute: boolean;
    clientReferenceManifest?: readonly ClientReferenceMetadata[] | undefined;
    data: Promise<unknown>;
    dataSettlement: () => ObservedPromiseSettlement<unknown>;
    define?: UserConfig["define"] | undefined;
    errorFile?: string | undefined;
    loadingFile: string;
    markerRequest: Request;
    onRenderError?: ((error: unknown) => void) | undefined;
    prerenderVariantCapture?: boolean | undefined;
    pageFile: string;
    params: RouteParams;
    queryClient: QueryClient;
    request: Request;
    requestUrl: string;
    trackedRequest?: TrackedHeaderRequest | undefined;
    routePath: string;
    routeScripts?: ReadonlyMap<string, string> | undefined;
    serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
    serverModuleCacheVersion?: string | undefined;
    serverSourceFiles?: ReadonlyMap<string, string> | undefined;
    script?: string | undefined;
    vitePlugins?: readonly PluginOption[] | undefined;
    importPolicy?: AppRouterImportPolicy | undefined;
  },
): Promise<ReadableStream<Uint8Array> | Response> {
  const loadingProps = withTrackedRouteLocation(
    {
      data: undefined,
      params: options.params,
      queryClient: options.queryClient,
    },
    options.request,
    options.trackedRequest,
    routeLocationFromUrl(new URL(options.requestUrl)),
  );
  const layoutShells = await layoutShellsForPage(
    options.appDir,
    options.pageFile,
    loadingProps,
    {},
    options.serverModules,
    options.serverModuleCacheVersion,
    options.serverSourceFiles,
    options.clientRouteInferenceCache,
    options.define,
    options.vitePlugins,
    options.importPolicy,
  );
  const loadingHtml = await renderServerFileToHtml(
    options.loadingFile,
    loadingProps,
    options.serverModules,
    options.serverModuleCacheVersion,
    options.serverSourceFiles,
    options.define,
    options.vitePlugins,
  );
  const marker = options.clientRoute
    ? hydrationMarkerParts({
        assetBaseUrl: options.assetBaseUrl,
        clientReferenceManifest: options.clientReferenceManifest,
        routePath: options.routePath,
        script: options.script,
        props: {
          params: options.params,
          request: routeLocationForHydration(new URL(options.requestUrl)),
        },
      })
    : serverOnlyRouteMarkerParts(
        options.routePath,
        options.markerRequest,
        options.prerenderVariantCapture === true,
      );

  const dataSettlement = options.dataSettlement();

  if (dataSettlement.status === "rejected") {
    throw dataSettlement.error;
  }

  if (dataSettlement.status === "fulfilled" && dataSettlement.value instanceof Response) {
    return dataSettlement.value;
  }

  return renderToReadableStream((sink) => {
    sink.append("<!DOCTYPE html>");
    sink.append(
      clientNavigationHeadTags({
        assetBaseUrl: options.assetBaseUrl,
        currentScript: options.clientRoute ? options.script : undefined,
        routeScripts: options.routeScripts,
      }),
    );

    for (const shell of layoutShells) {
      sink.append(shell.prefix);
    }

    sink.append(marker?.prefix ?? "");

    renderOutOfOrderBoundary(
      sink,
      "mreact-route",
      options.data,
      async (boundarySink, data) => {
        await appendServerStreamModule(
          code,
          boundarySink,
          withTrackedRouteLocation(
            {
              data,
              params: options.params,
              queryClient: options.queryClient,
            },
            options.request,
            options.trackedRequest,
            routeLocationFromUrl(new URL(options.requestUrl)),
          ),
          options.pageFile,
          options.serverModules,
          options.serverModuleCacheVersion,
          options.define,
          options.vitePlugins,
          options.importPolicy,
        );
      },
      {
        async catch(boundarySink, error) {
          try {
            options.onRenderError?.(error);
          } catch {
            // Error reporting is best-effort and must not truncate a response that already flushed.
          }

          if (options.errorFile === undefined) {
            boundarySink.append("Internal Server Error");
            return;
          }

          try {
            boundarySink.append(
              await renderServerFileToHtml(
                options.errorFile,
                errorBoundaryProps(error, options.request, options.routePath),
                options.serverModules,
                options.serverModuleCacheVersion,
                options.serverSourceFiles,
                options.define,
                options.vitePlugins,
              ),
            );
          } catch {
            boundarySink.append("Internal Server Error");
          }
        },
        placeholder(boundarySink) {
          boundarySink.append(loadingHtml);
        },
        placeholderTag: "div",
      },
    );

    sink.append(marker?.suffix ?? "");

    for (const shell of [...layoutShells].reverse()) {
      sink.append(shell.suffix);
    }

    renderOutOfOrderReorderScript(sink);
  });
}

async function appendServerStreamModule(
  code: string,
  sink: HtmlSink,
  props: ServerComponentProps,
  sourcefile: string,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
  define: UserConfig["define"] | undefined,
  vitePlugins?: readonly PluginOption[] | undefined,
  importPolicy?: AppRouterImportPolicy | undefined,
): Promise<void> {
  const module = await loadServerStreamModule(
    code,
    sourcefile,
    serverModules,
    serverModuleCacheVersion,
    define,
    vitePlugins,
    importPolicy,
  );
  const component = selectStreamComponent(module);

  await component(sink, props);
}

async function renderServerStreamSlots(
  code: string,
  options: {
    define?: UserConfig["define"] | undefined;
    pageFile: string;
    props: ServerComponentProps;
    serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
    serverModuleCacheVersion?: string | undefined;
    vitePlugins?: readonly PluginOption[] | undefined;
    importPolicy?: AppRouterImportPolicy | undefined;
  },
): Promise<Record<string, string>> {
  if (!hasRouteSlotsExport(code)) {
    return {};
  }

  const module = await loadServerStreamModule(
    code,
    options.pageFile,
    options.serverModules,
    options.serverModuleCacheVersion,
    options.define,
    options.vitePlugins,
    options.importPolicy,
  );

  if (module.slots === undefined) {
    return {};
  }

  const rendered: Record<string, string> = {};

  for (const [name, value] of Object.entries(module.slots)) {
    if (typeof value !== "function") {
      rendered[name] = value;
      continue;
    }

    const sink = createStringSink();
    await value(sink, options.props);
    await sink.drain();
    rendered[name] = sink.toString();
  }

  return rendered;
}

function hasRouteSlotsExport(code: string): boolean {
  return /^\s*export\s+const\s+slots\s*=/m.test(code);
}

async function loadServerStreamModule(
  code: string,
  sourcefile: string,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
  define?: UserConfig["define"] | undefined,
  vitePlugins?: readonly PluginOption[] | undefined,
  importPolicy?: AppRouterImportPolicy | undefined,
  outputOptions: { serverAwaitHydration?: boolean } = {},
): Promise<StreamModuleExports> {
  const artifactCode = serverModules?.get(sourcefile)?.stream;
  const codeHash = memoizedHashText(code);
  const prebuiltCode = prebuiltServerComponentModuleCode(
    artifactCode,
    code,
    codeHash,
    outputOptions,
  );
  const usesPrebuiltCompiledCode = artifactCode?.code === code;
  if (
    artifactCode !== undefined &&
    prebuiltServerModuleOutputOptionsMatch(artifactCode, outputOptions) &&
    prebuiltServerModuleOutputMatches(artifactCode, code, codeHash) &&
    artifactCode.moduleFile !== undefined
  ) {
    return await importBuiltServerModuleFile<StreamModuleExports>({
      file: artifactCode.moduleFile,
      label: `server-stream-component:${sourcefile}`,
      serverModuleCacheVersion,
    });
  }
  const moduleCode =
    prebuiltCode === undefined
      ? code
      : rewriteCompatVendorPlaceholderImportsForRunner(prebuiltCode);
  const cacheKey =
    serverModuleCacheVersion === undefined
      ? undefined
      : `server-stream-component:${serverModuleCacheVersion}:${sourcefile}:${
          moduleCode === code ? codeHash : memoizedHashText(moduleCode)
        }:${importPolicyCacheKey(importPolicy)}:${viteDefineCacheKey(define)}:${vitePluginsCacheKey(vitePlugins)}`;
  return await importAppRouterSourceModule<StreamModuleExports>({
    cacheKey,
    code: moduleCode,
    define,
    label: `server-stream-component:${sourcefile}`,
    plugins:
      importPolicy === undefined
        ? undefined
        : [
            createAppRouterImportPolicyPlugin({
              appDir: dirname(sourcefile),
              importPolicy,
              label: "Server stream component",
            }),
          ],
    ...(prebuiltCode === undefined && !usesPrebuiltCompiledCode
      ? {
          resolveDir: dirname(sourcefile),
          serverSourceTransform: {
            dev: serverModuleCacheVersion === undefined,
            serverModules,
            serverOutput: "stream" as const,
            define,
            vitePlugins,
          },
        }
      : {}),
    ...(usesPrebuiltCompiledCode ? { resolveDir: dirname(sourcefile) } : {}),
    sourcefile,
    vitePlugins,
  });
}

function selectStreamComponent(module: StreamModuleExports): StreamComponent {
  const component = module.default ?? module.App ?? Object.values(module)[0];

  if (typeof component !== "function") {
    throw new Error("No page component export was found.");
  }

  return component as StreamComponent;
}

async function applyLayouts(options: {
  appDir: string;
  clientRouteInferenceCache?: ClientRouteInferenceCache | undefined;
  define?: UserConfig["define"] | undefined;
  pageFile: string;
  html: string;
  props: ServerComponentProps;
  slots?: Record<string, string> | undefined;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
  timing?: RenderTiming | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
}): Promise<string> {
  const layoutFiles = await shellFilesForPage(
    options.appDir,
    options.pageFile,
    options.serverModuleCacheVersion,
  );
  let html = options.html;
  let shellHasOutOfOrderBoundary = false;
  const slotContext = createSlotRenderContext(options.slots);
  const renderShell = (shell: ShellFile) =>
    renderShellPrefixSuffix(
      options.appDir,
      shell,
      options.props,
      slotContext,
      options.serverModules,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
      options.clientRouteInferenceCache,
      options.timing,
      options.define,
      options.vitePlugins,
      options.importPolicy,
    );
  const renderedShells =
    Object.keys(slotContext.namedSlots).length === 0
      ? await Promise.all(layoutFiles.map(renderShell))
      : undefined;

  for (let index = layoutFiles.length - 1; index >= 0; index -= 1) {
    const shell = layoutFiles[index];
    if (shell === undefined) {
      continue;
    }

    const rendered = renderedShells?.[index] ?? (await renderShell(shell));
    shellHasOutOfOrderBoundary ||= rendered.hasOutOfOrderBoundary;
    html = `${rendered.prefix}${html}${rendered.suffix}`;
  }

  warnUnconsumedRouteSlots({
    appDir: options.appDir,
    pageFile: options.pageFile,
    serverModuleCacheVersion: options.serverModuleCacheVersion,
    slotContext,
  });

  if (!shellHasOutOfOrderBoundary) {
    return html;
  }

  const sink = createStringSink();
  sink.append(html);
  renderOutOfOrderReorderScript(sink);
  await sink.drain();
  return sink.toString();
}

async function layoutShellsForPage(
  appDir: string,
  pageFile: string,
  props: ServerComponentProps,
  slots: Readonly<Record<string, string>>,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
  serverSourceFiles: ReadonlyMap<string, string> | undefined,
  clientRouteInferenceCache: ClientRouteInferenceCache | undefined,
  define?: UserConfig["define"] | undefined,
  vitePlugins?: readonly PluginOption[] | undefined,
  importPolicy?: AppRouterImportPolicy | undefined,
): Promise<RenderedShell[]> {
  const layoutFiles = await shellFilesForPage(appDir, pageFile, serverModuleCacheVersion);
  const slotContext = createSlotRenderContext(slots);
  const renderShell = (shell: ShellFile) =>
    renderShellPrefixSuffix(
      appDir,
      shell,
      props,
      slotContext,
      serverModules,
      serverModuleCacheVersion,
      serverSourceFiles,
      clientRouteInferenceCache,
      undefined,
      define,
      vitePlugins,
      importPolicy,
    );
  const shells =
    Object.keys(slotContext.namedSlots).length === 0
      ? await Promise.all(layoutFiles.map(renderShell))
      : [];

  if (shells.length === 0 && layoutFiles.length > 0) {
    for (const shell of layoutFiles) {
      shells.push(await renderShell(shell));
    }
  }

  warnUnconsumedRouteSlots({
    appDir,
    pageFile,
    serverModuleCacheVersion,
    slotContext,
  });

  return shells;
}

async function renderShellPrefixSuffix(
  appDir: string,
  shell: ShellFile,
  props: ServerComponentProps,
  slotContext: SlotRenderContext,
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined,
  serverModuleCacheVersion: string | undefined,
  serverSourceFiles: ReadonlyMap<string, string> | undefined,
  clientRouteInferenceCache?: ClientRouteInferenceCache | undefined,
  timing?: RenderTiming | undefined,
  define?: UserConfig["define"] | undefined,
  vitePlugins?: readonly PluginOption[] | undefined,
  importPolicy?: AppRouterImportPolicy | undefined,
): Promise<RenderedShell> {
  const hasNamedSlots = Object.keys(slotContext.namedSlots).length > 0;
  const cacheKey =
    serverModuleCacheVersion === undefined || hasNamedSlots || shell.kind === "template"
      ? undefined
      : `${appDir}\0${shell.file}\0${serverModuleCacheVersion}\0${importPolicyCacheKey(importPolicy)}\0${viteDefineCacheKey(define)}\0${vitePluginsCacheKey(vitePlugins)}`;
  const staticEntry = cacheKey === undefined ? undefined : shellStaticRenderCache.get(cacheKey);
  const loadedStaticEntry =
    staticEntry ??
    (await loadShellStaticRenderEntry({
      cacheKey,
      clientRouteInferenceCache,
      define,
      importPolicy,
      serverModuleCacheVersion,
      serverModules,
      serverSourceFiles,
      shell,
      timing,
      vitePlugins,
    }));

  let phaseStartedAt = renderTimingPhaseStartedAt(timing);
  const layoutHtml = loadedStaticEntry.shellUsesAwait
    ? await renderShellStreamComponent(loadedStaticEntry.component as StreamComponent, props)
    : await (loadedStaticEntry.component as ServerComponent)(props);
  addRenderTimingPhaseDuration(timing, phaseStartedAt, "layoutComponentRenderMs");
  phaseStartedAt = renderTimingPhaseStartedAt(timing);
  const rendered = {
    ...splitLayoutSlot(markShellBoundary(layoutHtml, shell), slotContext),
    hasOutOfOrderBoundary: loadedStaticEntry.hasOutOfOrderBoundary,
  };
  addRenderTimingPhaseDuration(timing, phaseStartedAt, "layoutSlotSplitMs");

  return rendered;
}

async function loadShellStaticRenderEntry(options: {
  cacheKey: string | undefined;
  clientRouteInferenceCache?: ClientRouteInferenceCache | undefined;
  define?: UserConfig["define"] | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
  serverModuleCacheVersion: string | undefined;
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverSourceFiles: ReadonlyMap<string, string> | undefined;
  shell: ShellFile;
  timing?: RenderTiming | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<ShellStaticRenderEntry> {
  let phaseStartedAt = renderTimingPhaseStartedAt(options.timing);
  const code = await readServerSourceFile(
    options.shell.file,
    options.serverModuleCacheVersion,
    options.serverSourceFiles,
  );
  addRenderTimingPhaseDuration(options.timing, phaseStartedAt, "layoutSourceReadMs");
  phaseStartedAt = renderTimingPhaseStartedAt(options.timing);
  const shellUsesAwait = await mayRenderOutOfOrderBoundaryDeep({
    code,
    filename: options.shell.file,
    serverModuleCacheVersion: options.serverModuleCacheVersion,
    serverSourceFiles: options.serverSourceFiles,
  });
  const serverOutput: ServerOutputMode = shellUsesAwait ? "stream" : "string";
  const artifact = options.serverModules?.get(options.shell.file)?.[serverOutput];
  const clientInference =
    artifact !== undefined && artifact.sourceHash === memoizedHashText(code)
      ? {
          client: false,
          clientBoundaryImports: [],
          clientBoundaryFallbackImports: [],
          diagnostics: [],
        }
      : await inferClientRouteModule({
          cache: options.clientRouteInferenceCache,
          code: stripRouteClientOnlyExports(code, options.shell.file),
          filename: options.shell.file,
          vitePlugins: options.vitePlugins,
        });
  for (const diagnostic of clientInference.diagnostics) {
    console.warn(formatClientRouteInferenceDiagnostic(diagnostic));
  }
  const output = transformServerModule({
    code,
    clientBoundaryImports: clientInference.clientBoundaryImports,
    clientBoundaryFallbackImports: clientInference.clientBoundaryFallbackImports,
    filename: options.shell.file,
    serverModules: options.serverModules,
    serverOutput,
  });
  addRenderTimingPhaseDuration(options.timing, phaseStartedAt, "layoutTransformMs");
  const fatalDiagnostics = fatalServerDiagnostics(output.diagnostics);

  if (fatalDiagnostics.length > 0) {
    throw new Error(formatServerDiagnostics(options.shell.file, fatalDiagnostics));
  }

  phaseStartedAt = renderTimingPhaseStartedAt(options.timing);
  const component = shellUsesAwait
    ? selectStreamComponent(
        await loadServerStreamModule(
          output.code,
          options.shell.file,
          options.serverModules,
          options.serverModuleCacheVersion,
          options.define,
          options.vitePlugins,
          options.importPolicy,
        ),
      )
    : await loadServerComponent(
        output.code,
        options.shell.file,
        options.serverModules,
        options.serverModuleCacheVersion,
        options.define,
        options.vitePlugins,
        options.importPolicy,
      );
  addRenderTimingPhaseDuration(options.timing, phaseStartedAt, "layoutModuleLoadMs");
  const entry = {
    component,
    hasOutOfOrderBoundary: hasOutOfOrderBoundary(output.code),
    shellUsesAwait,
  };

  if (options.cacheKey !== undefined) {
    if (shellStaticRenderCache.size >= MAX_SHELL_STATIC_RENDER_CACHE_ENTRIES) {
      const oldestKey = shellStaticRenderCache.keys().next().value;
      if (oldestKey !== undefined) {
        shellStaticRenderCache.delete(oldestKey);
      }
    }
    shellStaticRenderCache.set(options.cacheKey, entry);
  }

  return entry;
}

async function renderShellStreamComponent(
  component: StreamComponent,
  props: ServerComponentProps,
): Promise<string> {
  const sink = createStringSink();
  await component(sink, props);
  await sink.drain();
  return sink.toString();
}

// Layout/template files for a given page do not change during a server's
// lifetime in production. Each cache miss costs up to N×4 filesystem
// `access()` syscalls (~5-10μs each on a fast SSD), making this one of
// the largest fixed costs in `renderBuiltAppRequest` for a minimal page.
//
// We cache by `appDir + pageFile + serverModuleCacheVersion` so the cache
// is only active when a server-module manifest version is available
// (= production builds). In dev mode the version is `undefined`, so we
// skip the cache and pick up newly added layout / template files on the
// next request.
const shellFilesCache = new Map<string, ShellFile[]>();
const MAX_SHELL_FILES_CACHE_ENTRIES = 1024;
const devShellFilesCache = new Map<
  string,
  { directoryStats: readonly FileStat[]; files: ShellFile[] }
>();
const shellStaticRenderCache = new Map<string, ShellStaticRenderEntry>();
const MAX_SHELL_STATIC_RENDER_CACHE_ENTRIES = 1024;
const routeMiddlewareControlCache = new Map<string, Promise<RouteMiddlewareControl | undefined>>();
const MAX_ROUTE_MIDDLEWARE_CONTROL_CACHE_ENTRIES = 1024;
const appMiddlewareFileCache = new Map<string, Promise<boolean>>();
const MAX_APP_MIDDLEWARE_FILE_CACHE_ENTRIES = 1024;
const devAppMiddlewareFileCache = new Map<
  string,
  { directoryStat: FileStat; hasMiddleware: boolean }
>();
const routeMiddlewareControlSourceCache = new Map<
  string,
  { control: RouteMiddlewareControl | undefined; mtimeMs: number }
>();
const devServerSourceFileCache = new Map<
  string,
  { mtimeMs: number; size: number; source: string }
>();
const MAX_DEV_SERVER_SOURCE_FILE_CACHE_ENTRIES = 2048;

interface FileStat {
  mtimeMs: number;
  size: number;
}

interface ShellStaticRenderEntry {
  component: ServerComponent | StreamComponent;
  hasOutOfOrderBoundary: boolean;
  shellUsesAwait: boolean;
}

async function shellFilesForPage(
  appDir: string,
  pageFile: string,
  serverModuleCacheVersion?: string,
): Promise<ShellFile[]> {
  const cacheKey =
    serverModuleCacheVersion === undefined
      ? undefined
      : `${appDir}\0${pageFile}\0${serverModuleCacheVersion}`;
  if (cacheKey !== undefined) {
    const cached = shellFilesCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  const devCacheKey = cacheKey === undefined ? `${appDir}\0${pageFile}` : undefined;
  if (devCacheKey !== undefined) {
    const directoryStats = await routeShellDirectoryStats(appDir, pageFile);
    const cached = devShellFilesCache.get(devCacheKey);
    if (cached !== undefined && sameFileStats(cached.directoryStats, directoryStats)) {
      return cached.files;
    }

    const files = await shellFilesForPageUncached(appDir, pageFile);
    devShellFilesCache.set(devCacheKey, { directoryStats, files });
    return files;
  }

  const files = await shellFilesForPageUncached(appDir, pageFile);
  if (cacheKey !== undefined) {
    if (shellFilesCache.size >= MAX_SHELL_FILES_CACHE_ENTRIES) {
      const oldestKey = shellFilesCache.keys().next().value;
      if (oldestKey !== undefined) {
        shellFilesCache.delete(oldestKey);
      }
    }
    shellFilesCache.set(cacheKey, files);
  }
  return files;
}

async function shellFilesForPageUncached(appDir: string, pageFile: string): Promise<ShellFile[]> {
  const shells = await existingRouteShellCandidates(appDir, pageFile, async (file) => {
    try {
      await access(file);
      return true;
    } catch {
      return false;
    }
  });
  const files: ShellFile[] = shells.map((shell) => ({
    file: shell.file,
    id: shellBoundaryId(appDir, shell.directory),
    kind: shell.kind,
  }));

  return files;
}

function withRouteCacheHeader(
  response: Response,
  policy: ReturnType<typeof routeCachePolicyFromSource>,
): Response {
  if (policy !== undefined) {
    response.headers.set("cache-control", policy.cacheControl);
  }

  return response;
}

async function hasAppMiddleware(options: {
  appDir: string;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
}): Promise<boolean> {
  const middlewareFiles = [
    join(options.appDir, "middleware.ts"),
    join(options.appDir, "middleware.mreact.ts"),
  ];

  if (options.serverSourceFiles !== undefined) {
    return middlewareFiles.some((file) => options.serverSourceFiles?.has(file) === true);
  }

  const cacheKey =
    options.serverModuleCacheVersion === undefined
      ? undefined
      : `${options.appDir}\0${options.serverModuleCacheVersion}`;

  if (cacheKey !== undefined) {
    const cached = appMiddlewareFileCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  if (cacheKey === undefined) {
    const directoryStat = await fileStat(options.appDir);
    const cached = devAppMiddlewareFileCache.get(options.appDir);
    if (cached !== undefined && sameFileStat(cached.directoryStat, directoryStat)) {
      return cached.hasMiddleware;
    }

    const hasMiddleware = await hasAppMiddlewareUncached(middlewareFiles);
    devAppMiddlewareFileCache.set(options.appDir, { directoryStat, hasMiddleware });
    return hasMiddleware;
  }

  const loaded = hasAppMiddlewareUncached(middlewareFiles).catch((error) => {
    appMiddlewareFileCache.delete(cacheKey);
    throw error;
  });

  if (appMiddlewareFileCache.size >= MAX_APP_MIDDLEWARE_FILE_CACHE_ENTRIES) {
    const oldestKey = appMiddlewareFileCache.keys().next().value;
    if (oldestKey !== undefined) {
      appMiddlewareFileCache.delete(oldestKey);
    }
  }
  appMiddlewareFileCache.set(cacheKey, loaded);

  return loaded;
}

async function hasAppMiddlewareUncached(files: readonly string[]): Promise<boolean> {
  for (const file of files) {
    try {
      await access(file);
      return true;
    } catch {
      // Missing middleware files are allowed.
    }
  }

  return false;
}

async function routeShellDirectoryStats(appDir: string, pageFile: string): Promise<FileStat[]> {
  const directories: string[] = [];
  let current = dirname(pageFile);
  const resolvedAppDir = resolve(appDir);

  while (true) {
    directories.push(current);
    if (resolve(current) === resolvedAppDir) {
      break;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return await Promise.all(directories.map((directory) => fileStatOrMissing(directory)));
}

async function fileStat(file: string): Promise<FileStat> {
  const stats = await stat(file);
  return { mtimeMs: stats.mtimeMs, size: stats.size };
}

async function fileStatOrMissing(file: string): Promise<FileStat> {
  try {
    return await fileStat(file);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { mtimeMs: -1, size: -1 };
    }
    throw error;
  }
}

function sameFileStats(left: readonly FileStat[], right: readonly FileStat[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => {
      const other = right[index];
      return other !== undefined && sameFileStat(value, other);
    })
  );
}

function sameFileStat(left: FileStat, right: FileStat): boolean {
  return left.mtimeMs === right.mtimeMs && left.size === right.size;
}

async function loadRouteMiddlewareControl(options: {
  appDir: string;
  pageFile: string;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
}): Promise<RouteMiddlewareControl | undefined> {
  const cacheKey =
    options.serverModuleCacheVersion === undefined
      ? undefined
      : `${options.appDir}\0${options.pageFile}\0${options.serverModuleCacheVersion}`;

  if (cacheKey !== undefined) {
    const cached = routeMiddlewareControlCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  const loaded = loadRouteMiddlewareControlUncached(options).catch((error) => {
    if (cacheKey !== undefined) {
      routeMiddlewareControlCache.delete(cacheKey);
    }
    throw error;
  });

  if (cacheKey !== undefined) {
    if (routeMiddlewareControlCache.size >= MAX_ROUTE_MIDDLEWARE_CONTROL_CACHE_ENTRIES) {
      const oldestKey = routeMiddlewareControlCache.keys().next().value;
      if (oldestKey !== undefined) {
        routeMiddlewareControlCache.delete(oldestKey);
      }
    }
    routeMiddlewareControlCache.set(cacheKey, loaded);
  }

  return loaded;
}

async function loadRouteMiddlewareControlUncached(options: {
  appDir: string;
  pageFile: string;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
}): Promise<RouteMiddlewareControl | undefined> {
  const controls: Array<RouteMiddlewareControl | undefined> = [];
  const shellFiles = await shellFilesForPage(
    options.appDir,
    options.pageFile,
    options.serverModuleCacheVersion,
  );

  for (const shell of shellFiles) {
    if (shell.kind !== "layout") {
      continue;
    }

    controls.push(
      await loadRouteMiddlewareControlFile({
        file: shell.file,
        serverModuleCacheVersion: options.serverModuleCacheVersion,
        serverSourceFiles: options.serverSourceFiles,
      }),
    );
  }

  controls.push(
    await loadRouteMiddlewareControlFile({
      file: options.pageFile,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
      serverSourceFiles: options.serverSourceFiles,
    }),
  );

  return mergeRouteMiddlewareControls(controls);
}

async function loadRouteMiddlewareControlFile(options: {
  file: string;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
}): Promise<RouteMiddlewareControl | undefined> {
  if (options.serverSourceFiles !== undefined || options.serverModuleCacheVersion !== undefined) {
    return parseRouteMiddlewareControl(
      await readServerSourceFile(
        options.file,
        options.serverModuleCacheVersion,
        options.serverSourceFiles,
      ),
    );
  }

  const fileStat = await stat(options.file);
  const cached = routeMiddlewareControlSourceCache.get(options.file);

  if (cached !== undefined && cached.mtimeMs === fileStat.mtimeMs) {
    return cached.control;
  }

  const control = parseRouteMiddlewareControl(await readFile(options.file, "utf8"));
  routeMiddlewareControlSourceCache.set(options.file, {
    control,
    mtimeMs: fileStat.mtimeMs,
  });

  return control;
}

interface RouteMetadataContext {
  data: unknown;
  params: RouteParams;
  request: Request;
}

interface RouteMetadataModule {
  generateMetadata?:
    | ((
        context: RouteMetadataContext,
      ) => Promise<RouteMetadata | undefined> | RouteMetadata | undefined)
    | undefined;
  metadata?: RouteMetadata;
}

async function loadRouteData(options: {
  appDir: string;
  code: string;
  context: RouteDataContext;
  define?: UserConfig["define"] | undefined;
  devServerModuleCacheVersion?: string | undefined;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  onLoaderReady?: (() => void) | undefined;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  timing?: RenderTiming | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<unknown> {
  return await loadRouteDataFromModule({
    context: options.context,
    hasLoader: hasLoaderExport(options.code),
    loadModule: () => loadRouteLoaderModule(options),
    onLoaderReady: options.onLoaderReady,
    timing: {
      finish(startedAt, phase) {
        finishRenderTimingPhase(options.timing, startedAt, phase);
      },
      start() {
        return renderTimingPhaseStartedAt(options.timing);
      },
    },
  });
}

async function loadRouteDataWithInstrumentation(options: {
  appDir: string;
  code: string;
  context: RouteDataContext;
  define?: UserConfig["define"] | undefined;
  devServerModuleCacheVersion?: string | undefined;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  instrumentation?: RouterInstrumentation | undefined;
  onLoaderReady?: (() => void) | undefined;
  request: Request;
  routeId: string;
  routePath: string;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  timing?: RenderTiming | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<unknown> {
  const trace = traceContextFromRequest(options.request);
  const event = {
    method: options.request.method,
    path: new URL(options.request.url).pathname,
    request: options.request,
    routeId: options.routeId,
    routePath: options.routePath,
    ...(trace === undefined ? {} : { trace }),
  };
  invokeRouterInstrumentation(options.instrumentation?.onLoaderStart, event);

  try {
    const data = await loadRouteData(options);
    invokeRouterInstrumentation(options.instrumentation?.onLoaderEnd, event);

    return data;
  } catch (error) {
    invokeRouterInstrumentation(options.instrumentation?.onLoaderEnd, {
      ...event,
      error,
    });
    throw error;
  }
}

async function loadRouteLoaderModule(options: {
  appDir: string;
  code: string;
  define?: UserConfig["define"] | undefined;
  devServerModuleCacheVersion?: string | undefined;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<RouteLoaderModule> {
  const moduleCacheVersion =
    options.serverModuleCacheVersion ?? options.devServerModuleCacheVersion;
  const cacheKey =
    moduleCacheVersion === undefined
      ? undefined
      : `${options.serverModuleCacheVersion === undefined ? "dev" : "build"}\0${options.appDir}\0${options.filename}\0${moduleCacheVersion}\0${memoizedHashText(options.code)}\0${importPolicyCacheKey(options.importPolicy)}\0${viteDefineCacheKey(options.define)}\0${vitePluginsCacheKey(options.vitePlugins)}`;

  if (cacheKey !== undefined) {
    const cached = readRouterRuntimeCacheEntry(
      routeLoaderModuleCache,
      cacheKey,
      routeLoaderModuleCacheCounters,
    );

    if (cached !== undefined) {
      return cached;
    }
  }

  const loaded = loadBundledRouteLoaderModule({
    ...options,
    prebuiltArtifact: prebuiltRouteLoaderModuleArtifact(
      options.serverModules,
      options.filename,
      options.code,
    ),
  }).catch((error) => {
    if (cacheKey !== undefined) {
      routeLoaderModuleCache.delete(cacheKey);
    }
    throw error;
  });

  if (cacheKey !== undefined) {
    setBoundedCacheEntry(
      routeLoaderModuleCache,
      cacheKey,
      loaded,
      maxRouteLoaderModuleCacheEntries,
      routeLoaderModuleCacheCounters,
    );
  }

  return loaded;
}

export async function bundleRouteLoaderModuleCode(options: {
  appDir: string;
  code: string;
  define?: UserConfig["define"] | undefined;
  externalizeAppSourceModuleDirs?: readonly string[] | undefined;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  const output = await bundleRouterModule({
    code: stripRouteLoaderOnlyExports(options.code, options.filename),
    define: options.define,
    externalizeAppSourceModuleDirs: options.externalizeAppSourceModuleDirs,
    filename: options.filename,
    platform: "node",
    vitePlugins: options.vitePlugins,
    plugins: [
      fileImportMetaUrlPlugin(),
      createAppRouterImportPolicyPlugin({
        appDir: options.appDir,
        importPolicy: options.importPolicy,
        label: "Loader",
      }),
    ],
  });
  const code = output.code;

  if (code === undefined) {
    throw new Error(`Failed to compile loader for ${options.filename}.`);
  }

  return code;
}

async function loadBundledRouteLoaderModule(options: {
  appDir: string;
  code: string;
  define?: UserConfig["define"] | undefined;
  devServerModuleCacheVersion?: string | undefined;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  prebuiltArtifact?: BuiltServerModuleOutputLike | undefined;
  serverModuleCacheVersion?: string | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<RouteLoaderModule> {
  if (options.prebuiltArtifact?.moduleFile !== undefined) {
    return await importBuiltServerModuleFile<RouteLoaderModule>({
      file: options.prebuiltArtifact.moduleFile,
      label: `loader:${options.filename}`,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
    });
  }

  const code =
    options.prebuiltArtifact?.code ??
    (await bundleRouteLoaderModuleCode({
      appDir: options.appDir,
      code: options.code,
      externalizeAppSourceModuleDirs:
        options.serverModuleCacheVersion === undefined
          ? devExternalSourceDirs(options.appDir, options.importPolicy)
          : undefined,
      filename: options.filename,
      importPolicy: options.importPolicy,
      define: options.define,
      vitePlugins: options.vitePlugins,
    }));

  return await importAppRouterSourceModule<RouteLoaderModule>({
    ...((options.serverModuleCacheVersion ?? options.devServerModuleCacheVersion) === undefined
      ? {}
      : {
          cacheKey: `loader:${options.serverModuleCacheVersion === undefined ? "dev" : "build"}:${options.filename}:${options.serverModuleCacheVersion ?? options.devServerModuleCacheVersion}:${memoizedHashText(code)}:${viteDefineCacheKey(options.define)}:${vitePluginsCacheKey(options.vitePlugins)}`,
        }),
    code,
    define: options.define,
    label: `loader:${options.filename}`,
  });
}

async function loadRouteMetadata(options: {
  appDir: string;
  code: string;
  context: RouteMetadataContext;
  define?: UserConfig["define"] | undefined;
  devServerModuleCacheVersion?: string | undefined;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<RouteMetadata | undefined> {
  if (!hasMetadataExport(options.code)) {
    return undefined;
  }

  const prebuiltArtifact = prebuiltRequestModuleArtifact(
    options.serverModules,
    options.filename,
    options.code,
    "routeMetadata",
  );
  if (prebuiltArtifact?.moduleFile !== undefined) {
    const module = await importBuiltServerModuleFile<RouteMetadataModule>({
      file: prebuiltArtifact.moduleFile,
      label: `metadata:${options.filename}`,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
    });

    return await resolveRouteMetadataModule(module, options.context);
  }

  const module = await loadRouteMetadataModule(options, prebuiltArtifact);

  return await resolveRouteMetadataModule(module, options.context);
}

async function loadRouteMetadataModule(
  options: {
    appDir: string;
    code: string;
    define?: UserConfig["define"] | undefined;
    devServerModuleCacheVersion?: string | undefined;
    filename: string;
    serverModuleCacheVersion?: string | undefined;
    vitePlugins?: readonly PluginOption[] | undefined;
  },
  prebuiltArtifact: BuiltServerModuleArtifact["routeMetadata"] | undefined,
): Promise<RouteMetadataModule> {
  if (prebuiltArtifact?.moduleFile !== undefined) {
    return await importBuiltServerModuleFile<RouteMetadataModule>({
      file: prebuiltArtifact.moduleFile,
      label: `metadata:${options.filename}`,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
    });
  }

  const sourceHash = memoizedHashText(options.code);
  const moduleCacheVersion =
    options.serverModuleCacheVersion ?? options.devServerModuleCacheVersion;
  const moduleCacheKey =
    moduleCacheVersion === undefined
      ? undefined
      : `metadata-module:${options.serverModuleCacheVersion === undefined ? "dev" : "build"}:${options.filename}:${moduleCacheVersion}:${sourceHash}:${viteDefineCacheKey(options.define)}:${vitePluginsCacheKey(options.vitePlugins)}`;

  if (moduleCacheKey !== undefined) {
    const cached = readRouterRuntimeCacheEntry(
      routeMetadataModuleCache,
      moduleCacheKey,
      routeMetadataModuleCacheCounters,
    );
    if (cached !== undefined) {
      return await cached;
    }
  }

  const loaded = (async () => {
    const code = prebuiltArtifact?.code ?? (await bundleRouteMetadataModuleCode(options));

    return await importAppRouterSourceModule<RouteMetadataModule>({
      ...(moduleCacheVersion === undefined
        ? {}
        : {
            cacheKey: `metadata:${options.serverModuleCacheVersion === undefined ? "dev" : "build"}:${options.filename}:${moduleCacheVersion}:${memoizedHashText(code)}:${viteDefineCacheKey(options.define)}`,
          }),
      code,
      define: options.define,
      label: `metadata:${options.filename}`,
    });
  })();

  if (moduleCacheKey !== undefined) {
    setBoundedCacheEntry(
      routeMetadataModuleCache,
      moduleCacheKey,
      loaded,
      maxRouteMetadataModuleCacheEntries,
      routeMetadataModuleCacheCounters,
    );
  }

  try {
    return await loaded;
  } catch (error) {
    if (moduleCacheKey !== undefined) {
      routeMetadataModuleCache.delete(moduleCacheKey);
    }
    throw error;
  }
}

async function resolveRouteMetadataModule(
  module: RouteMetadataModule,
  context: RouteMetadataContext,
): Promise<RouteMetadata | undefined> {
  const staticMetadata = validateRouteMetadata(module.metadata);

  if (module.generateMetadata === undefined) {
    return staticMetadata;
  }

  let generated: RouteMetadata | undefined;
  try {
    generated = await module.generateMetadata(context);
  } catch (error) {
    if (staticMetadata !== undefined) {
      return staticMetadata;
    }

    throw error;
  }

  const validatedGenerated = validateRouteMetadata(generated, "generateMetadata");
  const merged =
    validatedGenerated === undefined
      ? staticMetadata
      : mergeRouteMetadata([staticMetadata, validatedGenerated].filter(isRouteMetadata));

  return validateRouteMetadata(merged);
}

function isRouteMetadata(value: RouteMetadata | undefined): value is RouteMetadata {
  return value !== undefined;
}

async function bundleRouteMetadataModuleCode(options: {
  appDir: string;
  code: string;
  define?: UserConfig["define"] | undefined;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<string> {
  const output = await bundleRouterModule({
    code: stripRouteMetadataOnlyExports(options.code, options.filename),
    define: options.define,
    filename: options.filename,
    platform: "node",
    vitePlugins: options.vitePlugins,
    plugins: [
      fileImportMetaUrlPlugin(),
      createAppRouterImportPolicyPlugin({
        appDir: options.appDir,
        importPolicy: options.importPolicy,
        label: "Metadata",
      }),
    ],
  });
  const code = output.code;

  if (code === undefined) {
    throw new Error(`Failed to compile metadata for ${options.filename}.`);
  }

  return code;
}

async function loadComposedRouteMetadata(options: {
  appDir: string;
  code: string;
  context: RouteMetadataContext;
  define?: UserConfig["define"] | undefined;
  devServerModuleCacheVersion?: string | undefined;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  routes: readonly AppRoute[];
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<RouteMetadata | undefined> {
  const cacheKey = composedRouteMetadataCacheKey(options);
  if (cacheKey !== undefined) {
    const cached = readRouterRuntimeCacheEntry(
      composedRouteMetadataCache,
      cacheKey,
      composedRouteMetadataCacheCounters,
    );
    if (cached !== undefined) {
      const entry = await cached;
      return applyFileConventionMetadataTemplate(
        entry.metadata,
        entry.template,
        options.context.params,
      );
    }
  }

  try {
    const loaded = await loadComposedRouteMetadataUncached(options);
    if (cacheKey !== undefined && !loaded.dynamic) {
      setBoundedCacheEntry(
        composedRouteMetadataCache,
        cacheKey,
        Promise.resolve({ metadata: loaded.metadata, template: loaded.template }),
        maxComposedRouteMetadataCacheEntries,
        composedRouteMetadataCacheCounters,
      );
    }

    return applyFileConventionMetadataTemplate(
      loaded.metadata,
      loaded.template,
      options.context.params,
    );
  } catch (error) {
    if (cacheKey !== undefined) {
      composedRouteMetadataCache.delete(cacheKey);
    }
    throw error;
  }
}

function composedRouteMetadataCacheKey(options: {
  appDir: string;
  code: string;
  define?: UserConfig["define"] | undefined;
  devServerModuleCacheVersion?: string | undefined;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  serverModuleCacheVersion?: string | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): string | undefined {
  const moduleCacheVersion =
    options.serverModuleCacheVersion ?? options.devServerModuleCacheVersion;

  return moduleCacheVersion === undefined
    ? undefined
    : `${options.appDir}\0${options.filename}\0${options.serverModuleCacheVersion === undefined ? "dev" : "build"}\0${moduleCacheVersion}\0${memoizedHashText(options.code)}\0${importPolicyCacheKey(options.importPolicy)}\0${viteDefineCacheKey(options.define)}\0${vitePluginsCacheKey(options.vitePlugins)}`;
}

export const __composedRouteMetadataCacheKeyForTesting = composedRouteMetadataCacheKey;

async function loadComposedRouteMetadataUncached(options: {
  appDir: string;
  code: string;
  context: RouteMetadataContext;
  define?: UserConfig["define"] | undefined;
  devServerModuleCacheVersion?: string | undefined;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  routes: readonly AppRoute[];
  serverModules?: ReadonlyMap<string, BuiltServerModuleArtifact> | undefined;
  serverModuleCacheVersion?: string | undefined;
  serverSourceFiles?: ReadonlyMap<string, string> | undefined;
  vitePlugins?: readonly PluginOption[] | undefined;
}): Promise<{
  dynamic: boolean;
  metadata: RouteMetadata | undefined;
  template: FileConventionMetadataTemplate;
}> {
  const layoutFiles = await shellFilesForPage(
    options.appDir,
    options.filename,
    options.serverModuleCacheVersion,
  );
  const metadata: RouteMetadata[] = [];
  let dynamic = hasGenerateMetadataExport(options.code);
  const layoutMetadataTasks = layoutFiles.map(async (shell) => {
    if (shell.kind !== "layout") {
      return { code: undefined, metadata: undefined };
    }

    const code = await readServerSourceFile(
      shell.file,
      options.serverModuleCacheVersion,
      options.serverSourceFiles,
    );
    const shellMetadata = await loadRouteMetadata({
      appDir: options.appDir,
      code,
      context: options.context,
      filename: shell.file,
      importPolicy: options.importPolicy,
      serverModules: options.serverModules,
      serverModuleCacheVersion: options.serverModuleCacheVersion,
      devServerModuleCacheVersion: options.devServerModuleCacheVersion,
      define: options.define,
      vitePlugins: options.vitePlugins,
    });

    return { code, metadata: shellMetadata };
  });
  const pageMetadataTask = loadRouteMetadata({
    appDir: options.appDir,
    code: options.code,
    context: options.context,
    filename: options.filename,
    importPolicy: options.importPolicy,
    serverModules: options.serverModules,
    serverModuleCacheVersion: options.serverModuleCacheVersion,
    devServerModuleCacheVersion: options.devServerModuleCacheVersion,
    define: options.define,
    vitePlugins: options.vitePlugins,
  });

  for (const task of layoutMetadataTasks) {
    const shell = await task;
    if (shell.code !== undefined) {
      dynamic ||= hasGenerateMetadataExport(shell.code);
    }
    if (shell.metadata !== undefined) {
      metadata.push(shell.metadata);
    }
  }

  const pageMetadata = await pageMetadataTask;
  if (pageMetadata !== undefined) {
    metadata.push(pageMetadata);
  }

  return {
    dynamic,
    metadata: mergeRouteMetadata(metadata),
    template: fileConventionMetadataTemplate(options.routes, options.filename),
  };
}

function hasMetadataExport(code: string): boolean {
  return /\bexport\s+const\s+metadata\s*=/.test(code) || hasGenerateMetadataExport(code);
}

function hasGenerateMetadataExport(code: string): boolean {
  return (
    /\bexport\s+(?:async\s+)?function\s+generateMetadata\b/.test(code) ||
    /\bexport\s*\{[^}]*\bgenerateMetadata\b[^}]*\}/.test(code)
  );
}

function usesRuntimeCacheControl(code: string): boolean {
  return /\bcacheControl\s*\(/.test(code);
}

function warnIfCspNonceWouldBlockInlineTags(options: {
  html: string;
  logger: AppRouterLogger | undefined;
  metadata: RouteMetadata | undefined;
  request: Request;
  serverModuleCacheVersion: string | undefined;
}): void {
  if (
    options.serverModuleCacheVersion !== undefined ||
    process.env.NODE_ENV === "production" ||
    options.metadata?.csp?.disable === true ||
    options.metadata?.csp?.directives === undefined ||
    !/<(?:script|style)\b/i.test(options.html)
  ) {
    return;
  }

  const scriptNonces = cspDirectiveNonces(options.metadata.csp, "script-src");
  const styleNonces = cspDirectiveNonces(options.metadata.csp, "style-src");

  if (scriptNonces.size === 0 && styleNonces.size === 0) {
    return;
  }

  for (const tag of inlineCspTags(options.html)) {
    if (tag.name === "script") {
      if (
        scriptNonces.size > 0 &&
        !scriptHasExternalSourceOrInertType(tag.attributes) &&
        tag.content.trim() !== "" &&
        !tagHasMatchingNonce(tag.attributes, scriptNonces)
      ) {
        warnCspInlineNonceMismatch(options, "script-src", "script");
      }
      continue;
    }

    if (
      styleNonces.size > 0 &&
      tag.content.trim() !== "" &&
      !tagHasMatchingNonce(tag.attributes, styleNonces)
    ) {
      warnCspInlineNonceMismatch(options, "style-src", "style");
    }
  }
}

function warnCspInlineNonceMismatch(
  options: {
    logger: AppRouterLogger | undefined;
    request: Request;
  },
  directive: "script-src" | "style-src",
  tag: "script" | "style",
): void {
  const message =
    tag === "script"
      ? "mreact router: CSP script-src uses a nonce, but an inline <script> without a matching nonce will be blocked. Add the script through metadata.head with nonce: true, move it to an external script, or remove script-src for this route."
      : "mreact router: CSP style-src uses a nonce, but an inline <style> without a matching nonce will be blocked. Add the style through metadata.head with nonce: true, move it to an external stylesheet, or remove style-src for this route.";

  if (options.logger === undefined) {
    console.warn(message);
    return;
  }

  emitRouterLog(options.logger, "warn", {
    directive,
    path: new URL(options.request.url).pathname,
    tag,
    type: "router:csp:inline-nonce-warning",
  });
}

function cspDirectiveNonces(
  csp: NonNullable<RouteMetadata["csp"]>,
  directive: "script-src" | "style-src",
): ReadonlySet<string> {
  const values = csp.directives?.[directive];
  const nonces = new Set<string>();

  if (values !== undefined && csp.nonce !== undefined) {
    nonces.add(csp.nonce);
  }

  for (const value of Array.isArray(values) ? values : values === undefined ? [] : [values]) {
    const match = /^'nonce-([^']+)'$/.exec(value);

    if (match?.[1] !== undefined) {
      nonces.add(match[1]);
    }
  }

  return nonces;
}

interface InlineCspTag {
  attributes: ReadonlyMap<string, string>;
  content: string;
  name: "script" | "style";
}

function inlineCspTags(html: string): InlineCspTag[] {
  const tags: InlineCspTag[] = [];
  const lowerHtml = html.toLowerCase();
  let position = 0;

  while (position < html.length) {
    const scriptIndex = lowerHtml.indexOf("<script", position);
    const styleIndex = lowerHtml.indexOf("<style", position);
    const openerIndex =
      scriptIndex === -1
        ? styleIndex
        : styleIndex === -1
          ? scriptIndex
          : Math.min(scriptIndex, styleIndex);

    if (openerIndex === -1) {
      break;
    }

    const name = lowerHtml.startsWith("<script", openerIndex) ? "script" : "style";
    const tagEnd = html.indexOf(">", openerIndex + 1);
    if (tagEnd === -1) {
      break;
    }

    const closeToken = `</${name}>`;
    const closeIndex = lowerHtml.indexOf(closeToken, tagEnd + 1);
    const nextScriptIndex = lowerHtml.indexOf("<script", tagEnd + 1);
    const nextStyleIndex = lowerHtml.indexOf("<style", tagEnd + 1);
    const nextOpenerIndex =
      nextScriptIndex === -1
        ? nextStyleIndex
        : nextStyleIndex === -1
          ? nextScriptIndex
          : Math.min(nextScriptIndex, nextStyleIndex);

    if (closeIndex === -1 || (nextOpenerIndex !== -1 && nextOpenerIndex < closeIndex)) {
      position = tagEnd + 1;
      continue;
    }

    tags.push({
      attributes: parseTagAttributes(html.slice(openerIndex + name.length + 1, tagEnd)),
      content: html.slice(tagEnd + 1, closeIndex),
      name,
    });

    position = closeIndex + closeToken.length;
  }

  return tags;
}

export const __inlineCspTagsForTesting = inlineCspTags;

function parseTagAttributes(source: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const name = match[1]?.toLowerCase();

    if (name === undefined) {
      continue;
    }

    attributes.set(name, match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attributes;
}

function scriptHasExternalSourceOrInertType(attributes: ReadonlyMap<string, string>): boolean {
  if (attributes.has("src")) {
    return true;
  }

  const type = attributes.get("type")?.trim().toLowerCase();

  return type === "application/json" || type === "application/ld+json";
}

function tagHasMatchingNonce(
  attributes: ReadonlyMap<string, string>,
  expectedNonces: ReadonlySet<string>,
): boolean {
  const nonce = attributes.get("nonce");

  return nonce !== undefined && expectedNonces.has(nonce);
}

function injectQueryState(html: string, state: DehydratedQueryClient): string {
  if (state.queries.length === 0) {
    return html;
  }

  const script = `<script type="application/json" id="${__MREACT_QUERY_STATE_SCRIPT_ID}">${escapeJsonForHtml(
    JSON.stringify(state),
  )}</script>`;

  return /<\/body>/i.test(html) ? replaceFinalBodyCloseTag(html, script) : `${html}${script}`;
}

function injectAuthSessionClaims(html: string, claims: unknown): string {
  if (claims === undefined) {
    return html;
  }

  const script = `<script type="application/json" id="${authSessionScriptId}">${escapeJsonForHtml(
    JSON.stringify(claims),
  )}</script>`;

  return /<\/body>/i.test(html) ? replaceFinalBodyCloseTag(html, script) : `${html}${script}`;
}

function replaceFinalBodyCloseTag(html: string, insertion: string): string {
  const matches = [...html.matchAll(/<\/body>/gi)];
  const last = matches.at(-1);

  if (last?.index === undefined) {
    return `${html}${insertion}`;
  }

  return `${html.slice(0, last.index)}${insertion}${html.slice(last.index)}`;
}

function authIncludesClaims(code: string): boolean {
  return /\bexport\s+const\s+auth\s*=\s*["']include-claims["']\s*;?/.test(code);
}

function currentAuthClaims(): unknown {
  return authRequestStorage().getStore()?.claims;
}

function authRequestStorage(): AsyncLocalStorage<AuthRuntimeRequestState> {
  const global = globalThis as typeof globalThis & {
    [authRuntimeStateKey]?: AuthRuntimeState | undefined;
  };
  global[authRuntimeStateKey] ??= {};
  global[authRuntimeStateKey].storage ??= new AsyncLocalStorage<AuthRuntimeRequestState>();
  return global[authRuntimeStateKey].storage;
}

function escapeJsonForHtml(value: string): string {
  return value
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function readServerSourceFile(
  file: string,
  serverModuleCacheVersion: string | undefined,
  serverSourceFiles: ReadonlyMap<string, string> | undefined,
): Promise<string> {
  const manifestSource = serverSourceFiles?.get(file);

  if (manifestSource !== undefined) {
    return Promise.resolve(manifestSource);
  }

  if (serverModuleCacheVersion === undefined) {
    return readDevServerSourceFile(file);
  }

  const key = `${serverModuleCacheVersion}:${file}`;
  const cached = readRouterRuntimeCacheEntry(
    serverSourceFileCache,
    key,
    serverSourceFileCacheCounters,
  );

  if (cached !== undefined) {
    return cached;
  }

  const loaded = readFile(file, "utf8").catch((error) => {
    serverSourceFileCache.delete(key);
    throw error;
  });
  setBoundedCacheEntry(
    serverSourceFileCache,
    key,
    loaded,
    maxServerSourceFileCacheEntries,
    serverSourceFileCacheCounters,
  );

  return loaded;
}

async function readDevServerSourceFile(file: string): Promise<string> {
  const stats = await fileStat(file);
  const cached = devServerSourceFileCache.get(file);
  if (cached !== undefined && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
    return cached.source;
  }

  const source = await readFile(file, "utf8");
  if (devServerSourceFileCache.size >= MAX_DEV_SERVER_SOURCE_FILE_CACHE_ENTRIES) {
    const oldestKey = devServerSourceFileCache.keys().next().value;
    if (oldestKey !== undefined) {
      devServerSourceFileCache.delete(oldestKey);
    }
  }
  devServerSourceFileCache.set(file, { ...stats, source });
  return source;
}

function setBoundedCacheEntry<K, V>(
  cache: Map<K, V>,
  key: K,
  value: V,
  maxEntries: number,
  counters?: RouterRuntimeCacheCounters,
): void {
  if (cache.size >= maxEntries) {
    const oldestKey = cache.keys().next().value as K | undefined;

    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
      if (counters !== undefined) {
        counters.evictions += 1;
      }
    }
  }

  cache.set(key, value);
}
