export type HostElement = HTMLElement | SVGElement;
export type HostNamespace = "html" | "svg";

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
  documentRef: Document,
  tagName: string,
  namespace: HostNamespace,
): HostElement {
  if (namespaceForHostElement(namespace, tagName) === "svg") {
    return documentRef.createElementNS(svgNamespace, tagName);
  }

  return documentRef.createElement(tagName);
}

export function isHostElement(value: unknown): value is HostElement {
  return value instanceof HTMLElement || value instanceof SVGElement;
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
  return element.tagName.toLowerCase() === tagName && element.namespaceURI === namespaceUri(namespace);
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
