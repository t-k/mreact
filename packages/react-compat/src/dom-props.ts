import {
  getAppliedProps,
  setAppliedProps,
  type AppliedEventListener,
  type AppliedProps,
  ensureDelegatedEventListener,
  toEventNames,
} from "./host-event-binder.js";
import { HOST_OWN_PROPS_META } from "./element.js";
import { reportRecoverable, type RenderOptions } from "./hydration.js";
import type { SyntheticEvent } from "./event-types.js";
import {
  isDangerousHtmlAttribute,
  isDangerousHtmlOptIn,
  isUnsafeUrlAttribute,
  isUrlAttribute,
} from "./url-safety.js";
import {
  serializeClientStyleValue,
  styleNameToCssName,
  type HostElement,
} from "./dom-host-rules.js";

export function applyProps(
  element: HostElement,
  props: Record<string, unknown>,
  path: string,
  options: RenderOptions,
): void {
  const preserveHydrationAttributes = options.preserveHydrationAttributes === true;
  const previous = getAppliedProps(element);

  if (previous === undefined && !preserveHydrationAttributes) {
    if (applyInitialRowProps(element, props)) {
      setAppliedProps(element, { props });
      return;
    }

    setAppliedProps(element, {
      props,
      ...applyInitialProps(element, props, path, options),
    });
    return;
  }

  const previousProps = previous?.props ?? {};
  let listeners = previous?.listeners;
  const nextAttributeNames = collectAttributeNames(props);

  if (!preserveHydrationAttributes) {
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
  }

  if (listeners !== undefined) {
    for (const [name, appliedListener] of listeners) {
      const nextValue = props[name];

      if (nextValue !== appliedListener.handler) {
        listeners.delete(name);
      }
    }
  }

  for (const [name, value] of Object.entries(props)) {
    if (name === "children" || name === "ref" || name === "key") {
      continue;
    }

    if (applyFormValueProp(element, name, value, path, options)) {
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
      applyStyle(element, previousProps[name], value, path, options);
      continue;
    }

    if (/^on[A-Z]/.test(name) && typeof value === "function") {
      if (listeners?.get(name)?.handler === value) {
        continue;
      }

      const handler = value as (event: SyntheticEvent) => void;
      for (const eventName of toEventNames(name)) {
        ensureDelegatedEventListener(options.eventRoot ?? element, eventName);
      }
      listeners ??= new Map<string, AppliedEventListener>();
      listeners.set(name, { handler });
      continue;
    }

    if (typeof value === "boolean") {
      const attributeName = toDomAttributeName(name);
      if (element.hasAttribute(attributeName) !== value) {
        if (!preserveHydrationAttributes) {
          reportRecoverable(
            options,
            "attribute",
            path,
            new Error(`Hydration attribute mismatch: ${attributeName}.`),
          );
        }
      }

      if (preserveHydrationAttributes) {
        continue;
      }

      if ((element as unknown as Record<string, unknown>)[name] !== value) {
        (element as unknown as Record<string, unknown>)[name] = value;
      }

      if (value) {
        if (!element.hasAttribute(attributeName)) {
          element.setAttribute(attributeName, "");
        }
      } else if (element.hasAttribute(attributeName)) {
        element.removeAttribute(attributeName);
      }
      continue;
    }

    applyAttribute(element, toDomAttributeName(name), value, path, options);
  }

  setAppliedProps(element, {
    props,
    ...(listeners === undefined ? {} : { listeners }),
  });
}

function applyInitialProps(
  element: HostElement,
  props: Record<string, unknown>,
  path: string,
  options: RenderOptions,
): Pick<AppliedProps, "listeners"> | {} {
  let listeners: Map<string, AppliedEventListener> | undefined;

  for (const name in props) {
    if (!Object.prototype.hasOwnProperty.call(props, name)) {
      continue;
    }

    const value = props[name];

    if (name === "children" || name === "ref" || name === "key") {
      continue;
    }

    if (applyFormValueProp(element, name, value, path, options)) {
      continue;
    }

    if (value === null || value === undefined || value === false) {
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
      applyStyle(element, undefined, value, path, options);
      continue;
    }

    if (/^on[A-Z]/.test(name) && typeof value === "function") {
      const handler = value as (event: SyntheticEvent) => void;
      for (const eventName of toEventNames(name)) {
        ensureDelegatedEventListener(options.eventRoot ?? element, eventName);
      }
      listeners ??= new Map<string, AppliedEventListener>();
      listeners.set(name, { handler });
      continue;
    }

    if (typeof value === "boolean") {
      const attributeName = toDomAttributeName(name);
      if ((element as unknown as Record<string, unknown>)[name] !== value) {
        (element as unknown as Record<string, unknown>)[name] = value;
      }

      if (value) {
        if (!element.hasAttribute(attributeName)) {
          element.setAttribute(attributeName, "");
        }
      } else if (element.hasAttribute(attributeName)) {
        element.removeAttribute(attributeName);
      }
      continue;
    }

    applyAttribute(element, toDomAttributeName(name), value, path, options);
  }

  return listeners === undefined ? {} : { listeners };
}

function applyInitialRowProps(
  element: HostElement,
  props: Record<string, unknown>,
): boolean {
  const meta = (props as { [HOST_OWN_PROPS_META]?: number })[HOST_OWN_PROPS_META];

  if (meta === undefined) {
    return false;
  }

  element.setAttribute("data-key", String(props["data-key"]));

  if ((meta & 1) !== 0) {
    element.setAttribute("class", "selected");
  }

  if ((meta & 2) !== 0) {
    element.setAttribute("data-selected", "true");
  }

  return true;
}

export function applyPostChildFormProps(
  element: Element,
  props: Record<string, unknown>,
): void {
  const value = props.value ?? props.defaultValue;

  if (value === undefined || value === null) {
    return;
  }

  if (element instanceof HTMLInputElement) {
    element.value = String(value);
    element.setAttribute("value", String(value));
    return;
  }

  if (element instanceof HTMLTextAreaElement) {
    element.value = String(value);
    element.textContent = String(value);
    return;
  }

  if (element instanceof HTMLSelectElement) {
    const nextValue = String(value);
    for (const option of Array.from(element.options)) {
      option.selected = option.value === nextValue;
    }
  }
}

function applyAttribute(
  element: Element,
  name: string,
  value: unknown,
  path: string,
  options: RenderOptions,
): void {
  const preserveHydrationAttributes = options.preserveHydrationAttributes === true;

  // Issue 077: srcdoc and other HTML-bearing attributes require the
  // explicit `{ __html: "..." }` opt-in. A plain value -- string,
  // number, boolean -- is treated as if it were null (drop the
  // attribute and log a recoverable mismatch).
  if (isDangerousHtmlAttribute(name) && !isDangerousHtmlOptIn(value)) {
    if (element.hasAttribute(name) && !preserveHydrationAttributes) {
      reportRecoverable(
        options,
        "attribute",
        path,
        new Error(`Unsafe HTML attribute dropped: ${name}.`),
      );
    }
    if (!preserveHydrationAttributes) {
      element.removeAttribute(name);
    }
    return;
  }

  if (value === null || value === undefined || value === false) {
    if (element.hasAttribute(name) && !preserveHydrationAttributes) {
      reportRecoverable(
        options,
        "attribute",
        path,
        new Error(`Hydration attribute mismatch: ${name}.`),
      );
    }

    if (!preserveHydrationAttributes) {
      element.removeAttribute(name);
    }
    return;
  }

  const stringValue = isDangerousHtmlOptIn(value)
    ? (value as { __html: string }).__html
    : String(value);

  // Issue 075: URL attributes are scheme-validated against the same
  // block list used by SSR (packages/server/src/url-safety.ts). If the
  // value is unsafe we treat it as if it were null -- remove the
  // existing attribute, log a recoverable mismatch, and stop. This
  // matches react-dom's sanitizeURL posture.
  if (isUrlAttribute(name) && isUnsafeUrlAttribute(name, stringValue)) {
    if (element.hasAttribute(name) && !preserveHydrationAttributes) {
      reportRecoverable(
        options,
        "attribute",
        path,
        new Error(`Unsafe URL scheme dropped from ${name}.`),
      );
    }
    if (!preserveHydrationAttributes) {
      element.removeAttribute(name);
    }
    return;
  }

  const currentValue = element.getAttribute(name);

  if (currentValue !== stringValue && !preserveHydrationAttributes) {
    reportRecoverable(
      options,
      "attribute",
      path,
      new Error(`Hydration attribute mismatch: ${name}.`),
    );
  }

  if (preserveHydrationAttributes) {
    return;
  }

  if (currentValue === stringValue) {
    return;
  }

  element.setAttribute(name, stringValue);
}

function applyFormValueProp(
  element: Element,
  name: string,
  value: unknown,
  path: string,
  options: RenderOptions,
): boolean {
  if (element instanceof HTMLInputElement && (name === "value" || name === "defaultValue")) {
    const nextValue = value === null || value === undefined ? "" : String(value);

    if (element.value !== nextValue) {
      reportRecoverable(
        options,
        "attribute",
        path,
        new Error("Hydration attribute mismatch: value."),
      );
    }

    element.value = nextValue;
    return true;
  }

  if (element instanceof HTMLInputElement && (name === "checked" || name === "defaultChecked")) {
    const nextChecked = value !== null && value !== undefined && value !== false;

    if (element.checked !== nextChecked) {
      reportRecoverable(
        options,
        "attribute",
        path,
        new Error("Hydration attribute mismatch: checked."),
      );
    }

    element.checked = nextChecked;
    element.defaultChecked = nextChecked;
    if (nextChecked) {
      element.setAttribute("checked", "");
    } else {
      element.removeAttribute("checked");
    }
    return true;
  }

  if (element instanceof HTMLTextAreaElement && (name === "value" || name === "defaultValue")) {
    const nextValue = value === null || value === undefined ? "" : String(value);

    if (element.value !== nextValue) {
      reportRecoverable(
        options,
        "attribute",
        path,
        new Error("Hydration attribute mismatch: textarea value."),
      );
    }

    element.value = nextValue;
    return true;
  }

  if (element instanceof HTMLSelectElement && (name === "value" || name === "defaultValue")) {
    const nextValue = value === null || value === undefined ? undefined : String(value);

    for (const option of Array.from(element.options)) {
      option.selected = nextValue !== undefined && option.value === nextValue;
    }

    return true;
  }

  return false;
}

function applyStyle(
  element: HostElement,
  previousStyle: unknown,
  nextStyle: unknown,
  path: string,
  options: RenderOptions,
): void {
  if (options.preserveHydrationAttributes === true) {
    return;
  }

  if (isStyleObject(previousStyle)) {
    for (const name of Object.keys(previousStyle)) {
      element.style.removeProperty(styleNameToCssName(name));
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
    for (const [name, value] of Object.entries(nextStyle)) {
      if (value === null || value === undefined || value === false) {
        continue;
      }
      element.style.setProperty(styleNameToCssName(name), serializeClientStyleValue(name, value));
    }
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

    if (name === "defaultValue") {
      names.add("value");
      continue;
    }

    if (name === "defaultChecked") {
      names.add("checked");
      continue;
    }

    names.add(toDomAttributeName(name));
  }

  return names;
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

function isStyleObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
