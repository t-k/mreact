/** Describes the cache lifetime assigned to a rendered route response. */
export interface RouteCachePolicy {
  cacheControl: string;
  revalidateSeconds: number;
}

export function requestCarriesCredentials(request: Request | undefined): boolean {
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
      lower === "x-access-token" ||
      lower === "x-auth-token" ||
      lower === "x-authenticated-user" ||
      lower === "x-id-token" ||
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

    continue;
  }

  return false;
}

const PUBLIC_ROUTE_CACHE_REQUEST_HEADERS = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "connection",
  "dnt",
  "host",
  "if-none-match",
  "pragma",
  "priority",
  "purpose",
  "referer",
  "save-data",
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
  "via",
  "x-mreact-navigation",
  "x-mreact-navigation-cache",
  "x-real-ip",
  "x-request-id",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
]);

/** Configures cache-control directives for route response caching. */
export interface CacheControlOptions {
  maxAge?: number | undefined;
  sMaxAge?: number | undefined;
  staleWhileRevalidate?: boolean | number | undefined;
}

export function routeCachePolicyFromOptions(options: CacheControlOptions): RouteCachePolicy {
  const directives: string[] = [];
  const maxAge = cacheControlSeconds(options.maxAge, "maxAge");
  const sMaxAge = cacheControlSeconds(options.sMaxAge, "sMaxAge");

  if (maxAge !== undefined) directives.push(`max-age=${maxAge}`);
  if (sMaxAge !== undefined) directives.push(`s-maxage=${sMaxAge}`);
  if (options.staleWhileRevalidate !== undefined) {
    directives.push(staleWhileRevalidateDirective(options.staleWhileRevalidate));
  }
  if (directives.length === 0) {
    throw new Error("cacheControl() requires at least one cache directive.");
  }
  return { cacheControl: directives.join(", "), revalidateSeconds: sMaxAge ?? 0 };
}

function cacheControlSeconds(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`cacheControl() ${name} must be a non-negative integer.`);
  }
  return value;
}

function staleWhileRevalidateDirective(value: boolean | number): string {
  if (value === true) return "stale-while-revalidate";
  if (value === false) {
    throw new Error("cacheControl() staleWhileRevalidate must be true or a non-negative integer.");
  }
  return `stale-while-revalidate=${cacheControlSeconds(value, "staleWhileRevalidate")}`;
}
