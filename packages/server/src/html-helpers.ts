import {
  Fragment,
  Suspense as ReactCompatSuspense,
  isValidElement,
  type ReactCompatElement,
  type ReactCompatNode,
} from "@reckona/mreact-compat";
import type { HtmlSink } from "@reckona/mreact-shared/compiler-contract";
import { escapeHtmlText as escapeHtml } from "@reckona/mreact-shared/html-escape";
import {
  renderReactSuspenseBoundary,
  renderReactSuspenseOutOfOrderBoundary,
  type HydrationScriptOptions,
} from "./boundary.js";
import {
  isDangerousHtmlAttribute,
  isDangerousHtmlOptIn,
  isUnsafeMetaRefreshContent,
  isUnsafeUrlAttribute,
} from "./url-safety.js";
import {
  escapeAttribute,
  isPromiseLikeUnknown,
  renderNonceAttribute,
  serializeScriptJson,
} from "./html-internals.js";
import { createStringSink, hasDeferredTasks, type StreamRender } from "./sink.js";
import { renderToReadableStream } from "./stream.js";

export interface ScriptAssetOptions {
  src: string;
  nonce?: string;
  integrity?: string;
  crossOrigin?: "anonymous" | "use-credentials";
}

export interface EventHydrationEntry {
  id: string;
  event: string;
  handler: string;
}

export interface EventHydrationManifest {
  version: 1;
  events: EventHydrationEntry[];
}

export interface HtmlResponseOptions {
  headers?: HeadersInit;
  status?: number;
  statusText?: string;
}

export function serializeSsrState(value: unknown): string {
  return serializeScriptJson(value);
}

export function renderSsrState(
  sink: HtmlSink,
  value: unknown,
  options: HydrationScriptOptions = {},
): void {
  sink.append(
    `<script type="application/json" data-mreact-ssr-state${renderNonceAttribute(options.nonce)}>${serializeSsrState(value)}</script>`,
  );
}

export function createEventHydrationManifest(
  events: readonly EventHydrationEntry[],
): EventHydrationManifest {
  return {
    version: 1,
    events: events.map((event) => ({ ...event })),
  };
}

export function renderEventHydrationManifest(
  sink: HtmlSink,
  manifest: EventHydrationManifest,
  options: HydrationScriptOptions = {},
): void {
  sink.append(
    `<script type="application/json" data-mreact-event-manifest${renderNonceAttribute(options.nonce)}>${serializeSsrState(manifest)}</script>`,
  );
}

export function renderScriptAsset(sink: HtmlSink, options: ScriptAssetOptions): void {
  const integrityAttribute =
    options.integrity === undefined ? "" : ` integrity="${escapeAttribute(options.integrity)}"`;
  const crossOrigin =
    options.integrity === undefined ? options.crossOrigin : (options.crossOrigin ?? "anonymous");
  const crossOriginAttribute =
    crossOrigin === undefined ? "" : ` crossorigin="${escapeAttribute(crossOrigin)}"`;

  sink.append(
    `<script src="${escapeAttribute(options.src)}"${renderNonceAttribute(options.nonce)}${integrityAttribute}${crossOriginAttribute}></script>`,
  );
}

export function html(node: unknown, options: HtmlResponseOptions = {}): Response {
  const headers = new Headers(options.headers);
  const responseOptions: ResponseInit = { headers };

  if (!headers.has("content-type")) {
    headers.set("content-type", "text/html; charset=utf-8");
  }

  if (options.status !== undefined) {
    responseOptions.status = options.status;
  }

  if (options.statusText !== undefined) {
    responseOptions.statusText = options.statusText;
  }

  return new Response(
    renderToReadableStream((sink) => {
      const state: HtmlRenderState = { suspenseId: 0 };
      return appendReactNode(sink, node, state);
    }),
    responseOptions,
  );
}

export async function renderToString(render: StreamRender): Promise<string> {
  const sink = createStringSink();

  await render(sink);
  await sink.drain();

  return sink.toString();
}

interface HtmlRenderState {
  suspenseId: number;
}

function appendReactNode(
  sink: HtmlSink,
  node: unknown,
  state: HtmlRenderState,
): void | PromiseLike<void> {
  if (isPromiseLikeNode(node)) {
    return node.then((resolved) => appendReactNode(sink, resolved, state));
  }

  if (node === null || node === undefined || typeof node === "boolean") {
    return;
  }

  if (typeof node === "string" || typeof node === "number") {
    sink.append(escapeHtml(node));
    return;
  }

  if (Array.isArray(node)) {
    return appendReactNodeList(sink, node, state);
  }

  if (!isValidElement(node)) {
    return;
  }

  return appendReactElement(sink, node, state);
}

function appendReactNodeList(
  sink: HtmlSink,
  nodes: readonly unknown[],
  state: HtmlRenderState,
): void | PromiseLike<void> {
  let chain: PromiseLike<void> | undefined;

  for (const node of nodes) {
    if (chain !== undefined) {
      chain = chain.then(() => appendReactNode(sink, node, state));
      continue;
    }

    const result = appendReactNode(sink, node, state);

    if (isPromiseLike(result)) {
      chain = result;
    }
  }

  return chain;
}

function appendReactElement(
  sink: HtmlSink,
  element: ReactCompatElement,
  state: HtmlRenderState,
): void | PromiseLike<void> {
  if (typeof element.type === "string") {
    return appendHostElement(sink, element, state);
  }

  if (element.type === Fragment) {
    return appendReactNode(sink, element.props.children, state);
  }

  if (element.type === ReactCompatSuspense) {
    return appendSuspenseElement(sink, element, state);
  }

  if (isClassComponentType(element.type)) {
    const instance = new element.type(element.props);
    return appendReactNode(sink, instance.render(), state);
  }

  if (typeof element.type === "function") {
    return appendReactNode(sink, element.type(element.props), state);
  }
}

function isClassComponentType(
  value: unknown,
): value is new (props: Record<string, unknown>) => { render(): ReactCompatNode } {
  return typeof value === "function" && value.prototype?.render !== undefined;
}

function appendHostElement(
  sink: HtmlSink,
  element: ReactCompatElement,
  state: HtmlRenderState,
): void | PromiseLike<void> {
  const tagName = element.type as string;
  const innerHtml = (element.props as { dangerouslySetInnerHTML?: { __html?: unknown } })
    .dangerouslySetInnerHTML;
  sink.append(`<${tagName}${renderHtmlAttributes(element.props)}>`); 

  if (innerHtml !== undefined) {
    sink.append(String(innerHtml.__html ?? ""));
    sink.append(`</${tagName}>`);
    return;
  }

  const result = isRawTextElement(tagName)
    ? appendRawTextNode(sink, element.props.children)
    : appendReactNode(sink, element.props.children, state);

  if (isPromiseLike(result)) {
    return result.then(() => {
      sink.append(`</${tagName}>`);
    });
  }

  sink.append(`</${tagName}>`);
}

function isRawTextElement(tagName: string): boolean {
  return tagName === "script" || tagName === "style";
}

function appendRawTextNode(sink: HtmlSink, node: unknown): void | PromiseLike<void> {
  if (isPromiseLikeNode(node)) {
    return node.then((resolved) => appendRawTextNode(sink, resolved));
  }

  if (node === null || node === undefined || typeof node === "boolean") {
    return;
  }

  if (Array.isArray(node)) {
    return appendRawTextNodeList(sink, node);
  }

  if (typeof node === "string" || typeof node === "number") {
    sink.append(String(node));
  }
}

function appendRawTextNodeList(
  sink: HtmlSink,
  nodes: readonly unknown[],
): void | PromiseLike<void> {
  let chain: PromiseLike<void> | undefined;

  for (const node of nodes) {
    if (chain !== undefined) {
      chain = chain.then(() => appendRawTextNode(sink, node));
      continue;
    }

    const result = appendRawTextNode(sink, node);

    if (isPromiseLike(result)) {
      chain = result;
    }
  }

  return chain;
}

function appendSuspenseElement(
  sink: HtmlSink,
  element: ReactCompatElement,
  state: HtmlRenderState,
): void {
  const rendered = renderReactNodeToString(element.props.children, state);

  if (!isPromiseLikeString(rendered)) {
    renderReactSuspenseBoundary(sink, (boundarySink) => {
      boundarySink.append(rendered);
    });
    return;
  }

  const id = state.suspenseId;
  state.suspenseId += 1;
  renderReactSuspenseOutOfOrderBoundary(
    sink,
    `B:${id}`,
    `S:${id}`,
    rendered,
    (boundarySink, renderedHtml) => {
      boundarySink.append(renderedHtml);
    },
    {
      fallback(boundarySink) {
        const fallback = renderReactNodeToString(
          (element.props as { fallback?: ReactCompatNode }).fallback,
          state,
        );

        if (isPromiseLikeString(fallback)) {
          return fallback.then((html) => {
            boundarySink.append(html);
          });
        }

        boundarySink.append(fallback);
      },
    },
  );
}

function renderReactNodeToString(
  node: unknown,
  state: HtmlRenderState,
): string | PromiseLike<string> {
  const sink = createStringSink();
  const result = appendReactNode(sink, node, state);
  const finish = () =>
    hasDeferredTasks(sink) ? sink.drain().then(() => sink.toString()) : sink.toString();

  if (isPromiseLike(result)) {
    return result.then(finish);
  }

  return finish();
}

function renderHtmlAttributes(props: Record<string, unknown>): string {
  // Issue 078: <meta http-equiv="refresh" content="0;url=javascript:...">
  // is URL-bearing only when http-equiv is "refresh", so we need both
  // attributes in scope to make the call. Strip the unsafe content
  // before per-attribute rendering.
  const sanitizedProps = sanitizeMetaRefreshProps(props);
  return Object.entries(sanitizedProps)
    .map(([name, value]) => renderHtmlAttribute(name, value))
    .filter((attribute) => attribute !== "")
    .join("");
}

function sanitizeMetaRefreshProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const httpEquiv = props["http-equiv"] ?? props.httpEquiv;
  const content = props["content"];
  if (typeof httpEquiv !== "string" || typeof content !== "string") return props;
  if (!isUnsafeMetaRefreshContent(httpEquiv, content)) return props;
  // Drop only `content`; keep http-equiv so the developer's intent is
  // still visible in the rendered HTML (debugging hint).
  const sanitized = { ...props };
  delete sanitized["content"];
  return sanitized;
}

// Mirrors `isAttributeNameSafe` in react-dom: an attribute name must start with
// an ASCII letter (or underscore) and contain only word chars, dot, hyphen, or
// colon. Anything else is dropped to prevent SSR XSS via spread props
// (`<div {...userControlled} />`). See docs/issues/resolved Issue 060.
const VALID_ATTRIBUTE_NAME = /^[A-Za-z_][\w.\-:]*$/;

// URL scheme allow/block list is shared with the compiler emit paths
// (Issues 062 / 073). See packages/server/src/url-safety.ts.

function renderHtmlAttribute(name: string, value: unknown): string {
  if (
    name === "children" ||
    name === "dangerouslySetInnerHTML" ||
    name === "key" ||
    name === "ref" ||
    value === null ||
    value === undefined ||
    typeof value === "function"
  ) {
    return "";
  }

  const attributeName = toHtmlAttributeName(name);

  if (!VALID_ATTRIBUTE_NAME.test(attributeName)) {
    return "";
  }

  if (value === false && !isBooleanishStringAttribute(attributeName)) {
    return "";
  }

  // Issue 077: HTML-bearing attributes (`srcdoc`) require the explicit
  // `{ __html: "..." }` opt-in. A plain string value -- even if escaped
  // for the attribute syntax -- decodes back to executable HTML inside
  // the iframe document with the parent's origin.
  if (isDangerousHtmlAttribute(attributeName)) {
    if (!isDangerousHtmlOptIn(value)) {
      return "";
    }
    return ` ${attributeName}="${escapeAttribute(value.__html)}"`;
  }

  if (value === true) {
    if (isBooleanishStringAttribute(attributeName)) {
      return ` ${attributeName}="true"`;
    }
    return ` ${attributeName}`;
  }

  if (value === false) {
    return ` ${attributeName}="false"`;
  }

  const stringValue = String(value);

  if (isUnsafeUrlAttribute(attributeName, stringValue)) {
    return "";
  }

  return ` ${attributeName}="${escapeAttribute(stringValue)}"`;
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
  readOnly: "readonly",
  rowSpan: "rowspan",
  spellCheck: "spellcheck",
  srcDoc: "srcdoc",
  srcSet: "srcset",
  tabIndex: "tabindex",
  useMap: "usemap",
};

function isBooleanishStringAttribute(name: string): boolean {
  const attributeName = toHtmlAttributeName(name).toLowerCase();
  return attributeName.startsWith("aria-") || BOOLEANISH_STRING_ATTRIBUTES.has(attributeName);
}

const BOOLEANISH_STRING_ATTRIBUTES = new Set<string>([
  "contenteditable",
  "draggable",
  "spellcheck",
]);

function isPromiseLikeNode(value: unknown): value is PromiseLike<unknown> {
  return isPromiseLikeUnknown(value);
}

function isPromiseLikeString(value: unknown): value is PromiseLike<string> {
  return isPromiseLikeUnknown(value);
}

function isPromiseLike(value: unknown): value is PromiseLike<void> {
  return isPromiseLikeUnknown(value);
}
