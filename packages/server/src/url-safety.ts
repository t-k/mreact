// Shared URL-scheme allow/block list used by both the runtime SSR slow
// path (`renderHtmlAttribute`) and the compiler-generated fast path
// (`emit-server.ts` / `emit-server-stream.ts`). Closing Issue 073 means
// both routes must consult the same helper.

// Attributes that produce a navigation or script-execution context when
// dereferenced by the browser. Values feeding into these names must be
// scheme-validated.
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

// Block list mirrors react-dom's sanitizeURL. Any of these schemes in a URL
// attribute can execute script or open an out-of-process loader, so the value
// is dropped (the attribute remains absent rather than being rewritten).
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
  // WHATWG URL parsing strips leading C0 controls and ASCII whitespace.
  // Match the browser's view of the string before reading the scheme.
  const trimmed = value.replace(/^[\x00-\x20]+/u, "");
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (match === null || match[1] === undefined) return false;
  const scheme = match[1].toLowerCase();
  if (!UNSAFE_URL_SCHEMES.has(scheme)) return false;
  // Allow data: images on <img>/<video>/<audio>/<source>/poster -- these
  // are non-script sinks and inline data:image previews are common.
  if (scheme === "data" && (name === "src" || name === "poster")) {
    if (/^data:image\//i.test(trimmed)) return false;
  }
  return true;
}

// Returns the value unchanged when it is safe to emit for `name`, or
// `undefined` when the attribute should be dropped. Convenient for inline
// emit: `_safeUrl(name, value) === undefined ? "" : ` ${name}="..."``.
export function safeUrlAttributeValue(name: string, value: string): string | undefined {
  return isUnsafeUrlAttribute(name, value) ? undefined : value;
}
