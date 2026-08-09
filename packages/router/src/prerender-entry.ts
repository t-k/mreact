import type { BuiltPrerenderedRoute } from "./build.js";

export const PRERENDERED_ROUTE_SCHEMA_VERSION = 1;

export function isCurrentPrerenderedRoute(value: unknown): value is BuiltPrerenderedRoute {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const entry = value as Partial<BuiltPrerenderedRoute>;
  return (
    entry.schemaVersion === PRERENDERED_ROUTE_SCHEMA_VERSION &&
    isStringRecord(entry.headers) &&
    isShareableHeaderRecord(entry.headers) &&
    typeof entry.html === "string" &&
    typeof entry.status === "number" &&
    Number.isInteger(entry.status) &&
    entry.status >= 100 &&
    entry.status <= 599
  );
}

export function isVisitorDependentResponse(response: Response): boolean {
  return isVisitorDependentHeaders(response.headers);
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
