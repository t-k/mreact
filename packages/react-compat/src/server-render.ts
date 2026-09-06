import {
  Activity,
  FORWARD_REF_TYPE,
  Fragment,
  MEMO_TYPE,
  Profiler,
  isReactCompatElement,
  type ForwardRefType,
  type MemoType,
  type ReactCompatElement,
  type ReactCompatNode,
} from "./element.js";
import { isBooleanishStringAttribute } from "@reckona/mreact-shared";
import {
  consumerContext,
  isReactCompatConsumer,
  isReactCompatProvider,
  renderWithContextProvider,
  useContext,
} from "./context.js";
import {
  createCacheScope,
  createRootRuntime,
  renderWithRootRuntime,
  runWithCacheScope,
  type RootRuntime,
  type RootRuntimeOptions,
} from "./hooks.js";
import {
  isDangerousHtmlAttribute,
  readDangerousHtmlOptIn,
  isUnsafeMetaRefreshContent,
  isUnsafeUrlAttribute,
} from "./url-safety.js";
import { escapeHtmlAttribute as escapeHtml } from "@reckona/mreact-shared/html-escape";
import { isEventLikePropName, isVoidHtmlElement } from "@reckona/mreact-shared";

/** Renders a React-compatible component to an HTML string. */
export function renderToString<TProps>(
  component:
    | ((props: TProps) => ReactCompatNode)
    | (new (props: TProps) => { render(): ReactCompatNode }),
  props?: TProps,
  options: RootRuntimeOptions = {},
): string {
  const runtime = createRootRuntime(() => undefined, {
    ...options,
    idMode: "server",
  });

  return runWithCacheScope(createCacheScope(), () => {
    try {
      const rendered = renderWithRootRuntime(runtime, "0", () => {
        if (isClassComponentType(component)) {
          const instance = new component(props as Record<string, unknown>);
          return instance.render();
        }

        return (component as (props: TProps) => ReactCompatNode)(props as TProps);
      });
      return typeof rendered === "string" ? rendered : renderNodeToString(rendered, runtime, "0.0");
    } catch (error) {
      if (isThenable(error)) {
        throw new Error(
          "renderToString does not support Suspense. Use a streaming server renderer for components that suspend.",
        );
      }

      throw error;
    } finally {
      runtime.dispose();
    }
  });
}

// Renders a single child value the way the interpreter renders expression
// children: primitives escape, null/undefined/boolean render nothing, and
// react nodes fall back to the interpreter. Compiled compat pages call this
// for expression children whose runtime type is unknown.
export function renderChildToString(value: unknown): string {
  if (value === null || value === undefined || typeof value === "boolean") {
    return "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return escapeHtml(value);
  }

  const runtime = createRootRuntime(() => undefined, { idMode: "server" });

  return runWithCacheScope(createCacheScope(), () => {
    try {
      return renderNodeToString(value as ReactCompatNode, runtime, "0.0");
    } finally {
      runtime.dispose();
    }
  });
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function renderNodeToString(node: ReactCompatNode, runtime: RootRuntime, path: string): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return escapeHtml(node);
  }

  if (Array.isArray(node)) {
    let html = "";
    let previousWasText = false;
    for (let index = 0; index < node.length; index += 1) {
      const child = node[index];
      if (child === "" || child === null || child === undefined || typeof child === "boolean") {
        continue;
      }

      const childIsText = typeof child === "string" || typeof child === "number";
      if (previousWasText && childIsText) {
        html += "<!-- -->";
      }
      html += renderNodeToString(child, runtime, `${path}.${index}`);
      previousWasText = childIsText;
    }
    return html;
  }

  if (!isReactCompatElement(node)) {
    return "";
  }

  return renderElementToString(node, runtime, path);
}

function renderElementToString(
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
): string {
  if (typeof element.type === "string") {
    if (element.type === "textarea") {
      return renderTextareaToString(element, runtime, path);
    }

    if (element.type === "select") {
      return renderSelectToString(element, runtime, path);
    }

    if (element.type === "option" && currentSelectSelection != null) {
      return renderOptionToString(element, element.type, runtime, path);
    }

    return renderIntrinsicElementToString(element.type, element.props, runtime, path);
  }

  if (element.type === Fragment) {
    return renderNodeToString(element.props.children, runtime, `${path}.fragment`);
  }

  if (element.type === Activity) {
    if ((element.props as { mode?: unknown }).mode === "hidden") {
      return "";
    }

    return `<!--&-->${renderNodeToString(element.props.children, runtime, `${path}.activity`)}<!--/&-->`;
  }

  if (element.type === Profiler) {
    return renderNodeToString(element.props.children, runtime, `${path}.profiler`);
  }

  if (isReactCompatProvider(element.type)) {
    return renderWithContextProvider(
      element.type,
      (element.props as { value?: unknown }).value,
      () => renderNodeToString(element.props.children, runtime, `${path}.provider`),
    );
  }

  if (isReactCompatConsumer(element.type)) {
    const children = element.props.children;

    if (typeof children === "function") {
      return renderNodeToString(
        (children as (value: unknown) => ReactCompatNode)(
          useContext(consumerContext(element.type)),
        ),
        runtime,
        `${path}.consumer`,
      );
    }

    return "";
  }

  if (isForwardRefType(element.type)) {
    const forwardRefType = element.type;
    return renderNodeToString(
      renderWithRootRuntime(runtime, path, () => forwardRefType.render(element.props, element.ref)),
      runtime,
      `${path}.forwardRef`,
    );
  }

  if (isMemoType(element.type)) {
    return renderNodeToString(
      {
        ...element,
        type: element.type.type,
      },
      runtime,
      `${path}.memo`,
    );
  }

  if (isClassComponentType(element.type)) {
    const instance = new element.type(element.props);
    return renderNodeToString(
      renderWithRootRuntime(runtime, path, () => instance.render()),
      runtime,
      `${path}.class`,
    );
  }

  if (typeof element.type === "function") {
    const component = element.type as (props: typeof element.props) => ReactCompatNode;
    return renderNodeToString(
      renderWithRootRuntime(runtime, path, () => component(element.props)),
      runtime,
      `${path}.0`,
    );
  }

  return "";
}

function renderIntrinsicElementToString(
  tagName: string,
  props: Record<string, unknown>,
  runtime: RootRuntime,
  path: string,
): string {
  const attributes =
    tagName === "input" ? renderInputAttributesToString(props) : renderAttributesToString(props);
  if (isVoidHtmlElement(tagName)) {
    return `<${tagName}${attributes}/>`;
  }

  if (Object.prototype.hasOwnProperty.call(props, "dangerouslySetInnerHTML")) {
    return `<${tagName}${attributes}>${readDangerousHtmlOptIn(props.dangerouslySetInnerHTML) ?? ""}</${tagName}>`;
  }

  // Primitive children dominate real markup; serializing them inline skips
  // one recursive call and one child-path allocation per text leaf.
  const children = props.children;
  if (typeof children === "string" || typeof children === "number") {
    return `<${tagName}${attributes}>${escapeHtml(children)}</${tagName}>`;
  }

  return `<${tagName}${attributes}>${renderNodeToString(children as ReactCompatNode, runtime, `${path}.children`)}</${tagName}>`;
}

function renderAttributesToString(props: Record<string, unknown>): string {
  const skipUnsafeMetaRefreshContent = hasUnsafeMetaRefreshProps(props);

  let attributes = "";
  for (const name in props) {
    if (skipUnsafeMetaRefreshContent && name === "content") {
      continue;
    }
    attributes += renderHtmlAttribute(name, props[name]);
  }
  return attributes;
}

function hasUnsafeMetaRefreshProps(props: Record<string, unknown>): boolean {
  const content = props.content;
  if (typeof content !== "string") {
    return false;
  }

  const httpEquiv = props["http-equiv"] ?? props.httpEquiv;
  return typeof httpEquiv === "string" && isUnsafeMetaRefreshContent(httpEquiv, content);
}

function isClassComponentType(
  value: unknown,
): value is new (props: Record<string, unknown>) => { render(): ReactCompatNode } {
  return (
    typeof value === "function" &&
    typeof (value as { prototype?: { render?: unknown } }).prototype?.render === "function"
  );
}

function renderTextareaToString(
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
): string {
  const value =
    (element.props as { value?: unknown; defaultValue?: unknown }).value ??
    (element.props as { value?: unknown; defaultValue?: unknown }).defaultValue ??
    element.props.children;
  const attributes = Object.entries(element.props)
    .filter(([name]) => name !== "value" && name !== "defaultValue")
    .map(([name, child]) => renderHtmlAttribute(name, child))
    .filter((attribute) => attribute !== "")
    .join("");

  return `<textarea${attributes}>${renderNodeToString(value as ReactCompatNode, runtime, `${path}.textarea`)}</textarea>`;
}

/**
 * Selection of the `<select>` currently being serialized, or `null`/`undefined`
 * outside one (and for an uncontrolled select, which leaves each option's own
 * `selected` in charge).
 *
 * Server rendering here is a single synchronous tree walk — the same reason
 * `renderWithContextProvider` can keep provider values on a module-level stack —
 * so a saved-and-restored module variable is scoped to exactly one select
 * subtree. It cannot bleed into a sibling select, and because nothing yields,
 * concurrent requests cannot interleave inside a walk. Threading it as a
 * parameter instead would miss the point: options reached through arrays,
 * fragments, `optgroup`s and child components all funnel back through
 * `renderNodeToString`, and only an ambient value survives every one of those
 * hops the way React's `formatContext.selectedValue` does.
 */
let currentSelectSelection: unknown;

function withSelectSelection<T>(selection: unknown, render: () => T): T {
  const previous = currentSelectSelection;
  currentSelectSelection = selection;
  try {
    return render();
  } finally {
    currentSelectSelection = previous;
  }
}

function renderSelectToString(
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
): string {
  const props = element.props as { value?: unknown; defaultValue?: unknown };
  const selectedValue = props.value ?? props.defaultValue;
  const attributes = Object.entries(element.props)
    .filter(([name]) => name !== "value" && name !== "defaultValue")
    .map(([name, child]) => renderHtmlAttribute(name, child))
    .filter((attribute) => attribute !== "")
    .join("");

  return `<select${attributes}>${withSelectSelection(selectedValue, () =>
    renderNodeToString(element.props.children, runtime, `${path}.select`),
  )}</select>`;
}

/**
 * Applies the enclosing `<select>`'s selection to one `<option>`.
 *
 * `value` wins, then `defaultValue`, then the option's own `selected`: once the
 * select declares a selection it fully replaces `selected`, so a stale one on a
 * non-matching option cannot survive. Comparison is by `String()`, so `2` matches
 * `"2"`; an array selection (`<select multiple>`) matches any of its entries.
 */
function renderOptionToString(
  element: ReactCompatElement,
  tagName: string,
  runtime: RootRuntime,
  path: string,
): string {
  const selection = currentSelectSelection;
  const optionValue = (element.props as { value?: unknown }).value ?? element.props.children;
  const optionText = String(optionValue ?? "");
  const selected = Array.isArray(selection)
    ? selection.some((candidate) => candidate != null && String(candidate) === optionText)
    : String(selection) === optionText;
  const props = { ...element.props, selected };

  // An <option> cannot contain another option, and a nested <select> installs
  // its own selection, so the subtree never needs this one.
  return withSelectSelection(undefined, () =>
    renderIntrinsicElementToString(tagName, props, runtime, path),
  );
}

function renderInputAttributesToString(props: Record<string, unknown>): string {
  const hasValue = props.value !== undefined;
  const hasChecked = props.checked !== undefined;

  return Object.entries(props)
    .filter(
      ([name]) =>
        !((name === "defaultValue" && hasValue) || (name === "defaultChecked" && hasChecked)),
    )
    .sort(
      ([leftName], [rightName]) =>
        Number(isInputValueAttribute(leftName)) - Number(isInputValueAttribute(rightName)),
    )
    .map(([name, value]) => renderHtmlAttribute(toInputHtmlAttributeName(name), value))
    .filter((attribute) => attribute !== "")
    .join("");
}

type AttributeNameClassification =
  | { kind: "skip" }
  | { kind: "style" }
  | {
      kind: "attribute";
      attributeName: string;
      booleanishString: boolean;
      dataAttribute: boolean;
      dangerousHtml: boolean;
    };

const ATTRIBUTE_CLASSIFICATION_CACHE = new Map<string, AttributeNameClassification>();
const ATTRIBUTE_CLASSIFICATION_CACHE_LIMIT = 1024;
let attributeClassificationCacheMissCount = 0;

export const __serverRenderAttributeCacheForTesting = {
  clear() {
    ATTRIBUTE_CLASSIFICATION_CACHE.clear();
    attributeClassificationCacheMissCount = 0;
  },
  missCount() {
    return attributeClassificationCacheMissCount;
  },
  size() {
    return ATTRIBUTE_CLASSIFICATION_CACHE.size;
  },
};

function renderHtmlAttribute(name: string, value: unknown): string {
  if (value === null || value === undefined || typeof value === "function") {
    return "";
  }

  const classification = classifyAttributeName(name);

  if (classification.kind === "skip") {
    return "";
  }

  if (classification.kind === "style") {
    const style = renderStyleAttribute(value);
    return style === "" ? "" : ` style="${escapeHtml(style)}"`;
  }

  const { attributeName } = classification;

  if (typeof value === "boolean" && classification.booleanishString) {
    return ` ${attributeName}="${value ? "true" : "false"}"`;
  }

  if (typeof value === "boolean" && classification.dataAttribute) {
    return ` ${attributeName}="${value ? "true" : "false"}"`;
  }

  if (value === false) {
    return "";
  }

  if (classification.dangerousHtml) {
    const html = readDangerousHtmlOptIn(value);
    return html === undefined ? "" : ` ${attributeName}="${escapeHtml(html)}"`;
  }

  if (typeof value === "object") {
    return "";
  }

  if (value === true) {
    return ` ${attributeName}=""`;
  }

  const stringValue = String(value);

  if (isUnsafeUrlAttribute(attributeName, stringValue)) {
    return "";
  }

  return ` ${attributeName}="${escapeHtml(stringValue)}"`;
}

const VALID_ATTRIBUTE_NAME = /^[A-Za-z_][\w.\-:]*$/;

function classifyAttributeName(name: string): AttributeNameClassification {
  const cached = ATTRIBUTE_CLASSIFICATION_CACHE.get(name);
  if (cached !== undefined) {
    return cached;
  }

  attributeClassificationCacheMissCount += 1;

  const classification = createAttributeNameClassification(name);
  if (ATTRIBUTE_CLASSIFICATION_CACHE.size < ATTRIBUTE_CLASSIFICATION_CACHE_LIMIT) {
    ATTRIBUTE_CLASSIFICATION_CACHE.set(name, classification);
  }
  return classification;
}

function createAttributeNameClassification(name: string): AttributeNameClassification {
  if (
    name === "children" ||
    name === "dangerouslySetInnerHTML" ||
    name === "key" ||
    name === "ref" ||
    isEventLikePropName(name)
  ) {
    return { kind: "skip" };
  }

  if (name === "style") {
    return { kind: "style" };
  }

  const attributeName = toHtmlAttributeName(name);

  if (!VALID_ATTRIBUTE_NAME.test(attributeName) || isEventLikePropName(attributeName)) {
    return { kind: "skip" };
  }

  return {
    kind: "attribute",
    attributeName,
    booleanishString: isBooleanishStringAttribute(attributeName),
    dataAttribute: isDataAttribute(attributeName),
    dangerousHtml: isDangerousHtmlAttribute(attributeName),
  };
}

function isDataAttribute(attributeName: string): boolean {
  return attributeName.toLowerCase().startsWith("data-");
}

function isInputValueAttribute(name: string): boolean {
  return name === "value" || name === "defaultValue";
}

function toInputHtmlAttributeName(name: string): string {
  if (name === "defaultValue") {
    return "value";
  }

  if (name === "defaultChecked") {
    return "checked";
  }

  return name;
}

function toHtmlAttributeName(name: string): string {
  return Object.hasOwn(HTML_ATTRIBUTE_ALIASES, name)
    ? (HTML_ATTRIBUTE_ALIASES[name] as string)
    : name;
}

const HTML_ATTRIBUTE_ALIASES: Record<string, string> = {
  acceptCharset: "accept-charset",
  autoCapitalize: "autocapitalize",
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
  rowSpan: "rowspan",
  spellCheck: "spellcheck",
  imageSrcSet: "imagesrcset",
  srcDoc: "srcdoc",
  srcSet: "srcset",
  tabIndex: "tabindex",
  useMap: "usemap",
};

function renderStyleAttribute(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return "";
  }

  const styleProps = value as Record<string, unknown>;
  let css = "";
  for (const name in styleProps) {
    const propertyValue = styleProps[name];
    if (
      propertyValue === null ||
      propertyValue === undefined ||
      typeof propertyValue === "boolean" ||
      propertyValue === ""
    ) {
      continue;
    }

    css +=
      css === ""
        ? `${toKebabCase(name)}:${renderCssValue(name, propertyValue)}`
        : `;${toKebabCase(name)}:${renderCssValue(name, propertyValue)}`;
  }
  return css;
}

function renderCssValue(name: string, value: unknown): string {
  if (typeof value !== "number" || value === 0 || isUnitlessCssProperty(name)) {
    return String(value);
  }

  return `${value}px`;
}

const UPPERCASE_LETTER = /[A-Z]/;
const UPPERCASE_LETTER_GLOBAL = /[A-Z]/g;
// Distinct camelCase style names per app are few; the cap only guards
// pathological dynamically-generated property names.
const KEBAB_CASE_CACHE = new Map<string, string>();
const KEBAB_CASE_CACHE_LIMIT = 512;

function kebabReplace(letter: string): string {
  return `-${letter.toLowerCase()}`;
}

function toKebabCase(value: string): string {
  if (!UPPERCASE_LETTER.test(value)) {
    return value;
  }

  let cached = KEBAB_CASE_CACHE.get(value);
  if (cached === undefined) {
    cached = value.replace(UPPERCASE_LETTER_GLOBAL, kebabReplace);
    if (KEBAB_CASE_CACHE.size < KEBAB_CASE_CACHE_LIMIT) {
      KEBAB_CASE_CACHE.set(value, cached);
    }
  }
  return cached;
}

function isUnitlessCssProperty(name: string): boolean {
  return (
    name === "flex" ||
    name === "fontWeight" ||
    name === "lineHeight" ||
    name === "opacity" ||
    name === "order" ||
    name === "zIndex" ||
    name === "zoom"
  );
}

function isForwardRefType(value: unknown): value is ForwardRefType {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === FORWARD_REF_TYPE
  );
}

function isMemoType(value: unknown): value is MemoType {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === MEMO_TYPE
  );
}
