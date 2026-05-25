import { effect } from "@reckona/mreact-reactive-core";
import { registerDispose } from "./scope.js";
import {
  isDangerousHtmlAttribute,
  isDangerousHtmlOptIn,
  isUnsafeUrlAttribute,
  isUrlAttribute,
} from "./url-safety.js";
import type { Dispose } from "./types.js";

interface PropBinding {
  dispose: Dispose;
  retarget: (element: Element) => void;
}

type PropElement = Element & {
  __mreactHasReactiveProps?: true;
  __mreactPropBindings?: PropBinding[];
};

export function bindProp(
  element: Element,
  name: string,
  value: () => unknown,
): Dispose {
  let target = element;
  let initialized = false;
  let previousValue: unknown;

  const disposeEffect = effect(() => {
    const nextValue = value();

    if (initialized && Object.is(previousValue, nextValue)) {
      return;
    }

    initialized = true;
    previousValue = nextValue;
    setDomProp(target, name, nextValue);
  });
  const propElement = element as PropElement;
  const binding: PropBinding = {
    dispose: disposeEffect,
    retarget(nextElement) {
      target = nextElement;

      if (initialized) {
        setDomProp(target, name, previousValue);
      }
    },
  };

  propElement.__mreactHasReactiveProps = true;
  propElement.__mreactPropBindings = [
    ...(propElement.__mreactPropBindings ?? []),
    binding,
  ];

  return registerDispose(() => {
    disposeEffect();
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
    if (shouldAssignDomProperty(element, attrName)) {
      (element as unknown as Record<string, unknown>)[attrName] = "";
    } else if (shouldAssignDomProperty(element, name)) {
      (element as unknown as Record<string, unknown>)[name] = "";
    }
    element.removeAttribute(attrName);
    return;
  }

  if (value === null || value === undefined || value === false) {
    clearBooleanDomProperty(element, name);
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
    shouldAssignDomProperty(element, name)
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

function clearBooleanDomProperty(element: Element, name: string): void {
  if (
    shouldAssignDomProperty(element, name) &&
    typeof (element as unknown as Record<string, unknown>)[name] === "boolean"
  ) {
    (element as unknown as Record<string, unknown>)[name] = false;
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
