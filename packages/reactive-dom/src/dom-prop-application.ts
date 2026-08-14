import {
  isDangerousHtmlAttribute,
  isDangerousHtmlOptIn,
  isSrcsetAttribute,
  isUnsafeUrlAttribute,
  isUrlAttribute,
} from "./url-safety.js";
import { registerDispose } from "./scope.js";
import type { Dispose } from "./types.js";

export interface DomPropApplicationOptions {
  preferProperty: boolean;
}

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
  options: DomPropApplicationOptions,
): void {
  if (name === "dangerouslySetInnerHTML") {
    element.innerHTML = readDangerouslySetInnerHtml(value) ?? "";
    return;
  }

  const attrName = toDomAttributeName(name);

  if (
    (isUrlAttribute(attrName) || isSrcsetAttribute(attrName)) &&
    typeof value === "string" &&
    isUnsafeUrlAttribute(attrName, value)
  ) {
    clearDomProperty(element, name, attrName);
    removeDomAttribute(element, attrName);
    return;
  }

  if (value === null || value === undefined || value === false) {
    removeDomProp(element, name);
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

  if (options.preferProperty && shouldAssignDomProperty(element, name)) {
    (element as unknown as Record<string, unknown>)[name] = value;
    if (typeof value === "boolean") {
      if (value) {
        setDomAttribute(element, attrName, "");
      } else {
        removeDomAttribute(element, attrName);
      }
    }
    return;
  }

  if (value === true) {
    setBooleanDomProperty(element, name, true);
    setDomAttribute(element, attrName, "");
    return;
  }

  setDomAttribute(element, attrName, String(value));
}

export function removeDomProp(element: Element, name: string): void {
  if (name === "dangerouslySetInnerHTML") {
    element.innerHTML = "";
    return;
  }

  const attrName = toDomAttributeName(name);
  clearDomProperty(element, name, attrName);
  removeDomAttribute(element, attrName);
}

function readDangerouslySetInnerHtml(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const keys = Reflect.ownKeys(value);
  if (keys.length !== 1 || keys[0] !== "__html") {
    return undefined;
  }

  const descriptor = Object.getOwnPropertyDescriptor(value, "__html");
  return descriptor !== undefined && "value" in descriptor && typeof descriptor.value === "string"
    ? descriptor.value
    : undefined;
}

function setDomAttribute(element: Element, name: string, value: string): void {
  const namespace = domAttributeNamespace(name);
  if (namespace === undefined) {
    element.setAttribute(name, value);
    return;
  }

  element.setAttributeNS(namespace.uri, name, value);
}

function removeDomAttribute(element: Element, name: string): void {
  const namespace = domAttributeNamespace(name);
  if (namespace === undefined) {
    element.removeAttribute(name);
    return;
  }

  element.removeAttributeNS(namespace.uri, namespace.localName);
}

function domAttributeNamespace(
  name: string,
): { uri: string; localName: string } | undefined {
  const separator = name.indexOf(":");
  if (separator === -1) {
    return undefined;
  }

  const prefix = name.slice(0, separator);
  const uri = DOM_ATTRIBUTE_NAMESPACE_URIS[prefix];
  return uri === undefined ? undefined : { uri, localName: name.slice(separator + 1) };
}

const DOM_ATTRIBUTE_NAMESPACE_URIS: Readonly<Record<string, string>> = {
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace",
  xmlns: "http://www.w3.org/2000/xmlns/",
};

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
  return name.startsWith("--")
    ? name
    : name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

export function toDomAttributeName(name: string): string {
  return HTML_ATTRIBUTE_ALIASES[name] ?? name;
}

function clearDomProperty(element: Element, name: string, attrName: string): void {
  if (clearAssignableDomProperty(element, name)) {
    return;
  }

  if (attrName !== name) {
    clearAssignableDomProperty(element, attrName);
  }
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
    !name.startsWith("aria-") &&
    !name.startsWith("data-")
  );
}

const HTML_ATTRIBUTE_ALIASES: Record<string, string> = {
  acceptCharset: "accept-charset",
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
