import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";
import type {
  BuiltPrerenderedRoute,
  BuiltServerManifest,
  BuiltServerModuleArtifact,
} from "./build.js";
import type { AppRouterCache } from "./cache.js";
import type { ClientRouteManifestEntry } from "./client-route-inference.js";
import {
  createRouteMatcher,
  type AppRoute,
  type MatchedRoute,
  type RouteMatcher,
} from "./routes.js";
import type { AppRouterServerActionOptions } from "./actions.js";
import type { AppRouterImportPolicy } from "./import-policy.js";
import {
  preloadBuiltRequestModules,
  renderAppRequest,
  resolveAppRouterMiddleware,
  type AppRouterRenderPreload,
  type AppRouterResponseHook,
  type RenderAppRequestOptions,
} from "./render.js";
import type { RouterInstrumentation } from "./trace.js";
import {
  bytesResponse,
  htmlResponse,
  nodeRequestToWebRequest,
  rawNodeRequestUrl,
  sendResponse,
} from "./http.js";
import {
  emitRouterLog,
  logDurationMs,
  logError,
  logNow,
  nodeRequestPath,
  requestLogFields,
  type AppRouterLogger,
} from "./logger.js";
import { builtAppRuntimePreloadPlan } from "./preload-policy.js";
import { routeShellCandidates } from "./route-shells.js";
import { normalizeRoutePath } from "./route-path.js";
import type { HttpUpgradeHandler } from "./upgrade.js";

interface BuiltRuntime {
  appDir: string;
  allowedSourceDirs: readonly string[];
  assetBaseUrl?: string | undefined;
  clientAssetPaths: ReadonlySet<string>;
  clientScripts: ReadonlyMap<string, string>;
  clientStylesByFile: ReadonlyMap<string, readonly string[]>;
  clientStyles: ReadonlyMap<string, readonly string[]>;
  generatedImportPolicy?: AppRouterImportPolicy | undefined;
  hasMiddleware: boolean;
  navigationScripts: ReadonlyMap<string, string>;
  projectRoot: string;
  publicAssetBaseUrl?: string | undefined;
  prerenderableRoutes: ReadonlySet<string>;
  prerenderLocks: Map<string, Promise<Response>>;
  prerenderedRoutes: Map<string, BuiltPrerenderedRoute>;
  routeMatcher: RouteMatcher;
  routes: readonly AppRoute[];
  serverActionReferencesByFile: ReadonlyMap<
    string,
    readonly {
      end: number;
      expression: string;
      expressionEnd: number;
      expressionStart: number;
      moduleId: string;
      exportName: string;
      inferred: boolean;
      sourceHash: string;
      start: number;
    }[]
  >;
  serverActionManifest?: readonly { moduleId: string; exportName: string; inferred?: boolean }[] | undefined;
  serverModuleArtifactLoads: Map<string, Promise<void>>;
  serverModuleClosureFiles: Map<string, readonly string[]>;
  serverModuleFiles: ReadonlyMap<string, string>;
  serverModuleRenderFiles: ReadonlyMap<string, string>;
  serverModuleRequestFiles: ReadonlyMap<string, string>;
  serverModules: Map<string, BuiltServerModuleArtifact>;
  serverModuleCacheVersion: string;
  serverSourceFiles: ReadonlyMap<string, string>;
}

interface BuiltRuntimeCacheEntry {
  clientManifestText: string;
  importPolicyText: string | undefined;
  runtime: Promise<BuiltRuntime>;
  serverManifestText: string;
}

const builtRuntimeCache = new Map<string, BuiltRuntimeCacheEntry>();
const builtPublicAssetCache = new Map<string, BuiltPublicAsset>();

interface BuiltPublicAsset {
  bytes: Uint8Array;
  headers: HeadersInit;
}

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
      const response = await renderBuiltAppRequestWithRuntime({
        ...renderOptions,
        importPolicy:
          renderOptions.importPolicy === undefined
            ? defaultImportPolicy
            : mergeBuiltRuntimeImportPolicy(runtime, renderOptions.importPolicy),
        outDir: options.outDir,
        request,
        runtime,
      });

      return applyBuiltAppResponseHook(response, {
        onResponse: renderOptions.onResponse,
        request,
      });
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
  const runtime = await readBuiltRuntime({
    outDir: options.outDir,
    immutable: options.immutableRuntime,
    runtimeDir: options.runtimeDir,
  });
  const response = await renderBuiltAppRequestWithRuntime({
    ...options,
    importPolicy: mergeBuiltRuntimeImportPolicy(runtime, options.importPolicy),
    runtime,
  });

  return applyBuiltAppResponseHook(response, options);
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

  if (options.request.method === "GET" || options.request.method === "HEAD") {
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

    if (prerendered !== undefined) {
      if (options.request.method === "HEAD") {
        return new Response(null, {
          headers: prerendered.headers,
          status: prerendered.status,
        });
      }
      return htmlResponse(prerendered.html, {
        headers: prerendered.headers,
        status: prerendered.status,
      });
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
): Promise<Response> {
  const hooked = await options.onResponse?.(response, {
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
  const server = createServer(async (incoming, outgoing) => {
    const startedAt = logNow();
    const fallbackRequestFields = {
      method: incoming.method ?? "GET",
      path: nodeRequestPath(incoming.url),
      runtime: "node" as const,
    };

    try {
      const fallbackHost = `${options.hostname ?? "127.0.0.1"}:${options.port}`;
      const host = resolveRequestHost({
        allowedHosts: options.allowedHosts,
        fallbackHost,
        hostPolicy: options.hostPolicy,
        rawHost: incoming.headers.host,
      });
      const origin = `http://${host}`;
      const request = nodeRequestToWebRequest(incoming, origin);
      const logFields = requestLogFields(request, "node");
      emitRouterLog(options.logger, "info", {
        ...logFields,
        type: "router:request:start",
      });
      const response = await runtime.render(request, {
        instrumentation: options.instrumentation,
        logger: options.logger,
        onResponse: options.onResponse,
        prerenderStore: options.prerenderStore,
        routeCache: options.routeCache,
        serverActions: options.serverActions,
        ...(options.sinkStrategy === undefined ? {} : { sinkStrategy: options.sinkStrategy }),
      });
      emitRouterLog(options.logger, "info", {
        ...logFields,
        durationMs: logDurationMs(startedAt),
        status: response.status,
        type: "router:request:end",
      });

      await sendResponse(outgoing, response);
    } catch (error) {
      // Log the full stack to stderr for operator visibility; never
      // place it in the response body where attackers can scrape it
      // (Issue 071). The errorHandler hook lets embedders customize
      // the public response shape while still benefiting from the
      // server-side log.
      emitRouterLog(options.logger, "error", {
        ...fallbackRequestFields,
        durationMs: logDurationMs(startedAt),
        error: logError(error),
        type: "router:request:error",
      });
      if (options.logger === undefined) {
        console.error("[mreact] startServer request failed:", error);
      }
      const payload = options.errorHandler
        ? options.errorHandler(error)
        : { body: "Internal Server Error", status: 500 };
      outgoing.statusCode = payload.status;
      outgoing.setHeader(
        "content-type",
        payload.headers?.["content-type"] ?? "text/plain; charset=utf-8",
      );
      for (const [name, value] of Object.entries(payload.headers ?? {})) {
        if (name.toLowerCase() === "content-type") continue;
        outgoing.setHeader(name, value);
      }
      outgoing.end(payload.body);
    }
  });

  if (options.onUpgrade !== undefined) {
    server.on("upgrade", options.onUpgrade);
  }

  await new Promise<void>((resolve) =>
    server.listen(options.port, options.hostname ?? "127.0.0.1", resolve),
  );
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;

  return {
    server,
    url: `http://${options.hostname ?? "127.0.0.1"}:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function readBuiltClientAsset(
  outDir: string,
  pathname: string,
  allowedPaths: ReadonlySet<string>,
): Promise<Response> {
  const clientPrefix = "/_mreact/client/";
  const normalized = safeBuiltClientAssetPath(pathname.slice(clientPrefix.length));

  if (normalized === undefined || !allowedPaths.has(normalized)) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const code = await readFile(join(outDir, "client", normalized), "utf8");

    return new Response(code, {
      headers: clientAssetHeaders(normalized),
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

function builtClientAssetPathname(request: Request, url: URL): string | undefined {
  const rawUrl = rawNodeRequestUrl(request);
  const rawPathname = rawUrl?.split(/[?#]/, 1)[0];
  const pathname = rawPathname === undefined || rawPathname === "" ? url.pathname : rawPathname;
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;

  return normalizedPathname.startsWith("/_mreact/client/") ? normalizedPathname : undefined;
}

function safeBuiltClientAssetPath(relativePath: string): string | undefined {
  let decoded: string;

  try {
    decoded = decodeURIComponent(relativePath);
  } catch {
    return undefined;
  }

  if (decoded.includes("\\") || decoded.includes("\0")) {
    return undefined;
  }

  if (decoded.split("/").some((segment) => segment === "..")) {
    return undefined;
  }

  const normalized = normalize(decoded);

  if (isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..${sep}`)) {
    return undefined;
  }

  return normalized;
}

function builtClientAssetPaths(manifest: {
  assets?: readonly string[] | undefined;
  routes: readonly ClientRouteManifestEntry[];
}): ReadonlySet<string> {
  const paths = new Set<string>(["manifest.json"]);

  for (const route of manifest.routes) {
    for (const asset of [
      route.script,
      route.sourceMap,
      route.navigationScript,
      ...(route.css ?? []),
      ...(route.imports ?? []),
    ]) {
      const path = safeClientManifestAssetPath(asset);

      if (path !== undefined) {
        paths.add(path);
      }
    }
  }

  for (const asset of manifest.assets ?? []) {
    const path = safeClientManifestAssetPath(asset);

    if (path !== undefined) {
      paths.add(path);
    }
  }

  return paths;
}

function safeClientManifestAssetPath(asset: string | undefined): string | undefined {
  if (asset === undefined || asset === "" || asset.startsWith("/") || asset.includes("\\")) {
    return undefined;
  }

  const segments = asset.split("/");

  return segments.some((segment) => segment === "" || segment === "." || segment === "..")
    ? undefined
    : segments.join("/");
}

async function readBuiltPublicAsset(
  outDir: string,
  pathname: string,
): Promise<Response | undefined> {
  const relativePath = pathname.startsWith("/") ? pathname.slice(1) : pathname;

  if (relativePath === "") {
    return undefined;
  }

  const normalized = normalize(relativePath);

  if (isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
    return undefined;
  }

  try {
    const cacheKey = `${outDir}\0${normalized}`;
    const cached = builtPublicAssetCache.get(cacheKey);

    if (cached !== undefined) {
      return bytesResponse(cached.bytes, {
        headers: cached.headers,
      });
    }

    const bytes = await readFile(join(outDir, "client", "public", normalized));
    const headers = publicAssetHeaders(normalized);

    builtPublicAssetCache.set(cacheKey, {
      bytes,
      headers,
    });

    return bytesResponse(bytes, { headers });
  } catch {
    return undefined;
  }
}

export const __readBuiltPublicAssetForTest = readBuiltPublicAsset;

export function __clearBuiltPublicAssetCacheForTest(): void {
  builtPublicAssetCache.clear();
}

export function __getBuiltPublicAssetCacheSizeForTest(): number {
  return builtPublicAssetCache.size;
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

  return runtime;
}

async function materializeBuiltRuntime(options: {
  clientManifestText: string;
  clientManifestPath: string;
  importPolicyPath: string;
  importPolicyText: string | undefined;
  outDir: string;
  runtimeDir: string;
  serverManifestText: string;
  serverManifestPath: string;
}): Promise<BuiltRuntime> {
  const serverManifest = parseBuiltJsonArtifact<BuiltServerManifest>(
    options.serverManifestText,
    options.serverManifestPath,
    "built app server manifest",
  );
  const clientManifest = parseBuiltJsonArtifact<{
    assets?: readonly string[];
    routes: ClientRouteManifestEntry[];
    styles?: Array<{ css?: readonly string[]; file: string }>;
  }>(options.clientManifestText, options.clientManifestPath, "built app client manifest");
  const appDir = await materializeBuiltServerApp(options.runtimeDir, serverManifest);
  const projectRoot = appDir;
  const routesDir = join(projectRoot, serverManifest.routesDir ?? "");
  const routes = serverManifest.routes.map((route) => ({
    ...route,
    file: join(projectRoot, route.file),
  }));
  const prerenderedRoutes = new Map(Object.entries(serverManifest.prerenderedRoutes ?? {}));
  const prerenderableRoutes = new Set(prerenderedRoutes.keys());
  const prerenderLocks = new Map<string, Promise<Response>>();
  const serverModules = new Map<string, BuiltServerModuleArtifact>(
    Object.entries(serverManifest.serverModules ?? {}).map(([file, artifact]) => [
      join(appDir, file),
      artifact,
    ]),
  );
  const serverModuleFiles = new Map(
    Object.entries(serverManifest.serverModuleFiles ?? {}).map(([file, artifactFile]) => [
      join(appDir, file),
      join(options.outDir, "server", safeManifestFilePath(artifactFile)),
    ]),
  );
  const serverModuleRequestFiles = new Map(
    Object.entries(serverManifest.serverModuleRequestFiles ?? {}).map(([file, artifactFile]) => [
      join(appDir, file),
      join(options.outDir, "server", safeManifestFilePath(artifactFile)),
    ]),
  );
  const serverModuleRenderFiles = new Map(
    Object.entries(serverManifest.serverModuleRenderFiles ?? {}).map(([file, artifactFile]) => [
      join(appDir, file),
      join(options.outDir, "server", safeManifestFilePath(artifactFile)),
    ]),
  );
  const serverSourceFiles = new Map(
    Object.entries(serverManifest.files).map(([file, source]) => [join(appDir, file), source]),
  );
  const serverActionReferencesByFile = new Map(
    Object.entries(serverManifest.routeServerActionReferences ?? {}).map(([file, references]) => [
      join(appDir, file),
      references,
    ]),
  );
  const routeMatcher = createRouteMatcher(routes);
  const clientScripts = new Map(
    clientManifest.routes.flatMap((route) =>
      route.client && route.script !== undefined ? [[route.path, route.script]] : [],
    ),
  );
  const clientStyles = new Map(
    clientManifest.routes.flatMap((route) =>
      route.css !== undefined && route.css.length > 0 ? [[route.path, route.css]] : [],
    ),
  );
  const clientStylesByFile = new Map(
    (clientManifest.styles ?? []).flatMap((style) =>
      style.css !== undefined && style.css.length > 0
        ? [[join(routesDir, style.file), style.css] as const]
        : [],
    ),
  );
  const navigationScripts = new Map(
    clientManifest.routes.flatMap((route) =>
      route.navigation === true && route.navigationScript !== undefined
        ? [[route.path, route.navigationScript]]
        : [],
    ),
  );
  const hasMiddleware =
    serverSourceFiles.has(join(routesDir, "middleware.ts")) ||
    serverSourceFiles.has(join(routesDir, "middleware.mreact.ts"));
  const serverModuleCacheVersion = createHash("sha256")
    .update(options.serverManifestText)
    .update("\0")
    .update(options.clientManifestText)
    .digest("hex")
    .slice(0, 16);

  const allowedSourceDirs = (serverManifest.allowedSourceDirs ?? [""]).map((directory) =>
    join(projectRoot, directory),
  );
  const generatedImportPolicy = builtGeneratedImportPolicy(
    options.importPolicyText,
    options.importPolicyPath,
  );

  return {
    appDir: routesDir,
    allowedSourceDirs,
    ...(serverManifest.assetBaseUrl === undefined
      ? {}
      : { assetBaseUrl: serverManifest.assetBaseUrl }),
    clientAssetPaths: builtClientAssetPaths(clientManifest),
    clientScripts,
    clientStylesByFile,
    clientStyles,
    ...(generatedImportPolicy === undefined ? {} : { generatedImportPolicy }),
    hasMiddleware,
    navigationScripts,
    projectRoot,
    ...(serverManifest.publicAssetBaseUrl === undefined
      ? {}
      : { publicAssetBaseUrl: serverManifest.publicAssetBaseUrl }),
    prerenderableRoutes,
    prerenderLocks,
    prerenderedRoutes,
    routeMatcher,
    routes,
    serverActionReferencesByFile,
    ...(serverManifest.serverActionManifest === undefined
      ? {}
      : { serverActionManifest: serverManifest.serverActionManifest }),
    serverModuleArtifactLoads: new Map(),
    serverModuleClosureFiles: new Map(),
    serverModuleFiles,
    serverModuleRenderFiles,
    serverModuleRequestFiles,
    serverModules,
    serverModuleCacheVersion,
    serverSourceFiles,
  };
}

async function readBuiltImportPolicyText(outDir: string): Promise<string | undefined> {
  const policyPath = join(outDir, "server", "import-policy.json");

  try {
    return await readFile(policyPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw builtArtifactReadError("built app import policy", policyPath, error);
  }
}

function builtGeneratedImportPolicy(
  importPolicyText: string | undefined,
  importPolicyPath: string,
): AppRouterImportPolicy | undefined {
  if (importPolicyText === undefined) {
    return undefined;
  }

  const artifact = parseBuiltJsonArtifact<{
    runtimePackages?: unknown;
  }>(importPolicyText, importPolicyPath, "built app import policy");
  const runtimePackages = Array.isArray(artifact.runtimePackages)
    ? artifact.runtimePackages.filter((name): name is string => typeof name === "string")
    : [];

  return runtimePackages.length === 0 ? undefined : { allowedPackages: runtimePackages };
}

function mergeBuiltRuntimeImportPolicy(
  runtime: BuiltRuntime,
  importPolicy: AppRouterImportPolicy | undefined,
): AppRouterImportPolicy | undefined {
  const generatedImportPolicy = runtime.generatedImportPolicy;

  if (generatedImportPolicy === undefined) {
    return importPolicy;
  }

  const allowedPackages = [
    ...new Set([
      ...(generatedImportPolicy.allowedPackages ?? []),
      ...(importPolicy?.allowedPackages ?? []),
    ]),
  ];

  return {
    ...(allowedPackages.length === 0 ? {} : { allowedPackages }),
    ...(importPolicy?.allowedSourceDirs === undefined
      ? {}
      : { allowedSourceDirs: importPolicy.allowedSourceDirs }),
    ...(importPolicy?.projectRoot === undefined ? {} : { projectRoot: importPolicy.projectRoot }),
  };
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

function parseBuiltJsonArtifact<T>(text: string, artifactPath: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const detail = error instanceof Error && error.message !== "" ? `: ${error.message}` : "";

    throw new Error(`Invalid ${label}: ${artifactPath}${detail}`, { cause: error });
  }
}

async function loadBuiltServerModuleArtifacts(
  runtime: BuiltRuntime,
  files: Iterable<string>,
  kind: BuiltServerModuleArtifactKind = "all",
): Promise<void> {
  for (const file of files) {
    await loadBuiltServerModuleArtifact(runtime, file, kind);
  }
}

type BuiltServerModuleArtifactKind = "all" | "render" | "request";

async function loadBuiltServerModuleArtifact(
  runtime: BuiltRuntime,
  file: string,
  kind: BuiltServerModuleArtifactKind = "all",
): Promise<void> {
  if (kind === "all") {
    await loadBuiltServerModuleArtifact(runtime, file, "request");
    await loadBuiltServerModuleArtifact(runtime, file, "render");
    return;
  }

  const artifactPath =
    kind === "request"
      ? runtime.serverModuleRequestFiles.get(file) ?? runtime.serverModuleFiles.get(file)
      : runtime.serverModuleRenderFiles.get(file) ?? runtime.serverModuleFiles.get(file);

  if (artifactPath === undefined) {
    return;
  }

  const cached = runtime.serverModuleArtifactLoads.get(`${kind}\0${file}`);

  if (cached !== undefined) {
    await cached;
    return;
  }

  const loaded = readFile(artifactPath, "utf8")
    .then((text) => {
      const existing = runtime.serverModules.get(file) ?? {};
      runtime.serverModules.set(
        file,
        mergeBuiltServerModuleArtifacts(
          existing,
          hydrateBuiltServerModuleArtifact(
            parseBuiltJsonArtifact<BuiltServerModuleArtifact>(
              text,
              artifactPath,
              `built server module artifact for ${file}`,
            ),
            builtServerDirForArtifactPath(artifactPath),
          ),
        ),
      );
    })
    .catch((error) => {
      runtime.serverModuleArtifactLoads.delete(`${kind}\0${file}`);
      if (isMissingFileError(error)) {
        throw builtArtifactReadError(`built server module artifact for ${file}`, artifactPath, error);
      }
      throw error;
    });
  runtime.serverModuleArtifactLoads.set(`${kind}\0${file}`, loaded);

  await loaded;
}

function allBuiltServerModuleFiles(runtime: BuiltRuntime): Iterable<string> {
  return new Set([
    ...runtime.serverModuleFiles.keys(),
    ...runtime.serverModuleRequestFiles.keys(),
    ...runtime.serverModuleRenderFiles.keys(),
  ]);
}

function builtServerDirForArtifactPath(artifactPath: string): string {
  const marker = `${sep}server-modules${sep}`;
  const index = artifactPath.lastIndexOf(marker);

  return index === -1 ? dirname(dirname(artifactPath)) : artifactPath.slice(0, index);
}

function hydrateBuiltServerModuleArtifact(
  artifact: BuiltServerModuleArtifact,
  serverDir: string,
): BuiltServerModuleArtifact {
  return {
    ...(artifact.analysis === undefined ? {} : { analysis: artifact.analysis }),
    ...(artifact.loader === undefined
      ? {}
      : { loader: hydrateBuiltServerModuleOutput(artifact.loader, serverDir) }),
    ...(artifact.routeMetadata === undefined
      ? {}
      : { routeMetadata: hydrateBuiltServerModuleOutput(artifact.routeMetadata, serverDir) }),
    ...(artifact.request === undefined
      ? {}
      : { request: hydrateBuiltServerModuleOutput(artifact.request, serverDir) }),
    ...(artifact.stream === undefined
      ? {}
      : { stream: hydrateBuiltServerModuleOutput(artifact.stream, serverDir) }),
    ...(artifact.string === undefined
      ? {}
      : { string: hydrateBuiltServerModuleOutput(artifact.string, serverDir) }),
  };
}

function hydrateBuiltServerModuleOutput<T extends { moduleFile?: string | undefined }>(
  output: T,
  serverDir: string,
): T {
  if (output.moduleFile === undefined || isAbsolute(output.moduleFile)) {
    return output;
  }

  return {
    ...output,
    moduleFile: join(serverDir, safeManifestFilePath(output.moduleFile)),
  };
}

function mergeBuiltServerModuleArtifacts(
  existing: BuiltServerModuleArtifact,
  loaded: BuiltServerModuleArtifact,
): BuiltServerModuleArtifact {
  return {
    ...existing,
    ...loaded,
  };
}

async function loadBuiltServerModuleArtifactsForRequest(
  runtime: BuiltRuntime,
  routeFile: string | undefined,
  options: {
    includeRender?: boolean | undefined;
    includeShells?: boolean | undefined;
  } = {},
): Promise<void> {
  const roots = [
    join(runtime.appDir, "middleware.ts"),
    join(runtime.appDir, "middleware.mreact.ts"),
    ...(routeFile === undefined
      ? []
      : [
          routeFile,
          ...(options.includeShells === false ? [] : shellFilesForRoute(runtime, routeFile)),
        ]),
  ];
  const seen = new Set<string>();

  for (const file of roots) {
    await loadBuiltServerModuleArtifactClosure(runtime, file, seen, "request");
  }

  if (options.includeRender === true) {
    seen.clear();
    for (const file of roots) {
      await loadBuiltServerModuleArtifactClosure(runtime, file, seen, "render");
    }
  }
}

async function loadBuiltServerModuleArtifactClosure(
  runtime: BuiltRuntime,
  file: string,
  seen: Set<string>,
  kind: BuiltServerModuleArtifactKind,
): Promise<void> {
  for (const closureFile of builtServerModuleClosureFiles(runtime, file)) {
    if (seen.has(closureFile)) {
      continue;
    }
    seen.add(closureFile);
    await loadBuiltServerModuleArtifact(runtime, closureFile, kind);
  }
}

function builtServerModuleClosureFiles(
  runtime: BuiltRuntime,
  file: string,
): readonly string[] {
  const cached = runtime.serverModuleClosureFiles.get(file);
  if (cached !== undefined) {
    return cached;
  }

  const closure: string[] = [];
  collectBuiltServerModuleClosureFiles(runtime, file, new Set(), closure);
  runtime.serverModuleClosureFiles.set(file, closure);
  return closure;
}

function collectBuiltServerModuleClosureFiles(
  runtime: BuiltRuntime,
  file: string,
  seen: Set<string>,
  closure: string[],
): void {
  if (seen.has(file)) {
    return;
  }
  seen.add(file);
  closure.push(file);

  const source = runtime.serverSourceFiles.get(file);
  if (source === undefined) {
    return;
  }

  for (const specifier of localServerModuleSpecifiers(source)) {
    const resolved = resolveBuiltLocalServerSourceImport(runtime, file, specifier);
    if (resolved !== undefined) {
      collectBuiltServerModuleClosureFiles(runtime, resolved, seen, closure);
    }
  }
}

const localServerModuleImportPattern =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s*)?["'](?<source>\.{1,2}\/[^"']+)["']/g;

function localServerModuleSpecifiers(code: string): string[] {
  const specifiers = new Set<string>();
  localServerModuleImportPattern.lastIndex = 0;

  for (const match of code.matchAll(localServerModuleImportPattern)) {
    const source = match.groups?.source;

    if (source !== undefined) {
      specifiers.add(source);
    }
  }

  return Array.from(specifiers);
}

function resolveBuiltLocalServerSourceImport(
  runtime: BuiltRuntime,
  fromFile: string,
  specifier: string,
): string | undefined {
  const base = join(dirname(fromFile), specifier);

  for (const candidate of localServerSourceImportCandidates(base)) {
    if (runtime.serverSourceFiles.has(candidate)) {
      return candidate;
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

function shellFilesForRoute(runtime: BuiltRuntime, routeFile: string): string[] {
  return routeShellCandidates(runtime.appDir, routeFile)
    .map((candidate) => candidate.file)
    .filter((file) => runtime.serverSourceFiles.has(file));
}

async function readPrerenderedRoute(
  runtime: BuiltRuntime,
  path: string,
  store: AppRouterPrerenderStore | undefined,
): Promise<BuiltPrerenderedRoute | undefined> {
  const stored = await store?.get(path);

  if (stored !== undefined) {
    runtime.prerenderedRoutes.set(path, stored);
    return stored;
  }

  const manifestEntry = runtime.prerenderedRoutes.get(path);

  if (manifestEntry !== undefined && store !== undefined) {
    await store.set(path, manifestEntry);
  }

  return manifestEntry;
}

function renderBuiltDynamicResponse(
  options: RenderBuiltAppRequestOptions & {
    matchedRoute?: MatchedRoute | undefined;
    requestUrl?: URL | undefined;
    runtime: BuiltRuntime;
  },
): Promise<Response> {
  return renderAppRequest(builtRenderAppRequestOptions(options));
}

function builtRenderAppRequestOptions(
  options: RenderBuiltAppRequestOptions & {
    matchedRoute?: MatchedRoute | undefined;
    requestUrl?: URL | undefined;
    runtime: BuiltRuntime;
  },
): RenderAppRequestOptions {
  const renderOptions: RenderAppRequestOptions & {
    __mreactLoadServerRenderArtifacts?: ((routeFile: string) => Promise<void>) | undefined;
  } = {
    appDir: options.runtime.appDir,
    assetBaseUrl: options.runtime.assetBaseUrl,
    clientScripts: options.runtime.clientScripts,
    clientStylesByFile: options.runtime.clientStylesByFile,
    clientStyles: options.runtime.clientStyles,
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
    __mreactLoadServerRenderArtifacts: async (routeFile: string) => {
      await loadBuiltServerModuleArtifactsForRequest(options.runtime, routeFile, {
        includeRender: true,
      });
    },
    serverModules: options.runtime.serverModules,
    serverModuleCacheVersion: options.runtime.serverModuleCacheVersion,
    serverSourceFiles: options.runtime.serverSourceFiles,
    serverActionReferencesByFile: options.runtime.serverActionReferencesByFile,
    serverActions: mergeBuiltServerActionOptions(
      options.serverActions,
      options.runtime.serverActionManifest,
    ),
    skipMiddleware: true,
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
  const existing = options.runtime.prerenderLocks.get(path);

  if (existing !== undefined) {
    return cloneResponse(await existing);
  }

  const task = runPrerenderRegeneration(options, path);
  options.runtime.prerenderLocks.set(path, task);

  try {
    return cloneResponse(await task);
  } finally {
    options.runtime.prerenderLocks.delete(path);
  }
}

async function runPrerenderRegeneration(
  options: RenderBuiltAppRequestOptions & { runtime: BuiltRuntime },
  path: string,
): Promise<Response> {
  const regenerate = async () => {
    const stored = await readPrerenderedRoute(options.runtime, path, options.prerenderStore);

    if (stored !== undefined) {
      return htmlResponse(stored.html, {
        headers: stored.headers,
        status: stored.status,
      });
    }

    const response = await renderBuiltDynamicResponse(options);

    return response.ok
      ? await cacheRegeneratedPrerenderedRoute(
          options.runtime,
          path,
          response,
          options.prerenderStore,
        )
      : response;
  };

  return options.prerenderStore?.withLock === undefined
    ? await regenerate()
    : await options.prerenderStore.withLock(path, regenerate);
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
  response: Response,
  store: AppRouterPrerenderStore | undefined,
): Promise<Response> {
  const body = await response.text();
  const headers: Record<string, string> = {};

  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const entry = {
    headers,
    html: body,
    status: response.status,
  };
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

async function materializeBuiltServerApp(
  runtimeDir: string,
  manifest: BuiltServerManifest,
): Promise<string> {
  const appDir = join(runtimeDir, "app");

  await rm(appDir, { force: true, recursive: true });
  await Promise.all(
    Object.entries(manifest.files).map(async ([file, code]) => {
      const outputFile = join(appDir, safeManifestFilePath(file));

      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, code);
    }),
  );

  return appDir;
}

function safeManifestFilePath(pathname: string): string {
  const normalized = normalize(pathname);

  if (isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Invalid built app manifest file path: ${pathname}`);
  }

  return normalized;
}

function clientAssetHeaders(pathname: string): HeadersInit {
  if (pathname === "manifest.json") {
    return {
      "cache-control": "no-cache",
      "content-type": "application/json; charset=utf-8",
    };
  }

  return {
    "cache-control": "public, max-age=31536000, immutable",
    "content-type": pathname.endsWith(".css")
      ? "text/css; charset=utf-8"
      : "text/javascript; charset=utf-8",
  };
}

function publicAssetHeaders(pathname: string): HeadersInit {
  return {
    "cache-control": "public, max-age=3600",
    "content-type": publicAssetContentType(pathname),
  };
}

function publicAssetContentType(pathname: string): string {
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".ico")) return "image/x-icon";
  if (pathname.endsWith(".txt")) return "text/plain; charset=utf-8";

  return "application/octet-stream";
}
