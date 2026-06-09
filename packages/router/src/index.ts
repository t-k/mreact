export { buildApp, packageAwsLambdaArtifact, packageCloudflarePagesArtifact } from "./build.js";
export { assetHref, assetPreloadLinks } from "./assets.js";
export { cacheControl, createMemoryRouteCache, revalidatePath } from "./cache.js";
export { deleteCookie, parseCookieHeader, serializeCookie, setCookie } from "./cookies.js";
export { defineMessages, detectLocale } from "./i18n.js";
export { defer, isDeferredLoaderData } from "./deferred.js";
export type { DeferredLoaderData } from "./deferred.js";
export { definePage } from "./types.js";
export { href } from "./typed-routes.js";
export { parseMultipartStream } from "./multipart.js";
export type {
  MultipartFixedLengthStream,
  MultipartStreamFieldOptions,
  MultipartStreamParseOptions,
  MultipartStreamPart,
} from "./multipart.js";
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
import {
  Link as LinkInternal,
  linkProps as linkPropsInternal,
} from "./link.js";
import {
  getNavigationState as getNavigationStateInternal,
  subscribeNavigationState as subscribeNavigationStateInternal,
} from "./navigation-state.js";
import { getServerRuntimeState as getServerRuntimeStateInternal } from "./runtime-state.js";
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
import type {
  AppRouteDeclarations as LinkAppRouteDeclarations,
  ConcreteLinkHrefGuard as LinkConcreteLinkHrefGuard,
  LinkChild as LinkChildInternal,
  LinkHref as LinkHrefInternal,
  LinkOptions as LinkOptionsInternal,
  LinkPrefetch as LinkPrefetchInternal,
  LinkProps as LinkPropsInternal,
  LinkScroll as LinkScrollInternal,
  LinkTransition as LinkTransitionInternal,
  RegisteredAppRoutePath as RegisteredAppRoutePathInternal,
  TrustedLinkHtml as TrustedLinkHtmlInternal,
} from "./link.js";
import type {
  AppRouterNavigationState as AppRouterNavigationStateInternal,
  AppRouterNavigationStateListener as AppRouterNavigationStateListenerInternal,
  AppRouterNavigationType as AppRouterNavigationTypeInternal,
} from "./navigation-state.js";

/**
 * Renders an app-router anchor with typed `href` support and navigation runtime attributes.
 */
export const Link = LinkInternal;
/**
 * Converts router link options into anchor attributes consumed by the client navigation runtime.
 */
export const linkProps = linkPropsInternal;
/**
 * Reads the current client navigation state snapshot.
 */
export const getNavigationState = getNavigationStateInternal;
/**
 * Subscribes to app-router client navigation state changes.
 */
export const subscribeNavigationState = subscribeNavigationStateInternal;
/**
 * Reads or initializes shared server runtime state stored on `globalThis`.
 */
export const getServerRuntimeState = getServerRuntimeStateInternal;

/**
 * Creates a deprecated process-local session store alias.
 *
 * @deprecated Import session helpers from `@reckona/mreact-auth` instead.
 */
export const createMemorySessionStore = createMemorySessionStoreInternal;
/**
 * Creates a deprecated session record and cookie alias.
 *
 * @deprecated Import session helpers from `@reckona/mreact-auth` instead.
 */
export const createSession = createSessionInternal;
/**
 * Destroys a session through a deprecated router session alias.
 *
 * @deprecated Import session helpers from `@reckona/mreact-auth` instead.
 */
export const destroySession = destroySessionInternal;
/**
 * Reads a session through a deprecated router session alias.
 *
 * @deprecated Import session helpers from `@reckona/mreact-auth` instead.
 */
export const getSession = getSessionInternal;
/**
 * Rotates a session through a deprecated router session alias.
 *
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
  AppRouteLinkHrefSuffix,
  AppRouteLinkPathname,
  AppRouteLinkSegment,
  AppRouteLinkSegments,
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
/**
 * Allows applications to augment the set of statically registered app route paths.
 */
export interface AppRouteDeclarations extends LinkAppRouteDeclarations {}
/**
 * Produces a compile-time error shape when a typed Link receives an unresolved route pattern.
 */
export type ConcreteLinkHrefGuard<Href extends string> = LinkConcreteLinkHrefGuard<Href>;
/**
 * Represents children accepted by the app-router Link renderer.
 */
export type LinkChild = LinkChildInternal;
/**
 * Resolves the accepted `href` type for app-router links.
 */
export type LinkHref = LinkHrefInternal;
/**
 * Configures client navigation behavior for a router link.
 */
export type LinkOptions<Href extends string = LinkHref> = LinkOptionsInternal<Href>;
/**
 * Selects when the app router should prefetch a linked route.
 */
export type LinkPrefetch = LinkPrefetchInternal;
/**
 * Combines router link options with anchor attributes and children.
 */
export type LinkProps<Href extends string = LinkHref> = LinkPropsInternal<Href>;
/**
 * Extracts registered route paths from `AppRouteDeclarations`.
 */
export type RegisteredAppRoutePath = RegisteredAppRoutePathInternal;
/**
 * Controls scroll restoration behavior after client navigation.
 */
export type LinkScroll = LinkScrollInternal;
/**
 * Controls whether client navigation participates in view transitions.
 */
export type LinkTransition = LinkTransitionInternal;
/**
 * Wraps pre-escaped HTML that can be used as trusted link children.
 */
export type TrustedLinkHtml = TrustedLinkHtmlInternal;
/**
 * Describes the latest client-side app-router navigation state.
 */
export type AppRouterNavigationState = AppRouterNavigationStateInternal;
/**
 * Receives app-router client navigation state updates.
 */
export type AppRouterNavigationStateListener = AppRouterNavigationStateListenerInternal;
/**
 * Names the client navigation operation that produced the current router state.
 */
export type AppRouterNavigationType = AppRouterNavigationTypeInternal;
export type { RouterRuntimeCacheStat } from "./runtime-cache.js";
/**
 * Configures the deprecated router memory session store alias.
 */
export type MemorySessionStoreOptions = MemorySessionStoreOptionsInternal;
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
 * Configures the deprecated router session cookie alias.
 *
 * @deprecated Import session helpers and types from `@reckona/mreact-auth` instead.
 */
export type SessionCookieOptions = SessionCookieOptionsInternal;
/**
 * Stores session data through the deprecated router session record alias.
 *
 * @deprecated Import session helpers and types from `@reckona/mreact-auth` instead.
 */
export type SessionRecord<TData = unknown> = SessionRecordInternal<TData>;
/**
 * Defines session persistence through the deprecated router session store alias.
 *
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
