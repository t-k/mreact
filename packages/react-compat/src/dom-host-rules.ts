export type HostElement = HTMLElement | SVGElement;
export type HostNamespace = "html" | "svg";

export interface CustomHostElement {
  ownerDocument?: CustomHostDocument;
  appendChild(child: unknown): unknown;
  insertBefore(newNode: unknown, referenceNode: unknown): unknown;
  removeChild(child: unknown): unknown;
  setAttribute?(name: string, value: string): void;
  setAttributeNS?(namespace: string | null, name: string, value: string): void;
  removeAttribute?(name: string): void;
}

export interface CustomHostDocument {
  createElement(tagName: string): CustomHostElement;
  createElementNS?(namespace: string, tagName: string): CustomHostElement;
}

const htmlNamespace = "http://www.w3.org/1999/xhtml";
const svgNamespace = "http://www.w3.org/2000/svg";

const isUnitlessNumberStyle = new Set([
  "animationIterationCount",
  "aspectRatio",
  "borderImageOutset",
  "borderImageSlice",
  "borderImageWidth",
  "boxFlex",
  "boxFlexGroup",
  "boxOrdinalGroup",
  "columnCount",
  "columns",
  "flex",
  "flexGrow",
  "flexPositive",
  "flexShrink",
  "flexNegative",
  "flexOrder",
  "gridArea",
  "gridRow",
  "gridRowEnd",
  "gridRowSpan",
  "gridRowStart",
  "gridColumn",
  "gridColumnEnd",
  "gridColumnSpan",
  "gridColumnStart",
  "fontWeight",
  "lineClamp",
  "lineHeight",
  "opacity",
  "order",
  "orphans",
  "scale",
  "tabSize",
  "widows",
  "zIndex",
  "zoom",
  "fillOpacity",
  "floodOpacity",
  "stopOpacity",
  "strokeDasharray",
  "strokeDashoffset",
  "strokeMiterlimit",
  "strokeOpacity",
  "strokeWidth",
]);

export function createHostElement(
  documentRef: Document | CustomHostDocument,
  tagName: string,
  namespace: HostNamespace,
): HostElement {
  if (namespaceForHostElement(namespace, tagName) === "svg") {
    return documentRef.createElementNS?.(svgNamespace, tagName) as HostElement;
  }

  return documentRef.createElement(tagName) as HostElement;
}

export function isHostElement(value: unknown): value is HostElement {
  if (typeof Node !== "undefined" && value instanceof Node) {
    return isDomHostElement(value);
  }

  return isDomHostElement(value) || isCustomHostElement(value);
}

export function isDomHostElement(value: unknown): value is HTMLElement | SVGElement {
  return (
    (typeof HTMLElement !== "undefined" && value instanceof HTMLElement) ||
    (typeof SVGElement !== "undefined" && value instanceof SVGElement)
  );
}

export function namespaceForHostElement(
  parentNamespace: HostNamespace,
  tagName: string,
): HostNamespace {
  if (tagName === "svg") {
    return "svg";
  }

  return parentNamespace;
}

export function namespaceForHostChildren(
  elementNamespace: HostNamespace,
  tagName: string,
): HostNamespace {
  return elementNamespace === "svg" && tagName === "foreignObject" ? "html" : elementNamespace;
}

export function hostElementMatches(
  element: HostElement,
  tagName: string,
  namespace: HostNamespace,
): boolean {
  if (!isDomHostElement(element)) {
    return false;
  }

  // localName is already lowercase for HTML (and preserves case for SVG), so it
  // matches the lowercase tag from the element type without allocating the
  // lowercased string that element.tagName.toLowerCase() would.
  return element.localName === tagName && element.namespaceURI === namespaceUri(namespace);
}

export function serializeClientStyleValue(name: string, value: unknown): string {
  if (typeof value === "number" && value !== 0 && !name.startsWith("--") && !isUnitlessNumberStyle.has(name)) {
    return `${value}px`;
  }

  return String(value);
}

export function styleNameToCssName(name: string): string {
  if (name.startsWith("--")) {
    return name;
  }

  const cssName = name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
  return cssName.startsWith("ms-") ? `-${cssName}` : cssName;
}

function namespaceUri(namespace: HostNamespace): string {
  return namespace === "svg" ? svgNamespace : htmlNamespace;
}

function isCustomHostElement(value: unknown): value is CustomHostElement {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<CustomHostElement> & {
    ownerDocument?: { createElement?: unknown };
  };
  return (
    typeof candidate.appendChild === "function" &&
    typeof candidate.insertBefore === "function" &&
    typeof candidate.removeChild === "function" &&
    typeof candidate.ownerDocument?.createElement === "function"
  );
}
