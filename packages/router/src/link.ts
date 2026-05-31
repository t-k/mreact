import { escapeHtmlAttribute } from "@reckona/mreact-shared/html-escape";
import type { HtmlSink } from "@reckona/mreact-shared/compiler-contract";
import type { ReactCompatElement, ReactCompatNode } from "@reckona/mreact-compat";
import { safeUrlAttributeValue } from "@reckona/mreact-shared/url-safety";

export type LinkPrefetch = "intent" | "viewport" | "none" | false;
export type LinkScroll = "top" | "preserve";
export type LinkTransition = "auto" | "none" | false;
export type LinkChild = ReactCompatNode | Node | readonly LinkChild[];

export interface LinkOptions {
  href: string;
  prefetch?: LinkPrefetch | undefined;
  reload?: boolean | undefined;
  scroll?: LinkScroll | undefined;
  transition?: LinkTransition | undefined;
}

export interface LinkProps extends LinkOptions {
  children?: LinkChild;
  [attribute: string]: unknown;
}

export function linkProps(options: LinkOptions): Record<string, string> {
  return {
    href: options.href,
    ...(options.prefetch === undefined || options.prefetch === "intent"
      ? {}
      : { "data-mreact-prefetch": options.prefetch === false ? "none" : options.prefetch }),
    ...(options.reload === true ? { "data-mreact-reload": "true" } : {}),
    ...(options.scroll === undefined || options.scroll === "top"
      ? {}
      : { "data-mreact-scroll": options.scroll }),
    ...(options.transition === undefined || options.transition === false || options.transition === "none"
      ? {}
      : { "data-mreact-transition": options.transition }),
  };
}

export function Link(props: LinkProps): ReactCompatElement;
export function Link(sink: HtmlSink, props: LinkProps): void;
export function Link(
  sinkOrProps: HtmlSink | LinkProps,
  maybeProps?: LinkProps,
): ReactCompatElement | string | HTMLAnchorElement | void {
  if (maybeProps !== undefined) {
    (sinkOrProps as HtmlSink).append(renderLinkString(maybeProps));
    return;
  }

  return renderLink(sinkOrProps as LinkProps);
}

function renderLink(props: LinkProps): string | HTMLAnchorElement {
  const { href, prefetch, reload, scroll, transition, ...rest } = props;
  const propsWithLinkAttrs = {
    ...rest,
    ...linkProps({ href, prefetch, reload, scroll, transition }),
  };

  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    return createAnchorElement(propsWithLinkAttrs);
  }

  return renderAnchorString(propsWithLinkAttrs);
}

function renderLinkString(props: LinkProps): string {
  const { href, prefetch, reload, scroll, transition, ...rest } = props;

  return renderAnchorString({
    ...rest,
    ...linkProps({ href, prefetch, reload, scroll, transition }),
  });
}

function createAnchorElement(props: Record<string, unknown>): HTMLAnchorElement {
  const anchor = document.createElement("a");

  for (const [name, value] of Object.entries(props)) {
    if (name === "children") {
      appendLinkChild(anchor, value as LinkChild);
      continue;
    }

    if (!shouldSetAttribute(name, value)) {
      continue;
    }

    anchor.setAttribute(attributeName(name), String(value));
  }

  return anchor;
}

function appendLinkChild(parent: Node, child: LinkChild): void {
  if (child === null || child === undefined || typeof child === "boolean") {
    return;
  }

  if (Array.isArray(child)) {
    for (const item of child) {
      appendLinkChild(parent, item);
    }
    return;
  }

  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }

  parent.appendChild(document.createTextNode(String(child)));
}

function renderAnchorString(props: Record<string, unknown>): string {
  return `<a${renderAnchorAttributes(props)}>${renderChildren(props.children as LinkChild)}</a>`;
}

function renderAnchorAttributes(props: Record<string, unknown>): string {
  const attrs: string[] = [];

  for (const [name, value] of Object.entries(props)) {
    if (name === "children" || !shouldSetAttribute(name, value)) {
      continue;
    }

    const attrName = attributeName(name);
    const attrValue = String(value);
    const safeValue = safeUrlAttributeValue(attrName, attrValue);

    if (safeValue === undefined) {
      continue;
    }

    attrs.push(`${escapeHtmlAttribute(attrName)}="${escapeHtmlAttribute(safeValue)}"`);
  }

  return attrs.length === 0 ? "" : ` ${attrs.join(" ")}`;
}

function shouldSetAttribute(name: string, value: unknown): boolean {
  return (
    name !== "key" &&
    name !== "ref" &&
    value !== null &&
    value !== undefined &&
    value !== false &&
    typeof value !== "function" &&
    typeof value !== "symbol"
  );
}

function attributeName(name: string): string {
  return name === "className" ? "class" : name;
}

function renderChildren(child: LinkChild): string {
  if (child === null || child === undefined || typeof child === "boolean") {
    return "";
  }

  if (Array.isArray(child)) {
    return child.map(renderChildren).join("");
  }

  return String(child);
}
