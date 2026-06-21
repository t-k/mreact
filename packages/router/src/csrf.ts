const csrfCookieNameProduction = "__Host-mreact.csrf";
const csrfCookieNameDevelopment = "mreact.csrf";
const formFieldCsrf = "__mreact_csrf";

/**
 * Names the hidden form field used for app-router CSRF validation.
 */
export const formCsrfFieldName = formFieldCsrf;

export function serverActionCookie(csrfToken: string): string {
  const production = isProductionEnvironment();
  const parts = [
    `${currentCsrfCookieName()}=${encodeURIComponent(csrfToken)}`,
    "Path=/",
    "SameSite=Lax",
    "HttpOnly",
  ];

  if (production) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function serverActionCookieName(): string {
  return currentCsrfCookieName();
}

/**
 * Creates or reuses the CSRF token embedded into server-rendered forms.
 */
export function createFormCsrfToken(request?: Request | undefined): string {
  return readExistingFormCsrfToken(request) ?? randomToken();
}

/**
 * Serializes the CSRF cookie used to validate app-router form submissions.
 */
export function formCsrfCookie(csrfToken: string): string {
  return serverActionCookie(csrfToken);
}

/**
 * Validates the CSRF cookie and hidden form field for a form submission.
 */
export function validateFormCsrf(request: Request, formData: FormData): Response | undefined {
  const formToken = stringFormValue(formData.get(formFieldCsrf));
  const cookieHeader = request.headers.get("cookie");
  const cookieToken = csrfCookieNamesRead()
    .map((name) => readCookie(cookieHeader, name))
    .find((token) => token !== undefined);

  if (formToken === undefined || cookieToken === undefined) {
    return jsonResponse({ ok: false, error: "Invalid CSRF token." }, 403);
  }

  return timingSafeStringEqual(formToken, cookieToken)
    ? undefined
    : jsonResponse({ ok: false, error: "Invalid CSRF token." }, 403);
}

export function readExistingFormCsrfToken(request: Request | undefined): string | undefined {
  const cookieHeader = request?.headers.get("cookie") ?? null;

  for (const name of csrfCookieNamesRead()) {
    const token = readCookie(cookieHeader, name);

    if (token !== undefined && isCsrfTokenShape(token)) {
      return token;
    }
  }

  return undefined;
}

function isCsrfTokenShape(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function randomToken(): string {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error("Web Crypto is required to create a CSRF token.");
  }

  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function isProductionEnvironment(): boolean {
  return typeof process !== "undefined" && process.env?.NODE_ENV === "production";
}

function currentCsrfCookieName(): string {
  return isProductionEnvironment() ? csrfCookieNameProduction : csrfCookieNameDevelopment;
}

function csrfCookieNamesRead(): readonly string[] {
  return isProductionEnvironment()
    ? [csrfCookieNameProduction]
    : [csrfCookieNameProduction, csrfCookieNameDevelopment];
}

function timingSafeStringEqual(left: string, right: string): boolean {
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}

function stringFormValue(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (cookieHeader === null || cookieHeader.trim() === "") {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (rawName !== name) {
      continue;
    }

    try {
      return decodeURIComponent(rawValue.join("="));
    } catch {
      return rawValue.join("=");
    }
  }

  return undefined;
}

function jsonResponse(payload: unknown, status: number): Response {
  return Response.json(payload, { status });
}
