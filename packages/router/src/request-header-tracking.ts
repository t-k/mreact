import type { RouteLocation } from "./types.js";

/**
 * Observes request inputs read by application code during a render.
 *
 * The shared route cache is keyed on the app directory, route path, pathname
 * and query only. A render that reads a request header therefore produces HTML
 * that is only correct for that header value, and storing it would serve one
 * visitor's variant to the next: `accept-language` mixes locales, `user-agent`
 * mixes mobile and desktop shells, and `cf-connecting-ip` or `referer` disclose
 * one visitor's data to another. Reads are observed rather than inferred from
 * the source so that headers read through helper modules are covered too.
 *
 * Only the request handed to application code is tracked. Router internals keep
 * using the original request, so their own header reads never mark a route as
 * header dependent.
 *
 * Reconstructing the request with `new Request(request)` copies headers from
 * internal slots that no interception can reach. Application contexts therefore
 * mark access when their lazy `request` property is retrieved, before opaque
 * helpers can reconstruct it. `render.ts` also uses conservative source closure
 * analysis so a previously stored entry cannot bypass the runtime observation.
 */
export interface TrackedHeaderRequest {
  /** Marks application access to the Request before it can escape tracking. */
  markRequestAccess(): void;
  /** Returns true once application code has observed request-specific input. */
  requestDependent(): boolean;
  /** The request to hand to loaders, metadata functions and components. */
  request: Request;
}

const HEADER_READ_METHODS = new Set<string | symbol>([
  "entries",
  "forEach",
  "get",
  "getSetCookie",
  "has",
  "keys",
  "values",
  Symbol.iterator,
]);

/**
 * Wraps a request so that header reads performed through it are recorded.
 *
 * Falls back to reporting every request as header dependent when the request
 * cannot be cloned, so an unexpected runtime never silently enables sharing.
 */
export function trackRequestHeaderReads(request: Request): TrackedHeaderRequest {
  let readAny = false;

  let tracked: Request;
  try {
    // Cloning a request that carries a body would tee its stream and buffer
    // whichever half goes unread. Only bodyless requests are worth tracking:
    // a request with a body is reported as header dependent so that its
    // response is never shared.
    if (request.body !== null) {
      return {
        markRequestAccess() {},
        requestDependent: () => true,
        request,
      };
    }

    tracked = request.clone();
  } catch {
    return {
      markRequestAccess() {},
      requestDependent: () => true,
      request,
    };
  }

  const originalHeaders = tracked.headers;
  const originalUrl = tracked.url;
  const headers = new Proxy(originalHeaders, {
    get(target, property) {
      const value = Reflect.get(target, property, target);

      if (typeof value !== "function" || !HEADER_READ_METHODS.has(property)) {
        return value;
      }

      return (...args: unknown[]): unknown => {
        readAny = true;
        return Reflect.apply(value as (...callArgs: unknown[]) => unknown, target, args);
      };
    },
  });

  // Origin/host are not part of the route cache key. Treat any URL observation
  // as request dependence so a multi-host process cannot replay one tenant's
  // absolute URLs to another. Path and query reads are conservatively included.
  Object.defineProperty(tracked, "url", {
    configurable: true,
    get: () => {
      readAny = true;
      return originalUrl;
    },
  });

  // Shadow the prototype getter on a real Request so that `fetch(request)`,
  // `request.json()` and instanceof checks keep working in every runtime.
  // Taking a reference counts as a read on its own: a caller that reached for
  // the headers is assumed to depend on them, which keeps the decision closed
  // when the reference escapes into code this module cannot observe.
  Object.defineProperty(tracked, "headers", {
    configurable: true,
    get: () => {
      readAny = true;
      return headers;
    },
  });

  // `clone()` copies headers from internal slots rather than through the
  // property above, so an unshadowed clone would hand back untracked headers.
  Object.defineProperty(tracked, "clone", {
    configurable: true,
    value: (): Request => {
      readAny = true;
      return Request.prototype.clone.call(tracked);
    },
    writable: true,
  });

  return {
    markRequestAccess: () => {
      readAny = true;
    },
    requestDependent: () => readAny,
    request: tracked,
  };
}

/**
 * Adds an enumerable Request property that records application access before
 * opaque code can copy native Request internal slots.
 */
export function withTrackedRequest<T extends object>(
  values: T,
  request: Request,
  tracked: TrackedHeaderRequest | undefined,
): T & { request: Request } {
  const context = values as T & { request: Request };
  let currentRequest = request;

  Object.defineProperty(context, "request", {
    configurable: true,
    enumerable: true,
    get() {
      tracked?.markRequestAccess();
      return currentRequest;
    },
    set(value: Request) {
      tracked?.markRequestAccess();
      currentRequest = value;
    },
  });

  return context;
}

/**
 * Adds the serializable location view used by shared page and layout props.
 * The full Request remains available to loaders, handlers, and metadata code.
 */
export function withTrackedRouteLocation<T extends object>(
  values: T,
  request: Request,
  tracked: TrackedHeaderRequest | undefined,
  location?: RouteLocation,
): T & { request: RouteLocation } {
  const context = values as T & { request: RouteLocation };
  let currentLocation = location ?? routeLocationFromRequest(request);

  Object.defineProperty(context, "request", {
    configurable: true,
    enumerable: true,
    get() {
      tracked?.markRequestAccess();
      return currentLocation;
    },
    set(value: RouteLocation) {
      tracked?.markRequestAccess();
      currentLocation = value;
    },
  });

  return context;
}

/** Returns the URL fields that are safe to serialize into route HTML. */
export function routeLocationFromRequest(request: Request): RouteLocation {
  return routeLocationFromUrl(new URL(request.url));
}

/** Returns a serializable route location from a URL without request metadata. */
export function routeLocationFromUrl(url: URL): RouteLocation {
  return {
    hash: url.hash,
    pathname: url.pathname,
    search: url.search,
    url: url.href,
  };
}

/**
 * Returns the route location placeholder embedded in cached HTML. The client
 * hydration runtime replaces it with document.URL before invoking shared code.
 * Query values stay out of reusable HTML because they can contain credentials
 * or other request-specific data.
 */
export function routeLocationForHydration(url: URL): RouteLocation {
  return {
    hash: "",
    pathname: url.pathname,
    search: "",
    url: url.pathname,
  };
}
