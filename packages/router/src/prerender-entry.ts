import type { BuiltPrerenderedRoute } from "./build.js";
import { responseHeadersContainCspNonce } from "./csp.js";
import { hasNavigationRouteMarker } from "./navigation-marker.js";

export const PRERENDERED_ROUTE_SCHEMA_VERSION = 4;

const validatedNavigationHtmlByEntry = new WeakMap<object, string | null>();

export function isCurrentPrerenderedRoute(value: unknown): value is BuiltPrerenderedRoute {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const entry = value as Partial<BuiltPrerenderedRoute>;
  return (
    entry.schemaVersion === PRERENDERED_ROUTE_SCHEMA_VERSION &&
    isStringRecord(entry.headers) &&
    isShareableHeaderRecord(entry.headers) &&
    hasRequiredNavigationVary(entry.headers) &&
    !hasStoredHstsHeader(entry.headers) &&
    isCanonicalHstsHeader(entry.strictTransportSecurity) &&
    typeof entry.html === "string" &&
    typeof entry.status === "number" &&
    Number.isInteger(entry.status) &&
    entry.status >= 100 &&
    entry.status <= 599
  );
}

/**
 * Returns a navigation variant only after validating its route marker.
 *
 * Stored entries are stable objects during a runtime's lifetime, so the
 * marker scan is cached by identity. Document requests never call this
 * function and therefore never inspect navigation HTML.
 */
export function validatedPrerenderedNavigationHtml(
  entry: BuiltPrerenderedRoute,
): string | undefined {
  const cached = validatedNavigationHtmlByEntry.get(entry);
  if (cached !== undefined) {
    return cached === null ? undefined : cached;
  }

  const candidate = entry.navigationHtml;
  const validated =
    typeof candidate === "string" && hasNavigationRouteMarker(candidate) ? candidate : null;
  validatedNavigationHtmlByEntry.set(entry, validated);
  return validated === null ? undefined : validated;
}

/**
 * Adds a regenerated navigation variant only when it satisfies the marker
 * contract. Invalid navigation output must not replace a valid document.
 */
export function mergePrerenderedNavigationHtml(
  entry: BuiltPrerenderedRoute,
  navigationHtml: string,
): BuiltPrerenderedRoute {
  return hasNavigationRouteMarker(navigationHtml) ? { ...entry, navigationHtml } : entry;
}

function hasStoredHstsHeader(headers: Record<string, string>): boolean {
  try {
    return new Headers(headers).has("strict-transport-security");
  } catch {
    return true;
  }
}

function isCanonicalHstsHeader(value: unknown): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === "string" &&
      /^max-age=(?:0|[1-9][0-9]*)(?:; includeSubDomains)?(?:; preload)?$/.test(value))
  );
}

export function isVisitorDependentResponse(response: Response): boolean {
  return isVisitorDependentHeaders(response.headers);
}

export function protectNonceBearingResponse(response: Response): Response {
  if (!responseHeadersContainCspNonce(response.headers)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  headers.set("x-mreact-cache", "DYNAMIC");
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function storedPrerenderedRouteHeaders(headers: Headers): Record<string, string> {
  const stored: Record<string, string> = {};

  headers.forEach((value, key) => {
    if (key !== "strict-transport-security") {
      stored[key] = value;
    }
  });

  return stored;
}

export function replayedPrerenderedRouteHeaders(
  entry: BuiltPrerenderedRoute,
  request: Request,
): Headers {
  const headers = new Headers(entry.headers);

  if (!hasNavigationVary(headers)) {
    headers.append("vary", "x-mreact-navigation");
  }

  if (entry.strictTransportSecurity !== undefined && request.url.startsWith("https://")) {
    headers.set("strict-transport-security", entry.strictTransportSecurity);
  }

  return headers;
}

function hasRequiredNavigationVary(headers: Record<string, string>): boolean {
  try {
    return hasNavigationVary(new Headers(headers));
  } catch {
    return false;
  }
}

function hasNavigationVary(headers: Headers): boolean {
  return (
    headers
      .get("vary")
      ?.split(",")
      .some((value) => value.trim().toLowerCase() === "x-mreact-navigation") === true
  );
}

function isShareableHeaderRecord(headers: Record<string, string>): boolean {
  try {
    return !isVisitorDependentHeaders(new Headers(headers));
  } catch {
    return false;
  }
}

function isVisitorDependentHeaders(headers: Headers): boolean {
  const cacheControl = headers.get("cache-control") ?? "";
  const vary = headers.get("vary");
  const hasVisitorDependentVary =
    vary !== null &&
    vary.split(",").some((value) => value.trim().toLowerCase() !== "x-mreact-navigation");
  const forbidsSharedStorage = cacheControl
    .split(",")
    .some((directive) => /^(?:private|no-cache|no-store)(?:=|$)/i.test(directive.trim()));

  return (
    headers.get("x-mreact-cache")?.toUpperCase() === "DYNAMIC" ||
    headers.has("set-cookie") ||
    responseHeadersContainCspNonce(headers) ||
    hasVisitorDependentVary ||
    forbidsSharedStorage
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}
