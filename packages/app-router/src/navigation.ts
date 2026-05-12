const redirectErrorName = "MReactRedirect";
const notFoundErrorName = "MReactNotFound";
const rewriteHeaderName = "x-mreact-rewrite";
const rewriteLocationSymbol = Symbol.for("mreact.app-router.rewriteLocation");

export interface RedirectOptions {
  status?: 301 | 302 | 303 | 307 | 308;
}

export type MiddlewareNext = undefined;

export function redirect(location: string, options: RedirectOptions = {}): never {
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
  const values = new Map<string, string>();

  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");

    if (name === undefined || name === "") {
      continue;
    }

    values.set(name, decodeURIComponent(rest.join("=")));
  }

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
