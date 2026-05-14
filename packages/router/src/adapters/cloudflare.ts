import type { BuiltPrerenderedRoute, BuiltServerManifest } from "../build.js";
import type { ClientRouteManifestEntry } from "../client.js";
import type { AppRoute } from "../routes.js";
import type { AppRouterPrerenderStore } from "../serve.js";

export interface CloudflareExecutionContext {
  passThroughOnException(): void;
  waitUntil(promise: Promise<unknown>): void;
}

export interface CloudflareAssetLoader<Env = unknown> {
  fetch?:
    | ((
        pathname: string,
        request: Request,
        env: Env,
        context: CloudflareExecutionContext,
      ) => Response | Promise<Response | undefined> | undefined)
    | undefined;
}

export interface CloudflareRenderContext<Env = unknown> {
  clientManifest: CloudflareClientManifest;
  context: CloudflareExecutionContext;
  env: Env;
  serverManifest: BuiltServerManifest;
}

export interface CloudflareRequestHandlerOptions<Env = unknown> {
  assets?: CloudflareAssetLoader<Env> | undefined;
  clientManifest: CloudflareClientManifest;
  onError?:
    | ((
        error: unknown,
        request: Request,
        env: Env,
        context: CloudflareExecutionContext,
      ) => Response | Promise<Response>)
    | undefined;
  render?:
    | ((request: Request, context: CloudflareRenderContext<Env>) => Response | Promise<Response>)
    | undefined;
  serverManifest: BuiltServerManifest;
}

export interface CloudflareRequestHandler<Env = unknown> {
  fetch(request: Request, env: Env, context: CloudflareExecutionContext): Promise<Response>;
}

export interface CloudflareBuiltRouteRenderContext<
  Env = unknown,
> extends CloudflareRenderContext<Env> {
  params: Record<string, string>;
  route: AppRoute;
}

export interface CloudflareBuiltRequestHandlerOptions<Env = unknown> extends Omit<
  CloudflareRequestHandlerOptions<Env>,
  "render"
> {
  renderRoute?:
    | ((
        request: Request,
        context: CloudflareBuiltRouteRenderContext<Env>,
      ) => Response | Promise<Response>)
    | undefined;
}

export interface CloudflareClientManifest {
  routes: ClientRouteManifestEntry[];
}

export interface CloudflareAssetBinding {
  fetch(request: Request): Response | Promise<Response>;
}

export interface CloudflareStaticAssetLoaderOptions<Env = unknown> {
  binding:
    | CloudflareAssetBinding
    | ((
        env: Env,
      ) => CloudflareAssetBinding | Promise<CloudflareAssetBinding | undefined> | undefined);
  clientManifest: CloudflareClientManifest;
  extraPaths?: readonly string[] | undefined;
  prefix?: string | undefined;
}

export interface CloudflareCache {
  delete(request: Request | string): boolean | Promise<boolean>;
  match(request: Request | string): Response | Promise<Response | undefined> | undefined;
  put(request: Request | string, response: Response): void | Promise<void>;
}

export interface CloudflarePrerenderStoreOptions {
  cache: CloudflareCache;
  keyOrigin?: string | undefined;
  keyPrefix?: string | undefined;
}

const clientPrefix = "/_mreact/client/";
const defaultPrerenderCacheOrigin = "https://mreact.local";
const defaultPrerenderCachePrefix = "/_mreact/prerender";

export function createCloudflareRequestHandler<Env = unknown>(
  options: CloudflareRequestHandlerOptions<Env>,
): CloudflareRequestHandler<Env> {
  return {
    async fetch(request, env, context) {
      try {
        return await handleCloudflareRequest(options, request, env, context);
      } catch (error) {
        emitRouterDevtoolsEvent({
          method: request.method,
          type: "router:request:error",
          url: request.url,
        });

        return options.onError === undefined
          ? new Response("Internal Server Error", {
              headers: { "content-type": "text/plain; charset=utf-8" },
              status: 500,
            })
          : await options.onError(error, request, env, context);
      }
    },
  };
}

export function createCloudflareBuiltRequestHandler<Env = unknown>(
  options: CloudflareBuiltRequestHandlerOptions<Env>,
): CloudflareRequestHandler<Env> {
  return createCloudflareRequestHandler({
    ...options,
    render(request, context) {
      const matched = matchCloudflareRoute(
        options.serverManifest.routes,
        new URL(request.url).pathname,
      );

      if (matched === undefined || options.renderRoute === undefined) {
        return new Response("Not Found", { status: 404 });
      }

      return options.renderRoute(request, {
        ...context,
        params: matched.params,
        route: matched.route,
      });
    },
  });
}

export function createCloudflareStaticAssetLoader<Env = unknown>(
  options: CloudflareStaticAssetLoaderOptions<Env>,
): CloudflareAssetLoader<Env> {
  const prefix = normalizeAssetPrefix(options.prefix ?? clientPrefix);
  const allowedPaths = cloudflareClientAssetPaths(options.clientManifest, {
    extraPaths: options.extraPaths,
    prefix,
  });

  return {
    async fetch(pathname, request, env) {
      if (!allowedPaths.has(pathname)) {
        return undefined;
      }

      const binding =
        typeof options.binding === "function" ? await options.binding(env) : options.binding;

      if (binding === undefined) {
        return undefined;
      }

      const assetUrl = new URL(request.url);
      assetUrl.pathname = pathname;
      assetUrl.search = "";

      return await binding.fetch(new Request(assetUrl, request));
    },
  };
}

export function cloudflareClientAssetPaths(
  manifest: CloudflareClientManifest,
  options: { extraPaths?: readonly string[] | undefined; prefix?: string | undefined } = {},
): Set<string> {
  const prefix = normalizeAssetPrefix(options.prefix ?? clientPrefix);
  const paths = new Set<string>([`${prefix}manifest.json`]);

  for (const route of manifest.routes) {
    for (const asset of [route.script, route.sourceMap]) {
      const path = safeClientAssetPath(prefix, asset);

      if (path !== undefined) {
        paths.add(path);
      }
    }
  }

  for (const extraPath of options.extraPaths ?? []) {
    const path = safeClientAssetPath(prefix, extraPath);

    if (path !== undefined) {
      paths.add(path);
    }
  }

  return paths;
}

export function createCloudflarePrerenderStore(
  options: CloudflarePrerenderStoreOptions,
): AppRouterPrerenderStore {
  return {
    async delete(path) {
      await options.cache.delete(prerenderCacheRequest(options, path));
    },
    async get(path) {
      const response = await options.cache.match(prerenderCacheRequest(options, path));

      if (response === undefined) {
        return undefined;
      }

      return (await response.json()) as BuiltPrerenderedRoute;
    },
    async set(path, entry) {
      await options.cache.put(
        prerenderCacheRequest(options, path),
        Response.json(entry, {
          headers: { "cache-control": "no-store" },
        }),
      );
    },
  };
}

async function handleCloudflareRequest<Env>(
  options: CloudflareRequestHandlerOptions<Env>,
  request: Request,
  env: Env,
  context: CloudflareExecutionContext,
): Promise<Response> {
  emitRouterDevtoolsEvent({
    method: request.method,
    type: "router:request:start",
    url: request.url,
  });

  const url = new URL(request.url);

  if (url.pathname.startsWith(clientPrefix)) {
    const response = await options.assets?.fetch?.(url.pathname, request, env, context);
    return response ?? new Response("Not Found", { status: 404 });
  }

  const staticResponse = prerenderedResponse(
    options.serverManifest.prerenderedRoutes,
    normalizeRoutePath(url.pathname),
    request.method,
  );

  if (staticResponse !== undefined) {
    emitRouterDevtoolsEvent({
      method: request.method,
      status: staticResponse.status,
      type: "router:request:end",
      url: request.url,
    });
    return staticResponse;
  }

  if (options.render === undefined) {
    return new Response("Not Found", { status: 404 });
  }

  const response = await options.render(request, {
    clientManifest: options.clientManifest,
    context,
    env,
    serverManifest: options.serverManifest,
  });
  emitRouterDevtoolsEvent({
    method: request.method,
    status: response.status,
    type: "router:request:end",
    url: request.url,
  });

  return response;
}

function prerenderedResponse(
  prerenderedRoutes: Record<string, BuiltPrerenderedRoute> | undefined,
  path: string,
  method: string,
): Response | undefined {
  if (method !== "GET" && method !== "HEAD") {
    return undefined;
  }

  const prerendered = prerenderedRoutes?.[path];

  if (prerendered === undefined) {
    return undefined;
  }

  return new Response(method === "HEAD" ? null : prerendered.html, {
    headers: prerendered.headers,
    status: prerendered.status,
  });
}

function normalizeRoutePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

function matchCloudflareRoute(
  routes: readonly AppRoute[],
  pathname: string,
): { params: Record<string, string>; route: AppRoute } | undefined {
  const normalizedPath = normalizeRoutePath(pathname);
  const pathSegments = normalizedPath === "/" ? [] : normalizedPath.slice(1).split("/");

  for (const route of routes) {
    const params: Record<string, string> = {};
    const catchAllIndex = route.segments.findIndex((segment) => segment.kind === "catch-all");

    if (catchAllIndex === -1 && route.segments.length !== pathSegments.length) {
      continue;
    }

    if (catchAllIndex !== -1 && pathSegments.length < catchAllIndex + 1) {
      continue;
    }

    let matched = true;

    for (const [index, segment] of route.segments.entries()) {
      const value = pathSegments[index];

      if (value === undefined) {
        matched = false;
        break;
      }

      if (segment.kind === "static") {
        if (segment.value !== value) {
          matched = false;
          break;
        }
        continue;
      }

      if (segment.kind === "dynamic") {
        const decoded = safeDecodePathSegment(value);
        if (decoded === undefined) {
          matched = false;
          break;
        }
        params[segment.name] = decoded;
        continue;
      }

      const decodedParts: string[] = [];
      for (const part of pathSegments.slice(index)) {
        const decoded = safeDecodePathSegment(part);
        if (decoded === undefined) {
          matched = false;
          break;
        }
        decodedParts.push(decoded);
      }
      params[segment.name] = decodedParts.join("/");
      break;
    }

    if (matched) {
      return { params, route };
    }
  }

  return undefined;
}

function safeDecodePathSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

function normalizeAssetPrefix(prefix: string): string {
  const withLeadingSlash = prefix.startsWith("/") ? prefix : `/${prefix}`;

  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function safeClientAssetPath(prefix: string, asset: string | undefined): string | undefined {
  if (asset === undefined || asset === "" || asset.startsWith("/") || asset.includes("\\")) {
    return undefined;
  }

  const segments = asset.split("/");

  if (segments.some((segment) => unsafeAssetSegment(segment))) {
    return undefined;
  }

  return `${prefix}${segments.join("/")}`;
}

function unsafeAssetSegment(segment: string): boolean {
  if (segment === "" || segment === "." || segment === "..") {
    return true;
  }

  try {
    const decoded = decodeURIComponent(segment);
    return decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\");
  } catch {
    return true;
  }
}

function prerenderCacheRequest(options: CloudflarePrerenderStoreOptions, path: string): Request {
  const origin = options.keyOrigin ?? defaultPrerenderCacheOrigin;
  const prefix = options.keyPrefix ?? defaultPrerenderCachePrefix;
  const normalizedPath = normalizeRoutePath(path.startsWith("/") ? path : `/${path}`);
  const url = new URL(`${normalizePrerenderPrefix(prefix)}${normalizedPath}`, origin);

  return new Request(url, { method: "GET" });
}

function normalizePrerenderPrefix(prefix: string): string {
  const withLeadingSlash = prefix.startsWith("/") ? prefix : `/${prefix}`;

  return withLeadingSlash.replace(/\/+$/, "");
}

function emitRouterDevtoolsEvent(event: Record<string, unknown>): void {
  const devtools = (
    globalThis as typeof globalThis & {
      __mreactDevtools?: { emit?: (event: Record<string, unknown>) => void };
    }
  ).__mreactDevtools;

  devtools?.emit?.({
    package: "@modular-react/router",
    timestamp: Date.now(),
    ...event,
  });
}
