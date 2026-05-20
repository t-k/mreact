import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
import type {
  BuiltPrerenderedRoute,
  BuiltServerManifest,
  BuiltServerModuleArtifact,
} from "./build.js";
import type { AppRouterCache } from "./cache.js";
import type { ClientRouteManifestEntry } from "./client.js";
import { createRouteMatcher, type AppRoute, type RouteMatcher } from "./routes.js";
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
import { bytesResponse, htmlResponse, nodeRequestToWebRequest, sendResponse } from "./http.js";
import {
  emitRouterLog,
  logDurationMs,
  logError,
  logNow,
  nodeRequestPath,
  requestLogFields,
  type AppRouterLogger,
} from "./logger.js";
import { normalizeRoutePath } from "./route-path.js";

interface BuiltRuntime {
  appDir: string;
  allowedSourceDirs: readonly string[];
  assetBaseUrl?: string | undefined;
  clientScripts: ReadonlyMap<string, string>;
  hasMiddleware: boolean;
  navigationScripts: ReadonlyMap<string, string>;
  projectRoot: string;
  publicAssetBaseUrl?: string | undefined;
  prerenderableRoutes: ReadonlySet<string>;
  prerenderLocks: Map<string, Promise<Response>>;
  prerenderedRoutes: Map<string, BuiltPrerenderedRoute>;
  routeMatcher: RouteMatcher;
  routes: readonly AppRoute[];
  serverActionManifest?: readonly { moduleId: string; exportName: string }[] | undefined;
  serverModuleArtifactLoads: Map<string, Promise<void>>;
  serverModuleFiles: ReadonlyMap<string, string>;
  serverModules: Map<string, BuiltServerModuleArtifact>;
  serverModuleCacheVersion: string;
  serverSourceFiles: ReadonlyMap<string, string>;
}

interface BuiltRuntimeCacheEntry {
  clientManifestText: string;
  runtime: Promise<BuiltRuntime>;
  serverManifestText: string;
}

const builtRuntimeCache = new Map<string, BuiltRuntimeCacheEntry>();
const builtPublicAssetCache = new Map<string, BuiltPublicAsset | null>();

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
export type RequestHostPolicy = "strict" | "trusted-proxy";

let warnedImplicitHostTrust = false;

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
  serverActions?: AppRouterServerActionOptions | undefined;
  sinkStrategy?: ResponseSinkStrategy;
  preload?: AppRouterRenderPreload | undefined;
}

export type BuiltAppRuntimePreloadMode =
  | "all"
  | "hot-route-requests"
  | "hot-routes"
  | "middleware"
  | "none";

export interface BuiltAppRuntimePreloadStrategy {
  mode: BuiltAppRuntimePreloadMode;
  routes?: readonly string[] | undefined;
}

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
  console.warn(
    "[mreact] Host header trust is implicit because neither allowedHosts nor hostPolicy is configured. Set allowedHosts for public deployments, hostPolicy: \"strict\" to reject unlisted Host headers, or hostPolicy: \"trusted-proxy\" when a trusted reverse proxy normalizes Host.",
  );
}

export interface AppRouterPrerenderStore {
  delete(path: string): void | Promise<void>;
  get(path: string): BuiltPrerenderedRoute | undefined | Promise<BuiltPrerenderedRoute | undefined>;
  set(path: string, entry: BuiltPrerenderedRoute): void | Promise<void>;
  withLock?<T>(path: string, task: () => Promise<T>): Promise<T>;
}

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
  const strategy = options.preload ?? { mode: "all" };

  if (strategy.mode === "none") {
    return;
  }

  const routes = builtRuntimePreloadRoutes(runtime, strategy);
  if (strategy.mode === "all") {
    await loadBuiltServerModuleArtifacts(runtime, runtime.serverModuleFiles.keys());
  } else {
    await loadBuiltServerModuleArtifactsForRequest(runtime, undefined);
    for (const route of routes) {
      await loadBuiltServerModuleArtifactsForRequest(runtime, route.file, {
        includeShells: strategy.mode !== "hot-route-requests",
      });
    }
  }
  await preloadBuiltRequestModules({
    appDir: runtime.appDir,
    importPolicy: {
      ...options.importPolicy,
      allowedSourceDirs: runtime.allowedSourceDirs,
      projectRoot: runtime.projectRoot,
    },
    routes,
    serverModules: runtime.serverModules,
    serverModuleCacheVersion: runtime.serverModuleCacheVersion,
    serverSourceFiles: runtime.serverSourceFiles,
    includeRenderModules: strategy.mode !== "hot-route-requests",
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

export async function renderBuiltAppRequest(
  options: RenderBuiltAppRequestOptions,
): Promise<Response> {
  const response = await renderBuiltAppRequestWithRuntime({
    ...options,
    runtime: await readBuiltRuntime({
      outDir: options.outDir,
      runtimeDir: options.runtimeDir,
    }),
  });

  return applyBuiltAppResponseHook(response, options);
}

async function renderBuiltAppRequestWithRuntime(
  options: RenderBuiltAppRequestOptions & { runtime: BuiltRuntime },
): Promise<Response> {
  const url = new URL(options.request.url);
  const timing = createBuiltRenderTiming(options.logger);

  if (url.pathname.startsWith("/_mreact/client/")) {
    return readBuiltClientAsset(options.outDir, url.pathname);
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
  request = middlewareResult.request;
  normalizedPath = normalizeRoutePath(new URL(request.url).pathname);
  matched = options.runtime.routeMatcher.match(normalizedPath);

  if (request.method === "GET" && options.runtime.prerenderableRoutes.has(normalizedPath)) {
    await loadBuiltServerModuleArtifactsForRequest(options.runtime, matched?.route.file);
    return renderAndCachePrerenderWithLock({ ...options, request }, normalizedPath);
  }

  await loadBuiltServerModuleArtifactsForRequest(options.runtime, matched?.route.file);
  const response = await renderBuiltDynamicResponse({ ...options, request });

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

export async function startServer(
  options: StartServerOptions,
): Promise<{ close(): Promise<void>; url: string }> {
  warnIfImplicitHostTrust(options);
  const runtime = await readBuiltRuntime({ outDir: options.outDir });
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
      const response = await applyBuiltAppResponseHook(await renderBuiltAppRequestWithRuntime({
        outDir: options.outDir,
        importPolicy: options.importPolicy,
        instrumentation: options.instrumentation,
        logger: options.logger,
        onResponse: options.onResponse,
        prerenderStore: options.prerenderStore,
        request,
        routeCache: options.routeCache,
        runtime,
        serverActions: options.serverActions,
        ...(options.sinkStrategy === undefined ? {} : { sinkStrategy: options.sinkStrategy }),
      }), { onResponse: options.onResponse, request });
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

  await new Promise<void>((resolve) =>
    server.listen(options.port, options.hostname ?? "127.0.0.1", resolve),
  );
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;

  return {
    url: `http://${options.hostname ?? "127.0.0.1"}:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function readBuiltClientAsset(outDir: string, pathname: string): Promise<Response> {
  const clientPrefix = "/_mreact/client/";
  const relativePath = pathname.slice(clientPrefix.length);
  const normalized = normalize(relativePath);

  if (normalized.startsWith("..")) {
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

    if (cached === null) {
      return undefined;
    }

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
    builtPublicAssetCache.set(`${outDir}\0${normalized}`, null);
    return undefined;
  }
}

async function readBuiltRuntime(options: {
  outDir: string;
  runtimeDir?: string | undefined;
}): Promise<BuiltRuntime> {
  const outDir = options.outDir;
  const runtimeDir = options.runtimeDir ?? join(outDir, "server", "runtime");
  const [serverManifestText, clientManifestText] = await Promise.all([
    readFile(join(outDir, "server", "manifest.json"), "utf8"),
    readFile(join(outDir, "client", "manifest.json"), "utf8"),
  ]);
  const cacheKey = `${outDir}\0${runtimeDir}`;
  const cached = builtRuntimeCache.get(cacheKey);

  if (
    cached !== undefined &&
    cached.serverManifestText === serverManifestText &&
    cached.clientManifestText === clientManifestText
  ) {
    return cached.runtime;
  }

  const runtime = materializeBuiltRuntime({
    clientManifestText,
    outDir,
    runtimeDir,
    serverManifestText,
  });

  builtRuntimeCache.set(cacheKey, {
    clientManifestText,
    runtime,
    serverManifestText,
  });

  return runtime;
}

async function materializeBuiltRuntime(options: {
  clientManifestText: string;
  outDir: string;
  runtimeDir: string;
  serverManifestText: string;
}): Promise<BuiltRuntime> {
  const serverManifest = JSON.parse(options.serverManifestText) as BuiltServerManifest;
  const clientManifest = JSON.parse(options.clientManifestText) as {
    routes: ClientRouteManifestEntry[];
  };
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
  const serverSourceFiles = new Map(
    Object.entries(serverManifest.files).map(([file, source]) => [join(appDir, file), source]),
  );
  const routeMatcher = createRouteMatcher(routes);
  const clientScripts = new Map(
    clientManifest.routes.flatMap((route) =>
      route.client && route.script !== undefined ? [[route.path, route.script]] : [],
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

  return {
    appDir: routesDir,
    allowedSourceDirs,
    ...(serverManifest.assetBaseUrl === undefined
      ? {}
      : { assetBaseUrl: serverManifest.assetBaseUrl }),
    clientScripts,
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
    ...(serverManifest.serverActionManifest === undefined
      ? {}
      : { serverActionManifest: serverManifest.serverActionManifest }),
    serverModuleArtifactLoads: new Map(),
    serverModuleFiles,
    serverModules,
    serverModuleCacheVersion,
    serverSourceFiles,
  };
}

async function loadBuiltServerModuleArtifacts(
  runtime: BuiltRuntime,
  files: Iterable<string>,
): Promise<void> {
  for (const file of files) {
    await loadBuiltServerModuleArtifact(runtime, file);
  }
}

async function loadBuiltServerModuleArtifact(
  runtime: BuiltRuntime,
  file: string,
): Promise<void> {
  if (runtime.serverModules.has(file)) {
    return;
  }

  const artifactPath = runtime.serverModuleFiles.get(file);

  if (artifactPath === undefined) {
    return;
  }

  const cached = runtime.serverModuleArtifactLoads.get(file);

  if (cached !== undefined) {
    await cached;
    return;
  }

  const loaded = readFile(artifactPath, "utf8")
    .then((text) => {
      runtime.serverModules.set(file, JSON.parse(text) as BuiltServerModuleArtifact);
    })
    .catch((error) => {
      runtime.serverModuleArtifactLoads.delete(file);
      throw error;
    });
  runtime.serverModuleArtifactLoads.set(file, loaded);

  await loaded;
}

async function loadBuiltServerModuleArtifactsForRequest(
  runtime: BuiltRuntime,
  routeFile: string | undefined,
  options: { includeShells?: boolean | undefined } = {},
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
    await loadBuiltServerModuleArtifactClosure(runtime, file, seen);
  }
}

async function loadBuiltServerModuleArtifactClosure(
  runtime: BuiltRuntime,
  file: string,
  seen: Set<string>,
): Promise<void> {
  if (seen.has(file)) {
    return;
  }
  seen.add(file);

  await loadBuiltServerModuleArtifact(runtime, file);

  const source = runtime.serverSourceFiles.get(file);

  if (source === undefined) {
    return;
  }

  for (const specifier of localServerModuleSpecifiers(source)) {
    const resolved = resolveBuiltLocalServerSourceImport(runtime, file, specifier);

    if (resolved !== undefined) {
      await loadBuiltServerModuleArtifactClosure(runtime, resolved, seen);
    }
  }
}

function localServerModuleSpecifiers(code: string): string[] {
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
  const relativeDir = relative(runtime.appDir, dirname(routeFile));
  const parts = relativeDir === "" ? [] : relativeDir.split(/[\\/]/);
  const directories = [runtime.appDir];

  for (let index = 0; index < parts.length; index += 1) {
    directories.push(join(runtime.appDir, ...parts.slice(0, index + 1)));
  }

  return directories.flatMap((directory) =>
    [
      join(directory, "layout.tsx"),
      join(directory, "layout.mreact.tsx"),
      join(directory, "template.tsx"),
      join(directory, "template.mreact.tsx"),
    ].filter((file) => runtime.serverSourceFiles.has(file)),
  );
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
  options: RenderBuiltAppRequestOptions & { runtime: BuiltRuntime },
): Promise<Response> {
  return renderAppRequest(builtRenderAppRequestOptions(options));
}

function builtRenderAppRequestOptions(
  options: RenderBuiltAppRequestOptions & { runtime: BuiltRuntime },
): RenderAppRequestOptions {
  return {
    appDir: options.runtime.appDir,
    assetBaseUrl: options.runtime.assetBaseUrl,
    clientScripts: options.runtime.clientScripts,
    importPolicy: {
      ...options.importPolicy,
      allowedSourceDirs: options.runtime.allowedSourceDirs,
      projectRoot: options.runtime.projectRoot,
    },
    request: options.request,
    instrumentation: options.instrumentation,
    logger: options.logger,
    navigationScripts: options.runtime.navigationScripts,
    routeCache: options.routeCache,
    routeMatcher: options.runtime.routeMatcher,
    routes: options.runtime.routes,
    serverModules: options.runtime.serverModules,
    serverModuleCacheVersion: options.runtime.serverModuleCacheVersion,
    serverSourceFiles: options.runtime.serverSourceFiles,
    serverActions: mergeBuiltServerActionOptions(
      options.serverActions,
      options.runtime.serverActionManifest,
    ),
    skipMiddleware: true,
    ...(options.preload === undefined ? {} : { preload: options.preload }),
  };
}

function mergeBuiltServerActionOptions(
  options: AppRouterServerActionOptions | undefined,
  allowedActions: readonly { moduleId: string; exportName: string }[] | undefined,
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
    "content-type": "text/javascript; charset=utf-8",
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
