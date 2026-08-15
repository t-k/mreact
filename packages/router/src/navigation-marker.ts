import { routeHydrationContract } from "./route-hydration-contract.js";

const markerAttribute = routeHydrationContract.routeMarkerAttribute;
const rawTextElementNames = new Set([
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "style",
  "textarea",
  "title",
  "xmp",
]);

interface ParsedStartTag {
  end: number;
  hasMarker: boolean;
  name: string;
  selfClosing: boolean;
}

export function hasNavigationRouteMarker(html: string): boolean {
  let cursor = 0;
  let foreignContentDepth = 0;
  let templateDepth = 0;

  while (cursor < html.length) {
    const openingBracket = html.indexOf("<", cursor);
    if (openingBracket < 0) {
      return false;
    }

    if (html.startsWith("<!--", openingBracket)) {
      cursor = skipComment(html, openingBracket + 4);
      continue;
    }

    if (html.startsWith("<![CDATA[", openingBracket)) {
      cursor =
        foreignContentDepth > 0
          ? skipCdataSection(html, openingBracket + 9)
          : skipBogusComment(html, openingBracket + 2);
      continue;
    }

    const discriminator = html[openingBracket + 1];
    if (discriminator === "/") {
      const endTag = parseEndTag(html, openingBracket);
      if (endTag.name === "template" && templateDepth > 0) {
        templateDepth -= 1;
      } else if (
        (endTag.name === "svg" || endTag.name === "math") &&
        foreignContentDepth > 0
      ) {
        foreignContentDepth -= 1;
      }
      cursor = endTag.end;
      continue;
    }
    if (discriminator === "!" || discriminator === "?") {
      cursor = skipTagTail(html, openingBracket + 2);
      continue;
    }
    if (!isAsciiLetter(discriminator)) {
      cursor = openingBracket + 1;
      continue;
    }

    const tag = parseStartTag(html, openingBracket);
    if (tag === undefined) {
      cursor = openingBracket + 1;
      continue;
    }
    if (
      tag.hasMarker &&
      templateDepth === 0 &&
      tag.name !== "html" &&
      tag.name !== "head" &&
      tag.name !== "body" &&
      tag.name !== "frameset"
    ) {
      return true;
    }

    if (tag.name === "plaintext") {
      return false;
    }

    if (!tag.selfClosing && tag.name === "template") {
      templateDepth += 1;
    } else if (!tag.selfClosing && (tag.name === "svg" || tag.name === "math")) {
      foreignContentDepth += 1;
    }

    cursor =
      tag.name === "script"
        ? skipScriptElement(html, tag.end)
        : foreignContentDepth === 0 && rawTextElementNames.has(tag.name)
          ? skipRawTextElement(html, tag.end, tag.name)
          : tag.end;
  }

  return false;
}

function parseStartTag(html: string, openingBracket: number): ParsedStartTag | undefined {
  let cursor = openingBracket + 1;
  const nameStart = cursor;

  while (cursor < html.length && !isTagNameTerminator(html[cursor])) {
    if (isForbiddenTagNameCharacter(html[cursor])) {
      return invalidStartTag(html, cursor, "");
    }
    cursor += 1;
  }

  if (cursor === nameStart) {
    return undefined;
  }

  const name = html.slice(nameStart, cursor).toLowerCase();
  let markerValueIsNonEmpty: boolean | undefined;

  for (;;) {
    cursor = skipAsciiWhitespace(html, cursor);
    if (cursor >= html.length) {
      return { end: html.length, hasMarker: false, name, selfClosing: false };
    }
    if (html[cursor] === ">") {
      return {
        end: cursor + 1,
        hasMarker: markerValueIsNonEmpty === true,
        name,
        selfClosing: false,
      };
    }
    if (html[cursor] === "/" && html[cursor + 1] === ">") {
      return {
        end: cursor + 2,
        hasMarker: markerValueIsNonEmpty === true,
        name,
        selfClosing: true,
      };
    }
    if (html[cursor] === "/") {
      return invalidStartTag(html, cursor, name);
    }

    const attributeNameStart = cursor;
    while (cursor < html.length && !isAttributeNameTerminator(html[cursor])) {
      if (isForbiddenAttributeNameCharacter(html[cursor])) {
        return invalidStartTag(html, cursor, name);
      }
      cursor += 1;
    }
    if (cursor === attributeNameStart) {
      return invalidStartTag(html, cursor, name);
    }

    const attributeName = html.slice(attributeNameStart, cursor).toLowerCase();
    cursor = skipAsciiWhitespace(html, cursor);
    let valueIsNonEmpty = false;

    if (html[cursor] === "=") {
      cursor = skipAsciiWhitespace(html, cursor + 1);
      const quote = html[cursor];

      if (quote === '"' || quote === "'") {
        const valueStart = cursor + 1;
        const valueEnd = html.indexOf(quote, valueStart);
        if (valueEnd < 0) {
          return { end: html.length, hasMarker: false, name, selfClosing: false };
        }
        valueIsNonEmpty = valueEnd > valueStart;
        cursor = valueEnd + 1;
      } else {
        const valueStart = cursor;
        while (cursor < html.length && !isUnquotedValueTerminator(html[cursor])) {
          if (isForbiddenUnquotedValueCharacter(html[cursor])) {
            return invalidStartTag(html, cursor, name);
          }
          cursor += 1;
        }
        if (cursor === valueStart) {
          return invalidStartTag(html, cursor, name);
        }
        valueIsNonEmpty = true;
      }
    }

    if (attributeName === markerAttribute && markerValueIsNonEmpty === undefined) {
      markerValueIsNonEmpty = valueIsNonEmpty;
    }
  }
}

function invalidStartTag(html: string, cursor: number, name: string): ParsedStartTag {
  return { end: skipMalformedTagTail(html, cursor), hasMarker: false, name, selfClosing: false };
}

function skipComment(html: string, cursor: number): number {
  if (html[cursor] === ">") {
    return cursor + 1;
  }
  if (html.startsWith("->", cursor)) {
    return cursor + 2;
  }
  const standardEnd = html.indexOf("-->", cursor);
  const abruptEnd = html.indexOf("--!>", cursor);
  const end =
    standardEnd < 0 ? abruptEnd : abruptEnd < 0 ? standardEnd : Math.min(standardEnd, abruptEnd);
  return end < 0 ? html.length : end + (end === abruptEnd ? 4 : 3);
}

function skipBogusComment(html: string, cursor: number): number {
  const end = html.indexOf(">", cursor);
  return end < 0 ? html.length : end + 1;
}

function parseEndTag(html: string, openingBracket: number): { end: number; name: string } {
  let cursor = openingBracket + 2;
  const nameStart = cursor;
  while (isAsciiLetter(html[cursor])) {
    cursor += 1;
  }
  return {
    end: skipTagTail(html, cursor),
    name: html.slice(nameStart, cursor).toLowerCase(),
  };
}

function skipMalformedTagTail(html: string, cursor: number): number {
  const end = html.indexOf(">", cursor);
  return end < 0 ? html.length : end + 1;
}

function skipCdataSection(html: string, cursor: number): number {
  const end = html.indexOf("]]>", cursor);
  return end < 0 ? html.length : end + 3;
}

function skipTagTail(html: string, cursor: number): number {
  let quote: '"' | "'" | undefined;
  while (cursor < html.length) {
    const character = html[cursor];
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return cursor + 1;
    }
    cursor += 1;
  }
  return html.length;
}

function skipRawTextElement(html: string, cursor: number, name: string): number {
  const closingPrefix = `</${name}`;
  for (;;) {
    const closingStart = indexOfAsciiCaseInsensitive(html, closingPrefix, cursor);
    if (closingStart < 0) {
      return html.length;
    }
    const delimiter = html[closingStart + closingPrefix.length];
    if (delimiter === ">" || delimiter === "/" || isAsciiWhitespace(delimiter)) {
      return skipTagTail(html, closingStart + closingPrefix.length);
    }
    cursor = closingStart + 2;
  }
}

function skipScriptElement(html: string, cursor: number): number {
  let state: "data" | "double-escaped" | "escaped" = "data";

  while (cursor < html.length) {
    if (state === "data" && html.startsWith("<!--", cursor)) {
      state = "escaped";
      cursor += 4;
      continue;
    }

    if (state !== "data" && html.startsWith("-->", cursor)) {
      state = "data";
      cursor += 3;
      continue;
    }

    if (html[cursor] === "<") {
      if (isScriptTagAt(html, cursor, true)) {
        if (state === "double-escaped") {
          state = "escaped";
          cursor += 8;
          continue;
        }
        return skipTagTail(html, cursor + 8);
      }

      if (state === "escaped" && isScriptTagAt(html, cursor, false)) {
        state = "double-escaped";
        cursor += 7;
        continue;
      }
    }

    cursor += 1;
  }

  return html.length;
}

function isScriptTagAt(html: string, cursor: number, closing: boolean): boolean {
  const prefix = closing ? "</script" : "<script";
  if (!matchesAsciiCaseInsensitive(html, prefix, cursor)) {
    return false;
  }
  const delimiter = html[cursor + prefix.length];
  return delimiter === ">" || delimiter === "/" || isAsciiWhitespace(delimiter);
}

function matchesAsciiCaseInsensitive(html: string, needle: string, start: number): boolean {
  if (start + needle.length > html.length) {
    return false;
  }
  for (let offset = 0; offset < needle.length; offset += 1) {
    if (html.charAt(start + offset).toLowerCase() !== needle.charAt(offset)) {
      return false;
    }
  }
  return true;
}

function indexOfAsciiCaseInsensitive(html: string, needle: string, start: number): number {
  const lastStart = html.length - needle.length;
  for (let index = start; index <= lastStart; index += 1) {
    let offset = 0;
    while (
      offset < needle.length &&
      html.charAt(index + offset).toLowerCase() === needle.charAt(offset)
    ) {
      offset += 1;
    }
    if (offset === needle.length) {
      return index;
    }
  }
  return -1;
}

function skipAsciiWhitespace(html: string, cursor: number): number {
  while (isAsciiWhitespace(html[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function isAsciiWhitespace(character: string | undefined): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\f" ||
    character === "\r"
  );
}

function isAsciiLetter(character: string | undefined): boolean {
  if (character === undefined) {
    return false;
  }
  const code = character.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isTagNameTerminator(character: string | undefined): boolean {
  return (
    character === undefined ||
    character === ">" ||
    character === "/" ||
    isAsciiWhitespace(character)
  );
}

function isForbiddenTagNameCharacter(character: string | undefined): boolean {
  return (
    character === "\0" ||
    character === '"' ||
    character === "'" ||
    character === "<" ||
    character === "="
  );
}

function isAttributeNameTerminator(character: string | undefined): boolean {
  return (
    character === undefined ||
    character === ">" ||
    character === "/" ||
    character === "=" ||
    isAsciiWhitespace(character)
  );
}

function isForbiddenAttributeNameCharacter(character: string | undefined): boolean {
  return character === "\0" || character === '"' || character === "'" || character === "<";
}

function isUnquotedValueTerminator(character: string | undefined): boolean {
  return character === undefined || character === ">" || isAsciiWhitespace(character);
}

function isForbiddenUnquotedValueCharacter(character: string | undefined): boolean {
  return (
    character === "\0" ||
    character === '"' ||
    character === "'" ||
    character === "`" ||
    character === "<" ||
    character === "="
  );
}
