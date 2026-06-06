import {
  getAppliedProps,
  setAppliedProps,
  ensureDelegatedEventListenersForProp,
} from "./host-event-binder.js";
import { HOST_OWN_PROPS_META } from "./element.js";
import { reportRecoverable, type RenderOptions } from "./hydration.js";
import {
  isDangerousHtmlAttribute,
  isDangerousHtmlOptIn,
  isSrcsetAttribute,
  isUnsafeMetaRefreshContent,
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
  const nextProps = sanitizeMetaRefreshElementProps(element, props);

  if (previous === undefined && !preserveHydrationAttributes) {
    if (applyInitialRowProps(element, nextProps)) {
      setAppliedProps(element, {
        props: nextProps,
      });
      return;
    }

    applyInitialProps(element, nextProps, path, options);
    setAppliedProps(element, {
      props: nextProps,
    });
    return;
  }

  const previousProps = previous?.props ?? {};
  const previousAttributeNames = previous?.attributeNames ?? collectAttributeNames(previousProps);
  const nextAttributeNames = collectAttributeNames(nextProps);

  if (!preserveHydrationAttributes) {
    for (const attributeName of previousAttributeNames) {
      if (!nextAttributeNames.includes(attributeName)) {
        if (attributeName === "style") {
          removePreviousStyle(element, previousProps.style, path, options);
          continue;
        }

        if (element.hasAttribute(attributeName)) {
          reportRecoverable(
            options,
            "attribute",
            path,
            new Error(`Hydration attribute mismatch: ${attributeName}.`),
          );
          element.removeAttribute(attributeName);
        }
      }
    }
  }

  for (const name in nextProps) {
    if (!Object.prototype.hasOwnProperty.call(nextProps, name)) {
      continue;
    }

    const value = nextProps[name];

    if (name === "children" || name === "ref" || name === "key") {
      continue;
    }

    if (isFormValuePropName(name) && applyFormValueProp(element, name, value, path, options)) {
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

    if (isReactEventHandlerPropName(name) && typeof value === "function") {
      if (previousProps[name] === value) {
        continue;
      }

      ensureDelegatedEventListenersForProp(options.eventRoot ?? element, name);
      continue;
    }

    if (isEventLikePropName(name)) {
      continue;
    }

    const attributeName = toDomAttributeName(name);

    if (typeof value === "boolean" && isBooleanishStringAttribute(attributeName)) {
      applyAttribute(element, attributeName, value ? "true" : "false", path, options);
      continue;
    }

    if (typeof value === "boolean" && isDataAttribute(attributeName)) {
      applyAttribute(element, attributeName, value ? "true" : "false", path, options);
      continue;
    }

    if (typeof value === "boolean") {
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
    attributeNames: nextAttributeNames,
    props: nextProps,
  });
}

function applyInitialProps(
  element: HostElement,
  props: Record<string, unknown>,
  path: string,
  options: RenderOptions,
): void {
  const useAttributeFastPath = options.hydration === undefined;

  for (const name in props) {
    if (!Object.prototype.hasOwnProperty.call(props, name)) {
      continue;
    }

    const value = props[name];

    if (name === "children" || name === "ref" || name === "key") {
      continue;
    }

    if (isFormValuePropName(name) && applyFormValueProp(element, name, value, path, options)) {
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    if (name === "className") {
      applyInitialOrHydrationAttribute(
        element,
        "class",
        value,
        path,
        options,
        useAttributeFastPath,
      );
      continue;
    }

    if (name === "htmlFor") {
      applyInitialOrHydrationAttribute(
        element,
        "for",
        value,
        path,
        options,
        useAttributeFastPath,
      );
      continue;
    }

    if (name === "style") {
      applyStyle(element, undefined, value, path, options);
      continue;
    }

    if (isReactEventHandlerPropName(name) && typeof value === "function") {
      ensureDelegatedEventListenersForProp(options.eventRoot ?? element, name);
      continue;
    }

    if (isEventLikePropName(name)) {
      continue;
    }

    const attributeName = toDomAttributeName(name);

    if (typeof value === "boolean" && isBooleanishStringAttribute(attributeName)) {
      applyInitialOrHydrationAttribute(
        element,
        attributeName,
        value ? "true" : "false",
        path,
        options,
        useAttributeFastPath,
      );
      continue;
    }

    if (typeof value === "boolean" && isDataAttribute(attributeName)) {
      applyInitialOrHydrationAttribute(
        element,
        attributeName,
        value ? "true" : "false",
        path,
        options,
        useAttributeFastPath,
      );
      continue;
    }

    if (value === false) {
      continue;
    }

    if (typeof value === "boolean") {
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

    applyInitialOrHydrationAttribute(
      element,
      attributeName,
      value,
      path,
      options,
      useAttributeFastPath,
    );
  }

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

  if (isEventLikePropName(name)) {
    if (element.hasAttribute(name) && !preserveHydrationAttributes) {
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
  if (
    (isUrlAttribute(name) || isSrcsetAttribute(name)) &&
    isUnsafeUrlAttribute(name, stringValue)
  ) {
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

function applyInitialAttribute(
  element: Element,
  name: string,
  value: unknown,
): void {
  if (isDangerousHtmlAttribute(name) && !isDangerousHtmlOptIn(value)) {
    return;
  }

  if (isEventLikePropName(name) || value === null || value === undefined || value === false) {
    return;
  }

  const stringValue = isDangerousHtmlOptIn(value)
    ? (value as { __html: string }).__html
    : String(value);

  if (
    (isUrlAttribute(name) || isSrcsetAttribute(name)) &&
    isUnsafeUrlAttribute(name, stringValue)
  ) {
    return;
  }

  element.setAttribute(name, stringValue);
}

function applyInitialOrHydrationAttribute(
  element: Element,
  name: string,
  value: unknown,
  path: string,
  options: RenderOptions,
  useFastPath: boolean,
): void {
  if (useFastPath) {
    applyInitialAttribute(element, name, value);
    return;
  }

  applyAttribute(element, name, value, path, options);
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

function isFormValuePropName(name: string): boolean {
  return (
    name === "value" ||
    name === "defaultValue" ||
    name === "checked" ||
    name === "defaultChecked"
  );
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

  removePreviousStyle(element, previousStyle, path, options);

  if (isStyleObject(nextStyle)) {
    for (const [name, value] of Object.entries(nextStyle)) {
      if (value === null || value === undefined || value === false) {
        continue;
      }
      element.style.setProperty(styleNameToCssName(name), serializeClientStyleValue(name, value));
    }
    return;
  }

  if (nextStyle !== undefined && nextStyle !== null && nextStyle !== false) {
    element.removeAttribute("style");
  }
}

function removePreviousStyle(
  element: HostElement,
  previousStyle: unknown,
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
    return;
  }

  if (previousStyle !== undefined && element.hasAttribute("style")) {
    reportRecoverable(
      options,
      "attribute",
      path,
      new Error("Hydration attribute mismatch: style."),
    );
    element.removeAttribute("style");
  }
}

function collectAttributeNames(props: Record<string, unknown>): string[] {
  const names: string[] = [];

  for (const name in props) {
    if (!Object.prototype.hasOwnProperty.call(props, name)) {
      continue;
    }

    const value = props[name];

    if (
      name === "children" ||
      name === "ref" ||
      name === "key" ||
      isEventLikePropName(name) ||
      value === null ||
      value === undefined
    ) {
      continue;
    }

    const attributeName = toDomAttributeName(name);

    if (
      value === false &&
      !isBooleanishStringAttribute(attributeName) &&
      !isDataAttribute(attributeName)
    ) {
      continue;
    }

    if (name === "defaultValue") {
      pushUniqueAttributeName(names, "value");
      continue;
    }

    if (name === "defaultChecked") {
      pushUniqueAttributeName(names, "checked");
      continue;
    }

    pushUniqueAttributeName(names, attributeName);
  }

  return names;
}

function pushUniqueAttributeName(names: string[], name: string): void {
  if (!names.includes(name)) {
    names.push(name);
  }
}

function isReactEventHandlerPropName(name: string): boolean {
  const third = name.charCodeAt(2);
  return name.charCodeAt(0) === 111 && name.charCodeAt(1) === 110 && third >= 65 && third <= 90;
}

function isEventLikePropName(name: string): boolean {
  const first = name.charCodeAt(0);
  const second = name.charCodeAt(1);
  return (first === 111 || first === 79) && (second === 110 || second === 78);
}

function sanitizeMetaRefreshElementProps(
  element: Element,
  props: Record<string, unknown>,
): Record<string, unknown> {
  if (element.tagName !== "META" && element.tagName !== "meta") {
    return props;
  }

  const httpEquiv = props["http-equiv"] ?? props.httpEquiv ?? element.getAttribute("http-equiv");
  const content = props.content;
  if (typeof httpEquiv !== "string" || typeof content !== "string") {
    return props;
  }
  if (!isUnsafeMetaRefreshContent(httpEquiv, content)) {
    return props;
  }

  const sanitized = { ...props };
  delete sanitized.content;
  return sanitized;
}

function isBooleanishStringAttribute(name: string): boolean {
  const attributeName = toDomAttributeName(name).toLowerCase();
  return attributeName.startsWith("aria-") || BOOLEANISH_STRING_ATTRIBUTES.has(attributeName);
}

function isDataAttribute(name: string): boolean {
  return toDomAttributeName(name).toLowerCase().startsWith("data-");
}

const BOOLEANISH_STRING_ATTRIBUTES = new Set<string>([
  "contenteditable",
  "draggable",
  "spellcheck",
]);

function toDomAttributeName(name: string): string {
  return DOM_ATTRIBUTE_ALIASES[name] ?? name;
}

const DOM_ATTRIBUTE_ALIASES: Record<string, string> = {
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
  alignmentBaseline: "alignment-baseline",
  baselineShift: "baseline-shift",
  clipPath: "clip-path",
  clipRule: "clip-rule",
  colorInterpolation: "color-interpolation",
  colorInterpolationFilters: "color-interpolation-filters",
  colorProfile: "color-profile",
  colorRendering: "color-rendering",
  dominantBaseline: "dominant-baseline",
  enableBackground: "enable-background",
  fillOpacity: "fill-opacity",
  fillRule: "fill-rule",
  floodColor: "flood-color",
  floodOpacity: "flood-opacity",
  fontFamily: "font-family",
  fontSize: "font-size",
  fontSizeAdjust: "font-size-adjust",
  fontStretch: "font-stretch",
  fontStyle: "font-style",
  fontVariant: "font-variant",
  fontWeight: "font-weight",
  glyphOrientationHorizontal: "glyph-orientation-horizontal",
  glyphOrientationVertical: "glyph-orientation-vertical",
  imageRendering: "image-rendering",
  letterSpacing: "letter-spacing",
  lightingColor: "lighting-color",
  markerEnd: "marker-end",
  markerMid: "marker-mid",
  markerStart: "marker-start",
  overlinePosition: "overline-position",
  overlineThickness: "overline-thickness",
  paintOrder: "paint-order",
  pointerEvents: "pointer-events",
  shapeRendering: "shape-rendering",
  stopColor: "stop-color",
  stopOpacity: "stop-opacity",
  strikethroughPosition: "strikethrough-position",
  strikethroughThickness: "strikethrough-thickness",
  strokeDasharray: "stroke-dasharray",
  strokeDashoffset: "stroke-dashoffset",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeMiterlimit: "stroke-miterlimit",
  strokeOpacity: "stroke-opacity",
  strokeWidth: "stroke-width",
  textAnchor: "text-anchor",
  textDecoration: "text-decoration",
  textRendering: "text-rendering",
  transformOrigin: "transform-origin",
  underlinePosition: "underline-position",
  underlineThickness: "underline-thickness",
  unicodeBidi: "unicode-bidi",
  vectorEffect: "vector-effect",
  wordSpacing: "word-spacing",
  writingMode: "writing-mode",
  xHeight: "x-height",
};

function isStyleObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
