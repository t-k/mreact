import {
  isDangerousHtmlAttribute,
  isDangerousHtmlOptIn,
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

export function registerReactivePropBinding(element: Element, binding: PropBinding): Dispose {
  const propElement = element as PropElement;

  propElement.__mreactHasReactiveProps = true;
  propElement.__mreactPropBindings = [
    ...(propElement.__mreactPropBindings ?? []),
    binding,
  ];

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
  const attrName = toDomAttributeName(name);

  if (
    isUrlAttribute(attrName) &&
    typeof value === "string" &&
    isUnsafeUrlAttribute(attrName, value)
  ) {
    clearDomProperty(element, name, attrName);
    element.removeAttribute(attrName);
    return;
  }

  if (value === null || value === undefined || value === false) {
    removeDomProp(element, name);
    return;
  }

  if (name === "style" && typeof value === "object" && value !== null) {
    Object.assign((element as HTMLElement).style, value);
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
        element.setAttribute(attrName, "");
      } else {
        element.removeAttribute(attrName);
      }
    }
    return;
  }

  if (value === true) {
    setBooleanDomProperty(element, name, true);
    element.setAttribute(attrName, "");
    return;
  }

  element.setAttribute(attrName, String(value));
}

export function removeDomProp(element: Element, name: string): void {
  const attrName = toDomAttributeName(name);
  clearDomProperty(element, name, attrName);
  element.removeAttribute(attrName);
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
  srcDoc: "srcdoc",
  srcSet: "srcset",
  tabIndex: "tabindex",
  useMap: "usemap",
};
