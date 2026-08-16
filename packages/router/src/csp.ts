// CSP header serializer used by the App Router metadata pipeline.
//
// Validates both nonce and directive values before string-concatenating
// them into the Content-Security-Policy header. Background: directive
// concatenation with `; ` and quoted-source concatenation with `' '` are
// trivially escapable if untrusted strings reach the metadata field.
//
// Allowed nonce shape: base64 / base64url alphabet only (`+/=` and `-_=`).
// Allowed directive value shape: no `;`, no quote, no whitespace, no ASCII
// control characters. Quoted-keyword forms (`'self'`, `'nonce-...'`,
// `'sha256-...'`, etc.) are accepted via the `'...'` allow-list pattern.

export interface ContentSecurityPolicyInput {
  disable?: boolean;
  directives?: Record<string, readonly string[] | string>;
  nonce?: string;
  remove?: readonly string[];
  replace?: Record<string, readonly string[] | string>;
}

export function responseHeadersContainCspNonce(headers: Headers): boolean {
  for (const name of ["content-security-policy", "content-security-policy-report-only"]) {
    const value = headers.get(name);
    if (value !== null && /(?:^|[\s;,])'nonce-[^']+'(?=$|[\s;,])/i.test(value)) {
      return true;
    }
  }

  return false;
}

const VALID_NONCE = /^[A-Za-z0-9+/=_-]+$/;
const VALID_DIRECTIVE_NAME = /^[a-z][a-z0-9-]*$/i;
// One CSP "source expression". Reject anything containing `;`, quote,
// whitespace, or ASCII control characters. Quoted keywords like
// `'self'`, `'unsafe-inline'`, `'nonce-XYZ='` are accepted via the
// alternate `'...'` shape.
const VALID_QUOTED_DIRECTIVE_VALUE = /^'[A-Za-z0-9+/=_:.-]+'$/;

function isValidNonce(nonce: string): boolean {
  return VALID_NONCE.test(nonce);
}

function isValidDirectiveName(name: string): boolean {
  return VALID_DIRECTIVE_NAME.test(name);
}

function isValidDirectiveValue(value: string): boolean {
  if (VALID_QUOTED_DIRECTIVE_VALUE.test(value)) {
    return true;
  }

  if (value.length === 0) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (
      code <= 0x20 ||
      code === 0x22 ||
      code === 0x27 ||
      code === 0x3b ||
      code === 0x7f
    ) {
      return false;
    }
  }

  return true;
}

export function contentSecurityPolicy(
  csp: ContentSecurityPolicyInput | undefined,
): string | undefined {
  if (csp?.disable === true || csp?.directives === undefined) {
    return undefined;
  }

  if (csp.nonce !== undefined && !isValidNonce(csp.nonce)) {
    throw new TypeError(
      `invalid CSP nonce: ${JSON.stringify(csp.nonce)} - must be base64 / base64url`,
    );
  }

  const serialized: string[] = [];

  for (const [name, value] of Object.entries(csp.directives)) {
    if (!isValidDirectiveName(name)) {
      throw new TypeError(`invalid CSP directive name: ${JSON.stringify(name)}`);
    }

    const rawValues = Array.isArray(value) ? [...value] : [value];

    for (const rawValue of rawValues) {
      if (typeof rawValue !== "string" || !isValidDirectiveValue(rawValue)) {
        throw new TypeError(
          `invalid CSP directive value for ${name}: ${JSON.stringify(rawValue)}`,
        );
      }
    }

    const values = [...rawValues];

    if (csp.nonce !== undefined && (name === "script-src" || name === "style-src")) {
      values.push(`'nonce-${csp.nonce}'`);
    }

    serialized.push(`${name} ${values.join(" ")}`);
  }

  return serialized.join("; ");
}
