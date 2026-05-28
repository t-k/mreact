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
import { isDangerousHtmlAttribute, isDangerousHtmlOptIn } from "./url-safety.js";
import { escapeHtmlAttribute as escapeHtml } from "@reckona/mreact-shared/html-escape";

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
    } finally {
      runtime.dispose();
    }
  });
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
    if (voidHtmlElements.has(element.type)) {
      return `<${element.type}${attributes}/>`;
    }

    return `<${element.type}${attributes}>${renderNodeToString(element.props.children, runtime, `${path}.children`)}</${element.type}>`;
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
        (children as (value: unknown) => ReactCompatNode)(useContext(element.type.context)),
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
  const entries = Object.entries(props);
  if (
    entries.length === 0 ||
    (entries.length === 1 && entries[0]?.[0] === "children")
  ) {
    return "";
  }

  let attributes = "";
  for (const [name, value] of entries) {
    attributes += renderHtmlAttribute(name, value);
  }
  return attributes;
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

function renderHtmlAttribute(name: string, value: unknown): string {
  if (
    name === "children" ||
    name === "key" ||
    name === "ref" ||
    /^on[A-Z]/.test(name) ||
    value === null ||
    value === undefined ||
    value === false ||
    typeof value === "function"
  ) {
    return "";
  }

  if (name === "style") {
    const style = renderStyleAttribute(value);
    return style === "" ? "" : ` style="${escapeHtml(style)}"`;
  }

  const attributeName = toHtmlAttributeName(name);
  if (isDangerousHtmlAttribute(attributeName)) {
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

  return ` ${attributeName}="${escapeHtml(value)}"`;
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
  readOnly: "readOnly",
  rowSpan: "rowspan",
  spellCheck: "spellcheck",
  srcDoc: "srcdoc",
  srcSet: "srcset",
  tabIndex: "tabindex",
  useMap: "usemap",
};

function renderStyleAttribute(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return "";
  }

  return Object.entries(value)
    .filter(([, propertyValue]) =>
      propertyValue !== null &&
      propertyValue !== undefined &&
      typeof propertyValue !== "boolean" &&
      propertyValue !== "",
    )
    .map(([name, propertyValue]) =>
      `${toKebabCase(name)}:${renderCssValue(name, propertyValue)}`,
    )
    .join(";");
}

function renderCssValue(name: string, value: unknown): string {
  if (typeof value !== "number" || value === 0 || isUnitlessCssProperty(name)) {
    return String(value);
  }

  return `${value}px`;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
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

const voidHtmlElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

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
