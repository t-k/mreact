export { buildApp } from "./build.js";
export { assetHref, assetPreloadLinks } from "./assets.js";
export { createMemoryRouteCache, revalidatePath } from "./cache.js";
export { deleteCookie, parseCookieHeader, serializeCookie, setCookie } from "./cookies.js";
export { defineMessages, detectLocale } from "./i18n.js";
export { cookies, headers, html, json, next, notFound, redirect, redirectExternal, rewrite } from "./navigation.js";
export { createMemoryPrerenderStore } from "./prerender-store.js";
import {
  createMemorySessionStore as createMemorySessionStoreInternal,
  createSession as createSessionInternal,
  destroySession as destroySessionInternal,
  getSession as getSessionInternal,
  rotateSession as rotateSessionInternal,
} from "./session.js";

/**
 * @deprecated Import session helpers from @reckona/mreact-auth instead.
 */
export const createMemorySessionStore = createMemorySessionStoreInternal;
/**
 * @deprecated Import session helpers from @reckona/mreact-auth instead.
 */
export const createSession = createSessionInternal;
/**
 * @deprecated Import session helpers from @reckona/mreact-auth instead.
 */
export const destroySession = destroySessionInternal;
/**
 * @deprecated Import session helpers from @reckona/mreact-auth instead.
 */
export const getSession = getSessionInternal;
/**
 * @deprecated Import session helpers from @reckona/mreact-auth instead.
 */
export const rotateSession = rotateSessionInternal;
export type { BuildAppOptions, BuildAppResult } from "./build.js";
export type {
  AssetHelperOptions,
  AssetLinkDescriptor,
  AssetManifest,
  AssetManifestEntry,
} from "./assets.js";
export type { AppRouterCache, AppRouterCacheEntry, RouteCachePolicy } from "./cache.js";
export type { CookieOptions } from "./cookies.js";
export type { AppRouterImportPolicy } from "./import-policy.js";
export type { DetectedLocale, LocaleRoutingOptions, MessageTree } from "./i18n.js";
export type { AppRouterServerActionOptions } from "./actions.js";
export type { SessionCookieOptions, SessionRecord, SessionStore } from "./session.js";
export { startDevServer } from "./dev-server.js";
export type { StartDevServerOptions } from "./dev-server.js";
export { renderAppRequest } from "./render.js";
export type { RenderAppRequestOptions } from "./render.js";
export type {
  FileSystemPrerenderStoreOptions,
  KeyValuePrerenderStoreAdapter,
  KeyValuePrerenderStoreOptions,
  MemoryPrerenderStoreOptions,
} from "./prerender-store.js";
export {
  createFileSystemPrerenderStore,
  createKeyValuePrerenderStore,
} from "./prerender-store.js";
export { renderBuiltAppRequest, startServer } from "./serve.js";
export type {
  AppRouterPrerenderStore,
  RenderBuiltAppRequestOptions,
  StartServerOptions,
} from "./serve.js";
export { matchRoute, scanAppRoutes } from "./routes.js";
export type {
  AppRoute,
  MatchedRoute,
  PageRoute,
  RouteSegment,
  ServerRoute,
} from "./routes.js";
