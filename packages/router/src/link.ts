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
export function Link(sink: HtmlSink, props: LinkProps<string>): void;
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

    if (!shouldSetAttribute(name, value)) {
      continue;
    }

    const attrName = attributeName(name);
    const safeValue = safeUrlAttributeValue(attrName, String(value));

    if (safeValue === undefined) {
      continue;
    }

    anchor.setAttribute(attrName, safeValue);
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
