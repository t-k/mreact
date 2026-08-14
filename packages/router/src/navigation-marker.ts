import { routeHydrationContract } from "./route-hydration-contract.js";

const markerAttribute = routeHydrationContract.routeMarkerAttribute;
const rawTextElementNames = new Set([
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
]);

interface ParsedStartTag {
  end: number;
  hasMarker: boolean;
  name: string;
}

export function hasNavigationRouteMarker(html: string): boolean {
  let cursor = 0;

  while (cursor < html.length) {
    const openingBracket = html.indexOf("<", cursor);
    if (openingBracket < 0) {
      return false;
    }

    if (html.startsWith("<!--", openingBracket)) {
      cursor = skipComment(html, openingBracket + 4);
      continue;
    }

    const discriminator = html[openingBracket + 1];
    if (discriminator === "!" || discriminator === "?" || discriminator === "/") {
      cursor = skipTagTail(html, openingBracket + 2);
      continue;
    }

    const tag = parseStartTag(html, openingBracket);
    if (tag === undefined) {
      cursor = openingBracket + 1;
      continue;
    }
    if (tag.hasMarker) {
      return true;
    }

    if (tag.name === "plaintext") {
      return false;
    }

    cursor = rawTextElementNames.has(tag.name)
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
      return { end: html.length, hasMarker: false, name };
    }
    if (html[cursor] === ">") {
      return { end: cursor + 1, hasMarker: markerValueIsNonEmpty === true, name };
    }
    if (html[cursor] === "/" && html[cursor + 1] === ">") {
      return { end: cursor + 2, hasMarker: markerValueIsNonEmpty === true, name };
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
          return { end: html.length, hasMarker: false, name };
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
  return { end: skipTagTail(html, cursor), hasMarker: false, name };
}

function skipComment(html: string, cursor: number): number {
  const standardEnd = html.indexOf("-->", cursor);
  const abruptEnd = html.indexOf("--!>", cursor);
  const end =
    standardEnd < 0 ? abruptEnd : abruptEnd < 0 ? standardEnd : Math.min(standardEnd, abruptEnd);
  return end < 0 ? html.length : end + (end === abruptEnd ? 4 : 3);
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
