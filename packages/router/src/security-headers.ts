import type { RouteSecurityHeaders } from "./types.js";

const DEFAULT_SECURITY_HEADERS = Object.freeze({
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
});

export function routeSecurityHeaders(options: {
  request: Request;
  security: RouteSecurityHeaders | undefined;
}): Record<string, string> {
  const headers: Record<string, string> = { ...DEFAULT_SECURITY_HEADERS };
  const security = options.security;

  if (security?.contentTypeOptions === null) {
    delete headers["x-content-type-options"];
  } else {
    headers["x-content-type-options"] = validateHeaderValue(
      security?.contentTypeOptions ?? "nosniff",
    );
  }

  if (security?.referrerPolicy === null) {
    delete headers["referrer-policy"];
  } else {
    headers["referrer-policy"] = validateHeaderValue(
      security?.referrerPolicy ?? "strict-origin-when-cross-origin",
    );
  }

  if (security?.permissionsPolicy === null) {
    delete headers["permissions-policy"];
  } else {
    const permissionsPolicy = serializePermissionsPolicy(security?.permissionsPolicy);
    if (permissionsPolicy === undefined) {
      delete headers["permissions-policy"];
    } else {
      headers["permissions-policy"] = permissionsPolicy;
    }
  }

  if (security?.frameOptions === null) {
    delete headers["x-frame-options"];
  } else if (security?.frameOptions !== undefined) {
    headers["x-frame-options"] = validateHeaderValue(security.frameOptions);
  }

  if (
    options.request.url.startsWith("https://") &&
    security?.hsts !== undefined &&
    security.hsts !== false &&
    security.hsts !== null
  ) {
    headers["strict-transport-security"] = serializeHsts(security.hsts);
  }

  return headers;
}

/**
 * Returns the configured Strict-Transport-Security value regardless of scheme.
 *
 * `routeSecurityHeaders` only emits the header for secure requests, so callers
 * that persist a response across requests need the configured value on its own:
 * the scheme of the request that happened to produce the response must not
 * decide what later requests receive.
 *
 * An invalid value yields `undefined` rather than throwing. This runs on every
 * render that may be cached, including plain ones that would never emit the
 * header, and reporting the configuration error is `routeSecurityHeaders`'s
 * job on the request that actually emits it.
 */
export function configuredHstsHeader(
  security: RouteSecurityHeaders | undefined,
): string | undefined {
  if (security?.hsts === undefined || security.hsts === false || security.hsts === null) {
    return undefined;
  }

  try {
    return serializeHsts(security.hsts);
  } catch {
    return undefined;
  }
}

function serializeHsts(hsts: NonNullable<RouteSecurityHeaders["hsts"]>): string {
  if (hsts === false) {
    throw new TypeError("Invalid security header value for hsts.");
  }

  const maxAge = Math.trunc(hsts.maxAge);
  if (!Number.isFinite(maxAge) || maxAge < 0) {
    throw new TypeError("Invalid security header value for hsts.maxAge.");
  }

  const parts = [`max-age=${maxAge}`];
  if (hsts.includeSubDomains === true) {
    parts.push("includeSubDomains");
  }
  if (hsts.preload === true) {
    parts.push("preload");
  }

  return parts.join("; ");
}

function serializePermissionsPolicy(
  policy: NonNullable<RouteSecurityHeaders["permissionsPolicy"]> | undefined,
): string | undefined {
  if (policy === undefined) {
    return DEFAULT_SECURITY_HEADERS["permissions-policy"];
  }

  const directives: string[] = [];
  for (const [directive, allowlist] of Object.entries(policy)) {
    if (allowlist === null || allowlist === undefined) {
      continue;
    }

    validateToken(directive, "permissionsPolicy directive");
    for (const value of allowlist) {
      validatePermissionAllowlistValue(value);
    }
    directives.push(`${directive}=(${allowlist.join(" ")})`);
  }

  return directives.length === 0 ? undefined : directives.join(", ");
}

function validateHeaderValue(value: string): string {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      throw new TypeError(`Invalid security header value: ${JSON.stringify(value)}`);
    }
  }

  return value;
}

function validateToken(value: string, label: string): void {
  if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(value)) {
    throw new TypeError(`Invalid security header value for ${label}: ${JSON.stringify(value)}`);
  }
}

function validatePermissionAllowlistValue(value: string): void {
  if (value === "self" || value === "*" || /^[A-Za-z][A-Za-z0-9+.-]*:$/.test(value)) {
    return;
  }

  if (/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(value)) {
    return;
  }

  throw new TypeError(
    `Invalid security header value for permissionsPolicy allowlist: ${JSON.stringify(value)}`,
  );
}
