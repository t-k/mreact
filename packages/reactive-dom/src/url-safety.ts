// Mirrors packages/server/src/url-safety.ts. Duplicated rather than
// imported so packages/reactive-dom stays free of cross-package source
// imports. Keep all copies in sync (server, react-compat, reactive-dom).

const URL_ATTRIBUTE_NAMES = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "ping",
  "poster",
  "background",
  "manifest",
]);

const SRCSET_ATTRIBUTE_NAMES = new Set(["srcset", "imagesrcset"]);

const DANGEROUS_HTML_ATTRIBUTE_NAMES = new Set(["srcdoc"]);

export function isDangerousHtmlAttribute(name: string): boolean {
  return DANGEROUS_HTML_ATTRIBUTE_NAMES.has(name);
}

export function isDangerousHtmlOptIn(
  value: unknown,
): value is { __html: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "__html" in value &&
    typeof (value as { __html?: unknown }).__html === "string"
  );
}

const UNSAFE_URL_SCHEMES = new Set([
  "javascript",
  "data",
  "vbscript",
  "livescript",
  "mhtml",
  "file",
]);

export function isUrlAttribute(name: string): boolean {
  return URL_ATTRIBUTE_NAMES.has(name);
}

export function isSrcsetAttribute(name: string): boolean {
  return SRCSET_ATTRIBUTE_NAMES.has(name);
}

function canonicalizeUrlForSchemeCheck(value: string): string {
  return value
    .replace(/^[\x00-\x20]+/u, "")
    .replace(/[\t\r\n]/g, "");
}

function isUnsafeUrlValueForName(name: string, value: string): boolean {
  const canonical = canonicalizeUrlForSchemeCheck(value);
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(canonical);
  if (match === null || match[1] === undefined) return false;
  const scheme = match[1].toLowerCase();
  if (!UNSAFE_URL_SCHEMES.has(scheme)) return false;
  if (scheme === "data" && (name === "src" || name === "poster")) {
    if (/^data:image\//i.test(canonical)) return false;
  }
  return true;
}

export function isUnsafeUrlAttribute(name: string, value: string): boolean {
  if (isUrlAttribute(name)) {
    return isUnsafeUrlValueForName(name, value);
  }
  if (isSrcsetAttribute(name)) {
    const canonical = canonicalizeUrlForSchemeCheck(value);
    for (const candidate of canonical.split(",")) {
      const url = candidate.trim().split(/\s+/)[0] ?? "";
      if (url === "") continue;
      if (isUnsafeUrlValueForName("src", url)) return true;
    }
    return false;
  }
  return false;
}
