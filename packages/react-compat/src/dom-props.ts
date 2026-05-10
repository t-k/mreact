import {
  getAppliedProps,
  setAppliedProps,
  type AppliedEventListener,
  type AppliedProps,
} from "./event-listeners.js";
import { ensureDelegatedEventListener, toEventNames } from "./events.js";
import { reportRecoverable, type RenderOptions } from "./hydration.js";
import type { SyntheticEvent } from "./event-types.js";

export function applyProps(
  element: HTMLElement,
  props: Record<string, unknown>,
  path: string,
  options: RenderOptions,
): void {
  const previous: AppliedProps = getAppliedProps(element) ?? {
    props: {},
    listeners: new Map<string, AppliedEventListener>(),
  };
  const nextAttributeNames = collectAttributeNames(props);

  for (const attribute of Array.from(element.attributes)) {
    if (!nextAttributeNames.has(attribute.name)) {
      reportRecoverable(
        options,
        "attribute",
        path,
        new Error(`Hydration attribute mismatch: ${attribute.name}.`),
      );
      element.removeAttribute(attribute.name);
    }
  }

  for (const [name, appliedListener] of previous.listeners) {
    const nextValue = props[name];

    if (nextValue !== appliedListener.handler) {
      previous.listeners.delete(name);
    }
  }

  for (const [name, value] of Object.entries(props)) {
    if (name === "children" || name === "ref" || name === "key") {
      continue;
    }

    if (name === "className") {
      applyAttribute(element, "class", value, path, options);
      continue;
    }

    if (name === "htmlFor") {
      applyAttribute(element, "for", value, path, options);
      continue;
    }

    if (name === "style") {
      applyStyle(element, previous.props[name], value, path, options);
      continue;
    }

    if (/^on[A-Z]/.test(name) && typeof value === "function") {
      if (previous.listeners.get(name)?.handler === value) {
        continue;
      }

      const handler = value as (event: SyntheticEvent) => void;
      for (const eventName of toEventNames(name)) {
        ensureDelegatedEventListener(options.eventRoot ?? element, eventName);
      }
      previous.listeners.set(name, { handler });
      continue;
    }

    if (typeof value === "boolean") {
      const attributeName = toDomAttributeName(name);
      if (element.hasAttribute(attributeName) !== value) {
        reportRecoverable(
          options,
          "attribute",
          path,
          new Error(`Hydration attribute mismatch: ${attributeName}.`),
        );
      }
      (element as unknown as Record<string, unknown>)[name] = value;

      if (value) {
        element.setAttribute(attributeName, "");
      } else {
        element.removeAttribute(attributeName);
      }
      continue;
    }

    applyAttribute(element, toDomAttributeName(name), value, path, options);
  }

  setAppliedProps(element, { props: { ...props }, listeners: previous.listeners });
}

function applyAttribute(
  element: HTMLElement,
  name: string,
  value: unknown,
  path: string,
  options: RenderOptions,
): void {
  if (value === null || value === undefined || value === false) {
    if (element.hasAttribute(name)) {
      reportRecoverable(
        options,
        "attribute",
        path,
        new Error(`Hydration attribute mismatch: ${name}.`),
      );
    }
    element.removeAttribute(name);
    return;
  }

  if (element.getAttribute(name) !== String(value)) {
    reportRecoverable(
      options,
      "attribute",
      path,
      new Error(`Hydration attribute mismatch: ${name}.`),
    );
  }

  element.setAttribute(name, String(value));
}

function applyStyle(
  element: HTMLElement,
  previousStyle: unknown,
  nextStyle: unknown,
  path: string,
  options: RenderOptions,
): void {
  if (isStyleObject(previousStyle)) {
    for (const name of Object.keys(previousStyle)) {
      element.style.removeProperty(name);
    }
  } else if (element.hasAttribute("style")) {
    reportRecoverable(
      options,
      "attribute",
      path,
      new Error("Hydration attribute mismatch: style."),
    );
    element.removeAttribute("style");
  }

  if (isStyleObject(nextStyle)) {
    Object.assign(element.style, nextStyle);
    return;
  }

  element.removeAttribute("style");
}

function collectAttributeNames(props: Record<string, unknown>): Set<string> {
  const names = new Set<string>();

  for (const [name, value] of Object.entries(props)) {
    if (
      name === "children" ||
      name === "ref" ||
      name === "key" ||
      /^on[A-Z]/.test(name) ||
      value === false ||
      value === null ||
      value === undefined
    ) {
      continue;
    }

    names.add(toDomAttributeName(name));
  }

  return names;
}

function toDomAttributeName(name: string): string {
  if (name === "className") {
    return "class";
  }

  if (name === "htmlFor") {
    return "for";
  }

  return name;
}

function isStyleObject(value: unknown): value is Partial<CSSStyleDeclaration> {
  return typeof value === "object" && value !== null;
}
