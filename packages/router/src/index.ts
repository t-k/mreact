export { buildApp } from "./build.js";
export { assetHref, assetPreloadLinks } from "./assets.js";
export { cacheControl, createMemoryRouteCache, revalidatePath } from "./cache.js";
export { deleteCookie, parseCookieHeader, serializeCookie, setCookie } from "./cookies.js";
export { defineMessages, detectLocale } from "./i18n.js";
export { Link, linkProps } from "./link.js";
export { getNavigationState, subscribeNavigationState } from "./navigation-state.js";
export {
  cookies,
  headers,
  html,
  json,
  next,
  notFound,
  redirect,
  redirectExternal,
  rewrite,
} from "./navigation.js";
export { createMemoryPrerenderStore } from "./prerender-store.js";
import {
  createMemorySessionStore as createMemorySessionStoreInternal,
  createSession as createSessionInternal,
  destroySession as destroySessionInternal,
  getSession as getSessionInternal,
  rotateSession as rotateSessionInternal,
} from "./session.js";
import type {
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
export type { BuildAppOptions, BuildAppResult } from "./build.js";
export type { AppRouterBuildTarget } from "./config.js";
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
  RouteCachePolicy,
} from "./cache.js";
export type { CookieOptions } from "./cookies.js";
export type { AppRouterImportPolicy } from "./import-policy.js";
export type {
  LinkOptions,
  LinkPrefetch,
  LinkProps,
  LinkScroll,
  LinkTransition,
} from "./link.js";
export type {
  AppRouterNavigationState,
  AppRouterNavigationStateListener,
  AppRouterNavigationType,
} from "./navigation-state.js";
export type {
  AppRouterLogError,
  AppRouterLogEvent,
  AppRouterLogger,
  AppRouterLogLevel,
  AppRouterRuntime,
  AppRouterRequestEndLogEvent,
  AppRouterRequestErrorLogEvent,
  AppRouterRequestStartLogEvent,
  AppRouterRequestTimingLogEvent,
} from "./logger.js";
export type { DetectedLocale, LocaleRoutingOptions, MessageTree } from "./i18n.js";
export type { AppRouterServerActionOptions } from "./actions.js";
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
export type {
  FileSystemPrerenderStoreOptions,
  KeyValuePrerenderStoreAdapter,
  KeyValuePrerenderStoreOptions,
  MemoryPrerenderStoreOptions,
} from "./prerender-store.js";
export { createFileSystemPrerenderStore, createKeyValuePrerenderStore } from "./prerender-store.js";
export { preloadBuiltAppRuntime, renderBuiltAppRequest, startServer } from "./serve.js";
export type {
  AppRouterPrerenderStore,
  RenderBuiltAppRequestOptions,
  RequestHostPolicy,
  StartServerOptions,
} from "./serve.js";
export { matchRoute, scanAppRoutes } from "./routes.js";
export type { AppRoute, MatchedRoute, PageRoute, RouteSegment, ServerRoute } from "./routes.js";
