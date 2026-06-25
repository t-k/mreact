import { parseCookieHeader } from "./cookies.js";

const redirectErrorName = "MReactRedirect";
const notFoundErrorName = "MReactNotFound";
const rewriteHeaderName = "x-mreact-rewrite";
const rewriteLocationSymbol = Symbol.for("mreact.router.rewriteLocation");

export interface RedirectOptions {
  status?: 301 | 302 | 303 | 307 | 308;
}

export type MiddlewareNext = undefined;

/**
 * Describes a parser used by `parseForm()` to validate submitted form data.
 */
export interface ParseSchema<T> {
  parse(value: FormData): T;
}

// Strip leading C0 controls + ASCII whitespace per WHATWG URL parsing.
// Browsers ignore these characters when resolving the Location header,
// so attacker payloads must be rejected after the same normalization.
function stripLeadingControlOrWhitespace(value: string): string {
  let start = 0;

  while (start < value.length && value.charCodeAt(start) <= 0x20) {
    start += 1;
  }

  return value.slice(start);
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }

  return false;
}

// Returns true if `location` is safe to use as a same-origin Location header.
// Allowed: path-absolute (`/foo`), query-only (`?x=1`), hash-only (`#x`),
// relative (`foo`). Rejected: protocol-relative (`//evil`), backslash variants
// (`/\evil`, `\\evil`), and anything with a scheme like `javascript:`.
function isSafeInternalRedirect(location: string): boolean {
  if (containsControlCharacter(location)) return false;
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
  if (containsControlCharacter(location)) return false;
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

function throwUnsafeRewrite(location: string): never {
  throw new TypeError(`unsafe rewrite target: ${JSON.stringify(location)}`);
}

/**
 * Throws an internal redirect for loaders, middleware, route handlers, or server actions.
 *
 * The target must be same-origin or relative; use `redirectExternal()` for trusted `http` or `https` destinations. The default status is `303`.
 */
export function redirect(location: string, options: RedirectOptions = {}): never {
  if (!isSafeInternalRedirect(location)) {
    throwUnsafeRedirect(location);
  }
  throw Object.assign(new Error(`Redirect to ${location}`), {
    location,
    name: redirectErrorName,
    status: options.status ?? 303,
  });
}

/**
 * Throws an external redirect for trusted `http` or `https` destinations.
 *
 * This helper is intentionally separate from `redirect()` so off-site navigation is explicit. The default status is `307`.
 */
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

/**
 * Creates a same-origin `303 See Other` redirect response.
 *
 * Use this from route handlers when returning a `Response` is more convenient than throwing through the app-router control flow.
 */
export function redirect303(location: string, init: ResponseInit = {}): Response {
  if (!isSafeInternalRedirect(location)) {
    throwUnsafeRedirect(location);
  }

  const headers = new Headers(init.headers);
  headers.set("location", location);

  return new Response(null, {
    ...init,
    headers,
    status: 303,
  });
}

/**
 * Creates a plain-text error response with a default `text/plain` content type.
 */
export function textError(message: string, status = 400, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);

  if (!headers.has("content-type")) {
    headers.set("content-type", "text/plain; charset=utf-8");
  }

  return new Response(message, {
    ...init,
    headers,
    status,
  });
}

/**
 * Reads `request.formData()` and optionally validates it with a schema-like parser.
 *
 * Pass a schema object with `parse(FormData)` when a route handler or server action should receive typed form data.
 */
export async function parseForm(request: Request): Promise<FormData>;
export async function parseForm<T>(request: Request, schema: ParseSchema<T>): Promise<T>;
export async function parseForm<T>(
  request: Request,
  schema?: ParseSchema<T>,
): Promise<FormData | T> {
  const form = await request.formData();

  return schema === undefined ? form : schema.parse(form);
}

/**
 * Throws a route-level 404 control error.
 *
 * Use this from loaders, metadata, middleware, or route handlers when the matched route is valid but the requested resource is absent.
 */
export function notFound(): never {
  throw Object.assign(new Error("Not Found"), {
    name: notFoundErrorName,
    status: 404,
  });
}

/**
 * Alias for `notFound()` for codebases that prefer an explicit throwing helper name.
 */
export function throwNotFound(): never {
  return notFound();
}

/**
 * Continues middleware processing without changing the request.
 */
export function next(): MiddlewareNext {
  return undefined;
}

/**
 * Creates an internal rewrite response consumed by app-router middleware.
 *
 * The target must be a same-origin route path, query, hash, or relative URL; protocol-relative, external, and control-character targets are rejected.
 */
export function rewrite(location: string, init: ResponseInit = {}): Response {
  if (!isSafeInternalRedirect(location)) {
    throwUnsafeRewrite(location);
  }

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

/**
 * Creates a JSON response using the platform `Response.json()` implementation.
 */
export function json(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, init);
}

/**
 * Creates an HTML response and defaults the content type to `text/html; charset=utf-8`.
 */
export function html(value: string, init: ResponseInit = {}): Response {
  if (init.headers === undefined) {
    return new Response(value, {
      ...init,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const headers = new Headers(init.headers);

  if (!headers.has("content-type")) {
    headers.set("content-type", "text/html; charset=utf-8");
  }

  return new Response(value, {
    ...init,
    headers,
  });
}

/**
 * Returns the request headers object for route code that follows app-router helper naming.
 */
export function headers(request: Request): Headers {
  return request.headers;
}

export interface RequestCookies {
  entries(): IterableIterator<[string, string]>;
  get(name: string): string | undefined;
  has(name: string): boolean;
}

/**
 * Parses request cookies into a small read-only helper.
 *
 * Values are decoded with `decodeURIComponent`; malformed encoded values are ignored rather than throwing during request handling.
 */
export function cookies(request: Request): RequestCookies {
  let values: ReadonlyMap<string, string> | undefined;
  const cookieValues = () => {
    values ??= parseCookieHeader(request.headers.get("cookie"));
    return values;
  };

  return {
    entries: () => cookieValues().entries(),
    get: (name) => cookieValues().get(name),
    has: (name) => cookieValues().has(name),
  };
}

export function rewriteLocation(response: Response): string | undefined {
  const marked = (response as { [rewriteLocationSymbol]?: unknown })[rewriteLocationSymbol];
  const candidate = typeof marked === "string"
    ? marked
    : response.headers.get(rewriteHeaderName) ?? undefined;

  return candidate !== undefined && isSafeInternalRedirect(candidate) ? candidate : undefined;
}

/**
 * Checks whether an unknown error is an app-router redirect signal.
 */
export function isRedirectError(error: unknown): error is Error & { location: string; status: number } {
  return error instanceof Error &&
    error.name === redirectErrorName &&
    typeof (error as { location?: unknown }).location === "string";
}

/**
 * Checks whether an unknown error is an app-router not-found signal.
 */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.name === notFoundErrorName;
}
