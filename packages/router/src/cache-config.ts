export type RouterCacheLimitName =
  | "COMPOSED_ROUTE_METADATA"
  | "MIDDLEWARE_MODULE"
  | "ROUTE_LOADER_MODULE"
  | "ROUTE_METADATA_MODULE"
  | "ROUTE_OUT_OF_ORDER_BOUNDARY_ANALYSIS"
  | "ROUTE_SOURCE_ANALYSIS"
  | "SERVER_ROUTE_MODULE"
  | "SERVER_SOURCE_FILE"
  | "SERVER_SOURCE_TRANSFORM"
  | "SERVER_TRANSFORM"
  | "SOURCE_MODULE";

export function resolveRouterCacheLimit(
  name: RouterCacheLimitName,
  defaultLimit: number,
  env: Record<string, string | undefined> = process.env,
): number {
  const specificValue = parseCacheLimit(env[`MREACT_ROUTER_CACHE_${name}_MAX_ENTRIES`]);

  if (specificValue !== undefined) {
    return specificValue;
  }

  return parseCacheLimit(env.MREACT_ROUTER_CACHE_MAX_ENTRIES) ?? defaultLimit;
}

function parseCacheLimit(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
