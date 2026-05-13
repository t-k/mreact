import { effect } from "@modular-react/reactive-core";
import { registerDispose } from "./scope.js";
import { isUnsafeUrlAttribute, isUrlAttribute } from "./url-safety.js";
import type { Dispose } from "./types.js";

export function bindSpreadProps(
  element: HTMLElement,
  props: () => Record<string, unknown> | null | undefined,
): Dispose {
  const previousNames = new Set<string>();

  const dispose = effect(() => {
    for (const name of previousNames) {
      removeProp(element, name);
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

      applyProp(element, name, value);
      previousNames.add(name);
    }
  });

  return registerDispose(() => {
    dispose();

    for (const name of previousNames) {
      removeProp(element, name);
    }

    previousNames.clear();
  });
}

function applyProp(element: HTMLElement, name: string, value: unknown): void {
  const attrName = name === "className" ? "class" : name;

  if (value === false || value === null || value === undefined) {
    removeProp(element, name);
    return;
  }

  if (name === "style" && typeof value === "object" && value !== null) {
    Object.assign(element.style, value);
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
  const attrName = name === "className" ? "class" : name;
  element.removeAttribute(attrName);
}
