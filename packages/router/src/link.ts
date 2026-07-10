import { escapeHtmlAttribute, escapeHtmlText } from "@reckona/mreact-shared/html-escape";
import type { HtmlSink } from "@reckona/mreact-shared/compiler-contract";
import type { ReactCompatElement, ReactCompatNode } from "@reckona/mreact-compat";
import { safeUrlAttributeValue } from "@reckona/mreact-shared/url-safety";
import type { AppRouteLinkHref } from "./typed-routes.js";
/** Re-exports typed route href helper types used by Link. */
export type {
  AppRouteLinkHref,
  AppRouteLinkHrefSuffix,
  AppRouteLinkPathname,
  AppRouteLinkSegment,
  AppRouteLinkSegments,
} from "./typed-routes.js";

const TRUSTED_LINK_HTML = Symbol.for("modular.react.router.trusted_link_html");

/**
 * Selects when the app router should prefetch a linked route.
 */
export type LinkPrefetch = "intent" | "viewport" | "none" | false;
/**
 * Controls scroll restoration behavior after client navigation.
 */
export type LinkScroll = "top" | "preserve";
/**
 * Controls whether client navigation participates in view transitions.
 */
export type LinkTransition = "auto" | "none" | false;
/**
 * Wraps pre-escaped HTML that can be used as trusted link children.
 */
export type TrustedLinkHtml = { readonly [TRUSTED_LINK_HTML]: string };
/**
 * Represents children accepted by the app-router Link renderer.
 */
export type LinkChild = ReactCompatNode | Node | TrustedLinkHtml | readonly LinkChild[];
/**
 * Allows applications to augment statically registered app route paths through `@reckona/mreact-router/link`.
 */
export interface AppRouteDeclarations {}
/**
 * Extracts registered route paths from `AppRouteDeclarations`.
 */
export type RegisteredAppRoutePath = AppRouteDeclarations extends { readonly path: infer Path }
  ? Extract<Path, `/${string}`>
  : never;
/**
 * Resolves the accepted `href` type for app-router links.
 */
export type LinkHref = [RegisteredAppRoutePath] extends [never]
  ? string
  : AppRouteLinkHref<RegisteredAppRoutePath>;

/**
 * Configures client navigation behavior for a router link.
 */
export interface LinkOptions<Href extends string = LinkHref> {
  href: Href;
  prefetch?: LinkPrefetch | undefined;
  reload?: boolean | undefined;
  scroll?: LinkScroll | undefined;
  transition?: LinkTransition | undefined;
}

/**
 * Combines router link options with anchor attributes and children.
 */
export interface LinkProps<Href extends string = LinkHref> extends LinkOptions<Href> {
  children?: LinkChild;
  [attribute: string]: unknown;
}

/** Represents attributes that can be serialized when Link writes to an HtmlSink. */
export type LinkSerializableAttribute =
  | boolean
  | number
  | string
  | null
  | undefined
  | Readonly<Record<string, boolean | number | string | null | undefined>>;

/** Configures an HtmlSink Link without browser-only event handlers or refs. */
export interface LinkSinkProps extends LinkOptions<string> {
  children?: LinkChild;
  [attribute: string]: LinkChild | LinkSerializableAttribute;
}

/**
 * Converts router link options into anchor attributes consumed by the client navigation runtime.
 *
 * Use this when rendering a custom anchor component that should still opt into mreact prefetch, scroll, reload, or transition behavior.
 */
export function linkProps(options: LinkOptions<string>): Record<string, string> {
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

/**
 * Produces a compile-time error shape when a typed Link receives an unresolved route pattern.
 */
export type ConcreteLinkHrefGuard<Href extends string> = [RegisteredAppRoutePath] extends [never]
  ? unknown
  : Href extends Extract<RegisteredAppRoutePath, `${string}:${string}`>
    ? { readonly __mreactRoutePatternHrefError__: never }
    : unknown;

/**
 * Renders an app-router anchor with typed `href` support and navigation runtime attributes.
 *
 * In JSX it returns an anchor element compatible with the mreact runtime; during server streaming it can also write directly to an `HtmlSink`. Unsafe URL attribute values are dropped during rendering.
 */
export function Link<const Href extends LinkHref>(
  props: LinkProps<Href> & ConcreteLinkHrefGuard<Href>,
): ReactCompatElement;
export function Link(sink: HtmlSink, props: LinkSinkProps): void;
export function Link(
  sinkOrProps: HtmlSink | LinkProps<string>,
  maybeProps?: LinkProps<string>,
): ReactCompatElement | string | HTMLAnchorElement | void {
  if (maybeProps !== undefined) {
    (sinkOrProps as HtmlSink).append(renderLinkString(maybeProps));
    return;
  }

  return renderLink(sinkOrProps as LinkProps);
}

(Link as typeof Link & { trustedHtml(html: string): TrustedLinkHtml }).trustedHtml = (
  html: string,
): TrustedLinkHtml => ({
  [TRUSTED_LINK_HTML]: html,
});

function renderLink(props: LinkProps<string>): string | HTMLAnchorElement {
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

function renderLinkString(props: LinkProps<string>): string {
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

    if (name === "ref") {
      if (typeof value === "function") {
        (value as (element: HTMLAnchorElement) => void)(anchor);
      } else if (typeof value === "object" && value !== null && "current" in value) {
        (value as { current: HTMLAnchorElement | null }).current = anchor;
      }
      continue;
    }

    if (/^on[A-Z]/.test(name) && typeof value === "function") {
      const capture = name.endsWith("Capture");
      const eventName = name.slice(2, capture ? -"Capture".length : undefined).toLowerCase();
      anchor.addEventListener(eventName, value as EventListener, capture);
      continue;
    }

    if (name === "style" && typeof value === "object" && value !== null) {
      for (const [property, styleValue] of Object.entries(value as Record<string, unknown>)) {
        const cssProperty = linkStylePropertyName(property);
        const cssValue = linkStyleValue(styleValue);
        if (cssProperty !== undefined && cssValue !== undefined) {
          anchor.style.setProperty(cssProperty, cssValue);
        }
      }
      continue;
    }

    if (!shouldSetAttribute(name, value)) {
      continue;
    }

    const attrName = attributeName(name);
    const safeValue = safeUrlAttributeValue(attrName, String(value));

    if (safeValue === undefined) {
      continue;
    }

    anchor.setAttribute(attrName, value === true ? "" : safeValue);
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
    if (name === "children" || /^on/i.test(name) || !shouldSetAttribute(name, value)) {
      continue;
    }

    const attrName = attributeName(name);
    if (name === "style" && typeof value === "object" && value !== null) {
      const style = Object.entries(value as Record<string, unknown>)
        .flatMap(([property, styleValue]) => {
          const cssProperty = linkStylePropertyName(property);
          const cssValue = linkStyleValue(styleValue);
          return cssProperty === undefined || cssValue === undefined
            ? []
            : [`${cssProperty}:${cssValue}`];
        })
        .join(";");
      if (style !== "") {
        attrs.push(`${escapeHtmlAttribute(attrName)}="${escapeHtmlAttribute(style)}"`);
      }
      continue;
    }
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

function linkStylePropertyName(property: string): string | undefined {
  const cssProperty = property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return /^(?:--[a-zA-Z0-9_-]+|[a-zA-Z][a-zA-Z0-9-]*)$/.test(cssProperty)
    ? cssProperty
    : undefined;
}

function linkStyleValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === false) {
    return undefined;
  }

  const cssValue = String(value);
  return /[;{}]/.test(cssValue) ? undefined : cssValue;
}

function renderChildren(child: LinkChild): string {
  if (child === null || child === undefined || typeof child === "boolean") {
    return "";
  }

  if (Array.isArray(child)) {
    return child.map(renderChildren).join("");
  }

  if (isTrustedLinkHtml(child)) {
    return child[TRUSTED_LINK_HTML];
  }

  return escapeHtmlText(child);
}

function isTrustedLinkHtml(value: unknown): value is TrustedLinkHtml {
  return (
    typeof value === "object" &&
    value !== null &&
    TRUSTED_LINK_HTML in value &&
    typeof (value as TrustedLinkHtml)[TRUSTED_LINK_HTML] === "string"
  );
}
