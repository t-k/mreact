// Canonical URL and HTML-attribute safety helpers shared across server,
// React compatibility, and reactive DOM render paths.

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

const UNSAFE_URL_SCHEMES = new Set([
  "javascript",
  "data",
  "vbscript",
  "livescript",
  "mhtml",
  "file",
]);

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

export function isUrlAttribute(name: string): boolean {
  return URL_ATTRIBUTE_NAMES.has(name);
}

export function isSrcsetAttribute(name: string): boolean {
  return SRCSET_ATTRIBUTE_NAMES.has(name);
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

export function safeUrlAttributeValue(name: string, value: string): string | undefined {
  return isUnsafeUrlAttribute(name, value) ? undefined : value;
}

export function isUnsafeMetaRefreshContent(httpEquiv: string, content: string): boolean {
  if (httpEquiv.toLowerCase() !== "refresh") return false;
  const match = /^[^;]*;\s*url\s*=\s*(.+)$/iu.exec(content);
  if (match === null || match[1] === undefined) return false;
  return isUnsafeUrlValueForName("href", match[1].trim());
}

function canonicalizeUrlForSchemeCheck(value: string): string {
  let start = 0;

  while (start < value.length && value.charCodeAt(start) <= 0x20) {
    start += 1;
  }

  return value.slice(start).replace(/[\t\r\n]/g, "");
}

function schemeOf(value: string): string | undefined {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(value);
  if (match === null || match[1] === undefined) return undefined;
  return match[1].toLowerCase();
}

function isUnsafeUrlValueForName(name: string, value: string): boolean {
  const canonical = canonicalizeUrlForSchemeCheck(value);
  const scheme = schemeOf(canonical);
  if (scheme === undefined) return false;
  if (!UNSAFE_URL_SCHEMES.has(scheme)) return false;
  if (scheme === "data" && (name === "src" || name === "poster")) {
    if (/^data:image\/(?!svg\+xml(?:[;,]|$))/i.test(canonical)) return false;
  }
  return true;
}
