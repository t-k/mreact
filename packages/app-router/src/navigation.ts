const redirectErrorName = "MReactRedirect";
const notFoundErrorName = "MReactNotFound";

export interface RedirectOptions {
  status?: 301 | 302 | 303 | 307 | 308;
}

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

export function isRedirectError(error: unknown): error is Error & { location: string; status: number } {
  return error instanceof Error &&
    error.name === redirectErrorName &&
    typeof (error as { location?: unknown }).location === "string";
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.name === notFoundErrorName;
}
