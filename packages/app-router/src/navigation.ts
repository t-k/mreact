import { parseCookieHeader } from "./cookies.js";

const redirectErrorName = "MReactRedirect";
const notFoundErrorName = "MReactNotFound";
const rewriteHeaderName = "x-mreact-rewrite";
const rewriteLocationSymbol = Symbol.for("mreact.app-router.rewriteLocation");

export interface RedirectOptions {
  status?: 301 | 302 | 303 | 307 | 308;
}

export type MiddlewareNext = undefined;

// Strip leading C0 controls + ASCII whitespace per WHATWG URL parsing.
// Browsers ignore these characters when resolving the Location header,
// so attacker payloads must be rejected after the same normalization.
function stripLeadingControlOrWhitespace(value: string): string {
  return value.replace(/^[\x00-\x20]+/u, "");
}

// Returns true if `location` is safe to use as a same-origin Location header.
// Allowed: path-absolute (`/foo`), query-only (`?x=1`), hash-only (`#x`),
// relative (`foo`). Rejected: protocol-relative (`//evil`), backslash variants
// (`/\evil`, `\\evil`), and anything with a scheme like `javascript:`.
function isSafeInternalRedirect(location: string): boolean {
  const trimmed = stripLeadingControlOrWhitespace(location);
  if (trimmed === "") return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed.startsWith("/\\")) return false;
  if (trimmed.startsWith("\\")) return false;
  // Reject anything that parses as a URL with a scheme.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false;
  return true;
}

function isSafeExternalRedirect(location: string): boolean {
  const trimmed = stripLeadingControlOrWhitespace(location);
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (match === null || match[1] === undefined) return false;
  const scheme = match[1].toLowerCase();
  return scheme === "http" || scheme === "https";
}

function throwUnsafeRedirect(location: string): never {
  throw new TypeError(
    `unsafe redirect target: ${JSON.stringify(location)} - use redirectExternal() for off-site destinations and ensure the URL is http(s)`,
  );
}

export function redirect(location: string, options: RedirectOptions = {}): never {
  if (!isSafeInternalRedirect(location)) {
    throwUnsafeRedirect(location);
  }
  throw Object.assign(new Error(`Redirect to ${location}`), {
    location,
    name: redirectErrorName,
    status: options.status ?? 307,
  });
}

export function redirectExternal(
  location: string,
  options: RedirectOptions = {},
): never {
  if (!isSafeExternalRedirect(location)) {
    throwUnsafeRedirect(location);
  }
  throw Object.assign(new Error(`Redirect to ${location}`), {
    location,
    name: redirectErrorName,
    status: options.status ?? 307,
  });
}

export function notFound(): never {
  throw Object.assign(new Error("Not Found"), {
    name: notFoundErrorName,
    status: 404,
  });
}

export function next(): MiddlewareNext {
  return undefined;
}

export function rewrite(location: string, init: ResponseInit = {}): Response {
  const response = new Response(null, {
    ...init,
    status: init.status ?? 200,
  });

  Object.defineProperty(response, rewriteLocationSymbol, {
    configurable: false,
    enumerable: false,
    value: location,
  });

  return response;
}

export function json(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, init);
}

export function html(value: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);

  if (!headers.has("content-type")) {
    headers.set("content-type", "text/html; charset=utf-8");
  }

  return new Response(value, {
    ...init,
    headers,
  });
}

export function headers(request: Request): Headers {
  return request.headers;
}

export interface RequestCookies {
  entries(): IterableIterator<[string, string]>;
  get(name: string): string | undefined;
  has(name: string): boolean;
}

export function cookies(request: Request): RequestCookies {
  const values = parseCookieHeader(request.headers.get("cookie"));

  return {
    entries: () => values.entries(),
    get: (name) => values.get(name),
    has: (name) => values.has(name),
  };
}

export function rewriteLocation(response: Response): string | undefined {
  const marked = (response as { [rewriteLocationSymbol]?: unknown })[rewriteLocationSymbol];

  return typeof marked === "string"
    ? marked
    : response.headers.get(rewriteHeaderName) ?? undefined;
}

export function isRedirectError(error: unknown): error is Error & { location: string; status: number } {
  return error instanceof Error &&
    error.name === redirectErrorName &&
    typeof (error as { location?: unknown }).location === "string";
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.name === notFoundErrorName;
}
