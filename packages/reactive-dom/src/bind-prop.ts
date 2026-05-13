import { effect } from "@modular-react/reactive-core";
import { registerDispose } from "./scope.js";
import { isUnsafeUrlAttribute, isUrlAttribute } from "./url-safety.js";
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
  // Issue 075: URL attributes are scheme-validated even when the binder
  // would otherwise assign directly to the DOM property. An unsafe
  // scheme drops the attribute and clears the matching property.
  if (
    isUrlAttribute(name) &&
    typeof value === "string" &&
    isUnsafeUrlAttribute(name, value)
  ) {
    if (name in element) {
      (element as unknown as Record<string, unknown>)[name] = "";
    }
    element.removeAttribute(name);
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

  if (value === null || value === undefined || value === false) {
    element.removeAttribute(name);
    return;
  }

  if (value === true) {
    element.setAttribute(name, "");
    return;
  }

  element.setAttribute(name, String(value));
}
