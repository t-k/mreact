import type { BuiltPrerenderedRoute } from "./build.js";

export const PRERENDERED_ROUTE_SCHEMA_VERSION = 3;

export function isCurrentPrerenderedRoute(value: unknown): value is BuiltPrerenderedRoute {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const entry = value as Partial<BuiltPrerenderedRoute>;
  return (
    entry.schemaVersion === PRERENDERED_ROUTE_SCHEMA_VERSION &&
    isStringRecord(entry.headers) &&
    isShareableHeaderRecord(entry.headers) &&
    !hasStoredHstsHeader(entry.headers) &&
    isCanonicalHstsHeader(entry.strictTransportSecurity) &&
    typeof entry.html === "string" &&
    typeof entry.status === "number" &&
    Number.isInteger(entry.status) &&
    entry.status >= 100 &&
    entry.status <= 599
  );
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

  if (entry.strictTransportSecurity !== undefined && request.url.startsWith("https://")) {
    headers.set("strict-transport-security", entry.strictTransportSecurity);
  }

  return headers;
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
  const forbidsSharedStorage = cacheControl.split(",").some((directive) =>
    /^(?:private|no-cache|no-store)(?:=|$)/i.test(directive.trim()),
  );

  return (
    headers.get("x-mreact-cache")?.toUpperCase() === "DYNAMIC" ||
    headers.has("set-cookie") ||
    headers.has("vary") ||
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
