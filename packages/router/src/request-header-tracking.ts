/**
 * Observes request header reads performed by application code during a render.
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
 * internal slots that no interception can reach, so headers read through such a
 * copy are not observed. Callers that cannot construct the tracker treat the
 * render as header dependent instead, and `render.ts` does the same whenever a
 * cache policy appears without a tracker, so the uncovered case is a rewrapped
 * request rather than a silent cache write.
 */
export interface TrackedHeaderRequest {
  /** Returns true once application code has read any request header. */
  readAnyHeader(): boolean;
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
        readAnyHeader: () => true,
        request,
      };
    }

    tracked = request.clone();
  } catch {
    return {
      readAnyHeader: () => true,
      request,
    };
  }

  const originalHeaders = tracked.headers;
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
    readAnyHeader: () => readAny,
    request: tracked,
  };
}
