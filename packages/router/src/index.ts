export { buildApp, packageAwsLambdaArtifact, packageCloudflarePagesArtifact } from "./build.js";
export { assetHref, assetPreloadLinks } from "./assets.js";
export { cacheControl, createMemoryRouteCache, revalidatePath } from "./cache.js";
export { deleteCookie, parseCookieHeader, serializeCookie, setCookie } from "./cookies.js";
export { defineMessages, detectLocale } from "./i18n.js";
export { defer, isDeferredLoaderData } from "./deferred.js";
export type { DeferredLoaderData } from "./deferred.js";
export { definePage } from "./types.js";
export { Link, linkProps } from "./link.js";
export { href } from "./typed-routes.js";
export { parseMultipartStream } from "./multipart.js";
export type {
  MultipartFixedLengthStream,
  MultipartStreamFieldOptions,
  MultipartStreamParseOptions,
  MultipartStreamPart,
} from "./multipart.js";
export { getNavigationState, subscribeNavigationState } from "./navigation-state.js";
export { getRouterRuntimeCacheStats } from "./runtime-cache.js";
export type { HttpUpgradeHandler } from "./upgrade.js";
export {
  cookies,
  headers,
  html,
  isNotFoundError,
  isRedirectError,
  json,
  next,
  notFound,
  parseForm,
  redirect,
  redirect303,
  redirectExternal,
  rewrite,
  textError,
  throwNotFound,
} from "./navigation.js";
export type { ParseSchema } from "./navigation.js";
export { createMemoryPrerenderStore } from "./prerender-store.js";
export { getServerRuntimeState } from "./runtime-state.js";
import {
  createMemorySessionStore as createMemorySessionStoreInternal,
  createSession as createSessionInternal,
  destroySession as destroySessionInternal,
  getSession as getSessionInternal,
  rotateSession as rotateSessionInternal,
} from "./session.js";
import type {
  MemorySessionStoreOptions as MemorySessionStoreOptionsInternal,
  SessionCookieOptions as SessionCookieOptionsInternal,
  SessionRecord as SessionRecordInternal,
  SessionStore as SessionStoreInternal,
} from "./session.js";

/**
 * @deprecated Import session helpers from `@reckona/mreact-auth` instead.
 */
export const createMemorySessionStore = createMemorySessionStoreInternal;
/**
 * @deprecated Import session helpers from `@reckona/mreact-auth` instead.
 */
export const createSession = createSessionInternal;
/**
 * @deprecated Import session helpers from `@reckona/mreact-auth` instead.
 */
export const destroySession = destroySessionInternal;
/**
 * @deprecated Import session helpers from `@reckona/mreact-auth` instead.
 */
export const getSession = getSessionInternal;
/**
 * @deprecated Import session helpers from `@reckona/mreact-auth` instead.
 */
export const rotateSession = rotateSessionInternal;
export type {
  AwsLambdaArtifactManifest,
  BuildAppPhase,
  BuildAppPhaseTiming,
  BuildAppOptions,
  BuildAppProgressEvent,
  BuildAppResult,
  BuiltImportPolicyArtifact,
  CloudflarePagesArtifactManifest,
  PackageAwsLambdaArtifactOptions,
  PackageCloudflarePagesArtifactOptions,
} from "./build.js";
export type { ServerActionContext } from "./actions.js";
export type {
  AppRouteHref,
  AppRouteLinkHref,
  DynamicHrefOptions,
  RouteParamsFor,
  RouteSearchParams,
  RouteSearchValue,
  StaticHrefOptions,
} from "./typed-routes.js";
export type {
  InferLoaderData,
  InferLoaderParams,
  LayoutProps,
  LoaderContext,
  GenerateMetadataContext,
  ManifestContext,
  ManifestDescriptor,
  MetadataImage,
  MetadataScalar,
  MetadataThemeColor,
  MetadataViewport,
  MReactNode,
  PageProps,
  PageComponent,
  RobotsContext,
  RobotsManifest,
  RobotsRule,
  RouteHeadDescriptor,
  RouteHandlerContext,
  RouteLoader,
  RouteMetadata,
  RouteParams,
  RouteSecurityHeaders,
  RouteStrictTransportSecurity,
  SitemapContext,
  SitemapEntry,
} from "./types.js";
export type {
  AppRouterBuildTarget,
  AppRouterClientConsoleMethod,
  AppRouterClientSourceMapMode,
  AppRouterClientSourceMapOption,
  AppRouterProductionOptions,
} from "./config.js";
export type {
  AssetHelperOptions,
  AssetLinkDescriptor,
  AssetManifest,
  AssetManifestEntry,
} from "./assets.js";
export type {
  AppRouterCache,
  AppRouterCacheEntry,
  CacheControlOptions,
  MemoryRouteCacheOptions,
  RouteCachePolicy,
} from "./cache.js";
export type { CookieOptions } from "./cookies.js";
export type { AppRouterImportPolicy } from "./import-policy.js";
export type {
  LinkChild,
  LinkOptions,
  LinkPrefetch,
  LinkProps,
  LinkScroll,
  LinkTransition,
  TrustedLinkHtml,
} from "./link.js";
export type {
  AppRouterNavigationState,
  AppRouterNavigationStateListener,
  AppRouterNavigationType,
} from "./navigation-state.js";
export type { RouterRuntimeCacheStat } from "./runtime-cache.js";
export type { MemorySessionStoreOptionsInternal as MemorySessionStoreOptions };
export type {
  AppRouterCspInlineNonceWarningLogEvent,
  AppRouterLogError,
  AppRouterLogEvent,
  AppRouterLogger,
  AppRouterLogLevel,
  AppRouterRuntime,
  AppRouterRequestEndLogEvent,
  AppRouterRequestErrorLogEvent,
  AppRouterRenderTimingLogEvent,
  AppRouterRequestStartLogEvent,
  AppRouterRequestTimingLogEvent,
} from "./logger.js";
export type { DetectedLocale, LocaleRoutingOptions, MessageTree } from "./i18n.js";
export {
  createFormCsrfToken,
  formCsrfCookie,
  formCsrfFieldName,
  validateFormCsrf,
} from "./csrf.js";
export type {
  AppRouterAllowedServerAction,
  AppRouterServerActionOptions,
  PreparedFormActionReference,
} from "./actions.js";
/**
 * @deprecated Import session helpers and types from `@reckona/mreact-auth` instead.
 */
export type SessionCookieOptions = SessionCookieOptionsInternal;
/**
 * @deprecated Import session helpers and types from `@reckona/mreact-auth` instead.
 */
export type SessionRecord<TData = unknown> = SessionRecordInternal<TData>;
/**
 * @deprecated Import session helpers and types from `@reckona/mreact-auth` instead.
 */
export type SessionStore<TData = unknown> = SessionStoreInternal<TData>;
export { startDevServer } from "./dev-server.js";
export type { StartDevServerOptions } from "./dev-server.js";
export { renderAppRequest } from "./render.js";
export type {
  AppRouterResponseHook,
  AppRouterResponseHookContext,
  RenderAppRequestOptions,
} from "./render.js";
export {
  parseTraceContext,
  traceContextFromRequest,
} from "./trace.js";
export type {
  RouterInstrumentation,
  RouterMiddlewareEndInstrumentationEvent,
  RouterMiddlewareInstrumentationEvent,
  RouterRequestEndInstrumentationEvent,
  RouterRequestInstrumentationEvent,
  RouterRouteEndInstrumentationEvent,
  RouterRouteInstrumentationEvent,
  RouterTraceContext,
} from "./trace.js";
export type {
  FileSystemPrerenderStoreOptions,
  KeyValuePrerenderStoreAdapter,
  KeyValuePrerenderStoreOptions,
  MemoryPrerenderStoreOptions,
} from "./prerender-store.js";
export { createFileSystemPrerenderStore, createKeyValuePrerenderStore } from "./prerender-store.js";
export { preloadBuiltAppRuntime, renderBuiltAppRequest, startServer } from "./serve.js";
export type {
  BuiltAppRuntimePreloadMode,
  AppRouterPrerenderStore,
  BuiltAppRuntimePreloadStrategy,
  RenderBuiltAppRequestOptions,
  RequestHostPolicy,
  StartServerOptions,
} from "./serve.js";
export { matchRoute, scanAppRoutes } from "./routes.js";
export type { AppFileConvention } from "./file-conventions.js";
export type {
  AppAssetRoute,
  AppMetadataRoute,
  AppRoute,
  MatchedRoute,
  PageRoute,
  RouteSegment,
  ServerRoute,
} from "./routes.js";
