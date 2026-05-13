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
  directives?: Record<string, readonly string[] | string>;
  nonce?: string;
}

const VALID_NONCE = /^[A-Za-z0-9+/=_-]+$/;
const VALID_DIRECTIVE_NAME = /^[a-z][a-z0-9-]*$/i;
// One CSP "source expression". Reject anything containing `;`, quote,
// whitespace, or ASCII control characters. Quoted keywords like
// `'self'`, `'unsafe-inline'`, `'nonce-XYZ='` are accepted via the
// alternate `'...'` shape.
const VALID_DIRECTIVE_VALUE = /^(?:'[A-Za-z0-9+/=_:.-]+'|[^\s;'"\x00-\x1f\x7f]+)$/;

function isValidNonce(nonce: string): boolean {
  return VALID_NONCE.test(nonce);
}

function isValidDirectiveName(name: string): boolean {
  return VALID_DIRECTIVE_NAME.test(name);
}

function isValidDirectiveValue(value: string): boolean {
  return VALID_DIRECTIVE_VALUE.test(value);
}

export function contentSecurityPolicy(
  csp: ContentSecurityPolicyInput | undefined,
): string | undefined {
  if (csp?.directives === undefined) {
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
