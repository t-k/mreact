const validHtmlTagName = /^[a-zA-Z][a-zA-Z0-9:._-]*$/;

/** Rejects tag names that could inject attributes or markup into server-rendered HTML. */
export function assertValidHtmlTagName(tagName: string): void {
  if (!validHtmlTagName.test(tagName)) {
    throw new Error("Invalid HTML tag name.");
  }
}

const voidHtmlElementNames = new Set([
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

/** Returns true when an HTML tag is a void element that cannot have children. */
export function isVoidHtmlElement(tagName: string): boolean {
  return voidHtmlElementNames.has(tagName);
}
