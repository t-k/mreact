export { buildApp, packageAwsLambdaArtifact, packageCloudflarePagesArtifact } from "./build.js";
export { assetHref, assetPreloadLinks } from "./assets.js";
export {
  analyzeAppBoundaries,
  createBoundaryReport,
  formatBoundaryReport,
  formatBoundaryReportJson,
} from "./boundaries.js";
export type {
  AnalyzeAppBoundariesOptions,
  BoundaryReport,
  BoundaryReportComponent,
  BoundaryReportRoute,
  BoundaryReportSummary,
  CreateBoundaryReportInput,
  CreateBoundaryReportRouteInput,
} from "./boundaries.js";
export { cacheControl, createMemoryRouteCache, revalidatePath } from "./cache.js";
export { deleteCookie, parseCookieHeader, serializeCookie, setCookie } from "./cookies.js";
export { defineMessages, detectLocale } from "./i18n.js";
export { defer, isDeferredLoaderData } from "./deferred.js";
export type { DeferredLoaderData } from "./deferred.js";
export { definePage } from "./types.js";
export { Link, linkProps } from "./link.js";
export type { LinkSerializableAttribute, LinkSinkChild, LinkSinkProps } from "./link.js";
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
export { validateHttpUpgradeOrigin } from "./upgrade.js";
export type {
  HttpUpgradeContext,
  HttpUpgradeDisposition,
  HttpUpgradeHandler,
  HttpUpgradeOriginFailureReason,
  HttpUpgradeOriginPolicy,
  HttpUpgradeOriginValidation,
  ManagedHttpUpgradeHandler,
  ValidateHttpUpgradeOriginOptions,
} from "./upgrade.js";
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
export type { MiddlewareNext, ParseSchema, RedirectOptions, RequestCookies } from "./navigation.js";
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
 * Creates a deprecated process-local session store alias.
 *
 * @deprecated Import session helpers from `@reckona/mreact-auth` instead.
 */
export function createMemorySessionStore<TData = unknown>(
  options: MemorySessionStoreOptionsInternal = {},
): SessionStoreInternal<TData> {
  return createMemorySessionStoreInternal<TData>(options);
}
/**
 * Creates a deprecated session record and cookie alias.
 *
 * @deprecated Import session helpers from `@reckona/mreact-auth` instead.
 */
export async function createSession<TData>(
  response: Response,
  store: SessionStoreInternal<TData>,
  data: TData,
  options: SessionCookieOptionsInternal = {},
): Promise<SessionRecordInternal<TData>> {
  return createSessionInternal(response, store, data, options);
}
/**
 * Destroys a session through a deprecated router session alias.
 *
 * @deprecated Import session helpers from `@reckona/mreact-auth` instead.
 */
export async function destroySession<TData>(
  request: Request,
  response: Response,
  store: SessionStoreInternal<TData>,
  options: SessionCookieOptionsInternal = {},
): Promise<void> {
  return destroySessionInternal(request, response, store, options);
}
/**
 * Reads a session through a deprecated router session alias.
 *
 * @deprecated Import session helpers from `@reckona/mreact-auth` instead.
 */
export async function getSession<TData>(
  request: Request,
  store: SessionStoreInternal<TData>,
  options: SessionCookieOptionsInternal = {},
): Promise<SessionRecordInternal<TData> | undefined> {
  return getSessionInternal(request, store, options);
}
/**
 * Rotates a session through a deprecated router session alias.
 *
 * @deprecated Import session helpers from `@reckona/mreact-auth` instead.
 */
export async function rotateSession<TData>(
  request: Request,
  response: Response,
  store: SessionStoreInternal<TData>,
  options: SessionCookieOptionsInternal = {},
): Promise<SessionRecordInternal<TData> | undefined> {
  return rotateSessionInternal(request, response, store, options);
}
export type {
  AwsLambdaArtifactManifest,
  AwsLambdaGeneratedHandlerPreloadMode,
  BuildAppPhase,
  BuildAppPhaseTiming,
  BuildAppOptions,
  BuildAppProgressEvent,
  BuildAppResult,
  BuiltImportPolicyArtifact,
  BuiltPrerenderedRoute,
  BuiltRouteSourceAnalysisSummary,
  BuiltServerModuleArtifact,
  BuiltServerModuleOutput,
  CloudflarePagesArtifactManifest,
  PackageAwsLambdaArtifactOptions,
  PackageCloudflarePagesArtifactOptions,
} from "./build.js";
export type { AppRouterProjectOptions } from "./config.js";
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
  SegmentRouteParam,
  StaticHrefOptions,
  ExtractRouteParams,
  HasRouteParams,
  Simplify,
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
  RouteLocation,
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
/** Re-exports link types used by the router root entrypoint. */
export type {
  AppRouteDeclarations,
  ConcreteLinkHrefGuard,
  LinkChild,
  LinkHref,
  LinkOptions,
  LinkPrefetch,
  LinkProps,
  RegisteredAppRoutePath,
  LinkScroll,
  LinkTransition,
  TrustedLinkHtml,
} from "./link.js";
/** Re-exports client navigation state types used by the router root entrypoint. */
export type {
  AppRouterNavigationState,
  AppRouterNavigationStateListener,
  AppRouterNavigationType,
} from "./navigation-state.js";
export type { RouterRuntimeCacheStat } from "./runtime-cache.js";
/** Configures the deprecated router memory session store alias. */
export type { MemorySessionStoreOptions } from "./session.js";
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
  AppRouterUpgradeErrorLogEvent,
  AppRouterUpgradeRejectedLogEvent,
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
export type { SessionCookieOptions } from "./session.js";
/**
 * Stores session data through the deprecated router session record alias.
 *
 * @deprecated Import session helpers and types from `@reckona/mreact-auth` instead.
 */
export type { SessionRecord } from "./session.js";
/**
 * Defines session persistence through the deprecated router session store alias.
 *
 * @deprecated Import session helpers and types from `@reckona/mreact-auth` instead.
 */
export type { SessionStore } from "./session.js";
export { startDevServer } from "./dev-server.js";
export type { StartDevServerOptions } from "./dev-server.js";
export { renderAppRequest } from "./render.js";
export type {
  AppRouterRenderPreload,
  AppRouterResponseHook,
  AppRouterResponseHookContext,
  AppRouterServerRenderArtifactLoader,
  RenderAppRequestOptions,
} from "./render.js";
export { parseTraceContext, traceContextFromRequest } from "./trace.js";
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
  MemoryPrerenderStoreEntry,
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
  ResponseSinkStrategy,
  StartServerOptions,
} from "./serve.js";
export { matchRoute, scanAppRoutes } from "./routes.js";
export type {
  CachedClientRouteSource,
  ClientRouteComponent,
  ClientRouteComponentClassification,
  ClientRouteComponentOrigin,
  ClientRouteInferenceCache,
  ClientRouteInferenceDiagnostic,
} from "./client.js";
export type { RouteMatcher, ScanAppRoutesOptions } from "./routes.js";
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
