import type { BuiltPrerenderedRoute, BuiltServerManifest } from "../build.js";
import type { ClientRouteManifestEntry } from "../client.js";
import type { AppRouterResponseHook } from "../render.js";
import {
  emitRouterLog,
  logDurationMs,
  logError,
  logNow,
  requestLogFields,
  type AppRouterLogger,
} from "../logger.js";
import { normalizeRoutePath } from "../route-path.js";
import type { AppRoute } from "../routes.js";
import type { AppRouterPrerenderStore } from "../serve.js";
import { emitRouterDevtoolsEvent } from "./devtools.js";
import { escapeHtmlAttribute } from "@reckona/mreact-shared/html-escape";

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
  logger?: AppRouterLogger | undefined;
  onResponse?: AppRouterResponseHook | undefined;
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

export interface CloudflareRouteModuleLoaderContext<
  Env = unknown,
> extends CloudflareBuiltRouteRenderContext<Env> {
  request: Request;
}

export interface CloudflareRouteModuleComponentProps<
  Data = unknown,
  Env = unknown,
> extends CloudflareBuiltRouteRenderContext<Env> {
  data: Data;
  request: Request;
}

export type CloudflareRouteModuleComponent<Data = unknown, Env = unknown> = (
  props: CloudflareRouteModuleComponentProps<Data, Env>,
) => Response | string | PromiseLike<Response | string>;

export interface CloudflareRouteModule<Data = unknown, Env = unknown> {
  App?: CloudflareRouteModuleComponent<Data, Env> | undefined;
  default?: CloudflareRouteModuleComponent<Data, Env> | undefined;
  loader?:
    | ((context: CloudflareRouteModuleLoaderContext<Env>) => Data | PromiseLike<Data>)
    | undefined;
}

export type CloudflareServerRouteHandler = (
  request: Request,
  context: { params: Record<string, string> },
) => unknown | PromiseLike<unknown>;

export interface CloudflareServerRouteModule {
  ALL?: CloudflareServerRouteHandler | undefined;
  DELETE?: CloudflareServerRouteHandler | undefined;
  default?: CloudflareServerRouteHandler | undefined;
  GET?: CloudflareServerRouteHandler | undefined;
  HEAD?: CloudflareServerRouteHandler | undefined;
  OPTIONS?: CloudflareServerRouteHandler | undefined;
  PATCH?: CloudflareServerRouteHandler | undefined;
  POST?: CloudflareServerRouteHandler | undefined;
  PUT?: CloudflareServerRouteHandler | undefined;
}

export type CloudflareRouteModuleRegistryEntry<Env = unknown> =
  | CloudflareRouteModule<unknown, Env>
  | CloudflareServerRouteModule;

export type CloudflareRouteModuleRegistry<Env = unknown> = Record<
  string,
  | CloudflareRouteModuleRegistryEntry<Env>
  | (() => CloudflareRouteModuleRegistryEntry<Env> | PromiseLike<CloudflareRouteModuleRegistryEntry<Env>>)
>;

export interface CloudflareRouteModuleRendererOptions<Env = unknown> {
  document?:
    | ((
        context: CloudflareRouteModuleComponentProps<unknown, Env> & {
          body: string;
          modulePreload: string;
        },
      ) => Response | string | PromiseLike<Response | string>)
    | undefined;
  modules: CloudflareRouteModuleRegistry<Env>;
}

export type CloudflareRouteModuleGlob<Env = unknown> = Record<
  string,
  | CloudflareRouteModuleRegistryEntry<Env>
  | (() => CloudflareRouteModuleRegistryEntry<Env> | PromiseLike<CloudflareRouteModuleRegistryEntry<Env>>)
>;

export interface CollectCloudflareRouteModulesOptions {
  manifest: BuiltServerManifest;
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
  publicAssets?: readonly string[] | undefined;
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
      const startedAt = logNow();
      try {
        return await handleCloudflareRequest(options, request, env, context);
      } catch (error) {
        const logFields = requestLogFields(request, "cloudflare");
        emitRouterDevtoolsEvent({
          method: request.method,
          type: "router:request:error",
          url: request.url,
        });
        emitRouterLog(options.logger, "error", {
          ...logFields,
          durationMs: logDurationMs(startedAt),
          error: logError(error),
          type: "router:request:error",
        });

        return await applyCloudflareResponseHook(
          options.onError === undefined
            ? new Response("Internal Server Error", {
                headers: { "content-type": "text/plain; charset=utf-8" },
                status: 500,
              })
            : await options.onError(error, request, env, context),
          options,
          request,
        );
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

export function createCloudflareRouteModuleRenderer<Env = unknown>(
  options: CloudflareRouteModuleRendererOptions<Env>,
): NonNullable<CloudflareBuiltRequestHandlerOptions<Env>["renderRoute"]> {
  return async (request, context) => {
    if (context.route.kind !== "server" && isCloudflareNavigationRequest(request)) {
      return cloudflareDocumentReloadNavigationResponse();
    }

    const module = await loadCloudflareRouteModule(options.modules, context.route.file);

    if (module === undefined) {
      return new Response(`No Cloudflare route module registered for ${context.route.file}.`, {
        headers: { "content-type": "text/plain; charset=utf-8" },
        status: 500,
      });
    }

    if (context.route.kind === "server") {
      return await dispatchCloudflareServerRoute(module as CloudflareServerRouteModule, request, context.params);
    }

    const pageModule = module as CloudflareRouteModule<unknown, Env>;
    const component = pageModule.default ?? pageModule.App;

    if (component === undefined) {
      return new Response(`No Cloudflare page component registered for ${context.route.file}.`, {
        headers: { "content-type": "text/plain; charset=utf-8" },
        status: 500,
      });
    }

    const loaderContext = {
      ...context,
      request,
    };
    let data: unknown;

    try {
      data = pageModule.loader === undefined ? undefined : await pageModule.loader(loaderContext);
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }

      throw error;
    }
    const props = {
      ...context,
      data,
      request,
    };
    const rendered = await component(props);

    if (rendered instanceof Response) {
      return rendered;
    }

    const modulePreload = cloudflareModulePreloadTag(context.clientManifest, context.route.path);
    const documented =
      options.document === undefined
        ? defaultCloudflareDocument(rendered, modulePreload)
        : await options.document({
            ...props,
            body: rendered,
            modulePreload,
          });

    return documented instanceof Response
      ? documented
      : new Response(documented, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
  };
}

async function dispatchCloudflareServerRoute(
  module: CloudflareServerRouteModule,
  request: Request,
  params: Record<string, string>,
): Promise<Response> {
  const handler =
    module[request.method as keyof CloudflareServerRouteModule] ?? module.ALL ?? module.default;

  if (typeof handler !== "function") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let response: unknown;

  try {
    response = await handler(request, { params });
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

function isCloudflareNavigationRequest(request: Request): boolean {
  return request.headers.get("x-mreact-navigation") === "1";
}

function cloudflareDocumentReloadNavigationResponse(): Response {
  return new Response(null, {
    headers: { "x-mreact-navigation": "reload" },
    status: 204,
  });
}

export function collectCloudflareRouteModules<Env = unknown>(
  glob: CloudflareRouteModuleGlob<Env>,
  options: CollectCloudflareRouteModulesOptions,
): CloudflareRouteModuleRegistry<Env> {
  const requiredRoutes = options.manifest.routes.filter((route) =>
    cloudflareRouteRequiresModule(route, options.manifest),
  );
  const matchedKeys = new Set<string>();
  const modules: CloudflareRouteModuleRegistry<Env> = {};

  for (const route of requiredRoutes) {
    const match = Object.entries(glob).find(([key]) =>
      cloudflareRouteGlobKeyMatchesRoute(key, route.file),
    );

    if (match === undefined) {
      throw new Error(`Missing Cloudflare route module for ${route.file}.`);
    }

    const [key, module] = match;
    matchedKeys.add(key);
    modules[route.file] = module;
  }

  const extraKeys = Object.keys(glob).filter((key) => !matchedKeys.has(key));

  if (extraKeys.length > 0) {
    throw new Error(`Extra Cloudflare route module entries: ${extraKeys.join(", ")}.`);
  }

  return modules;
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
    for (const asset of [route.script, route.sourceMap, route.navigationScript]) {
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

  for (const publicAsset of manifest.publicAssets ?? []) {
    const path = safePublicAssetPath(publicAsset);

    if (path !== undefined) {
      paths.add(path);
    }
  }

  return paths;
}

function safePublicAssetPath(asset: string): string | undefined {
  if (!asset.startsWith("/") || asset.startsWith("//") || asset.includes("..")) {
    return undefined;
  }

  return asset;
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
  const startedAt = logNow();
  const logFields = requestLogFields(request, "cloudflare");
  emitRouterLog(options.logger, "info", {
    ...logFields,
    type: "router:request:start",
  });
  emitRouterDevtoolsEvent({
    method: request.method,
    type: "router:request:start",
    url: request.url,
  });

  const url = new URL(request.url);

  if (
    url.pathname.startsWith(clientPrefix) ||
    isCloudflarePublicAssetPath(options.clientManifest, url.pathname)
  ) {
    const response = await options.assets?.fetch?.(url.pathname, request, env, context);
    const assetResponse = await applyCloudflareResponseHook(
      response ?? new Response("Not Found", { status: 404 }),
      options,
      request,
    );
    emitRouterLog(options.logger, "info", {
      ...logFields,
      durationMs: logDurationMs(startedAt),
      status: assetResponse.status,
      type: "router:request:end",
    });
    return assetResponse;
  }

  const staticResponse = prerenderedResponse(
    options.serverManifest.prerenderedRoutes,
    normalizeRoutePath(url.pathname),
    request.method,
    isCloudflareNavigationRequest(request),
  );

  if (staticResponse !== undefined) {
    emitRouterDevtoolsEvent({
      method: request.method,
      status: staticResponse.status,
      type: "router:request:end",
      url: request.url,
    });
    emitRouterLog(options.logger, "info", {
      ...logFields,
      durationMs: logDurationMs(startedAt),
      status: staticResponse.status,
      type: "router:request:end",
    });
    return await applyCloudflareResponseHook(staticResponse, options, request);
  }

  if (options.render === undefined) {
    const notFoundResponse = await applyCloudflareResponseHook(
      new Response("Not Found", { status: 404 }),
      options,
      request,
    );
    emitRouterLog(options.logger, "info", {
      ...logFields,
      durationMs: logDurationMs(startedAt),
      status: notFoundResponse.status,
      type: "router:request:end",
    });
    return notFoundResponse;
  }

  const renderedResponse = await options.render(request, {
    clientManifest: options.clientManifest,
    context,
    env,
    serverManifest: options.serverManifest,
  });
  const response = await applyCloudflareResponseHook(
    preserveCloudflareStreamedHtmlResponse(renderedResponse),
    options,
    request,
  );
  emitRouterDevtoolsEvent({
    method: request.method,
    status: response.status,
    type: "router:request:end",
    url: request.url,
  });
  emitRouterLog(options.logger, "info", {
    ...logFields,
    durationMs: logDurationMs(startedAt),
    status: response.status,
    type: "router:request:end",
  });

  return response;
}

function isCloudflarePublicAssetPath(manifest: CloudflareClientManifest, pathname: string): boolean {
  return (manifest.publicAssets ?? []).includes(pathname);
}

async function applyCloudflareResponseHook<Env>(
  response: Response,
  options: Pick<CloudflareRequestHandlerOptions<Env>, "onResponse">,
  request: Request,
): Promise<Response> {
  const hooked = await options.onResponse?.(response, { request });

  return hooked instanceof Response ? hooked : response;
}

function preserveCloudflareStreamedHtmlResponse(response: Response): Response {
  if (
    response.headers.get("x-mreact-stream") !== "1" ||
    !isHtmlContentType(response.headers.get("content-type"))
  ) {
    return response;
  }

  const headers = new Headers(response.headers);
  const cacheControl = headers.get("cache-control");

  if (!cacheControlHasDirective(cacheControl, "no-transform")) {
    headers.set(
      "cache-control",
      cacheControl === null || cacheControl.trim() === ""
        ? "no-transform"
        : `${cacheControl}, no-transform`,
    );
  }

  if (headers.get("content-encoding") === null) {
    headers.set("content-encoding", "identity");
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function isHtmlContentType(contentType: string | null): boolean {
  return contentType?.toLowerCase().split(";", 1)[0]?.trim() === "text/html";
}

function cacheControlHasDirective(cacheControl: string | null, directive: string): boolean {
  if (cacheControl === null) {
    return false;
  }

  const normalizedDirective = directive.toLowerCase();
  return cacheControl
    .split(",")
    .some((part) => part.trim().toLowerCase() === normalizedDirective);
}

function prerenderedResponse(
  prerenderedRoutes: Record<string, BuiltPrerenderedRoute> | undefined,
  path: string,
  method: string,
  isNavigation: boolean,
): Response | undefined {
  if (method !== "GET" && method !== "HEAD") {
    return undefined;
  }

  const prerendered = prerenderedRoutes?.[path];

  if (prerendered === undefined) {
    return undefined;
  }

  if (isNavigation && !prerendered.html.includes("data-mreact-route-id")) {
    return cloudflareDocumentReloadNavigationResponse();
  }

  return new Response(method === "HEAD" ? null : prerendered.html, {
    headers: prerendered.headers,
    status: prerendered.status,
  });
}

function cloudflareRouteRequiresModule(
  route: AppRoute,
  manifest: BuiltServerManifest,
): boolean {
  return (
    route.kind === "server" ||
    (route.kind === "page" &&
      (route.segments.some((segment) => segment.kind !== "static") ||
        manifest.prerenderedRoutes?.[route.path] === undefined))
  );
}

function cloudflareRouteGlobKeyMatchesRoute(key: string, routeFile: string): boolean {
  const normalizedKey = normalizeCloudflareRouteModulePath(key);
  const normalizedRoute = normalizeCloudflareRouteModulePath(routeFile);

  return (
    normalizedKey === normalizedRoute ||
    normalizedKey.endsWith(`/${normalizedRoute}`)
  );
}

function normalizeCloudflareRouteModulePath(path: string): string {
  const withoutPrefix = path
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");

  return withoutPrefix.replace(/\.(?:mjs|js|ts|tsx)$/, "");
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

async function loadCloudflareRouteModule<Env>(
  modules: CloudflareRouteModuleRegistry<Env>,
  file: string,
): Promise<CloudflareRouteModuleRegistryEntry<Env> | undefined> {
  const entry = modules[file];

  return typeof entry === "function" ? await entry() : entry;
}

function cloudflareModulePreloadTag(manifest: CloudflareClientManifest, routePath: string): string {
  const script = manifest.routes.find((route) => route.path === routePath)?.script;

  return script === undefined
    ? ""
    : `<link rel="modulepreload" href="/_mreact/client/${escapeHtmlAttribute(script)}">`;
}

function defaultCloudflareDocument(body: string, modulePreload: string): string {
  return `<!DOCTYPE html>${modulePreload}<html><head></head><body>${body}</body></html>`;
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
