// Shared attribute-safety helpers used by both the runtime SSR slow path
// (`renderHtmlAttribute`) and the compiler-generated fast path
// (`emit-server.ts` / `emit-server-stream.ts`). Issue 062 / 073 closed
// the URL scheme allow-list bypass; Issue 078 closed the in-scheme
// whitespace bypass (e.g. `java\tscript:alert(1)`).

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

// `srcset` carries comma-separated URL candidates. It needs the same
// scheme allow-list as `src` but must be split before checking.
const SRCSET_ATTRIBUTE_NAMES = new Set(["srcset", "imagesrcset"]);

// Attributes whose value is parsed as HTML (not as text or URL). The
// browser decodes attribute entities and feeds the result into a new
// HTML parser context that inherits the embedder's origin. We treat
// these like `dangerouslySetInnerHTML`: drop the attribute unless the
// developer opts in via an `__html` wrapper.
const DANGEROUS_HTML_ATTRIBUTE_NAMES = new Set(["srcdoc"]);

export function isDangerousHtmlAttribute(name: string): boolean {
  return DANGEROUS_HTML_ATTRIBUTE_NAMES.has(name);
}

// True when the value is the explicit opt-in shape (`{ __html: "..." }`).
// This intentionally mirrors React's `dangerouslySetInnerHTML` contract
// so the same code pattern works for srcdoc.
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

export function isSrcsetAttribute(name: string): boolean {
  return SRCSET_ATTRIBUTE_NAMES.has(name);
}

// Canonicalizes a URL value the way the WHATWG URL parser does before
// reading the scheme: strip leading C0/whitespace AND remove every ASCII
// tab / CR / LF anywhere in the input. The browser does both, so any
// scheme allow-list that only does the leading strip is bypassable with
// values like `"java\tscript:alert(1)"` (Issue 078).
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
  // Allow data:image/* on <img>/<source>/<video>/<audio> poster -- these
  // are non-script sinks and inline data:image previews are common.
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
    // `srcset` = "url [descriptor], url [descriptor], ...". Canonicalize
    // first so attackers cannot smuggle the scheme past the split with
    // tabs/CR/LF inside the URL ("java\tscript:..."). Any candidate URL
    // that resolves to an unsafe scheme taints the whole attribute.
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

// Returns the value unchanged when it is safe to emit for `name`, or
// `undefined` when the attribute should be dropped. Convenient for inline
// emit: `_safeUrl(name, value) === undefined ? "" : ` ${name}="..."``.
export function safeUrlAttributeValue(name: string, value: string): string | undefined {
  return isUnsafeUrlAttribute(name, value) ? undefined : value;
}

// Inspects an `http-equiv` directive together with the `content` value.
// Returns true when the directive is `refresh` and the embedded URL
// (after the `;url=` segment) resolves to an unsafe scheme. Other
// http-equiv values (`content-type`, etc.) are not URL-bearing.
export function isUnsafeMetaRefreshContent(httpEquiv: string, content: string): boolean {
  if (httpEquiv.toLowerCase() !== "refresh") return false;
  // Format: `<delay>` or `<delay>;url=<url>` (case-insensitive on `url=`).
  const match = /^[^;]*;\s*url\s*=\s*(.+)$/iu.exec(content);
  if (match === null || match[1] === undefined) return false;
  return isUnsafeUrlValueForName("href", match[1].trim());
}
