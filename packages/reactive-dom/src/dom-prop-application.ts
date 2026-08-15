import {
  isDangerousHtmlAttribute,
  isDangerousHtmlOptIn,
  isSrcsetAttribute,
  isUnsafeUrlAttribute,
  isUrlAttribute,
} from "./url-safety.js";
import { isBooleanishStringAttribute, isEventLikePropName } from "@reckona/mreact-shared";
import { registerDispose } from "./scope.js";
import type { Dispose } from "./types.js";

export interface PropBinding {
  dispose: Dispose;
  retarget: (element: Element) => void;
}

type PropElement = Element & {
  __mreactHasReactiveProps?: true;
  __mreactPropBindings?: PropBinding[];
};

let propBindingMetadataDepth = 0;

export function withPropBindingMetadata<T>(fn: () => T): T {
  propBindingMetadataDepth += 1;

  try {
    return fn();
  } finally {
    propBindingMetadataDepth -= 1;
  }
}

export function hasActivePropBindingMetadata(): boolean {
  return propBindingMetadataDepth > 0;
}

export function registerReactivePropBinding(element: Element, binding: PropBinding): Dispose {
  if (propBindingMetadataDepth === 0) {
    return registerDispose(binding.dispose);
  }

  const propElement = element as PropElement;

  propElement.__mreactHasReactiveProps = true;
  const bindings = propElement.__mreactPropBindings;

  if (bindings === undefined) {
    propElement.__mreactPropBindings = [binding];
  } else {
    bindings.push(binding);
  }

  return registerDispose(() => {
    binding.dispose();
    const bindings = propElement.__mreactPropBindings;
    const index = bindings?.indexOf(binding) ?? -1;

    if (index !== -1) {
      bindings?.splice(index, 1);
    }

    if (bindings?.length === 0) {
      delete propElement.__mreactHasReactiveProps;
    }
  });
}

export function applyDomProp(
  element: Element,
  name: string,
  value: unknown,
  preferProperty: boolean,
): void {
  if (name === "dangerouslySetInnerHTML") {
    element.innerHTML = isDangerousHtmlOptIn(value) ? value.__html : "";
    return;
  }

  if (isEventLikePropName(name)) {
    clearEventLikeDomProp(element, name);
    return;
  }

  const attrName = toDomAttributeName(name);
  const booleanishString = typeof value === "boolean" && isBooleanishStringAttribute(attrName);

  if (value === null || value === undefined || (value === false && !booleanishString)) {
    removeDomProp(element, name);
    return;
  }

  if (booleanishString) {
    setDomAttribute(element, attrName, value ? "true" : "false");
    return;
  }

  const stringAttributeValue =
    isUrlAttribute(attrName) || isSrcsetAttribute(attrName) ? String(value) : undefined;
  if (stringAttributeValue !== undefined && isUnsafeUrlAttribute(attrName, stringAttributeValue)) {
    clearDomProperty(element, name, attrName);
    element.removeAttribute(attrName);
    return;
  }

  if (name === "style" && typeof value === "object" && value !== null) {
    applyStyleObject(element as HTMLElement, value as Record<string, unknown>);
    return;
  }

  if (isDangerousHtmlAttribute(attrName)) {
    if (isDangerousHtmlOptIn(value)) {
      element.setAttribute(attrName, value.__html);
    } else {
      removeDomProp(element, name);
    }
    return;
  }

  if (preferProperty && shouldAssignDomProperty(element, name)) {
    (element as unknown as Record<string, unknown>)[name] = stringAttributeValue ?? value;
    if (typeof value === "boolean") {
      if (value) {
        setDomAttribute(element, attrName, "");
      } else {
        element.removeAttribute(attrName);
      }
    }
    return;
  }

  if (value === true) {
    setBooleanDomProperty(element, name, true);
    setDomAttribute(element, attrName, "");
    return;
  }

  setDomAttribute(element, attrName, stringAttributeValue ?? String(value));
}

export function removeDomProp(element: Element, name: string): void {
  if (name === "dangerouslySetInnerHTML") {
    element.innerHTML = "";
    return;
  }
  if (isEventLikePropName(name)) {
    clearEventLikeDomProp(element, name);
    return;
  }
  const attrName = toDomAttributeName(name);
  clearDomProperty(element, name, attrName);
  if (isValidDomAttributeName(attrName)) {
    element.removeAttribute(attrName);
  }
}

function clearEventLikeDomProp(element: Element, name: string): void {
  const attributeName = name.toLowerCase();
  const record = element as unknown as Record<string, unknown>;
  if (attributeName in element) {
    record[attributeName] = null;
  }
  if (isValidDomAttributeName(attributeName)) {
    element.removeAttribute(attributeName);
  }
}

export function setDomAttribute(element: Element, name: string, value: string): void {
  if (!isValidDomAttributeName(name)) {
    return;
  }
  const prefix = name.split(":", 1)[0];
  const namespace =
    prefix === "xlink"
      ? "1999/xlink"
      : prefix === "xml"
        ? "XML/1998/namespace"
        : prefix === "xmlns"
          ? "2000/xmlns/"
          : undefined;
  if (namespace === undefined) {
    element.setAttribute(name, value);
    return;
  }

  element.setAttributeNS(`http://www.w3.org/${namespace}`, name, value);
}

function applyStyleObject(element: HTMLElement, value: Record<string, unknown>): void {
  const nextNames = new Set(Object.keys(value).map(styleObjectKeyToCssName));

  for (const cssName of Array.from(element.style)) {
    if (!nextNames.has(cssName)) {
      element.style.removeProperty(cssName);
    }
  }

  for (const [name, nextValue] of Object.entries(value)) {
    const cssName = styleObjectKeyToCssName(name);

    if (nextValue === null || nextValue === undefined || nextValue === false) {
      element.style.removeProperty(cssName);
      continue;
    }

    if (name.startsWith("--") || name.includes("-")) {
      element.style.setProperty(cssName, String(nextValue));
      continue;
    }

    (element.style as unknown as Record<string, string>)[name] = String(nextValue);
  }
}

function styleObjectKeyToCssName(name: string): string {
  return name.startsWith("--") ? name : name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

export function toDomAttributeName(name: string): string {
  return Object.hasOwn(HTML_ATTRIBUTE_ALIASES, name)
    ? (HTML_ATTRIBUTE_ALIASES[name] as string)
    : name;
}

function clearDomProperty(element: Element, name: string, attrName: string): void {
  if (isConstrainedDomProperty(attrName)) {
    return;
  }

  if (clearAssignableDomProperty(element, name)) {
    return;
  }

  if (attrName !== name) {
    clearAssignableDomProperty(element, attrName);
  }
}

function isConstrainedDomProperty(name: string): boolean {
  const propertyName = name.toLowerCase();
  return (
    propertyName === "cols" ||
    propertyName === "contenteditable" ||
    propertyName === "rows" ||
    propertyName === "size" ||
    propertyName === "span"
  );
}

function clearAssignableDomProperty(element: Element, name: string): boolean {
  if (!shouldAssignDomProperty(element, name)) {
    return false;
  }

  const record = element as unknown as Record<string, unknown>;
  record[name] = typeof record[name] === "boolean" ? false : "";
  return true;
}

function setBooleanDomProperty(element: Element, name: string, value: boolean): void {
  if (
    shouldAssignDomProperty(element, name) &&
    typeof (element as unknown as Record<string, unknown>)[name] === "boolean"
  ) {
    (element as unknown as Record<string, unknown>)[name] = value;
  }
}

function shouldAssignDomProperty(element: Element, name: string): boolean {
  return (
    element.namespaceURI !== "http://www.w3.org/2000/svg" &&
    name in element &&
    !Object.hasOwn(Object.prototype, name) &&
    !name.startsWith("aria-") &&
    !name.startsWith("data-")
  );
}

function isValidDomAttributeName(name: string): boolean {
  return /^[A-Za-z_][\w.\-:]*$/.test(name);
}

const HTML_ATTRIBUTE_ALIASES: Readonly<Record<string, string>> = {
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
  imageSrcSet: "imagesrcset",
  maxLength: "maxlength",
  minLength: "minlength",
  noValidate: "novalidate",
  playsInline: "playsinline",
  readOnly: "readonly",
  rowSpan: "rowspan",
  spellCheck: "spellcheck",
  srcDoc: "srcdoc",
  srcSet: "srcset",
  tabIndex: "tabindex",
  useMap: "usemap",
};
