import { requestState } from "@reckona/mreact-reactive-core";
import { getRequestStateStorage } from "@reckona/mreact-reactive-core/internal";
import {
  requestCarriesCredentials,
  routeCachePolicyFromOptions,
  type CacheControlOptions,
  type RouteCachePolicy,
} from "./cache-policy.js";
import { responseHeadersContainCspNonce } from "./csp.js";

// The registry can contain several separately bundled copies of this module.
// A shared accessor identity makes them use the same request-state entry.
interface CloudflareCacheScope {
  active: boolean;
  policy?: RouteCachePolicy;
}

const usePolicy = ((
  globalThis as { __mreactCloudflareCachePolicy?: () => CloudflareCacheScope }
).__mreactCloudflareCachePolicy ??= requestState((): CloudflareCacheScope => ({ active: false })));

export function beginCloudflareCacheScope(): CloudflareCacheScope | undefined {
  if (getRequestStateStorage()?.getStore() === undefined) return undefined;
  const scope = usePolicy();
  scope.active = true;
  return scope;
}

export function cacheControl(options: CacheControlOptions): void {
  if (getRequestStateStorage()?.getStore() === undefined || !usePolicy().active) {
    throw new Error(
      "cacheControl() must be called during an app router request. Cloudflare requires nodejs_compat for request-local cache policies.",
    );
  }
  usePolicy().policy = routeCachePolicyFromOptions(options);
}

export function currentCloudflareCachePolicy(): RouteCachePolicy | undefined {
  return getRequestStateStorage()?.getStore() === undefined ? undefined : usePolicy().policy;
}

export function revalidatePath(_path: string): never {
  throw new Error(
    "revalidatePath() is unavailable in Cloudflare workers; invalidate cached responses through your deployment's cache provider.",
  );
}

/** Applies headers without consuming or buffering a streamed response body. */
export function applyCloudflareCachePolicy(
  response: Response,
  request: Request,
  policy: RouteCachePolicy | undefined,
  requestDependent: boolean,
): Response {
  if (policy === undefined) return response;
  const existing = response.headers.get("cache-control") ?? "";
  if (
    /(^|,)\s*no-store\s*(?:,|$)/i.test(existing) ||
    (policy.cacheControl !== "no-store" &&
      /(^|,)\s*(?:private|no-cache)\s*(?:=|,|$)/i.test(existing))
  )
    return response;
  const shareable = !/(^|,)\s*(?:private|no-store)\s*(?:,|$)/i.test(policy.cacheControl);
  const privateResponse =
    shareable &&
    (requestDependent ||
      (request.method !== "GET" && request.method !== "HEAD") ||
      requestCarriesCredentials(request) ||
      response.headers.has("set-cookie") ||
      responseHeadersContainCspNonce(response.headers));
  const cacheControl = privateResponse ? "private, no-store" : policy.cacheControl;
  try {
    response.headers.set("cache-control", cacheControl);
    return response;
  } catch {
    // Redirects and fetched responses can have immutable headers.
    const headers = new Headers(response.headers);
    headers.set("cache-control", cacheControl);
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  }
}
