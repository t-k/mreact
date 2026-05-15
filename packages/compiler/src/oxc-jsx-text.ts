export function normalizeOxcJsxText(
  rawValue: string,
  siblings: readonly unknown[],
  index: number,
): string {
  const value = rawValue.replace(/\s+/g, " ");

  if (value.trim() === "") {
    const isSameLineSeparator = !/[\r\n]/.test(rawValue);
    return isSameLineSeparator &&
      siblings[index - 1] !== undefined &&
      siblings[index + 1] !== undefined
      ? " "
      : "";
  }

  const previousSibling = siblings[index - 1];
  const nextSibling = siblings[index + 1];
  const leadingWhitespace = rawValue.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = rawValue.match(/\s*$/)?.[0] ?? "";
  const preserveLeadingSpace = previousSibling !== undefined && !/[\r\n]/.test(leadingWhitespace);
  const preserveTrailingSpace = nextSibling !== undefined && !/[\r\n]/.test(trailingWhitespace);

  return value
    .replace(/^\s+/, preserveLeadingSpace ? " " : "")
    .replace(/\s+$/, preserveTrailingSpace ? " " : "")
    .replace(htmlEntityPattern, decodeHtmlEntity);
}

const htmlEntityPattern = /&(#\d+|#x[\da-fA-F]+|[A-Za-z][A-Za-z\d]+);/g;

const namedHtmlEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  copy: "\u00a9",
  gt: ">",
  lt: "<",
  mdash: "\u2014",
  middot: "\u00b7",
  nbsp: "\u00a0",
  quot: "\"",
};

function decodeHtmlEntity(entity: string, body: string): string {
  if (body.startsWith("#x") || body.startsWith("#X")) {
    return decodeNumericHtmlEntity(entity, body.slice(2), 16);
  }

  if (body.startsWith("#")) {
    return decodeNumericHtmlEntity(entity, body.slice(1), 10);
  }

  return namedHtmlEntities[body] ?? entity;
}

function decodeNumericHtmlEntity(entity: string, value: string, radix: number): string {
  const codePoint = Number.parseInt(value, radix);

  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return entity;
  }

  return String.fromCodePoint(codePoint);
}
