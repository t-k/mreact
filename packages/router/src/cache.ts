export interface RouteCachePolicy {
  cacheControl: string;
  revalidateSeconds: number;
}

export interface AppRouterCacheEntry {
  body: string;
  cacheControl: string;
  expiresAt: number;
  path: string;
  status: number;
}

export interface AppRouterCache {
  deleteByPath(path: string): void | Promise<void>;
  get(key: string): AppRouterCacheEntry | undefined | Promise<AppRouterCacheEntry | undefined>;
  set(key: string, entry: AppRouterCacheEntry): void | Promise<void>;
}

interface AppRouterCacheState {
  activeContexts: RouteCacheContext[];
  invalidatedPaths: Set<string>;
  memoryCache: AppRouterCache;
}

interface RouteCacheContext {
  cache: AppRouterCache;
  revalidatedPaths: Set<string>;
}

const cacheState = ((globalThis as { __mreactAppRouterCache?: AppRouterCacheState })
  .__mreactAppRouterCache ??= {
  activeContexts: [],
  invalidatedPaths: new Set(),
  memoryCache: createMemoryRouteCache(),
});

export function createMemoryRouteCache(): AppRouterCache {
  const cachedRoutes = new Map<string, AppRouterCacheEntry>();

  return {
    deleteByPath(path) {
      const normalizedPath = normalizeRevalidationPath(path);

      for (const [key, entry] of cachedRoutes) {
        if (entry.path === normalizedPath) {
          cachedRoutes.delete(key);
        }
      }
    },
    get(key) {
      return cachedRoutes.get(key);
    },
    set(key, entry) {
      cachedRoutes.set(key, entry);
    },
  };
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

export function cachedRouteResponse(options: {
  cache?: AppRouterCache | undefined;
  key: string;
  now?: number;
}): Promise<Response | undefined> {
  return Promise.resolve().then(async () => {
    const cache = options.cache ?? cacheState.memoryCache;

    await consumeInvalidations(cache);
    const cached = await cache.get(options.key);

    if (cached === undefined || cached.expiresAt <= (options.now ?? Date.now())) {
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
      "content-type": options.response.headers.get("content-type") ?? "text/html; charset=utf-8",
      "x-mreact-cache": "MISS",
    },
    status,
  });
}

export function revalidatePath(path: string): void {
  const normalizedPath = normalizeRevalidationPath(path);
  const activeContext = cacheState.activeContexts.at(-1);

  if (activeContext !== undefined) {
    activeContext.revalidatedPaths.add(normalizedPath);
    return;
  }

  cacheState.invalidatedPaths.add(normalizedPath);
}

export async function consumeInvalidations(cache: AppRouterCache = cacheState.memoryCache): Promise<void> {
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
): Promise<{ revalidatedPaths: string[]; value: T }> {
  const context: RouteCacheContext = {
    cache: cache ?? cacheState.memoryCache,
    revalidatedPaths: new Set(),
  };

  cacheState.activeContexts.push(context);

  try {
    const value = await fn();
    const revalidatedPaths = Array.from(context.revalidatedPaths);

    for (const path of revalidatedPaths) {
      await context.cache.deleteByPath(path);
    }

    return { revalidatedPaths, value };
  } finally {
    cacheState.activeContexts.pop();
  }
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
