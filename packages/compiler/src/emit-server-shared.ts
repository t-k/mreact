import { parseSync } from "oxc-parser";
import { isBooleanishStringAttribute as isSharedBooleanishStringAttribute } from "@reckona/mreact-shared";
import { readArray, readObject, unwrapOxcParentheses } from "./oxc-node-utils.js";

export interface StaticStyleObjectEntry {
  cssName: string;
  valueCode: string;
}

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
  "data",
  "codebase",
  "srcset",
  "imagesrcset",
]);

const DANGEROUS_HTML_ATTRIBUTE_NAMES = new Set(["srcdoc"]);

const VOID_HTML_ELEMENT_NAMES = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const SIMPLE_IDENT_CHAIN_RE = /^(this|[A-Za-z_$][\w$]*)(\.[A-Za-z_$][\w$]*)*$/;
const NUMERIC_LITERAL_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const SIMPLE_STRING_LITERAL_RE = /^"(?:[^"\\]|\\.)*"$/;
const SIMPLE_SINGLE_QUOTE_RE = /^'(?:[^'\\]|\\.)*'$/;

const HTML_ATTRIBUTE_ALIASES: Record<string, string> = {
  acceptCharset: "accept-charset",
  autoCapitalize: "autocapitalize",
  autoFocus: "autofocus",
  autoPlay: "autoplay",
  charSet: "charset",
  className: "class",
  colSpan: "colspan",
  contentEditable: "contenteditable",
  crossOrigin: "crossorigin",
  encType: "enctype",
  formAction: "formaction",
  frameBorder: "frameborder",
  htmlFor: "for",
  httpEquiv: "http-equiv",
  maxLength: "maxlength",
  minLength: "minlength",
  noValidate: "novalidate",
  playsInline: "playsinline",
  readOnly: "readonly",
  rowSpan: "rowspan",
  spellCheck: "spellcheck",
  imageSrcSet: "imagesrcset",
  srcDoc: "srcdoc",
  srcSet: "srcset",
  tabIndex: "tabindex",
  useMap: "usemap",
};

export function isUrlAttribute(name: string): boolean {
  return URL_ATTRIBUTE_NAMES.has(name.toLowerCase());
}

export function isDangerousHtmlAttribute(name: string): boolean {
  return DANGEROUS_HTML_ATTRIBUTE_NAMES.has(name.toLowerCase());
}

export function isVoidHtmlElement(tagName: string): boolean {
  return VOID_HTML_ELEMENT_NAMES.has(tagName);
}

export function isStaticUrlValueUnsafe(name: string, value: string): boolean {
  const attributeName = name.toLowerCase();
  if (attributeName === "srcset" || attributeName === "imagesrcset") {
    const canonicalSet = canonicalizeUrlForSchemeCheck(value);
    for (const candidate of canonicalSet.split(",")) {
      const url = candidate.trim().split(/\s+/)[0] ?? "";
      if (url !== "" && isStaticUrlValueUnsafe("src", url)) {
        return true;
      }
    }
    return false;
  }

  const canonical = canonicalizeUrlForSchemeCheck(value);
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(canonical);
  if (match === null || match[1] === undefined) return false;
  const scheme = match[1].toLowerCase();
  if (
    scheme === "javascript" ||
    scheme === "vbscript" ||
    scheme === "livescript" ||
    scheme === "mhtml" ||
    scheme === "file"
  )
    return true;
  if (scheme === "data") {
    if (
      (attributeName === "src" || attributeName === "poster") &&
      /^data:image\/(?!svg\+xml\s*(?:[;,]|$))/i.test(canonical)
    )
      return false;
    return true;
  }
  return false;
}

function canonicalizeUrlForSchemeCheck(value: string): string {
  let start = 0;

  while (start < value.length && value.charCodeAt(start) <= 0x20) {
    start += 1;
  }

  return value.slice(start).replace(/[\t\r\n]/g, "");
}

export function parseStyleLiteralValue(code: string): string | number | null | undefined {
  const trimmed = unwrapParenthesized(code.trim());

  if (trimmed === "null" || trimmed === "false" || trimmed === "undefined") {
    return null;
  }

  if (trimmed === "true") {
    return "";
  }

  if (NUMERIC_LITERAL_RE.test(trimmed)) {
    return Number(trimmed);
  }

  if (SIMPLE_STRING_LITERAL_RE.test(trimmed)) {
    return JSON.parse(trimmed) as string;
  }

  if (SIMPLE_SINGLE_QUOTE_RE.test(trimmed)) {
    return JSON.parse(`"${trimmed.slice(1, -1).replaceAll('"', '\\"')}"`) as string;
  }

  return undefined;
}

export function parseStaticStyleObjectLiteral(code: string): StaticStyleObjectEntry[] | undefined {
  const objectCode = unwrapParenthesized(code.trim());
  const stringParsedEntries = parseStaticStyleObjectLiteralFromString(objectCode);

  if (stringParsedEntries !== undefined) {
    return stringParsedEntries;
  }

  return parseStaticStyleObjectLiteralWithOxc(objectCode);
}

function parseStaticStyleObjectLiteralFromString(
  objectCode: string,
): StaticStyleObjectEntry[] | undefined {
  if (!objectCode.startsWith("{") || !objectCode.endsWith("}")) {
    return undefined;
  }

  const body = objectCode.slice(1, -1).trim();

  if (body === "") {
    return [];
  }

  const entries: StaticStyleObjectEntry[] = [];

  for (const property of splitTopLevel(body, ",")) {
    const trimmed = property.trim();

    if (trimmed === "" || trimmed.startsWith("...") || trimmed.startsWith("[")) {
      return undefined;
    }

    const colonIndex = findTopLevelColon(trimmed);

    if (colonIndex < 0) {
      return undefined;
    }

    const rawKey = trimmed.slice(0, colonIndex).trim();
    const valueCode = trimmed.slice(colonIndex + 1).trim();
    const key = parseStaticObjectKey(rawKey);

    if (key === undefined || valueCode === "") {
      return undefined;
    }

    entries.push({ cssName: cssPropertyName(key), valueCode });
  }

  return entries;
}

function parseStaticStyleObjectLiteralWithOxc(
  objectCode: string,
): StaticStyleObjectEntry[] | undefined {
  if (!objectCode.startsWith("{") || !objectCode.endsWith("}")) {
    return undefined;
  }

  const prefix = "const __mreactStyle = ";
  const source = `${prefix}${objectCode};`;
  const parsed = parseSync("style-object.tsx", source, {
    lang: "tsx",
    sourceType: "module",
    astType: "ts",
  });

  if (parsed.errors.length > 0) {
    return undefined;
  }

  const body = readArray(readObject(parsed.program).body);
  const declaration = readArray(readObject(body[0]).declarations)[0];
  const init = unwrapOxcParentheses(readObject(readObject(declaration).init));

  if (init.type !== "ObjectExpression") {
    return undefined;
  }

  const entries: StaticStyleObjectEntry[] = [];

  for (const property of readArray(init.properties)) {
    const propertyObject = readObject(property);

    if (
      propertyObject.type !== "Property" ||
      propertyObject.kind !== "init" ||
      propertyObject.method === true ||
      propertyObject.computed === true ||
      propertyObject.shorthand === true
    ) {
      return undefined;
    }

    const key = readStaticOxcObjectKey(propertyObject.key);
    const value = readObject(propertyObject.value);
    const start = readNumber(value.start);
    const end = readNumber(value.end);

    if (key === undefined || start < prefix.length || end < start) {
      return undefined;
    }

    entries.push({
      cssName: cssPropertyName(key),
      valueCode: source.slice(start, end),
    });
  }

  return entries;
}

function readStaticOxcObjectKey(node: unknown): string | undefined {
  const key = readObject(node);

  if (key.type === "Identifier") {
    return typeof key.name === "string" ? key.name : undefined;
  }

  if (key.type === "Literal") {
    return typeof key.value === "string" ? key.value : undefined;
  }

  return undefined;
}

function readNumber(value: unknown): number {
  return typeof value === "number" ? value : -1;
}

export function simpleSideEffectFreeExpression(code: string): string | undefined {
  const trimmed = unwrapParenthesized(code.trim());

  if (trimmed === "") {
    return undefined;
  }

  if (trimmed === "true" || trimmed === "false" || trimmed === "null" || trimmed === "undefined") {
    return trimmed;
  }

  if (
    NUMERIC_LITERAL_RE.test(trimmed) ||
    SIMPLE_STRING_LITERAL_RE.test(trimmed) ||
    SIMPLE_SINGLE_QUOTE_RE.test(trimmed) ||
    SIMPLE_IDENT_CHAIN_RE.test(trimmed)
  ) {
    return trimmed;
  }

  return undefined;
}

export function htmlAttributeName(name: string): string {
  return Object.hasOwn(HTML_ATTRIBUTE_ALIASES, name)
    ? (HTML_ATTRIBUTE_ALIASES[name] as string)
    : name;
}

export function isBooleanishStringAttribute(name: string): boolean {
  return isSharedBooleanishStringAttribute(htmlAttributeName(name));
}

const SELECTED_MARKER_LITERAL = '" selected=\\"\\""';

/**
 * Combines a `<select>` element's `value` and `defaultValue` expressions into the
 * single selection expression its descendant `<option>` elements compare against.
 *
 * `value` wins whenever it evaluates to something other than `null`/`undefined`,
 * matching React's `props.value != null ? props.value : props.defaultValue`.
 * Returning `undefined` means the select is uncontrolled, which leaves each
 * option's own `selected` attribute in charge.
 */
export function emitSelectSelectionValueCode(
  valueCode: string | undefined,
  defaultValueCode: string | undefined,
): string | undefined {
  if (valueCode === undefined) {
    return defaultValueCode;
  }
  if (defaultValueCode === undefined) {
    return valueCode;
  }
  return `(${valueCode} ?? ${defaultValueCode})`;
}

/**
 * Emits the ` selected=""` attribute fragment for one `<option>` rendered inside a
 * `<select>` that declares a selection.
 *
 * Shared by the string and the stream server emitters so both agree on value
 * normalization (`String()` comparison, so `2` matches `"2"`), on array values
 * (`<select multiple>`), and on precedence: a live selection replaces the
 * option's own `selected`, and only an absent selection falls back to it.
 */
export function emitOptionSelectedAttributeCode(
  selectedValueCode: string,
  optionValueCode: string,
  ownSelectedFallbackCode: string,
): string {
  return (
    `(() => { const _selected = (${selectedValueCode}); ` +
    `if (_selected == null) return ${ownSelectedFallbackCode}; ` +
    `const _optionValue = String(${optionValueCode}); ` +
    `if (Array.isArray(_selected)) { ` +
    `for (let _i = 0; _i < _selected.length; _i++) { ` +
    `const _candidate = _selected[_i]; ` +
    `if (_candidate != null && String(_candidate) === _optionValue) return ${SELECTED_MARKER_LITERAL}; ` +
    `} return ""; } ` +
    `return String(_selected) === _optionValue ? ${SELECTED_MARKER_LITERAL} : ""; })()`
  );
}

function unwrapParenthesized(code: string): string {
  let current = code;

  while (
    current.startsWith("(") &&
    current.endsWith(")") &&
    findMatchingClose(current, 0) === current.length - 1
  ) {
    current = current.slice(1, -1).trim();
  }

  return current;
}

function splitTopLevel(code: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | undefined;

  for (let index = 0; index < code.length; index += 1) {
    const char = code[index];

    if (quote !== undefined) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{" || char === "[" || char === "(") {
      depth += 1;
      continue;
    }

    if (char === "}" || char === "]" || char === ")") {
      depth -= 1;
      continue;
    }

    if (depth === 0 && char === separator) {
      parts.push(code.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(code.slice(start));
  return parts;
}

function findTopLevelColon(code: string): number {
  return splitTopLevel(code, ":")[0]?.length ?? -1;
}

function findMatchingClose(code: string, openIndex: number): number {
  let depth = 0;
  let quote: string | undefined;

  for (let index = openIndex; index < code.length; index += 1) {
    const char = code[index];

    if (quote !== undefined) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function parseStaticObjectKey(rawKey: string): string | undefined {
  if (/^[A-Za-z_$][\w$]*$/.test(rawKey)) {
    return rawKey;
  }

  if (
    (rawKey.startsWith('"') && rawKey.endsWith('"')) ||
    (rawKey.startsWith("'") && rawKey.endsWith("'"))
  ) {
    return rawKey.slice(1, -1);
  }

  return undefined;
}

function cssPropertyName(name: string): string {
  return name.startsWith("--") ? name : name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}
