// Canonical URL and HTML-attribute safety helpers shared across server,
// React compatibility, and reactive DOM render paths.

/** Returns true for HTML attributes that require explicit unsafe-HTML opt-in handling. */
export function isDangerousHtmlAttribute(name: string): boolean {
  return name.toLowerCase() === "srcdoc";
}

/** Reads an own string data property without invoking the payload's getter. */
export function readDangerousHtmlOptIn(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;

  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "__html");
    return descriptor !== undefined && "value" in descriptor && typeof descriptor.value === "string"
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

/** Returns whether a value carries an own string raw HTML data property. */
export function isDangerousHtmlOptIn(value: unknown): value is { __html: string } {
  return readDangerousHtmlOptIn(value) !== undefined;
}

/** Returns true when an attribute name normally carries a single URL value. */
export function isUrlAttribute(name: string): boolean {
  return /^(href|src|action|formaction|xlink:href|ping|poster|background|manifest|data|codebase)$/.test(
    name.toLowerCase(),
  );
}

/** Returns true when an attribute name carries a srcset-style URL list. */
export function isSrcsetAttribute(name: string): boolean {
  const attributeName = name.toLowerCase();
  return attributeName === "srcset" || attributeName === "imagesrcset";
}

/** Checks whether an HTML URL-bearing attribute value uses a blocked scheme. */
export function isUnsafeUrlAttribute(name: string, value: string): boolean {
  const attributeName = name.toLowerCase();
  if (isUrlAttribute(attributeName)) {
    return isUnsafeUrlValueForName(attributeName, value);
  }
  if (isSrcsetAttribute(attributeName)) {
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

/** Returns the original URL attribute value when it is safe, otherwise undefined. */
export function safeUrlAttributeValue(name: string, value: string): string | undefined {
  return isUnsafeUrlAttribute(name, value) ? undefined : value;
}

/** Checks whether a meta refresh content value redirects to an unsafe URL. */
export function isUnsafeMetaRefreshContent(httpEquiv: string, content: string): boolean {
  if (httpEquiv.toLowerCase() !== "refresh") return false;
  const match = /^[^;]*;\s*url\s*=\s*([\s\S]+)$/iu.exec(content);
  if (match === null || match[1] === undefined) return false;
  return isUnsafeUrlValueForName("href", stripSurroundingQuotes(match[1].trim()));
}

function stripSurroundingQuotes(value: string): string {
  if (value.length < 2) return value;

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
    return value.slice(1, -1).trim();
  }

  return value;
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
  if (!/^(javascript|data|vbscript|livescript|mhtml|file)$/.test(scheme)) return false;
  if (scheme === "data" && (name === "src" || name === "poster")) {
    if (/^data:image\/(?!svg\+xml\s*(?:[;,]|$))/i.test(canonical)) return false;
  }
  return true;
}
