/** Lightweight request/control-plane helpers that do not import router build or Vite modules. */
export { cacheControl, createMemoryRouteCache, revalidatePath } from "./cache.js";
export { deleteCookie, parseCookieHeader, serializeCookie, setCookie } from "./cookies.js";
export { defer, isDeferredLoaderData } from "./deferred.js";
export type { DeferredLoaderData } from "./deferred.js";
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
