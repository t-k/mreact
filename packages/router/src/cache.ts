import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Describes the cache lifetime assigned to a rendered route response.
 */
export interface RouteCachePolicy {
  cacheControl: string;
  revalidateSeconds: number;
}

/**
 * Configures cache-control directives for route response caching.
 */
export interface CacheControlOptions {
  maxAge?: number | undefined;
  sMaxAge?: number | undefined;
  staleWhileRevalidate?: boolean | number | undefined;
}

/**
 * Stores a cached route response body and its expiration metadata.
 */
export interface AppRouterCacheEntry {
  body: string;
  cacheControl: string;
  expiresAt: number;
  path: string;
  status: number;
}

/**
 * Defines the storage interface used by app-router route response caching.
 */
export interface AppRouterCache {
  deleteByPath(path: string): void | Promise<void>;
  get(
    key: string,
    now?: number,
  ): AppRouterCacheEntry | undefined | Promise<AppRouterCacheEntry | undefined>;
  set(key: string, entry: AppRouterCacheEntry): void | Promise<void>;
}

/**
 * Configures the process-local in-memory route cache implementation.
 */
export interface MemoryRouteCacheOptions {
  maxEntries?: number;
  sweepIntervalMs?: number;
}

interface AppRouterCacheState {
  activeContexts: RouteCacheContext[];
  invalidatedPaths: Set<string>;
  memoryCache: AppRouterCache;
  storage: AsyncLocalStorage<RouteCacheContext>;
}

interface RouteCacheContext {
  cache: AppRouterCache;
  cachePolicy?: RouteCachePolicy | undefined;
  revalidatedPaths: Set<string>;
}

const cacheState = ((
  globalThis as { __mreactAppRouterCache?: AppRouterCacheState }
).__mreactAppRouterCache ??= {
  activeContexts: [],
  invalidatedPaths: new Set(),
  memoryCache: createMemoryRouteCache(),
  storage: new AsyncLocalStorage<RouteCacheContext>(),
});
cacheState.storage ??= new AsyncLocalStorage<RouteCacheContext>();

/**
 * Creates an in-memory route response cache for app-router rendering.
 *
 * The cache is process-local, evicts expired entries during reads/writes, and is suitable for development, tests, or single-process deployments that do not need shared invalidation.
 */
export function createMemoryRouteCache(options: MemoryRouteCacheOptions = {}): AppRouterCache {
  const maxEntries = positiveIntegerOrDefault(options.maxEntries, 10_000);
  const sweepIntervalMs = nonNegativeIntegerOrDefault(options.sweepIntervalMs, 60_000);
  const cachedRoutes = new Map<string, AppRouterCacheEntry>();
  const keysByPath = new Map<string, Set<string>>();
  let nextSweepAt = 0;

  function unindexKey(key: string, path: string): void {
    const keys = keysByPath.get(path);
    keys?.delete(key);

    if (keys?.size === 0) {
      keysByPath.delete(path);
    }
  }

  function deleteEntry(key: string): void {
    const entry = cachedRoutes.get(key);
    cachedRoutes.delete(key);

    if (entry !== undefined) {
      unindexKey(key, entry.path);
    }
  }

  function indexKey(key: string, path: string): void {
    const keys = keysByPath.get(path);

    if (keys === undefined) {
      keysByPath.set(path, new Set([key]));
      return;
    }

    keys.add(key);
  }

  function sweepExpired(now: number): void {
    for (const [key, entry] of cachedRoutes) {
      if (entry.expiresAt <= now) {
        deleteEntry(key);
      }
    }

    nextSweepAt = now + sweepIntervalMs;
  }

  function maybeSweepExpired(now: number): void {
    if (sweepIntervalMs === 0 || now >= nextSweepAt) {
      sweepExpired(now);
    }
  }

  function evictOldestEntries(): void {
    while (cachedRoutes.size > maxEntries) {
      const oldestKey = cachedRoutes.keys().next().value;

      if (oldestKey === undefined) {
        return;
      }

      deleteEntry(oldestKey);
    }
  }

  return {
    deleteByPath(path) {
      const normalizedPath = normalizeRevalidationPath(path);
      const keys = keysByPath.get(normalizedPath);

      if (keys === undefined) {
        return;
      }

      for (const key of keys) {
        cachedRoutes.delete(key);
      }

      keysByPath.delete(normalizedPath);
    },
    get(key, now = Date.now()) {
      const entry = cachedRoutes.get(key);

      if (entry === undefined) {
        return undefined;
      }

      if (entry.expiresAt <= now) {
        deleteEntry(key);
        return undefined;
      }

      return entry;
    },
    set(key, entry) {
      const now = Date.now();
      maybeSweepExpired(now);
      const previous = cachedRoutes.get(key);

      if (previous !== undefined) {
        cachedRoutes.delete(key);
        unindexKey(key, previous.path);
      }

      cachedRoutes.set(key, entry);
      indexKey(key, entry.path);

      if (cachedRoutes.size > maxEntries) {
        sweepExpired(now);
        evictOldestEntries();
      }
    },
  };
}

function positiveIntegerOrDefault(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isInteger(value) || value < 1 ? fallback : value;
}

function nonNegativeIntegerOrDefault(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isInteger(value) || value < 0 ? fallback : value;
}

export function routeCachePolicyFromSource(code: string): RouteCachePolicy | undefined {
  const match = /^\s*export\s+const\s+revalidate\s*=\s*(?<seconds>\d+)\s*;?\s*$/m.exec(code);
  const seconds = match?.groups?.seconds === undefined ? undefined : Number(match.groups.seconds);

  if (seconds === undefined || !Number.isFinite(seconds)) {
    return undefined;
  }

  return {
    cacheControl: seconds === 0 ? "no-store" : `s-maxage=${seconds}, stale-while-revalidate`,
    revalidateSeconds: seconds,
  };
}

/**
 * Sets the cache policy for the current app-router render.
 *
 * Call this during a loader or route render to override the response `Cache-Control` policy; it throws outside an active app-router request.
 */
export function cacheControl(options: CacheControlOptions): void {
  const activeContext = activeRouteCacheContext();

  if (activeContext === undefined) {
    throw new Error("cacheControl() must be called during an app router request.");
  }

  activeContext.cachePolicy = routeCachePolicyFromOptions(options);
}

export function routeCachePolicyFromOptions(options: CacheControlOptions): RouteCachePolicy {
  const directives: string[] = [];
  const maxAge = cacheControlSeconds(options.maxAge, "maxAge");
  const sMaxAge = cacheControlSeconds(options.sMaxAge, "sMaxAge");

  if (maxAge !== undefined) {
    directives.push(`max-age=${maxAge}`);
  }

  if (sMaxAge !== undefined) {
    directives.push(`s-maxage=${sMaxAge}`);
  }

  if (options.staleWhileRevalidate !== undefined) {
    directives.push(staleWhileRevalidateDirective(options.staleWhileRevalidate));
  }

  if (directives.length === 0) {
    throw new Error("cacheControl() requires at least one cache directive.");
  }

  return {
    cacheControl: directives.join(", "),
    revalidateSeconds: sMaxAge ?? 0,
  };
}

export function cachedRouteResponse(options: {
  cache?: AppRouterCache | undefined;
  key: string;
  now?: number;
  request?: Request | undefined;
}): Promise<Response | undefined> {
  return Promise.resolve().then(async () => {
    if (requestCarriesCredentials(options.request)) {
      return undefined;
    }

    const cache = options.cache ?? cacheState.memoryCache;

    await consumeInvalidations(cache);
    const now = options.now ?? Date.now();
    const cached = await cache.get(options.key, now);

    if (cached === undefined || cached.expiresAt <= now) {
      return undefined;
    }

    return new Response(cached.body, {
      headers: {
        "cache-control": cached.cacheControl,
        "content-type": "text/html; charset=utf-8",
        "x-mreact-cache": "HIT",
      },
      status: cached.status,
    });
  });
}

export async function cacheRouteResponse(options: {
  cache?: AppRouterCache | undefined;
  key: string;
  now?: number;
  path: string;
  policy: RouteCachePolicy | undefined;
  request?: Request | undefined;
  response: Response;
}): Promise<Response> {
  if (options.policy === undefined) {
    return options.response;
  }

  if (options.policy.revalidateSeconds === 0) {
    options.response.headers.set("cache-control", options.policy.cacheControl);
    return options.response;
  }

  const body = await options.response.text();
  const cacheControl = options.policy.cacheControl;
  const status = options.response.status;
  const contentType = options.response.headers.get("content-type") ?? "text/html; charset=utf-8";

  if (
    requestCarriesCredentials(options.request) ||
    options.response.headers.has("set-cookie")
  ) {
    const headers = new Headers(options.response.headers);
    headers.set("cache-control", "private, no-store");
    if (!headers.has("content-type")) {
      headers.set("content-type", contentType);
    }

    return new Response(body, {
      headers,
      status,
    });
  }

  await (options.cache ?? cacheState.memoryCache).set(options.key, {
    body,
    cacheControl,
    expiresAt: (options.now ?? Date.now()) + options.policy.revalidateSeconds * 1000,
    path: normalizeRevalidationPath(options.path),
    status,
  });

  return new Response(body, {
    headers: {
      "cache-control": cacheControl,
      "content-type": contentType,
      "x-mreact-cache": "MISS",
    },
    status,
  });
}

function requestCarriesCredentials(request: Request | undefined): boolean {
  if (request === undefined) {
    return false;
  }

  if (request.headers.has("authorization") || request.headers.has("cookie")) {
    return true;
  }

  for (const name of request.headers.keys()) {
    const lower = name.toLowerCase();
    if (PUBLIC_ROUTE_CACHE_REQUEST_HEADERS.has(lower)) {
      continue;
    }

    if (
      lower === "x-api-key" ||
      lower === "cf-access-jwt-assertion" ||
      lower === "proxy-authorization" ||
      lower === "x-auth-token" ||
      lower === "x-authenticated-user" ||
      lower === "x-forwarded-user" ||
      lower === "x-session-id" ||
      lower === "x-user-email" ||
      lower === "x-user-id" ||
      lower.endsWith("-api-key") ||
      lower.endsWith("-auth-token") ||
      lower.endsWith("-session-id") ||
      lower.endsWith("-user") ||
      lower.endsWith("-user-email") ||
      lower.endsWith("-user-id") ||
      lower.includes("-jwt-") ||
      lower.endsWith("-jwt")
    ) {
      return true;
    }

    return true;
  }

  return false;
}

const PUBLIC_ROUTE_CACHE_REQUEST_HEADERS = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "connection",
  "dnt",
  "host",
  "pragma",
  "purpose",
  "referer",
  "sec-ch-prefers-color-scheme",
  "sec-ch-prefers-reduced-motion",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-user",
  "upgrade-insecure-requests",
  "user-agent",
  "x-mreact-navigation",
  "x-mreact-navigation-cache",
]);

/**
 * Invalidates cached route responses for a normalized app-router path.
 *
 * During a request the invalidation is scoped to that route cache context; outside a request it is queued for the next cache access.
 */
export function revalidatePath(path: string): void {
  const normalizedPath = normalizeRevalidationPath(path);
  const activeContext = activeRouteCacheContext();

  if (activeContext !== undefined) {
    activeContext.revalidatedPaths.add(normalizedPath);
    return;
  }

  cacheState.invalidatedPaths.add(normalizedPath);
}

export async function consumeInvalidations(
  cache: AppRouterCache = cacheState.memoryCache,
): Promise<void> {
  if (cacheState.invalidatedPaths.size === 0) {
    return;
  }

  for (const path of cacheState.invalidatedPaths) {
    await cache.deleteByPath(path);
  }

  cacheState.invalidatedPaths.clear();
}

export async function withRouteCacheContext<T>(
  cache: AppRouterCache | undefined,
  fn: () => T | Promise<T>,
): Promise<{ cachePolicy: RouteCachePolicy | undefined; revalidatedPaths: string[]; value: T }> {
  const context: RouteCacheContext = {
    cache: cache ?? cacheState.memoryCache,
    revalidatedPaths: new Set(),
  };

  return cacheState.storage.run(context, async () => {
    const value = await fn();
    const cachePolicy = context.cachePolicy;
    const revalidatedPaths = Array.from(context.revalidatedPaths);

    for (const path of revalidatedPaths) {
      await context.cache.deleteByPath(path);
    }

    return { cachePolicy, revalidatedPaths, value };
  });
}

export function beginRouteCacheContext(cache: AppRouterCache | undefined): {
  readonly cachePolicy: RouteCachePolicy | undefined;
  dispose(): Promise<{ revalidatedPaths: string[] }>;
} {
  const context: RouteCacheContext = {
    cache: cache ?? cacheState.memoryCache,
    revalidatedPaths: new Set(),
  };

  cacheState.activeContexts.push(context);

  return {
    get cachePolicy() {
      return context.cachePolicy;
    },
    async dispose() {
      const revalidatedPaths = Array.from(context.revalidatedPaths);

      for (const path of revalidatedPaths) {
        await context.cache.deleteByPath(path);
      }

      const index = cacheState.activeContexts.lastIndexOf(context);
      if (index !== -1) {
        cacheState.activeContexts.splice(index, 1);
      }

      return { revalidatedPaths };
    },
  };
}

function activeRouteCacheContext(): RouteCacheContext | undefined {
  return cacheState.storage.getStore() ?? cacheState.activeContexts.at(-1);
}

// Host is excluded from the cache key to prevent attacker-supplied Host
// headers from fragmenting / poisoning the cache (Issue 068). The Vary
// dimension is the request path + query; same-origin reverse proxies are
// expected to handle vhost separation at their layer.
export function routeCacheKey(appDir: string, routePath: string, url: URL): string {
  return `${appDir}\0${normalizeRevalidationPath(routePath)}\0${url.pathname}${url.search}`;
}

export function stripRevalidateExport(code: string): string {
  return code.replace(/^\s*export\s+const\s+revalidate\s*=\s*\d+\s*;?\s*$/m, "");
}

function normalizeRevalidationPath(path: string): string {
  const pathname = path.startsWith("/") ? path : `/${path}`;
  const withoutTrailing = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  return withoutTrailing === "" ? "/" : withoutTrailing;
}

function cacheControlSeconds(value: number | undefined, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`cacheControl() ${name} must be a non-negative integer.`);
  }

  return value;
}

function staleWhileRevalidateDirective(value: boolean | number): string {
  if (value === true) {
    return "stale-while-revalidate";
  }

  if (value === false) {
    throw new Error("cacheControl() staleWhileRevalidate must be true or a non-negative integer.");
  }

  const seconds = cacheControlSeconds(value, "staleWhileRevalidate");
  return `stale-while-revalidate=${seconds}`;
}
