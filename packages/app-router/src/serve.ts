import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize } from "node:path";
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
import { renderAppRequest } from "./render.js";
import { bytesResponse, htmlResponse, nodeRequestToWebRequest, sendResponse } from "./http.js";

interface BuiltRuntime {
  appDir: string;
  clientScripts: ReadonlyMap<string, string>;
  prerenderableRoutes: ReadonlySet<string>;
  prerenderLocks: Map<string, Promise<Response>>;
  prerenderedRoutes: Map<string, BuiltPrerenderedRoute>;
  routeMatcher: RouteMatcher;
  routes: readonly AppRoute[];
  serverModules: ReadonlyMap<string, BuiltServerModuleArtifact>;
  serverModuleCacheVersion: string;
  serverSourceFiles: ReadonlyMap<string, string>;
}

interface BuiltRuntimeCacheEntry {
  clientManifestText: string;
  runtime: Promise<BuiltRuntime>;
  serverManifestText: string;
}

const builtRuntimeCache = new Map<string, BuiltRuntimeCacheEntry>();

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

export interface RenderBuiltAppRequestOptions {
  outDir: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  prerenderStore?: AppRouterPrerenderStore | undefined;
  request: Request;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
  sinkStrategy?: ResponseSinkStrategy;
}

export interface StartServerOptions {
  outDir: string;
  port: number;
  hostname?: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  prerenderStore?: AppRouterPrerenderStore | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
  sinkStrategy?: ResponseSinkStrategy;
}

export interface AppRouterPrerenderStore {
  delete(path: string): void | Promise<void>;
  get(path: string): BuiltPrerenderedRoute | undefined | Promise<BuiltPrerenderedRoute | undefined>;
  set(path: string, entry: BuiltPrerenderedRoute): void | Promise<void>;
  withLock?<T>(path: string, task: () => Promise<T>): Promise<T>;
}

export async function renderBuiltAppRequest(
  options: RenderBuiltAppRequestOptions,
): Promise<Response> {
  return renderBuiltAppRequestWithRuntime({
    ...options,
    runtime: await readBuiltRuntime(options.outDir),
  });
}

async function renderBuiltAppRequestWithRuntime(
  options: RenderBuiltAppRequestOptions & { runtime: BuiltRuntime },
): Promise<Response> {
  const url = new URL(options.request.url);

  if (url.pathname.startsWith("/_mreact/client/")) {
    return readBuiltClientAsset(options.outDir, url.pathname);
  }

  const normalizedPath = normalizeRoutePath(url.pathname);

  if (options.request.method === "GET" || options.request.method === "HEAD") {
    const prerendered = await readPrerenderedRoute(
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

  if (
    options.request.method === "GET" &&
    options.runtime.prerenderableRoutes.has(normalizedPath)
  ) {
    return renderAndCachePrerenderWithLock(options, normalizedPath);
  }

  const response = await renderBuiltDynamicResponse(options);

  await applyBuiltPrerenderInvalidations(
    options.runtime,
    response,
    options.prerenderStore,
  );

  return options.sinkStrategy === "buffer"
    ? await materializeResponseAsBuffer(response)
    : response;
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
  const runtime = await readBuiltRuntime(options.outDir);
  const server = createServer(async (incoming, outgoing) => {
    try {
      const origin = `http://${incoming.headers.host ?? `${options.hostname ?? "127.0.0.1"}:${options.port}`}`;
      const request = nodeRequestToWebRequest(incoming, origin);
      const response = await renderBuiltAppRequestWithRuntime({
        outDir: options.outDir,
        importPolicy: options.importPolicy,
        prerenderStore: options.prerenderStore,
        request,
        routeCache: options.routeCache,
        runtime,
        serverActions: options.serverActions,
        ...(options.sinkStrategy === undefined ? {} : { sinkStrategy: options.sinkStrategy }),
      });

      await sendResponse(outgoing, response);
    } catch (error) {
      outgoing.statusCode = 500;
      outgoing.setHeader("content-type", "text/plain; charset=utf-8");
      outgoing.end(error instanceof Error ? error.stack : String(error));
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

async function readBuiltRuntime(outDir: string): Promise<BuiltRuntime> {
  const [serverManifestText, clientManifestText] = await Promise.all([
    readFile(join(outDir, "server", "manifest.json"), "utf8"),
    readFile(join(outDir, "client", "manifest.json"), "utf8"),
  ]);
  const cached = builtRuntimeCache.get(outDir);

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
    serverManifestText,
  });

  builtRuntimeCache.set(outDir, {
    clientManifestText,
    runtime,
    serverManifestText,
  });

  return runtime;
}

async function materializeBuiltRuntime(options: {
  clientManifestText: string;
  outDir: string;
  serverManifestText: string;
}): Promise<BuiltRuntime> {
  const serverManifest = JSON.parse(options.serverManifestText) as BuiltServerManifest;
  const clientManifest = JSON.parse(options.clientManifestText) as {
    routes: ClientRouteManifestEntry[];
  };
  const appDir = await materializeBuiltServerApp(options.outDir, serverManifest);
  const routes = serverManifest.routes.map((route) => ({
    ...route,
    file: join(appDir, route.file),
  }));
  const prerenderedRoutes = new Map(Object.entries(serverManifest.prerenderedRoutes ?? {}));
  const prerenderableRoutes = new Set(prerenderedRoutes.keys());
  const prerenderLocks = new Map<string, Promise<Response>>();
  const serverModules = new Map(
    Object.entries(serverManifest.serverModules ?? {}).map(([file, artifact]) => [
      join(appDir, file),
      artifact,
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
  const serverModuleCacheVersion = createHash("sha256")
    .update(options.serverManifestText)
    .update("\0")
    .update(options.clientManifestText)
    .digest("hex")
    .slice(0, 16);

  return {
    appDir,
    clientScripts,
    prerenderableRoutes,
    prerenderLocks,
    prerenderedRoutes,
    routeMatcher,
    routes,
    serverModules,
    serverModuleCacheVersion,
    serverSourceFiles,
  };
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
  return renderAppRequest({
    appDir: options.runtime.appDir,
    clientScripts: options.runtime.clientScripts,
    importPolicy: options.importPolicy,
    request: options.request,
    routeCache: options.routeCache,
    routeMatcher: options.runtime.routeMatcher,
    routes: options.runtime.routes,
    serverModules: options.runtime.serverModules,
    serverModuleCacheVersion: options.runtime.serverModuleCacheVersion,
    serverSourceFiles: options.runtime.serverSourceFiles,
    serverActions: options.serverActions,
  });
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
      return new Response(stored.html, {
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

  return new Response(body, {
    headers: response.headers,
    status: response.status,
  });
}

async function cloneResponse(response: Response): Promise<Response> {
  return new Response(await response.clone().text(), {
    headers: response.headers,
    status: response.status,
  });
}

function normalizeRoutePath(pathname: string): string {
  const withoutTrailing = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  return withoutTrailing === "" ? "/" : withoutTrailing;
}

async function materializeBuiltServerApp(
  outDir: string,
  manifest: BuiltServerManifest,
): Promise<string> {
  const appDir = join(outDir, "server", "runtime", "app");

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
