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
  retarget: (element: HTMLElement) => void;
}

type PropElement = HTMLElement & {
  __mreactHasReactiveProps?: true;
  __mreactPropBindings?: PropBinding[];
};

export function bindSpreadProps(
  element: HTMLElement,
  props: () => Record<string, unknown> | null | undefined,
): Dispose {
  let target = element;
  const previousNames = new Set<string>();

  const disposeEffect = effect(() => {
    for (const name of previousNames) {
      removeProp(target, name);
    }

    previousNames.clear();

    const nextProps = props();

    if (nextProps === null || nextProps === undefined) {
      return;
    }

    for (const [name, value] of Object.entries(nextProps)) {
      if (name === "children" || name === "key" || name === "ref") {
        continue;
      }

      applyProp(target, name, value);
      previousNames.add(name);
    }
  });
  const propElement = element as PropElement;
  const binding: PropBinding = {
    dispose: disposeEffect,
    retarget(nextElement) {
      const previousTarget = target;
      target = nextElement;
      const nextProps = props();

      for (const name of previousNames) {
        removeProp(previousTarget, name);
      }

      previousNames.clear();

      if (nextProps === null || nextProps === undefined) {
        return;
      }

      for (const [name, value] of Object.entries(nextProps)) {
        if (name === "children" || name === "key" || name === "ref") {
          continue;
        }

        applyProp(target, name, value);
        previousNames.add(name);
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

    for (const name of previousNames) {
      removeProp(target, name);
    }

    previousNames.clear();

    if (bindings?.length === 0) {
      delete propElement.__mreactHasReactiveProps;
    }
  });
}

function applyProp(element: HTMLElement, name: string, value: unknown): void {
  const attrName = toDomAttributeName(name);

  if (value === false || value === null || value === undefined) {
    removeProp(element, name);
    return;
  }

  if (name === "style" && typeof value === "object" && value !== null) {
    Object.assign(element.style, value);
    return;
  }

  if (isDangerousHtmlAttribute(attrName)) {
    if (isDangerousHtmlOptIn(value)) {
      element.setAttribute(attrName, value.__html);
    } else {
      removeProp(element, name);
    }
    return;
  }

  if (typeof value === "boolean") {
    element.setAttribute(attrName, "");
    return;
  }

  const stringValue = String(value);

  // Issue 075: same URL-scheme filter as the SSR / react-compat paths.
  if (isUrlAttribute(attrName) && isUnsafeUrlAttribute(attrName, stringValue)) {
    removeProp(element, name);
    return;
  }

  element.setAttribute(attrName, stringValue);
}

function removeProp(element: HTMLElement, name: string): void {
  const attrName = toDomAttributeName(name);
  element.removeAttribute(attrName);
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
