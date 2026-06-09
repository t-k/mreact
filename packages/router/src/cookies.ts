/**
 * Configures attributes used when serializing a Set-Cookie header.
 */
export interface CookieOptions {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "Strict" | "Lax" | "None";
  secure?: boolean;
}

const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function assertCookieName(name: string): void {
  if (!COOKIE_NAME.test(name)) {
    throw new TypeError(`invalid cookie name: ${JSON.stringify(name)}`);
  }
}

function assertAttributeValue(value: string): void {
  if (/[\r\n;]/.test(value)) {
    throw new TypeError(`invalid cookie attribute value: ${JSON.stringify(value)}`);
  }
}

/**
 * Parses a raw `Cookie` header into decoded name/value pairs.
 *
 * Malformed percent-encoded values are skipped so one bad cookie does not abort request handling.
 */
export function parseCookieHeader(
  cookieHeader: string | null | undefined,
): Map<string, string> {
  const values = new Map<string, string>();

  for (const part of (cookieHeader ?? "").split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (rawName === undefined || rawName === "") {
      continue;
    }

    const raw = rawValue.join("=");
    if (raw.indexOf("%") === -1) {
      values.set(rawName, raw);
      continue;
    }

    try {
      values.set(rawName, decodeURIComponent(raw));
    } catch {
      // Treat malformed cookie values as absent for this request.
    }
  }

  return values;
}

/**
 * Serializes a cookie name, value, and attributes for a `Set-Cookie` header.
 *
 * Cookie names and attribute values are validated, and `SameSite=None` requires `Secure`.
 */
export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {},
): string {
  assertCookieName(name);

  if (options.sameSite === "None" && options.secure !== true) {
    throw new TypeError("SameSite=None requires Secure");
  }

  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    if (!Number.isSafeInteger(options.maxAge)) {
      throw new TypeError("invalid cookie Max-Age");
    }
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.domain !== undefined) {
    assertAttributeValue(options.domain);
    parts.push(`Domain=${options.domain}`);
  }

  if (options.path !== undefined) {
    assertAttributeValue(options.path);
    parts.push(`Path=${options.path}`);
  }

  if (options.expires !== undefined) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.httpOnly === true) parts.push("HttpOnly");
  if (options.secure === true) parts.push("Secure");
  if (options.sameSite !== undefined) parts.push(`SameSite=${options.sameSite}`);

  return parts.join("; ");
}

/**
 * Appends a serialized cookie to a response's `Set-Cookie` headers and returns the same response.
 */
export function setCookie(
  response: Response,
  name: string,
  value: string,
  options: CookieOptions = {},
): Response {
  response.headers.append("set-cookie", serializeCookie(name, value, options));
  return response;
}

/**
 * Appends an expiring `Set-Cookie` header that removes a cookie in the browser.
 */
export function deleteCookie(
  response: Response,
  name: string,
  options: Pick<CookieOptions, "domain" | "path" | "sameSite" | "secure"> = {},
): Response {
  return setCookie(response, name, "", {
    ...options,
    maxAge: 0,
  });
}
