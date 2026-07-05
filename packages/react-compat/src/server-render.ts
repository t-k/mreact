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
  isDangerousHtmlOptIn,
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
      return typeof rendered === "string"
        ? rendered
        : renderNodeToString(rendered, runtime, "0.0");
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

function renderNodeToString(
  node: ReactCompatNode,
  runtime: RootRuntime,
  path: string,
): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return escapeHtml(node);
  }

  if (Array.isArray(node)) {
    let html = "";
    for (let index = 0; index < node.length; index += 1) {
      html += renderNodeToString(node[index], runtime, `${path}.${index}`);
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

    const attributes =
      element.type === "input"
        ? renderInputAttributesToString(element.props)
        : renderAttributesToString(element.props);
    if (isVoidHtmlElement(element.type)) {
      return `<${element.type}${attributes}/>`;
    }

    // Primitive children dominate real markup; serializing them inline skips
    // one recursive call and one child-path allocation per text leaf.
    const children = element.props.children;
    if (typeof children === "string" || typeof children === "number") {
      return `<${element.type}${attributes}>${escapeHtml(children)}</${element.type}>`;
    }

    return `<${element.type}${attributes}>${renderNodeToString(children, runtime, `${path}.children`)}</${element.type}>`;
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
        (children as (value: unknown) => ReactCompatNode)(useContext(consumerContext(element.type))),
        runtime,
        `${path}.consumer`,
      );
    }

    return "";
  }

  if (isForwardRefType(element.type)) {
    const forwardRefType = element.type;
    return renderNodeToString(
      renderWithRootRuntime(runtime, path, () =>
        forwardRefType.render(element.props, element.ref),
      ),
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

function renderSelectToString(
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
): string {
  const selectedValue =
    (element.props as { value?: unknown; defaultValue?: unknown }).value ??
    (element.props as { value?: unknown; defaultValue?: unknown }).defaultValue;
  const attributes = Object.entries(element.props)
    .filter(([name]) => name !== "value" && name !== "defaultValue")
    .map(([name, child]) => renderHtmlAttribute(name, child))
    .filter((attribute) => attribute !== "")
    .join("");

  return `<select${attributes}>${renderSelectChildrenToString(
    element.props.children,
    selectedValue,
    runtime,
    `${path}.select`,
  )}</select>`;
}

function renderSelectChildrenToString(
  children: ReactCompatNode,
  selectedValue: unknown,
  runtime: RootRuntime,
  path: string,
): string {
  const childArray = Array.isArray(children) ? children : [children];

  return childArray.map((child, index) => {
    if (!isReactCompatElement(child) || child.type !== "option") {
      return renderNodeToString(child, runtime, `${path}.${index}`);
    }

    const optionValue =
      (child.props as { value?: unknown }).value ?? child.props.children;
    const selected =
      selectedValue !== undefined && String(optionValue) === String(selectedValue);
    const props = selected
      ? { ...child.props, selected: true }
      : child.props;

    return renderElementToString({ ...child, props }, runtime, `${path}.${index}`);
  }).join("");
}

function renderInputAttributesToString(props: Record<string, unknown>): string {
  const hasValue = props.value !== undefined;
  const hasChecked = props.checked !== undefined;

  return Object.entries(props)
    .filter(([name]) =>
      !((name === "defaultValue" && hasValue) || (name === "defaultChecked" && hasChecked))
    )
    .sort(([leftName], [rightName]) =>
      Number(isInputValueAttribute(leftName)) - Number(isInputValueAttribute(rightName))
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
  if (
    value === null ||
    value === undefined ||
    typeof value === "function"
  ) {
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
    return isDangerousHtmlOptIn(value)
      ? ` ${attributeName}="${escapeHtml(value.__html)}"`
      : "";
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

function isBooleanishStringAttribute(attributeName: string): boolean {
  // Callers pass the already-mapped HTML attribute name.
  const lowerCased = attributeName.toLowerCase();
  return lowerCased.startsWith("aria-") || BOOLEANISH_STRING_ATTRIBUTES.has(lowerCased);
}

function isDataAttribute(attributeName: string): boolean {
  return attributeName.toLowerCase().startsWith("data-");
}

const BOOLEANISH_STRING_ATTRIBUTES = new Set<string>([
  "contenteditable",
  "draggable",
  "spellcheck",
]);

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

    css += css === ""
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
