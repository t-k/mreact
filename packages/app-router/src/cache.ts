export interface RouteCachePolicy {
  cacheControl: string;
  revalidateSeconds: number;
}

interface CachedRouteResponse {
  body: string;
  cacheControl: string;
  expiresAt: number;
  status: number;
}

interface AppRouterCacheState {
  cachedRoutes: Map<string, CachedRouteResponse>;
  invalidatedPaths: Set<string>;
}

const cacheState = ((globalThis as { __mreactAppRouterCache?: AppRouterCacheState })
  .__mreactAppRouterCache ??= {
  cachedRoutes: new Map(),
  invalidatedPaths: new Set(),
});

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
  key: string;
  now?: number;
}): Response | undefined {
  consumeInvalidations();
  const cached = cacheState.cachedRoutes.get(options.key);

  if (cached === undefined || cached.expiresAt <= (options.now ?? Date.now())) {
    cacheState.cachedRoutes.delete(options.key);
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
}

export async function cacheRouteResponse(options: {
  key: string;
  now?: number;
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
  cacheState.cachedRoutes.set(options.key, {
    body,
    cacheControl,
    expiresAt: (options.now ?? Date.now()) + options.policy.revalidateSeconds * 1000,
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
  cacheState.invalidatedPaths.add(normalizeRevalidationPath(path));
}

export function consumeInvalidations(): void {
  if (cacheState.invalidatedPaths.size === 0) {
    return;
  }

  for (const key of cacheState.cachedRoutes.keys()) {
    const [, routePath] = key.split("\0");

    if (
      routePath !== undefined &&
      cacheState.invalidatedPaths.has(normalizeRevalidationPath(routePath))
    ) {
      cacheState.cachedRoutes.delete(key);
    }
  }

  cacheState.invalidatedPaths.clear();
}

export function routeCacheKey(appDir: string, routePath: string, url: URL): string {
  return `${appDir}\0${normalizeRevalidationPath(routePath)}\0${url.href}`;
}

export function stripRevalidateExport(code: string): string {
  return code.replace(/^\s*export\s+const\s+revalidate\s*=\s*\d+\s*;?\s*$/m, "");
}

function normalizeRevalidationPath(path: string): string {
  const pathname = path.startsWith("/") ? path : `/${path}`;
  const withoutTrailing = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  return withoutTrailing === "" ? "/" : withoutTrailing;
}
