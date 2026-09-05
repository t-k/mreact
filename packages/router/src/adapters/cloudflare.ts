import type { BuiltPrerenderedRoute, BuiltServerManifest } from "../build.js";
import type { ClientRouteManifestEntry } from "../client.js";
import { clientManifestAssetPaths } from "../client-manifest-assets.js";
import type { AppRouterResponseHook } from "../render.js";
import {
  __MREACT_QUERY_STATE_SCRIPT_ID,
  createQueryClient,
  dehydrate,
  installQueryAsyncStorage,
  isQueryClientScopeUnavailableError,
  runWithQueryClient,
  type DehydratedQueryClient,
  type DehydrateOptions,
  type QueryAsyncStorage,
  type QueryClient,
} from "@reckona/mreact-query";
import type {
  GenerateMetadataContext,
  ManifestDescriptor,
  RobotsManifest,
  RouteMetadata,
  SitemapEntry,
} from "../types.js";
import {
  emitRouterLog,
  logDurationMs,
  logError,
  logNow,
  requestLogFields,
  type AppRouterLogger,
} from "../logger.js";
import { middlewareMatches, type MiddlewareModule } from "../middleware.js";
import { normalizeRoutePath } from "../route-path.js";
import type { AppRoute } from "../routes.js";
import { routeLocationFromRequest } from "../request-header-tracking.js";
import { contentSecurityPolicy } from "../csp.js";
import { isNotFoundError, isRedirectError, rewriteLocation } from "../navigation.js";
import { validateRouteMetadata } from "../metadata.js";
import { routeSecurityHeaders } from "../security-headers.js";
import type { AppRouterPrerenderStore } from "../serve.js";
import { emitRouterDevtoolsEvent } from "./devtools.js";
import { escapeHtmlAttribute, escapeHtmlText } from "@reckona/mreact-shared/html-escape";
import {
  isCurrentPrerenderedRoute,
  replayedPrerenderedRouteHeaders,
  validatedPrerenderedNavigationHtml,
} from "../prerender-entry.js";

/** Re-exports build manifest contracts used by Cloudflare handlers. */
export type {
  BuiltPrerenderedRoute,
  BuiltRouteSourceAnalysisSummary,
  BuiltServerActionExpressionReference,
  BuiltServerActionReference,
  BuiltServerManifest,
  BuiltServerModuleArtifact,
  BuiltServerModuleOutput,
} from "../build.js";
/** Re-exports client manifest contracts used by Cloudflare handlers. */
export type { ClientRouteManifestEntry } from "../client.js";
/** Re-exports route cache policy contracts used by route manifests. */
export type { RouteCachePolicy } from "../cache.js";
/** Re-exports logger contracts used by Cloudflare handlers. */
export type {
  AppRouterCspInlineNonceWarningLogEvent,
  AppRouterLogger,
  AppRouterLogError,
  AppRouterLogEvent,
  AppRouterRenderTimingLogEvent,
  AppRouterRequestEndLogEvent,
  AppRouterRequestErrorLogEvent,
  AppRouterRequestStartLogEvent,
  AppRouterRequestTimingLogEvent,
  AppRouterRuntime,
  AppRouterUpgradeErrorLogEvent,
  AppRouterUpgradeRejectedLogEvent,
} from "../logger.js";
/** Re-exports response hook contracts used by Cloudflare handlers. */
export type { AppRouterResponseHook, AppRouterResponseHookContext } from "../render.js";
/** Re-exports route contracts used by Cloudflare handlers. */
export type {
  AppAssetRoute,
  AppMetadataRoute,
  AppRoute,
  CompiledRouteMatcherEntry,
  CompiledRouteMatcherArtifact,
  CompiledRouteMatcherSegment,
  PageRoute,
  ServerRoute,
  RouteSegment,
} from "../routes.js";
/** Re-exports prerender store contracts used by Cloudflare handlers. */
export type { AppRouterPrerenderStore } from "../serve.js";
/** Re-exports metadata contracts used by Cloudflare route modules. */
export type {
  GenerateMetadataContext,
  MetadataImage,
  MetadataScalar,
  MetadataThemeColor,
  MetadataViewport,
  RouteHeadDescriptor,
  RouteMetadata,
  RouteParams,
  RouteSecurityHeaders,
  RouteStrictTransportSecurity,
} from "../types.js";
/** Re-exports file convention contracts used by Cloudflare route manifests. */
export type { AppFileConvention } from "../file-conventions.js";

/**
 * Represents the Cloudflare Worker execution context used by router handlers.
 */
export interface CloudflareExecutionContext {
  passThroughOnException(): void;
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Loads static assets for Cloudflare router requests.
 */
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

/**
 * Provides manifests, environment, and execution context to Cloudflare rendering.
 */
export interface CloudflareRenderContext<Env = unknown> {
  clientManifest: CloudflareClientManifest;
  context: CloudflareExecutionContext;
  env: Env;
  serverManifest: BuiltServerManifest;
}

/**
 * Configures a Cloudflare Worker request handler for app-router output.
 */
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

/**
 * Defines the Cloudflare Worker `fetch` handler shape returned by router adapters.
 */
export interface CloudflareRequestHandler<Env = unknown> {
  fetch(request: Request, env: Env, context: CloudflareExecutionContext): Promise<Response>;
}

/**
 * Provides route match data to Cloudflare built-route rendering.
 */
export interface CloudflareBuiltRouteRenderContext<
  Env = unknown,
> extends CloudflareRenderContext<Env> {
  params: Record<string, readonly string[] | string>;
  route: AppRoute;
}

/**
 * Provides loader context to Cloudflare route modules.
 */
export interface CloudflareRouteModuleLoaderContext<
  Env = unknown,
> extends CloudflareBuiltRouteRenderContext<Env> {
  queryClient: QueryClient;
  request: Request;
}

/**
 * Provides request context to Cloudflare server route handlers.
 */
export interface CloudflareServerRouteContext<
  Env = unknown,
> extends CloudflareBuiltRouteRenderContext<Env> {
  request: Request;
}

/**
 * Provides props to Cloudflare route module components.
 */
export interface CloudflareRouteModuleComponentProps<
  Data = unknown,
  Env = unknown,
> extends CloudflareBuiltRouteRenderContext<Env> {
  data: Data;
  queryClient: QueryClient;
  request: import("../types.js").RouteLocation;
}

/**
 * Renders a Cloudflare route module response body or `Response`.
 */
export type CloudflareRouteModuleComponent<Data = unknown, Env = unknown> = (
  props: CloudflareRouteModuleComponentProps<Data, Env>,
  request?: Request,
) => Response | string | PromiseLike<Response | string>;

/**
 * Defines the exports accepted from a Cloudflare page route module.
 */
export interface CloudflareRouteModule<Data = unknown, Env = unknown> {
  [exportName: string]: unknown;
  App?: CloudflareRouteModuleComponent<Data, Env> | undefined;
  CloudflareRouteComponent?: CloudflareRouteModuleComponent<Data, Env> | undefined;
  default?: CloudflareRouteModuleComponent<Data, Env> | undefined;
  generateMetadata?:
    | ((
        context: GenerateMetadataContext<Data>,
      ) => RouteMetadata | PromiseLike<RouteMetadata | undefined> | undefined)
    | undefined;
  loader?:
    | ((context: CloudflareRouteModuleLoaderContext<Env>) => Data | PromiseLike<Data>)
    | undefined;
  metadata?: RouteMetadata | undefined;
}

/**
 * Handles a Cloudflare server route request.
 */
export type CloudflareServerRouteHandler<Env = unknown> = (
  request: Request,
  context: CloudflareServerRouteContext<Env>,
) => unknown | PromiseLike<unknown>;

/**
 * Defines HTTP method exports accepted from a Cloudflare server route module.
 */
export interface CloudflareServerRouteModule<Env = unknown> {
  ALL?: CloudflareServerRouteHandler<Env> | undefined;
  DELETE?: CloudflareServerRouteHandler<Env> | undefined;
  default?: CloudflareServerRouteHandler<Env> | undefined;
  GET?: CloudflareServerRouteHandler<Env> | undefined;
  HEAD?: CloudflareServerRouteHandler<Env> | undefined;
  OPTIONS?: CloudflareServerRouteHandler<Env> | undefined;
  PATCH?: CloudflareServerRouteHandler<Env> | undefined;
  POST?: CloudflareServerRouteHandler<Env> | undefined;
  PUT?: CloudflareServerRouteHandler<Env> | undefined;
}

/**
 * Provides request context to Cloudflare metadata route modules.
 */
export interface CloudflareMetadataRouteContext {
  baseUrl: string;
  host: string;
  params: Record<string, readonly string[] | string>;
  request: Request;
}

/**
 * Defines the default export accepted from a Cloudflare metadata route module.
 */
export interface CloudflareMetadataRouteModule {
  default?:
    | ((context: CloudflareMetadataRouteContext) => unknown | PromiseLike<unknown>)
    | undefined;
}

/**
 * Represents one registered Cloudflare route module entry.
 */
export type CloudflareRouteModuleRegistryEntry<Env = unknown> =
  | CloudflareRouteModule<unknown, Env>
  | CloudflareMetadataRouteModule
  | CloudflareServerRouteModule<Env>;

/**
 * Maps generated route module file keys to Cloudflare route modules or lazy loaders.
 */
export type CloudflareRouteModuleRegistry<Env = unknown> = Record<
  string,
  | CloudflareRouteModuleRegistryEntry<Env>
  | (() =>
      | CloudflareRouteModuleRegistryEntry<Env>
      | PromiseLike<CloudflareRouteModuleRegistryEntry<Env>>)
>;

/**
 * Configures the Cloudflare route module renderer.
 */
export interface CloudflareRouteModuleRendererOptions<Env = unknown> {
  dehydrateOptions?: DehydrateOptions | undefined;
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

/**
 * Represents an import glob of Cloudflare route modules.
 */
export type CloudflareRouteModuleGlob<Env = unknown> = Record<
  string,
  | CloudflareRouteModuleRegistryEntry<Env>
  | (() =>
      | CloudflareRouteModuleRegistryEntry<Env>
      | PromiseLike<CloudflareRouteModuleRegistryEntry<Env>>)
>;

/**
 * Configures collection of Cloudflare route modules from a built manifest.
 */
export interface CollectCloudflareRouteModulesOptions {
  manifest: BuiltServerManifest;
}

/**
 * Configures a Cloudflare request handler that renders matched built routes.
 */
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

/**
 * Describes client assets and route metadata used by Cloudflare handlers.
 */
export interface CloudflareClientManifest {
  assets?: readonly string[] | undefined;
  publicAssets?: readonly string[] | undefined;
  routes: ClientRouteManifestEntry[];
}

/**
 * Represents a Cloudflare asset binding with a `fetch` method.
 */
export interface CloudflareAssetBinding {
  fetch(request: Request): Response | Promise<Response>;
}

/**
 * Configures static asset loading from a Cloudflare asset binding.
 */
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

/**
 * Defines the Cloudflare Cache API subset used by prerender stores.
 */
export interface CloudflareCache {
  delete(request: Request | string): boolean | Promise<boolean>;
  match(request: Request | string): Response | Promise<Response | undefined> | undefined;
  put(request: Request | string, response: Response): void | Promise<void>;
}

/**
 * Configures a Cloudflare Cache API backed prerender store.
 */
export interface CloudflarePrerenderStoreOptions {
  cache: CloudflareCache;
  keyOrigin?: string | undefined;
  keyPrefix?: string | undefined;
}

const clientPrefix = "/_mreact/client/";
const cloudflareMiddlewareRouteModuleKey = "__middleware__";
const defaultPrerenderCacheOrigin = "https://mreact.local";
const defaultPrerenderCachePrefix = "/_mreact/prerender";

/**
 * Creates a Cloudflare Worker `fetch` handler from manifests, asset loading, and an optional renderer.
 *
 * The handler serves generated client assets and prerendered routes before calling `render`, preserves streamed HTML responses, and routes errors through `onError` when provided.
 */
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

/**
 * Creates a Cloudflare Worker handler that matches built app-router routes before rendering.
 *
 * Pair it with `createCloudflareRouteModuleRenderer()` and the generated route module registry from Cloudflare-target builds.
 */
export function createCloudflareBuiltRequestHandler<Env = unknown>(
  options: CloudflareBuiltRequestHandlerOptions<Env>,
): CloudflareRequestHandler<Env> {
  const sortedRoutes = [...options.serverManifest.routes].sort(compareCloudflareRoutes);

  return createCloudflareRequestHandler({
    ...options,
    render(request, context) {
      const matched = matchCloudflareRoute(sortedRoutes, new URL(request.url).pathname);

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

/**
 * Creates the renderer used by the generated Cloudflare Worker route registry.
 *
 * It loads matched route modules, dispatches server route handlers, evaluates loaders and metadata, and renders page routes with Cloudflare request context.
 */
export function createCloudflareRouteModuleRenderer<Env = unknown>(
  options: CloudflareRouteModuleRendererOptions<Env>,
): NonNullable<CloudflareBuiltRequestHandlerOptions<Env>["renderRoute"]> {
  return async (request, context) => {
    const middlewareResult = await resolveCloudflareRouteModuleMiddleware(options.modules, request);
    if (middlewareResult.type === "response") {
      return middlewareResult.response;
    }

    if (middlewareResult.request !== request) {
      // The route was matched against the pre-middleware URL, so a rewrite has
      // to re-match: otherwise the rewritten path would still render the module
      // the visitor asked for, which is the module a rewrite is often used to
      // keep them away from. The built runtime re-matches the same way.
      request = middlewareResult.request;
      const rematched = matchCloudflareRoute(
        sortedCloudflareRoutes(context.serverManifest),
        new URL(request.url).pathname,
      );

      if (rematched === undefined) {
        return new Response("Not Found", { status: 404 });
      }

      context = { ...context, params: rematched.params, route: rematched.route };
    }

    // Middleware apps skip the prerendered fast path in `handleCloudflareRequest`
    // so that access gates run first, so the stored HTML is resolved here
    // instead, against the post-middleware path.
    const prerendered = prerenderedResponse(
      context.serverManifest.prerenderedRoutes,
      normalizeRoutePath(new URL(request.url).pathname),
      request,
      isCloudflareNavigationRequest(request),
    );

    if (prerendered !== undefined) {
      return prerendered;
    }

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
      return withDefaultSecurityHeaders(
        await dispatchCloudflareServerRoute(module as CloudflareServerRouteModule<Env>, request, {
          ...context,
          request,
        }),
        request,
      );
    }

    if (context.route.kind === "metadata") {
      return withDefaultSecurityHeaders(
        await dispatchCloudflareMetadataRoute(module as CloudflareMetadataRouteModule, request, {
          ...context,
          request,
        }),
        request,
      );
    }

    const pageModule = module as CloudflareRouteModule<unknown, Env>;
    const component = selectCloudflarePageComponent(pageModule);
    const queryClient = createQueryClient();

    if (component === undefined) {
      return new Response(
        `No Cloudflare page component registered for ${context.route.file}. Module exports: ${describeCloudflareModuleExports(pageModule)}.`,
        {
          headers: { "content-type": "text/plain; charset=utf-8" },
          status: 500,
        },
      );
    }

    const loaderContext = {
      ...context,
      queryClient,
      request,
    };
    let data: unknown;

    try {
      data =
        pageModule.loader === undefined
          ? undefined
          : await runWithCloudflareQueryClient(queryClient, () =>
              pageModule.loader!(loaderContext),
            );
    } catch (error) {
      if (error instanceof Response) {
        return error;
      }

      if (isRedirectError(error)) {
        return new Response(null, {
          headers: { location: error.location },
          status: error.status,
        });
      }

      if (isNotFoundError(error)) {
        return cloudflareNotFoundResponse(request);
      }

      throw error;
    }

    if (data instanceof Response) {
      return data;
    }

    const props = {
      ...context,
      data,
      queryClient,
      request: routeLocationFromRequest(request),
    };
    let rendered: Awaited<ReturnType<typeof component>>;

    try {
      rendered = await runWithCloudflareQueryClient(queryClient, () => component(props, request));
    } catch (error) {
      if (isRedirectError(error)) {
        return new Response(null, {
          headers: { location: error.location },
          status: error.status,
        });
      }

      if (isNotFoundError(error)) {
        return cloudflareNotFoundResponse(request);
      }

      throw error;
    }

    const metadata = await runWithCloudflareQueryClient(queryClient, () =>
      resolveCloudflareRouteMetadata([pageModule], { ...props, request }),
    );

    if (rendered instanceof Response) {
      if (
        (
          pageModule as CloudflareRouteModule<unknown, Env> & {
            __mreactSecurityHeadersApplied?: boolean | undefined;
          }
        ).__mreactSecurityHeadersApplied === true
      ) {
        return rendered;
      }

      return withDefaultSecurityHeaders(rendered, request, metadata);
    }

    const modulePreload = cloudflareModulePreloadTag(context.clientManifest, context.route.path);
    const body = withCloudflareHydrationMarkers({
      data,
      html: rendered,
      manifest: context.clientManifest,
      params: context.params,
      request,
      routePath: context.route.path,
    });
    const documented =
      options.document === undefined
        ? defaultCloudflareDocument(body, modulePreload, metadata)
        : await runWithCloudflareQueryClient(queryClient, () =>
            options.document!({
              ...props,
              body,
              modulePreload,
            }),
          );
    const documentedWithQueryState = await injectCloudflareQueryState(
      documented,
      dehydrate(queryClient, options.dehydrateOptions),
    );

    return withDefaultSecurityHeaders(
      documentedWithQueryState instanceof Response
        ? documentedWithQueryState
        : new Response(documentedWithQueryState, {
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      request,
      metadata,
    );
  };
}

async function resolveCloudflareRouteModuleMiddleware<Env>(
  modules: CloudflareRouteModuleRegistry<Env>,
  request: Request,
): Promise<{ request: Request; type: "continue" } | { response: Response; type: "response" }> {
  const module = (await loadCloudflareRouteModule(modules, cloudflareMiddlewareRouteModuleKey)) as
    | MiddlewareModule
    | undefined;

  if (module === undefined || !middlewareMatches(module.config, new URL(request.url).pathname)) {
    return { request, type: "continue" };
  }

  const middleware = module.middleware ?? module.default;
  if (typeof middleware !== "function") {
    return { request, type: "continue" };
  }

  const response = await middleware(request);
  if (!(response instanceof Response)) {
    return { request, type: "continue" };
  }

  const location = rewriteLocation(response);
  if (location !== undefined) {
    return {
      request: new Request(new URL(location, request.url), request),
      type: "continue",
    };
  }

  return { response, type: "response" };
}

async function injectCloudflareQueryState<T extends Response | string>(
  document: T,
  state: DehydratedQueryClient,
): Promise<T | Response | string> {
  if (state.queries.length === 0) {
    return document;
  }

  if (typeof document === "string") {
    return injectCloudflareQueryStateScript(document, state);
  }

  const contentType = document.headers.get("content-type") ?? "";
  if (!/^text\/html\b/i.test(contentType)) {
    return document;
  }

  const headers = new Headers(document.headers);
  headers.delete("content-length");
  return new Response(injectCloudflareQueryStateScript(await document.text(), state), {
    headers,
    status: document.status,
    statusText: document.statusText,
  });
}

function injectCloudflareQueryStateScript(html: string, state: DehydratedQueryClient): string {
  const script = `<script type="application/json" id="${__MREACT_QUERY_STATE_SCRIPT_ID}">${escapeJsonForHtml(
    JSON.stringify(state),
  )}</script>`;

  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, () => `${script}</body>`)
    : `${html}${script}`;
}

async function runWithCloudflareQueryClient<T>(
  queryClient: QueryClient,
  fn: () => T,
): Promise<Awaited<T>> {
  if (cloudflareQueryClientFallbackInstalled) {
    installQueryAsyncStorage(cloudflareQueryClientStorage);
    return await runWithSerializedCloudflareQueryClient(queryClient, fn);
  }

  try {
    return await runWithQueryClient(queryClient, fn);
  } catch (error) {
    if (isQueryClientScopeUnavailableError(error)) {
      installQueryAsyncStorage(cloudflareQueryClientStorage);
      cloudflareQueryClientFallbackInstalled = true;
      console.warn(
        '[mreact] Cloudflare AsyncLocalStorage is unavailable. Enable the "nodejs_compat" compatibility flag; rendering is serialized until native request-local storage is available.',
      );
      return await runWithSerializedCloudflareQueryClient(queryClient, fn);
    }

    throw error;
  }
}

const cloudflareQueryClientStorage = createCloudflareQueryClientStorage();
let cloudflareQueryClientFallbackQueue: Promise<void> = Promise.resolve();
let cloudflareQueryClientFallbackInstalled = false;

export function __resetCloudflareQueryClientFallbackForTesting(): void {
  cloudflareQueryClientFallbackQueue = Promise.resolve();
  cloudflareQueryClientFallbackInstalled = false;
}

async function runWithSerializedCloudflareQueryClient<T>(
  queryClient: QueryClient,
  fn: () => T,
): Promise<Awaited<T>> {
  const previous = cloudflareQueryClientFallbackQueue;
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  cloudflareQueryClientFallbackQueue = previous.then(
    () => current,
    () => current,
  );

  await previous;

  try {
    return await runWithQueryClient(queryClient, fn);
  } finally {
    releaseCurrent();
  }
}

function createCloudflareQueryClientStorage(): QueryAsyncStorage<QueryClient> {
  const stores: QueryClient[] = [];

  return {
    getStore() {
      return stores.at(-1);
    },
    run<TResult>(store: QueryClient, callback: () => TResult): TResult {
      stores.push(store);
      let popSynchronously = true;

      try {
        const result = callback();

        if (isPromiseLike(result)) {
          popSynchronously = false;
          return Promise.resolve(result).finally(() => {
            removeCloudflareQueryClientStore(stores, store);
          }) as TResult;
        }

        return result;
      } finally {
        if (popSynchronously) {
          removeCloudflareQueryClientStore(stores, store);
        }
      }
    },
  };
}

function removeCloudflareQueryClientStore(stores: QueryClient[], store: QueryClient): void {
  const index = stores.lastIndexOf(store);

  if (index >= 0) {
    stores.splice(index, 1);
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

async function dispatchCloudflareServerRoute<Env>(
  module: CloudflareServerRouteModule<Env>,
  request: Request,
  context: CloudflareServerRouteContext<Env>,
): Promise<Response> {
  const handler =
    module[request.method as keyof CloudflareServerRouteModule<Env>] ??
    module.ALL ??
    module.default;

  if (typeof handler !== "function") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let response: unknown;

  try {
    response = await handler(request, context);
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

const cloudflareReservedPageModuleExportNames = new Set([
  "ALL",
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "App",
  "CloudflareRouteComponent",
  "default",
  "generateMetadata",
  "generateStaticParams",
  "loader",
  "metadata",
  "middleware",
  "prerender",
  "revalidate",
  "slots",
  "stream",
]);

function selectCloudflarePageComponent<Data, Env>(
  module: CloudflareRouteModule<Data, Env>,
): CloudflareRouteModuleComponent<Data, Env> | undefined {
  const defaultExport = readCloudflareModuleExport(module, "default");
  if (typeof defaultExport === "function") {
    return defaultExport as CloudflareRouteModuleComponent<Data, Env>;
  }

  const appExport = readCloudflareModuleExport(module, "App");
  if (typeof appExport === "function") {
    return appExport as CloudflareRouteModuleComponent<Data, Env>;
  }

  const cloudflareRouteComponentExport = readCloudflareModuleExport(
    module,
    "CloudflareRouteComponent",
  );
  if (typeof cloudflareRouteComponentExport === "function") {
    return cloudflareRouteComponentExport as CloudflareRouteModuleComponent<Data, Env>;
  }

  for (const name of Object.keys(module)) {
    const value = readCloudflareModuleExport(module, name);
    if (!cloudflareReservedPageModuleExportNames.has(name) && typeof value === "function") {
      return value as CloudflareRouteModuleComponent<Data, Env>;
    }
  }

  return undefined;
}

function readCloudflareModuleExport(module: object, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(module, name);
  if (descriptor === undefined) {
    return undefined;
  }

  if ("value" in descriptor) {
    return descriptor.value;
  }

  return descriptor.get?.call(module);
}

const cloudflareDiagnosticPageModuleExportNames = [
  "default",
  "App",
  "CloudflareRouteComponent",
  "slots",
] as const;

// Fixed names + typeof only (never values) so the 500 response is useful without
// listing app-specific export names. Accessors are not invoked.
function describeCloudflareModuleExports(module: object): string {
  const described = cloudflareDiagnosticPageModuleExportNames.map(
    (name) => `${name}=${typeofCloudflareModuleExport(module, name)}`,
  );

  return described.join(", ");
}

function typeofCloudflareModuleExport(module: object, name: string): string {
  const descriptor = Object.getOwnPropertyDescriptor(module, name);
  if (descriptor === undefined) {
    return "absent";
  }

  if (!("value" in descriptor)) {
    return "accessor";
  }

  return typeof descriptor.value;
}

async function dispatchCloudflareMetadataRoute(
  module: CloudflareMetadataRouteModule,
  request: Request,
  context: CloudflareBuiltRouteRenderContext & { request: Request },
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      headers: { allow: "GET, HEAD" },
      status: 405,
    });
  }

  if (typeof module.default !== "function") {
    return new Response("Invalid metadata route response", { status: 500 });
  }

  const url = new URL(request.url);
  const value = await module.default({
    baseUrl: url.origin,
    host: url.host,
    params: context.params,
    request,
  });

  if (value instanceof Response) {
    return value;
  }

  if (context.route.kind !== "metadata") {
    return new Response("Invalid metadata route convention", { status: 500 });
  }

  if (context.route.convention === "robots") {
    return new Response(serializeCloudflareRobots(value as RobotsManifest), {
      headers: {
        "cache-control": "public, max-age=3600",
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  if (context.route.convention === "sitemap") {
    return new Response(serializeCloudflareSitemap(value as readonly SitemapEntry[]), {
      headers: {
        "cache-control": "no-cache",
        "content-type": "application/xml; charset=utf-8",
      },
    });
  }

  if (context.route.convention === "manifest") {
    return new Response(JSON.stringify(value as ManifestDescriptor), {
      headers: {
        "cache-control": "public, max-age=3600",
        "content-type": "application/manifest+json; charset=utf-8",
      },
    });
  }

  if (context.route.convention === "opengraph-image") {
    const body = value instanceof Uint8Array ? value.slice().buffer : String(value);
    return new Response(body, {
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

function isCloudflareNavigationRequest(request: Request): boolean {
  return request.headers.get("x-mreact-navigation") === "1";
}

function cloudflareDocumentReloadNavigationResponse(): Response {
  return new Response(null, {
    headers: { "x-mreact-navigation": "reload" },
    status: 204,
  });
}

function withDefaultSecurityHeaders(
  response: Response,
  request: Request,
  metadata?: RouteMetadata | undefined,
): Response {
  const headers = new Headers(response.headers);
  const csp = contentSecurityPolicy(metadata?.csp);

  if (
    isHtmlContentType(headers.get("content-type")) &&
    csp !== undefined &&
    !headers.has("content-security-policy")
  ) {
    headers.set("content-security-policy", csp);
  }

  for (const [name, value] of Object.entries(
    routeSecurityHeaders({ request, security: metadata?.security }),
  )) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

/**
 * Validates and normalizes a Vite `import.meta.glob` map into a Cloudflare route module registry.
 *
 * Every manifest route that needs a module must be present, and extra glob entries are rejected to catch stale generated workers.
 */
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

/**
 * Creates a Cloudflare asset loader that forwards only manifest-listed client and public asset paths.
 *
 * This keeps the Worker from passing arbitrary paths to the `ASSETS` binding while still serving generated route scripts, CSS, imports, source maps, and allowed public files.
 */
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

/**
 * Returns the set of client and public asset paths a Cloudflare Worker is allowed to serve.
 */
export function cloudflareClientAssetPaths(
  manifest: CloudflareClientManifest,
  options: { extraPaths?: readonly string[] | undefined; prefix?: string | undefined } = {},
): Set<string> {
  const prefix = normalizeAssetPrefix(options.prefix ?? clientPrefix);
  const paths = clientManifestAssetPaths(manifest, {
    extraPaths: options.extraPaths,
    prefix,
  });

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

/**
 * Creates an app-router prerender store backed by the Cloudflare Cache API.
 *
 * Keys are represented as synthetic requests so Workers cache entries can be shared by path and optional key prefix.
 */
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

  // Prerendered HTML may only short-circuit `render` when the app has no
  // middleware. Middleware runs inside `render`, so serving stored HTML here
  // would bypass auth, geo blocking and maintenance gates for exactly the
  // routes they are most often used to protect.
  const staticResponse = builtServerManifestHasMiddleware(options.serverManifest)
    ? undefined
    : prerenderedResponse(
        options.serverManifest.prerenderedRoutes,
        normalizeRoutePath(url.pathname),
        request,
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

function isCloudflarePublicAssetPath(
  manifest: CloudflareClientManifest,
  pathname: string,
): boolean {
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
  return cacheControl.split(",").some((part) => part.trim().toLowerCase() === normalizedDirective);
}

// `serverManifest.files` is keyed on paths relative to the project root, so a
// default `src/app` project stores the middleware as "src/app/middleware.ts".
// This mirrors `hasMiddleware` in built-runtime.ts, which resolves the same two
// names against the routes directory.
function builtServerManifestHasMiddleware(manifest: {
  files: Record<string, string>;
  routesDir?: string | undefined;
}): boolean {
  const routesDir = (manifest.routesDir ?? "").replaceAll("\\", "/").replace(/\/+$/, "");
  const prefix = routesDir === "" ? "" : `${routesDir}/`;

  return (
    manifest.files[`${prefix}middleware.ts`] !== undefined ||
    manifest.files[`${prefix}middleware.mreact.ts`] !== undefined
  );
}

function prerenderedResponse(
  prerenderedRoutes: Record<string, BuiltPrerenderedRoute> | undefined,
  path: string,
  request: Request,
  isNavigation: boolean,
): Response | undefined {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return undefined;
  }

  const prerendered = prerenderedRoutes?.[path];
  if (!isCurrentPrerenderedRoute(prerendered)) {
    return undefined;
  }

  const html = isNavigation ? validatedPrerenderedNavigationHtml(prerendered) : prerendered.html;
  if (html === undefined) {
    return cloudflareDocumentReloadNavigationResponse();
  }

  return new Response(request.method === "HEAD" ? null : html, {
    headers: replayedPrerenderedRouteHeaders(prerendered, request),
    status: prerendered.status,
  });
}

function cloudflareRouteRequiresModule(route: AppRoute, manifest: BuiltServerManifest): boolean {
  return (
    route.kind === "metadata" ||
    route.kind === "server" ||
    (route.kind === "page" &&
      (route.segments.some((segment) => segment.kind !== "static") ||
        !isCurrentPrerenderedRoute(manifest.prerenderedRoutes?.[route.path])))
  );
}

function cloudflareRouteGlobKeyMatchesRoute(key: string, routeFile: string): boolean {
  const normalizedKey = normalizeCloudflareRouteModulePath(key);
  const normalizedRoute = normalizeCloudflareRouteModulePath(routeFile);

  return normalizedKey === normalizedRoute || normalizedKey.endsWith(`/${normalizedRoute}`);
}

function normalizeCloudflareRouteModulePath(path: string): string {
  const withoutPrefix = path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");

  return withoutPrefix.replace(/\.(?:mjs|js|ts|tsx)$/, "");
}

// The manifest is the same object across requests, so a rewrite-heavy app pays
// for the specificity sort once rather than on every rewritten request.
const sortedRoutesByManifest = new WeakMap<BuiltServerManifest, readonly AppRoute[]>();

function sortedCloudflareRoutes(manifest: BuiltServerManifest): readonly AppRoute[] {
  const cached = sortedRoutesByManifest.get(manifest);

  if (cached !== undefined) {
    return cached;
  }

  const sorted = [...manifest.routes].sort(compareCloudflareRoutes);
  sortedRoutesByManifest.set(manifest, sorted);

  return sorted;
}

function matchCloudflareRoute(
  routes: readonly AppRoute[],
  pathname: string,
): { params: Record<string, readonly string[] | string>; route: AppRoute } | undefined {
  const normalizedPath = normalizeRoutePath(pathname);
  const pathSegments = normalizedPath === "/" ? [] : normalizedPath.slice(1).split("/");

  for (const route of routes) {
    const params: Record<string, readonly string[] | string> = {};
    const catchAllIndex = route.segments.findIndex((segment) => segment.kind === "catch-all");

    if (catchAllIndex === -1 && route.segments.length !== pathSegments.length) {
      continue;
    }

    if (
      catchAllIndex !== -1 &&
      pathSegments.length < catchAllIndex + 1 + route.segments.length - catchAllIndex - 1
    ) {
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

      const suffixSegments = route.segments.slice(index + 1);
      const catchAllEnd = pathSegments.length - suffixSegments.length;

      if (catchAllEnd <= index) {
        matched = false;
        break;
      }

      const decodedParts: string[] = [];
      for (const part of pathSegments.slice(index, catchAllEnd)) {
        const decoded = safeDecodePathSegment(part);
        if (decoded === undefined) {
          matched = false;
          break;
        }
        decodedParts.push(decoded);
      }
      params[segment.name] = decodedParts;

      for (let suffixIndex = 0; suffixIndex < suffixSegments.length; suffixIndex += 1) {
        const suffixSegment = suffixSegments[suffixIndex];
        const suffixValue = pathSegments[catchAllEnd + suffixIndex];

        if (suffixSegment === undefined || suffixValue === undefined) {
          matched = false;
          break;
        }

        if (suffixSegment.kind === "static") {
          if (suffixSegment.value !== suffixValue) {
            matched = false;
            break;
          }
          continue;
        }

        if (suffixSegment.kind === "dynamic") {
          const decoded = safeDecodePathSegment(suffixValue);
          if (decoded === undefined) {
            matched = false;
            break;
          }
          params[suffixSegment.name] = decoded;
          continue;
        }

        matched = false;
        break;
      }

      break;
    }

    if (matched) {
      return { params, route };
    }
  }

  return undefined;
}

function compareCloudflareRoutes(a: AppRoute, b: AppRoute): number {
  const scoreDelta = routeSpecificityScore(b) - routeSpecificityScore(a);

  return scoreDelta === 0
    ? a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind)
    : scoreDelta;
}

function routeSpecificityScore(route: AppRoute): number {
  return route.segments.reduce((score, segment) => {
    if (segment.kind === "static") {
      return score + 100;
    }

    if (segment.kind === "dynamic") {
      return score + 10;
    }

    return score;
  }, route.segments.length);
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

function withCloudflareHydrationMarkers(options: {
  data: unknown;
  html: string;
  manifest: CloudflareClientManifest;
  params: Record<string, readonly string[] | string>;
  request: Request;
  routePath: string;
}): string {
  const marker = cloudflareHydrationMarkerParts(options);

  return marker.prefix === "" && marker.suffix === ""
    ? options.html
    : `${marker.prefix}${options.html}${marker.suffix}`;
}

function cloudflareHydrationMarkerParts(options: {
  data: unknown;
  manifest: CloudflareClientManifest;
  params: Record<string, readonly string[] | string>;
  request: Request;
  routePath: string;
}): { prefix: string; suffix: string } {
  const route = options.manifest.routes.find(
    (route) => route.path === options.routePath && route.client === true,
  );

  if (route?.script === undefined) {
    return { prefix: "", suffix: "" };
  }

  const routeId = route.routeId ?? cloudflareRouteIdForPath(options.routePath);
  const escapedRouteId = escapeHtmlAttribute(routeId);
  const requestUrl = new URL(options.request.url);
  const propsJson = escapeScriptJson(
    JSON.stringify({
      params: options.params,
      request: {
        hash: "",
        pathname: requestUrl.pathname,
        search: "",
        url: requestUrl.pathname,
      },
      data: options.data,
    }),
  );
  const clientReferencesJson =
    route.clientReferenceManifest === undefined || route.clientReferenceManifest.length === 0
      ? undefined
      : escapeScriptJson(JSON.stringify(route.clientReferenceManifest));

  return {
    prefix: `<div data-mreact-route-id="${escapedRouteId}">`,
    suffix: [
      "</div>",
      `<script type="application/json" id="mreact-props-${escapedRouteId}">${propsJson}</script>`,
      clientReferencesJson === undefined
        ? undefined
        : `<script type="application/json" id="mreact-client-references-${escapedRouteId}">${clientReferencesJson}</script>`,
      `<script type="module" src="/_mreact/client/${escapeHtmlAttribute(route.script)}"></script>`,
    ]
      .filter((part): part is string => part !== undefined)
      .join(""),
  };
}

function escapeScriptJson(json: string): string {
  return escapeJsonForHtml(json);
}

function escapeJsonForHtml(value: string): string {
  return value
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function cloudflareRouteIdForPath(path: string): string {
  if (path === "/") {
    return "index";
  }

  return path
    .slice(1)
    .replaceAll("/", "_")
    .replaceAll(":", "_")
    .replace(/[^A-Za-z0-9_$-]/g, "_");
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

async function resolveCloudflareRouteMetadata<Data, Env>(
  modules: readonly CloudflareRouteModule<Data, Env>[],
  context: GenerateMetadataContext<Data>,
): Promise<RouteMetadata | undefined> {
  const metadata: RouteMetadata[] = [];

  for (const module of modules) {
    let next = validateRouteMetadata(module.metadata);

    if (module.generateMetadata !== undefined) {
      const generated = await module.generateMetadata(context);
      next = mergeCloudflareRouteMetadata(
        [next, validateRouteMetadata(generated, "generateMetadata")].filter(
          isCloudflareRouteMetadata,
        ),
      );
    }

    if (next !== undefined) {
      metadata.push(next);
    }
  }

  return validateRouteMetadata(mergeCloudflareRouteMetadata(metadata));
}

function isCloudflareRouteMetadata(value: RouteMetadata | undefined): value is RouteMetadata {
  return value !== undefined;
}

function mergeCloudflareRouteMetadata(
  metadata: readonly RouteMetadata[],
): RouteMetadata | undefined {
  if (metadata.length === 0) {
    return undefined;
  }

  return metadata.reduce<RouteMetadata>((merged, next) => {
    const openGraph = mergeCloudflareMetadataObject(merged.openGraph, next.openGraph);
    const openGraphImages = mergeCloudflareMetadataArrays(
      merged.openGraph?.images,
      next.openGraph?.images,
    );

    const alternates = mergeCloudflareMetadataObject(merged.alternates, next.alternates);
    const csp = mergeCloudflareMetadataObject(merged.csp, next.csp);
    const head = mergeCloudflareMetadataArrays(merged.head, next.head);
    const icons = mergeCloudflareMetadataObject(merged.icons, next.icons);
    const mergedMetadata: RouteMetadata = {
      ...merged,
      ...next,
      ...(alternates === undefined ? {} : { alternates }),
      ...(csp === undefined ? {} : { csp }),
      ...(head === undefined ? {} : { head }),
      ...(icons === undefined ? {} : { icons }),
      ...(openGraph === undefined && openGraphImages === undefined
        ? {}
        : {
            openGraph: {
              ...openGraph,
              ...(openGraphImages === undefined ? {} : { images: openGraphImages }),
            },
          }),
    };

    return mergedMetadata;
  }, {});
}

function mergeCloudflareMetadataObject<T extends object>(
  left: T | undefined,
  right: T | undefined,
): T | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }

  return { ...left, ...right };
}

function mergeCloudflareMetadataArrays<T>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined,
): readonly T[] | undefined {
  if (left === undefined || left.length === 0) {
    return right;
  }
  if (right === undefined || right.length === 0) {
    return left;
  }

  return [...left, ...right];
}

function defaultCloudflareDocument(
  body: string,
  modulePreload: string,
  metadata: RouteMetadata | undefined,
): string {
  return `<!DOCTYPE html><html><head>${modulePreload}${cloudflareMetadataTitle(metadata)}</head><body>${body}</body></html>`;
}

function cloudflareMetadataTitle(metadata: RouteMetadata | undefined): string {
  if (metadata?.title === undefined) {
    return "";
  }

  return `<title>${escapeHtmlText(metadataString(metadata.title))}</title>`;
}

function metadataString(value: boolean | number | string): string {
  return String(value);
}

function serializeCloudflareRobots(manifest: RobotsManifest): string {
  const lines: string[] = [];
  const rules =
    manifest.rules === undefined
      ? []
      : Array.isArray(manifest.rules)
        ? manifest.rules
        : [manifest.rules];

  for (const rule of rules) {
    for (const userAgent of arrayValue(rule.userAgent)) {
      lines.push(`User-agent: ${userAgent}`);
    }
    for (const allow of arrayValue(rule.allow)) {
      lines.push(`Allow: ${allow}`);
    }
    for (const disallow of arrayValue(rule.disallow)) {
      lines.push(`Disallow: ${disallow}`);
    }
  }

  for (const sitemap of arrayValue(manifest.sitemap)) {
    lines.push(`Sitemap: ${sitemap}`);
  }
  if (manifest.host !== undefined) {
    lines.push(`Host: ${manifest.host}`);
  }

  return `${lines.join("\n")}\n`;
}

function serializeCloudflareSitemap(entries: readonly SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const fields = [
        `<loc>${escapeXml(entry.url)}</loc>`,
        entry.lastModified === undefined
          ? undefined
          : `<lastmod>${escapeXml(sitemapDate(entry.lastModified))}</lastmod>`,
        entry.changeFrequency === undefined
          ? undefined
          : `<changefreq>${escapeXml(entry.changeFrequency)}</changefreq>`,
        entry.priority === undefined ? undefined : `<priority>${entry.priority}</priority>`,
      ].filter((field): field is string => field !== undefined);

      return `<url>${fields.join("")}</url>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

function sitemapDate(value: Date | number | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "number" ? new Date(value).toISOString() : value;
}

function arrayValue<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? (value as readonly T[]) : [value as T];
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cloudflareNotFoundResponse(request: Request): Response {
  return withDefaultSecurityHeaders(
    new Response("<!DOCTYPE html><html><head></head><body>Not Found</body></html>", {
      headers: { "content-type": "text/html; charset=utf-8" },
      status: 404,
    }),
    request,
  );
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
