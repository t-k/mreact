import { effect } from "@reckona/mreact-reactive-core";
import { registerDispose } from "./scope.js";
import {
  isDangerousHtmlAttribute,
  isDangerousHtmlOptIn,
  isUnsafeUrlAttribute,
  isUrlAttribute,
} from "./url-safety.js";
import type { Dispose } from "./types.js";

export function bindProp(
  element: Element,
  name: string,
  value: () => unknown,
): Dispose {
  const dispose = effect(() => {
    setDomProp(element, name, value());
  });

  return registerDispose(dispose);
}

function setDomProp(element: Element, name: string, value: unknown): void {
  const attrName = toDomAttributeName(name);
  // Issue 075: URL attributes are scheme-validated even when the binder
  // would otherwise assign directly to the DOM property. An unsafe
  // scheme drops the attribute and clears the matching property.
  if (
    isUrlAttribute(attrName) &&
    typeof value === "string" &&
    isUnsafeUrlAttribute(attrName, value)
  ) {
    if (attrName in element) {
      (element as unknown as Record<string, unknown>)[attrName] = "";
    } else if (name in element) {
      (element as unknown as Record<string, unknown>)[name] = "";
    }
    element.removeAttribute(attrName);
    return;
  }

  if (value === null || value === undefined || value === false) {
    element.removeAttribute(attrName);
    return;
  }

  if (isDangerousHtmlAttribute(attrName)) {
    if (isDangerousHtmlOptIn(value)) {
      element.setAttribute(attrName, value.__html);
    } else {
      element.removeAttribute(attrName);
    }
    return;
  }

  if (
    name in element &&
    !name.startsWith("aria-") &&
    !name.startsWith("data-")
  ) {
    (element as unknown as Record<string, unknown>)[name] = value;
    return;
  }

  if (value === true) {
    element.setAttribute(attrName, "");
    return;
  }

  element.setAttribute(attrName, String(value));
}

function toDomAttributeName(name: string): string {
  return HTML_ATTRIBUTE_ALIASES[name] ?? name;
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
