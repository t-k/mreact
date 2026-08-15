import type { Server } from "node:http";
import type { DehydrateOptions } from "@reckona/mreact-query";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BuiltPrerenderedRoute } from "./build.js";
import type { AppRouterCache } from "./cache.js";
import {
  builtClientAssetPathname,
  clearBuiltPublicAssetCacheForTest,
  getBuiltPublicAssetCacheSizeForTest,
  readBuiltClientAsset,
  readBuiltPublicAsset,
} from "./built-assets.js";
import {
  materializeBuiltRuntime,
  mergeBuiltRuntimeImportPolicy,
  readBuiltImportPolicyText,
  type BuiltRuntime,
} from "./built-runtime.js";
import {
  allBuiltServerModuleFiles,
  loadBuiltResponseHookArtifacts,
  loadBuiltServerModuleArtifacts,
  loadBuiltServerModuleArtifactsForRequest,
} from "./built-server-module-artifacts.js";
import {
  type AppRoute,
  type MatchedRoute,
} from "./routes.js";
import type { AppRouterServerActionOptions } from "./actions.js";
import type { AppRouterImportPolicy } from "./import-policy.js";
import {
  preloadBuiltRequestModules,
  renderAppRequest,
  resolveAppRouterResponseHook,
  resolveAppRouterMiddleware,
  type AppRouterServerRenderArtifactLoader,
  type AppRouterRenderPreload,
  type AppRouterResponseHook,
  type RenderAppRequestRuntimeOptions,
} from "./render.js";
import {
  invokeRouterInstrumentation,
  traceContextFromRequest,
  type RouterInstrumentation,
} from "./trace.js";
import {
  bytesResponse,
  htmlResponse,
} from "./http.js";
import {
  emitRouterLog,
  logDurationMs,
  logNow,
  type AppRouterLogger,
} from "./logger.js";
import { startNodeRequestServer } from "./node-server.js";
import { builtAppRuntimePreloadPlan } from "./preload-policy.js";
import { normalizeRoutePath } from "./route-path.js";
import type { HttpUpgradeHandler } from "./upgrade.js";
import {
  isCurrentPrerenderedRoute,
  isVisitorDependentResponse,
  mergePrerenderedNavigationHtml,
  PRERENDERED_ROUTE_SCHEMA_VERSION,
  replayedPrerenderedRouteHeaders,
  storedPrerenderedRouteHeaders,
  validatedPrerenderedNavigationHtml,
} from "./prerender-entry.js";

interface BuiltRuntimeCacheEntry {
  clientManifestText: string;
  importPolicyText: string | undefined;
  runtime: Promise<BuiltRuntime>;
  serverManifestText: string;
}

const builtRuntimeCache = new Map<string, BuiltRuntimeCacheEntry>();
const builtRuntimeReadInflight = new Map<string, Promise<BuiltRuntime>>();
let builtRuntimeMaterializeCountForTest = 0;

/**
 * Strategy for the final response body shape sent to the HTTP layer.
 *
 * - `"string"` (default, cross-runtime): body is the raw HTML string. The
 *   underlying runtime encodes to UTF-8 bytes when writing to the socket.
 * - `"buffer"` (Node only): materialize the response body into a Buffer
 *   before returning. Skips the implicit encode at the Response → socket
 *   boundary and can let Node's HTTP layer write bytes directly.
 *
 * The buffer path forces full materialization of streaming responses
 * (loses TTFB streaming) — only opt in if the throughput gain outweighs
 * that on your workload.
 */
export type ResponseSinkStrategy = "string" | "buffer";
/**
 * Controls whether built request handling trusts the incoming Host header.
 */
export type RequestHostPolicy = "strict" | "trusted-proxy";

let warnedImplicitHostTrust = false;

/**
 * Configures rendering a request against a built app-router output directory.
 */
export interface RenderBuiltAppRequestOptions {
  dehydrateOptions?: DehydrateOptions | undefined;
  outDir: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  instrumentation?: RouterInstrumentation | undefined;
  logger?: AppRouterLogger | undefined;
  onResponse?: AppRouterResponseHook | undefined;
  prerenderStore?: AppRouterPrerenderStore | undefined;
  request: Request;
  routeCache?: AppRouterCache | undefined;
  runtimeDir?: string | undefined;
  immutableRuntime?: boolean | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
  sinkStrategy?: ResponseSinkStrategy;
  preload?: AppRouterRenderPreload | undefined;
}

export interface BuiltRequestRuntimeOptions {
  immutableRuntime?: boolean | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
  outDir: string;
  runtimeDir?: string | undefined;
}

export type BuiltRequestRuntimeRenderOptions = Omit<
  RenderBuiltAppRequestOptions,
  "immutableRuntime" | "outDir" | "request" | "runtimeDir"
>;

export interface BuiltRequestRuntime {
  preload(preload?: BuiltAppRuntimePreloadStrategy | undefined): Promise<void>;
  render(
    request: Request,
    options?: BuiltRequestRuntimeRenderOptions | undefined,
  ): Promise<Response>;
}

/**
 * Selects which built runtime modules should be preloaded.
 */
export type BuiltAppRuntimePreloadMode =
  | "all"
  | "hot-route-requests"
  | "hot-routes"
  | "middleware"
  | "none";

/**
 * Configures built app runtime preload scope and optional hot routes.
 */
export interface BuiltAppRuntimePreloadStrategy {
  mode: BuiltAppRuntimePreloadMode;
  routes?: readonly string[] | undefined;
}

/**
 * Configures the Node HTTP server used to serve a built app-router output.
 */
export interface StartServerOptions {
  dehydrateOptions?: DehydrateOptions | undefined;
  outDir: string;
  port: number;
  hostname?: string;
  // Optional hook for customizing the 500 response. The default returns
  // a generic "Internal Server Error" body and logs the stack to stderr
  // via console.error. Issue 071: stack traces must never end up in
  // production responses.
  errorHandler?: (error: unknown) => { body: string; status: number; headers?: Record<string, string> };
  // When set, an incoming Host header that does not exactly match one of
  // the listed values is replaced with the configured hostname/port for
  // origin reconstruction. Use this in front of public deployments to
  // block Host header injection (Issue 068). Undefined preserves the
  // legacy "trust Host" behavior for backward compatibility when
  // hostPolicy is not configured.
  allowedHosts?: readonly string[] | undefined;
  hostPolicy?: RequestHostPolicy | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
  instrumentation?: RouterInstrumentation | undefined;
  logger?: AppRouterLogger | undefined;
  onResponse?: AppRouterResponseHook | undefined;
  prerenderStore?: AppRouterPrerenderStore | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
  sinkStrategy?: ResponseSinkStrategy;
  onUpgrade?: HttpUpgradeHandler | undefined;
  /**
   * Trusts the first `X-Forwarded-Proto` value when the socket is not TLS.
   *
   * Defaults to `false`. Enable only behind a proxy that overwrites the header
   * and prevents untrusted clients from reaching the Node listener directly.
   */
  trustForwardedProto?: boolean | undefined;
}

export function resolveRequestHost(options: {
  allowedHosts?: readonly string[] | undefined;
  fallbackHost: string;
  hostPolicy?: RequestHostPolicy | undefined;
  rawHost: string | undefined;
}): string {
  const raw = options.rawHost;
  if (raw === undefined || raw === "") return options.fallbackHost;
  if (options.allowedHosts === undefined) {
    return options.hostPolicy === "strict" ? options.fallbackHost : raw;
  }
  return options.allowedHosts.includes(raw) ? raw : options.fallbackHost;
}

export function warnIfImplicitHostTrust(options: {
  allowedHosts?: readonly string[] | undefined;
  hostPolicy?: RequestHostPolicy | undefined;
}): void {
  if (
    process.env.NODE_ENV !== "production" ||
    options.allowedHosts !== undefined ||
    options.hostPolicy !== undefined ||
    warnedImplicitHostTrust
  ) {
    return;
  }

  warnedImplicitHostTrust = true;
  console.error(
    "[mreact] Host header trust is implicit because neither allowedHosts nor hostPolicy is configured. Set allowedHosts for public deployments, hostPolicy: \"strict\" to reject unlisted Host headers, or hostPolicy: \"trusted-proxy\" when a trusted reverse proxy normalizes Host.",
  );
}

/**
 * Defines storage for prerendered route responses used by built request rendering.
 */
export interface AppRouterPrerenderStore {
  delete(path: string): void | Promise<void>;
  get(path: string): BuiltPrerenderedRoute | undefined | Promise<BuiltPrerenderedRoute | undefined>;
  set(path: string, entry: BuiltPrerenderedRoute): void | Promise<void>;
  withLock?<T>(path: string, task: () => Promise<T>): Promise<T>;
}

export async function createBuiltRequestRuntime(
  options: BuiltRequestRuntimeOptions,
): Promise<BuiltRequestRuntime> {
  const runtime = await readBuiltRuntime({
    immutable: options.immutableRuntime,
    outDir: options.outDir,
    runtimeDir: options.runtimeDir,
  });
  const defaultImportPolicy = mergeBuiltRuntimeImportPolicy(runtime, options.importPolicy);

  return {
    preload(preload) {
      return preloadBuiltAppRuntimeWithRuntime({
        importPolicy: defaultImportPolicy,
        preload,
        runtime,
      });
    },
    async render(request, renderOptions = {}) {
      emitBuiltRequestStart(renderOptions.instrumentation, request);
      const response = await renderBuiltAppRequestWithRuntime({
        ...renderOptions,
        instrumentation: withoutBuiltRequestInstrumentation(renderOptions.instrumentation),
        importPolicy:
          renderOptions.importPolicy === undefined
            ? defaultImportPolicy
            : mergeBuiltRuntimeImportPolicy(runtime, renderOptions.importPolicy),
        outDir: options.outDir,
        request,
        runtime,
      });

      const finalResponse = await applyBuiltAppResponseHook(
        response,
        {
          onResponse: renderOptions.onResponse,
          request,
        },
        runtime,
      );
      emitBuiltRequestEnd(renderOptions.instrumentation, request, finalResponse.status);
      return finalResponse;
    },
  };
}

/**
 * Preloads selected modules from a built app-router runtime.
 */
export async function preloadBuiltAppRuntime(options: {
  importPolicy?: AppRouterImportPolicy | undefined;
  outDir: string;
  preload?: BuiltAppRuntimePreloadStrategy | undefined;
  runtimeDir?: string | undefined;
}): Promise<void> {
  const runtime = await readBuiltRuntime({
    outDir: options.outDir,
    runtimeDir: options.runtimeDir,
  });
  await preloadBuiltAppRuntimeWithRuntime({
    importPolicy: mergeBuiltRuntimeImportPolicy(runtime, options.importPolicy),
    preload: options.preload,
    runtime,
  });
}

async function preloadBuiltAppRuntimeWithRuntime(options: {
  importPolicy?: AppRouterImportPolicy | undefined;
  preload?: BuiltAppRuntimePreloadStrategy | undefined;
  runtime: BuiltRuntime;
}): Promise<void> {
  const plan = builtAppRuntimePreloadPlan(options.preload);

  if (!plan.shouldPreload) {
    return;
  }

  const routes = builtRuntimePreloadRoutes(options.runtime, plan);
  if (plan.loadAllArtifacts) {
    await loadBuiltServerModuleArtifacts(
      options.runtime,
      allBuiltServerModuleFiles(options.runtime),
      "all",
    );
  } else {
    await loadBuiltServerModuleArtifactsForRequest(
      options.runtime,
      undefined,
      plan.middlewareArtifacts,
    );
    for (const route of routes) {
      await loadBuiltServerModuleArtifactsForRequest(
        options.runtime,
        route.file,
        plan.routeArtifacts,
      );
    }
  }
  await preloadBuiltRequestModules({
    appDir: options.runtime.appDir,
    importPolicy: {
      ...options.importPolicy,
      allowedSourceDirs: options.runtime.allowedSourceDirs,
      projectRoot: options.runtime.projectRoot,
    },
    routes,
    serverModules: options.runtime.serverModules,
    serverModuleCacheVersion: options.runtime.serverModuleCacheVersion,
    serverSourceFiles: options.runtime.serverSourceFiles,
    serverActionReferencesByFile: options.runtime.serverActionReferencesByFile,
    includeRenderModules: plan.includeRenderModules,
  });
}

function builtRuntimePreloadRoutes(
  runtime: BuiltRuntime,
  strategy: BuiltAppRuntimePreloadStrategy,
): readonly AppRoute[] {
  if (strategy.mode === "all") {
    return runtime.routes;
  }

  if (strategy.mode === "middleware" || strategy.mode === "none") {
    return [];
  }

  const routes = strategy.routes ?? [];
  return routes.map((path) => {
    const route = runtime.routeMatcher.match(normalizeRoutePath(path))?.route;
    if (route === undefined) {
      throw new Error(`Unknown hot route preload path: ${path}`);
    }
    return route;
  });
}

/**
 * Renders a request using a built app-router output directory.
 */
export async function renderBuiltAppRequest(
  options: RenderBuiltAppRequestOptions,
): Promise<Response> {
  emitBuiltRequestStart(options.instrumentation, options.request);
  const runtime = await readBuiltRuntime({
    outDir: options.outDir,
    immutable: options.immutableRuntime,
    runtimeDir: options.runtimeDir,
  });
  const response = await renderBuiltAppRequestWithRuntime({
    ...options,
    instrumentation: withoutBuiltRequestInstrumentation(options.instrumentation),
    importPolicy: mergeBuiltRuntimeImportPolicy(runtime, options.importPolicy),
    runtime,
  });

  const finalResponse = await applyBuiltAppResponseHook(response, options, runtime);
  emitBuiltRequestEnd(options.instrumentation, options.request, finalResponse.status);
  return finalResponse;
}

function withoutBuiltRequestInstrumentation(
  instrumentation: RouterInstrumentation | undefined,
): RouterInstrumentation | undefined {
  if (instrumentation === undefined) {
    return undefined;
  }

  const { onRequestEnd: _onRequestEnd, onRequestStart: _onRequestStart, ...remaining } =
    instrumentation;
  return remaining;
}

function emitBuiltRequestStart(
  instrumentation: RouterInstrumentation | undefined,
  request: Request,
): void {
  const trace = traceContextFromRequest(request);
  invokeRouterInstrumentation(instrumentation?.onRequestStart, {
    method: request.method,
    path: new URL(request.url).pathname,
    request,
    ...(trace === undefined ? {} : { trace }),
  });
}

function emitBuiltRequestEnd(
  instrumentation: RouterInstrumentation | undefined,
  request: Request,
  status: number,
): void {
  const trace = traceContextFromRequest(request);
  invokeRouterInstrumentation(instrumentation?.onRequestEnd, {
    method: request.method,
    path: new URL(request.url).pathname,
    request,
    status,
    ...(trace === undefined ? {} : { trace }),
  });
}

async function renderBuiltAppRequestWithRuntime(
  options: RenderBuiltAppRequestOptions & { runtime: BuiltRuntime },
): Promise<Response> {
  const url = new URL(options.request.url);
  const timing = createBuiltRenderTiming(options.logger);

  const clientAssetPathname = builtClientAssetPathname(options.request, url);

  if (clientAssetPathname !== undefined) {
    return readBuiltClientAsset(
      options.outDir,
      clientAssetPathname,
      options.runtime.clientAssetPaths,
    );
  }

  if (options.request.method === "GET" || options.request.method === "HEAD") {
    const publicAsset = await readBuiltPublicAsset(options.outDir, url.pathname);

    if (publicAsset !== undefined) {
      return publicAsset;
    }
  }

  let request = options.request;
  let normalizedPath = normalizeRoutePath(url.pathname);
  let matched = options.runtime.routeMatcher.match(normalizedPath);

  // Prerendered HTML may only be served ahead of middleware when the app has
  // no middleware at all. Otherwise a middleware that gates access (auth,
  // geo blocking, maintenance mode) would be bypassed for exactly the routes
  // it is most often used to protect.
  if (
    !options.runtime.hasMiddleware &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    // Sync fast path when no external prerender store is configured (the
    // common case): skip the Promise wrap that `readPrerenderedRoute`
    // would otherwise introduce just to satisfy the async signature.
    const prerendered =
      options.prerenderStore === undefined
        ? options.runtime.prerenderedRoutes.get(normalizedPath)
        : await readPrerenderedRoute(
            options.runtime,
            normalizedPath,
            options.prerenderStore,
          );
    const prerenderedResponse = prerenderedRouteResponse(prerendered, request);

    if (prerenderedResponse !== undefined) {
      return prerenderedResponse;
    }
  }

  const middlewareStartedAt = builtRenderTimingPhaseStartedAt(timing);
  const middlewareResult = await resolveBuiltMiddleware({ ...options, timing }, request);
  finishBuiltRenderTimingPhase(timing, middlewareStartedAt, "middlewareMs");
  if (middlewareResult.type === "response") {
    emitBuiltRenderTiming(options, request, timing, middlewareResult.response.status);
    return middlewareResult.response;
  }
  if (middlewareResult.request !== request) {
    request = middlewareResult.request;
    normalizedPath = normalizeRoutePath(new URL(request.url).pathname);
    matched = options.runtime.routeMatcher.match(normalizedPath);
  }

  // Middleware apps resolve prerendered HTML here instead, so that a
  // middleware response or rewrite is honoured before the stored HTML is
  // served. The lookup uses the post-middleware path.
  if (
    options.runtime.hasMiddleware &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    const prerendered =
      options.prerenderStore === undefined
        ? options.runtime.prerenderedRoutes.get(normalizedPath)
        : await readPrerenderedRoute(
            options.runtime,
            normalizedPath,
            options.prerenderStore,
          );
    const prerenderedResponse = prerenderedRouteResponse(prerendered, request);

    if (prerenderedResponse !== undefined) {
      emitBuiltRenderTiming(options, request, timing, prerenderedResponse.status);
      return prerenderedResponse;
    }
  }

  if (request.method === "GET" && options.runtime.prerenderableRoutes.has(normalizedPath)) {
    await loadBuiltServerModuleArtifactsForRequest(options.runtime, matched?.route.file, {
      includeRender: false,
    });
    return renderAndCachePrerenderWithLock({ ...options, request }, normalizedPath);
  }

  await loadBuiltServerModuleArtifactsForRequest(options.runtime, matched?.route.file, {
    includeRender: false,
  });
  const response = await renderBuiltDynamicResponse({
    ...options,
    matchedRoute: matched,
    request,
    requestUrl: new URL(request.url),
  });

  await applyBuiltPrerenderInvalidations(
    options.runtime,
    response,
    options.prerenderStore,
  );

  return options.sinkStrategy === "buffer"
    ? await materializeResponseAsBuffer(response)
    : response;
}

function prerenderedRouteResponse(
  prerendered: BuiltPrerenderedRoute | undefined,
  request: Request,
): Response | undefined {
  if (!isCurrentPrerenderedRoute(prerendered)) {
    return undefined;
  }

  const navigation = request.headers.get("x-mreact-navigation") === "1";
  const html = navigation ? validatedPrerenderedNavigationHtml(prerendered) : prerendered.html;
  if (html === undefined) {
    return undefined;
  }

  if (request.method === "HEAD") {
    return new Response(null, {
      headers: replayedPrerenderedRouteHeaders(prerendered, request),
      status: prerendered.status,
    });
  }

  return htmlResponse(html, {
    headers: replayedPrerenderedRouteHeaders(prerendered, request),
    status: prerendered.status,
  });
}

async function resolveBuiltMiddleware(
  options: RenderBuiltAppRequestOptions & {
    runtime: BuiltRuntime;
    timing?: { phases: Record<string, number> } | undefined;
  },
  request: Request,
): Promise<{ request: Request; type: "continue" } | { response: Response; type: "response" }> {
  if (!options.runtime.hasMiddleware) {
    return { request, type: "continue" };
  }

  await loadBuiltServerModuleArtifactsForRequest(options.runtime, undefined);

  return resolveAppRouterMiddleware({
    appDir: options.runtime.appDir,
    importPolicy: {
      ...options.importPolicy,
      allowedSourceDirs: options.runtime.allowedSourceDirs,
      projectRoot: options.runtime.projectRoot,
    },
    instrumentation: options.instrumentation,
    request,
    serverModules: options.runtime.serverModules,
    serverModuleCacheVersion: options.runtime.serverModuleCacheVersion,
    serverSourceFiles: options.runtime.serverSourceFiles,
    timing: options.timing,
  });
}

function createBuiltRenderTiming(
  logger: AppRouterLogger | undefined,
): { phases: Record<string, number> } | undefined {
  return logger?.debug === undefined ? undefined : { phases: {} };
}

function builtRenderTimingPhaseStartedAt(
  timing: { phases: Record<string, number> } | undefined,
): number | undefined {
  return timing === undefined ? undefined : logNow();
}

function finishBuiltRenderTimingPhase(
  timing: { phases: Record<string, number> } | undefined,
  startedAt: number | undefined,
  phaseName: string,
): void {
  if (timing === undefined || startedAt === undefined) {
    return;
  }

  timing.phases[phaseName] = logDurationMs(startedAt);
}

function emitBuiltRenderTiming(
  options: RenderBuiltAppRequestOptions,
  request: Request,
  timing: { phases: Record<string, number> } | undefined,
  status: number,
): void {
  if (timing === undefined) {
    return;
  }

  emitRouterLog(options.logger, "debug", {
    method: request.method,
    path: new URL(request.url).pathname,
    phases: timing.phases,
    status,
    type: "router:render:timing",
  });
}

async function applyBuiltAppResponseHook(
  response: Response,
  options: Pick<RenderBuiltAppRequestOptions, "onResponse" | "request">,
  runtime: BuiltRuntime,
): Promise<Response> {
  await loadBuiltResponseHookArtifacts(runtime);
  const onResponse = await resolveAppRouterResponseHook({
    appDir: runtime.appDir,
    importPolicy: runtime.generatedImportPolicy,
    onResponse: options.onResponse,
    serverModules: runtime.serverModules,
    serverModuleCacheVersion: runtime.serverModuleCacheVersion,
    serverSourceFiles: runtime.serverSourceFiles,
  });
  const hooked = await onResponse?.(response, {
    request: options.request,
  });

  return hooked instanceof Response ? hooked : response;
}

async function materializeResponseAsBuffer(response: Response): Promise<Response> {
  if (response.body === null) {
    return response;
  }

  // Drains streaming responses into a single Buffer (loses TTFB streaming
  // by design — opt-in via sinkStrategy === "buffer"). Avoids the
  // string → UTF-8 encode the Response stream would otherwise do lazily
  // during the socket write. Tagged via `bytesResponse` so `sendResponse`
  // can take the raw-bytes fast path.
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytesResponse(bytes, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

/**
 * Starts a Node HTTP server for an already built app-router output directory.
 *
 * Use this for production-like local serving or custom Node deployments. It loads `.mreact/server` artifacts, applies the generated import policy when configured, enforces host trust options, and returns a `close()` method for orderly shutdown.
 */
export async function startServer(
  options: StartServerOptions,
): Promise<{ close(): Promise<void>; server: Server; url: string }> {
  warnIfImplicitHostTrust(options);
  const runtime = await createBuiltRequestRuntime({
    importPolicy: options.importPolicy,
    outDir: options.outDir,
  });

  return await startNodeRequestServer({
    allowedHosts: options.allowedHosts,
    errorHandler: options.errorHandler,
    hostname: options.hostname,
    hostPolicy: options.hostPolicy,
    logger: options.logger,
    onUpgrade: options.onUpgrade,
    port: options.port,
    resolveHost: resolveRequestHost,
    trustForwardedProto: options.trustForwardedProto,
    render: (request) =>
      runtime.render(request, {
        dehydrateOptions: options.dehydrateOptions,
        instrumentation: options.instrumentation,
        logger: options.logger,
        onResponse: options.onResponse,
        prerenderStore: options.prerenderStore,
        routeCache: options.routeCache,
        serverActions: options.serverActions,
        ...(options.sinkStrategy === undefined ? {} : { sinkStrategy: options.sinkStrategy }),
      }),
  });
}

export const __readBuiltPublicAssetForTest = readBuiltPublicAsset;

export function __clearBuiltRuntimeCacheForTest(): void {
  builtRuntimeCache.clear();
  builtRuntimeReadInflight.clear();
  builtRuntimeMaterializeCountForTest = 0;
}

export function __getBuiltRuntimeMaterializeCountForTest(): number {
  return builtRuntimeMaterializeCountForTest;
}

export function __clearBuiltPublicAssetCacheForTest(): void {
  clearBuiltPublicAssetCacheForTest();
}

export function __getBuiltPublicAssetCacheSizeForTest(): number {
  return getBuiltPublicAssetCacheSizeForTest();
}

async function readBuiltRuntime(options: {
  immutable?: boolean | undefined;
  outDir: string;
  runtimeDir?: string | undefined;
}): Promise<BuiltRuntime> {
  const outDir = options.outDir;
  const runtimeDir = options.runtimeDir ?? join(outDir, "server", "runtime");
  const cacheKey = `${outDir}\0${runtimeDir}`;
  const cached = builtRuntimeCache.get(cacheKey);

  if (options.immutable === true && cached !== undefined) {
    return cached.runtime;
  }

  if (cached === undefined) {
    const inflight = builtRuntimeReadInflight.get(cacheKey);
    if (inflight !== undefined) {
      return inflight;
    }

    const runtime = readBuiltRuntimeUncached({
      cacheKey,
      cached,
      outDir,
      runtimeDir,
    });
    builtRuntimeReadInflight.set(cacheKey, runtime);
    void runtime
      .finally(() => {
        if (builtRuntimeReadInflight.get(cacheKey) === runtime) {
          builtRuntimeReadInflight.delete(cacheKey);
        }
      })
      .catch(() => {});
    return runtime;
  }

  return readBuiltRuntimeUncached({
    cacheKey,
    cached,
    outDir,
    runtimeDir,
  });
}

async function readBuiltRuntimeUncached(options: {
  cached: BuiltRuntimeCacheEntry | undefined;
  cacheKey: string;
  outDir: string;
  runtimeDir: string;
}): Promise<BuiltRuntime> {
  const { cacheKey, cached, outDir, runtimeDir } = options;
  const serverManifestPath = join(outDir, "server", "manifest.json");
  const clientManifestPath = join(outDir, "client", "manifest.json");
  const importPolicyPath = join(outDir, "server", "import-policy.json");
  const [serverManifestText, clientManifestText, importPolicyText] = await Promise.all([
    readRequiredBuiltArtifactText(serverManifestPath, "built app server manifest"),
    readRequiredBuiltArtifactText(clientManifestPath, "built app client manifest"),
    readBuiltImportPolicyText(outDir),
  ]);

  if (
    cached !== undefined &&
    cached.serverManifestText === serverManifestText &&
    cached.clientManifestText === clientManifestText &&
    cached.importPolicyText === importPolicyText
  ) {
    return cached.runtime;
  }

  const runtime = materializeBuiltRuntime({
    clientManifestText,
    clientManifestPath,
    importPolicyText,
    importPolicyPath,
    onMaterialize() {
      builtRuntimeMaterializeCountForTest += 1;
    },
    outDir,
    runtimeDir,
    serverManifestText,
    serverManifestPath,
  });

  builtRuntimeCache.set(cacheKey, {
    clientManifestText,
    importPolicyText,
    runtime,
    serverManifestText,
  });
  runtime.catch(() => {
    if (builtRuntimeCache.get(cacheKey)?.runtime === runtime) {
      builtRuntimeCache.delete(cacheKey);
    }
  });

  return runtime;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function readRequiredBuiltArtifactText(labelPath: string, label: string): Promise<string> {
  try {
    return await readFile(labelPath, "utf8");
  } catch (error) {
    throw builtArtifactReadError(label, labelPath, error);
  }
}

function builtArtifactReadError(label: string, artifactPath: string, error: unknown): Error {
  const prefix = isMissingFileError(error) ? "Missing" : "Unable to read";
  const detail = error instanceof Error && error.message !== "" ? `: ${error.message}` : "";

  return new Error(`${prefix} ${label}: ${artifactPath}${detail}`, { cause: error });
}

async function readPrerenderedRoute(
  runtime: BuiltRuntime,
  path: string,
  store: AppRouterPrerenderStore | undefined,
): Promise<BuiltPrerenderedRoute | undefined> {
  const stored = await store?.get(path);

  if (stored !== undefined) {
    if (isCurrentPrerenderedRoute(stored)) {
      runtime.prerenderedRoutes.set(path, stored);
      return stored;
    }

    await store?.delete(path);
  }

  const manifestEntry = runtime.prerenderedRoutes.get(path);

  if (!isCurrentPrerenderedRoute(manifestEntry)) {
    runtime.prerenderedRoutes.delete(path);
    return undefined;
  }

  if (store !== undefined) {
    await store.set(path, manifestEntry);
  }

  return manifestEntry;
}

function renderBuiltDynamicResponse(
  options: RenderBuiltAppRequestOptions & {
    matchedRoute?: MatchedRoute | undefined;
    renderSignals?: { headerDependent: () => boolean } | undefined;
    requestUrl?: URL | undefined;
    runtime: BuiltRuntime;
  },
): Promise<Response> {
  return renderAppRequest({
    ...builtRenderAppRequestOptions(options),
    ...(options.renderSignals === undefined ? {} : { renderSignals: options.renderSignals }),
  });
}

function builtRenderAppRequestOptions(
  options: RenderBuiltAppRequestOptions & {
    matchedRoute?: MatchedRoute | undefined;
    requestUrl?: URL | undefined;
    runtime: BuiltRuntime;
  },
): RenderAppRequestRuntimeOptions {
  const serverRenderArtifactLoader: AppRouterServerRenderArtifactLoader = {
    async load(routeFile: string) {
      await loadBuiltServerModuleArtifactsForRequest(options.runtime, routeFile, {
        includeRender: true,
      });
    },
  };
  const renderOptions: RenderAppRequestRuntimeOptions = {
    appDir: options.runtime.appDir,
    assetBaseUrl: options.runtime.assetBaseUrl,
    clientScripts: options.runtime.clientScripts,
    clientStylesByFile: options.runtime.clientStylesByFile,
    clientStyles: options.runtime.clientStyles,
    dehydrateOptions: options.dehydrateOptions,
    importPolicy: {
      ...options.importPolicy,
      allowedSourceDirs: options.runtime.allowedSourceDirs,
      projectRoot: options.runtime.projectRoot,
    },
    request: options.request,
    instrumentation: options.instrumentation,
    logger: options.logger,
    matchedRoute: options.matchedRoute,
    navigationScripts: options.runtime.navigationScripts,
    routeCache: options.routeCache,
    routeMatcher: options.runtime.routeMatcher,
    requestUrl: options.requestUrl,
    routes: options.runtime.routes,
    serverRenderArtifactLoader,
    serverModules: options.runtime.serverModules,
    serverModuleCacheVersion: options.runtime.serverModuleCacheVersion,
    serverSourceFiles: options.runtime.serverSourceFiles,
    serverActionReferencesByFile: options.runtime.serverActionReferencesByFile,
    serverActions: mergeBuiltServerActionOptions(
      options.serverActions,
      options.runtime.serverActionManifest,
    ),
    skipMiddleware: true,
    onResponse: () => undefined,
    ...(options.preload === undefined ? {} : { preload: options.preload }),
  };

  return renderOptions;
}

function mergeBuiltServerActionOptions(
  options: AppRouterServerActionOptions | undefined,
  allowedActions: readonly { moduleId: string; exportName: string; inferred?: boolean }[] | undefined,
): AppRouterServerActionOptions | undefined {
  if (allowedActions === undefined) {
    return options;
  }

  return {
    ...options,
    allowedActions,
  };
}

async function renderAndCachePrerenderWithLock(
  options: RenderBuiltAppRequestOptions & { runtime: BuiltRuntime },
  path: string,
): Promise<Response> {
  const lockKey =
    options.request.headers.get("x-mreact-navigation") === "1"
      ? `${path}\0navigation`
      : path;
  const existing = options.runtime.prerenderLocks.get(lockKey);

  if (existing !== undefined) {
    const result = await existing;
    if (result.shareable) {
      return cloneResponse(result.response);
    }

    return (await runPrerenderRegeneration(options, path)).response;
  }

  const task = runPrerenderRegeneration(options, path);
  options.runtime.prerenderLocks.set(lockKey, task);

  try {
    return cloneResponse((await task).response);
  } finally {
    options.runtime.prerenderLocks.delete(lockKey);
  }
}

async function runPrerenderRegeneration(
  options: RenderBuiltAppRequestOptions & { runtime: BuiltRuntime },
  path: string,
): Promise<{ response: Response; shareable: boolean }> {
  const lockKey =
    options.request.headers.get("x-mreact-navigation") === "1"
      ? `${path}\0navigation`
      : path;
  const regenerate = async () => {
    const stored = await readPrerenderedRoute(options.runtime, path, options.prerenderStore);
    const storedResponse = prerenderedRouteResponse(stored, options.request);

    if (storedResponse !== undefined) {
      return {
        response: storedResponse,
        shareable: true,
      };
    }

    // A prerendered entry is replayed to every visitor by path alone, so a
    // render that depended on this visitor's request headers must not become
    // one; it is returned to the caller without being stored. The signal starts
    // closed so that a render which never reports back is not stored either.
    const renderSignals = {
      headerDependent: () => true,
      strictTransportSecurity: () => undefined as string | undefined,
    };
    const response = await renderBuiltDynamicResponse({ ...options, renderSignals });

    if (!response.ok) {
      return { response, shareable: false };
    }

    // Draining the body finishes a streamed render, so the signal is only
    // final once the whole response has been read.
    const body = await response.text();

    if (renderSignals.headerDependent() || isVisitorDependentResponse(response)) {
      return {
        response: htmlResponse(body, {
          headers: response.headers,
          status: response.status,
        }),
        shareable: false,
      };
    }

    const navigation = options.request.headers.get("x-mreact-navigation") === "1";
    if (navigation && stored === undefined) {
      return {
        response: htmlResponse(body, {
          headers: response.headers,
          status: response.status,
        }),
        shareable: false,
      };
    }

    return {
      response: await cacheRegeneratedPrerenderedRoute(
        options.runtime,
        path,
        body,
        response,
        renderSignals.strictTransportSecurity(),
        options.prerenderStore,
        navigation ? stored : undefined,
      ),
      shareable: true,
    };
  };

  return options.prerenderStore?.withLock === undefined
    ? await regenerate()
    : await options.prerenderStore.withLock(lockKey, regenerate);
}

async function applyBuiltPrerenderInvalidations(
  runtime: BuiltRuntime,
  response: Response,
  store: AppRouterPrerenderStore | undefined,
): Promise<void> {
  const revalidated = response.headers.get("x-mreact-revalidate");

  if (revalidated === null) {
    return;
  }

  for (const path of revalidated.split(",")) {
    const normalized = normalizeRoutePath(path.trim());
    runtime.prerenderedRoutes.delete(normalized);
    await store?.delete(normalized);
  }
}

async function cacheRegeneratedPrerenderedRoute(
  runtime: BuiltRuntime,
  path: string,
  body: string,
  response: Response,
  strictTransportSecurity: string | undefined,
  store: AppRouterPrerenderStore | undefined,
  existing?: BuiltPrerenderedRoute | undefined,
): Promise<Response> {
  const headers = storedPrerenderedRouteHeaders(response.headers);
  const entry: BuiltPrerenderedRoute =
    existing === undefined
      ? {
          headers,
          html: body,
          schemaVersion: PRERENDERED_ROUTE_SCHEMA_VERSION,
          status: response.status,
          ...(strictTransportSecurity === undefined ? {} : { strictTransportSecurity }),
        }
      : mergePrerenderedNavigationHtml(existing, body);
  if (entry === existing) {
    return htmlResponse(body, {
      headers: response.headers,
      status: response.status,
    });
  }
  runtime.prerenderedRoutes.set(path, entry);
  await store?.set(path, entry);

  return htmlResponse(body, {
    headers: response.headers,
    status: response.status,
  });
}

async function cloneResponse(response: Response): Promise<Response> {
  return htmlResponse(await response.clone().text(), {
    headers: response.headers,
    status: response.status,
  });
}
