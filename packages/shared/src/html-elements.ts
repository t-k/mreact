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
