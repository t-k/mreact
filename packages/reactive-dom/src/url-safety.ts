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

export function isUnsafeUrlAttribute(name: string, value: string): boolean {
  if (!isUrlAttribute(name)) return false;
  const trimmed = value.replace(/^[\x00-\x20]+/u, "");
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (match === null || match[1] === undefined) return false;
  const scheme = match[1].toLowerCase();
  if (!UNSAFE_URL_SCHEMES.has(scheme)) return false;
  if (scheme === "data" && (name === "src" || name === "poster")) {
    if (/^data:image\//i.test(trimmed)) return false;
  }
  return true;
}
