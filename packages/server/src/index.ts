import {
  Fragment,
  Suspense as ReactCompatSuspense,
  createElement,
  isValidElement,
  type ReactCompatElement,
  type ReactCompatNode,
} from "@reckona/mreact-compat";
import {
  isDangerousHtmlAttribute,
  isDangerousHtmlOptIn,
  isUnsafeMetaRefreshContent,
  isUnsafeUrlAttribute,
} from "./url-safety.js";
import { escapeHtmlText as escapeHtml } from "@reckona/mreact-shared/html-escape";
import { createStreamingBufferSink } from "./buffer-sink.js";

export { Fragment } from "@reckona/mreact-compat";
export type { ReactCompatNode } from "@reckona/mreact-compat";

export interface HtmlSink {
  append(chunk: string): void;
  defer?(task: PromiseLike<void>): void;
  signal?: AbortSignal;
}

export {
  CLIENT_REFERENCE_TYPE,
  SERVER_REFERENCE_TYPE,
  createClientReference,
  createFlightClientManifest,
  createServerReference,
  createServerActionHandler,
  fromReactFlightRows,
  getReactFlightProtocolCoverage,
  isClientReference,
  isServerReference,
  mergeReactFlightRows,
  renderFlightPreloadLinks,
  renderFlightResponseScript,
  renderToFlightResponse,
  stringifyFlightResponse,
  toReactFlightRows,
} from "./flight.js";
export type {
  ClientReference,
  FlightClientManifestEntry,
  FlightClientReference,
  FlightClientReferenceInput,
  FlightClientReferenceModel,
  FlightDataViewModel,
  FlightElementModel,
  FlightFormDataModel,
  FlightIterableModel,
  FlightModel,
  FlightResponse,
  FlightScriptOptions,
  FlightServerReference,
  FlightServerReferenceModel,
  FlightArrayBufferModel,
  FlightTypedArrayModel,
  FlightTypedArrayName,
  ServerAction,
  ServerActionDescriptor,
  ServerActionHandlerOptions,
  ServerActionRegistry,
  ServerActionReplayStore,
  ServerActionRequestReference,
  ServerActionValidationResult,
  ServerReference,
} from "./flight.js";

export interface StringHtmlSink extends HtmlSink {
  bufferStrategy(): StringSinkBufferStrategy;
  drain(): Promise<void>;
  toString(): string;
}

export type StringSinkBufferStrategy = "concat" | "array-join";

export interface StringSinkOptions {
  strategy?: StringSinkBufferStrategy | "auto";
  arrayJoinThreshold?: number;
}

export type StreamRender = (sink: HtmlSink) => void | PromiseLike<void>;

export interface AsyncBoundaryOptions {
  catch?: (sink: HtmlSink, error: unknown) => void | PromiseLike<void>;
  hydrationAwaitId?: string;
}

export interface OutOfOrderBoundaryOptions extends AsyncBoundaryOptions {
  hydration?: boolean;
  placeholder?: (sink: HtmlSink) => void | PromiseLike<void>;
}

export interface OutOfOrderReorderScriptOptions {
  nonce?: string;
  src?: string;
}

export interface HydrationScriptOptions {
  nonce?: string;
}

export interface ReactSuspenseScriptOptions {
  nonce?: string;
  src?: string;
}

export interface ReactSuspenseBoundaryOptions extends AsyncBoundaryOptions {
  fallback?: (sink: HtmlSink) => void | PromiseLike<void>;
  nonce?: string;
}

export interface ReactSuspenseClientRenderOptions {
  message?: string;
  stack?: string;
}

const streamQueuedChunkSoftLimitBytes = 1024 * 1024;

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

export interface SuspenseProps extends Record<string, unknown> {
  fallback?: unknown;
  children?: unknown;
}

export type AsyncBoundaryRender<T> = (
  sink: HtmlSink,
  value: Awaited<T>,
) => void | PromiseLike<void>;

export function Suspense(props: SuspenseProps): never {
  const config: SuspenseProps = {};

  if (props.fallback !== undefined) {
    config.fallback = props.fallback as ReactCompatNode;
  }

  return createElement<SuspenseProps>(
    ReactCompatSuspense,
    config,
    props.children as ReactCompatNode,
  ) as never;
}

export function createStringSink(options: StringSinkOptions = {}): StringHtmlSink {
  // Default to "concat" — V8 rope flattening yields 2-6x throughput over
  // `Array#join("")` across all measured fixture sizes (see
  // docs/benchmarks/2026-05-12-server-sink-strategy.md). "array-join" stays
  // available as opt-in for scenarios that need lower peak memory.
  const requestedStrategy = options.strategy ?? "concat";
  const arrayJoinThreshold = options.arrayJoinThreshold ?? 256;
  const deferredTasks: PromiseLike<void>[] = [];
  let strategy: StringSinkBufferStrategy = requestedStrategy === "auto"
    ? "concat"
    : requestedStrategy;
  let writeCount = 0;
  let text = "";
  const chunks: string[] = [];

  const switchConcatToArrayJoin = () => {
    if (strategy !== "concat") {
      return;
    }

    if (text !== "") {
      chunks.push(text);
      text = "";
    }
    strategy = "array-join";
  };

  return {
    append(chunk) {
      writeCount += 1;

      if (requestedStrategy === "auto" && strategy === "concat" && writeCount > arrayJoinThreshold) {
        switchConcatToArrayJoin();
      }

      if (strategy === "concat") {
        text += chunk;
        return;
      }

      chunks.push(chunk);
    },
    bufferStrategy() {
      return strategy;
    },
    defer(task) {
      deferredTasks.push(task);
    },
    async drain() {
      await Promise.all(deferredTasks);
    },
    toString() {
      if (strategy === "concat") {
        return text;
      }

      return chunks.join("");
    },
  };
}

export async function renderAsyncBoundary<T>(
  sink: HtmlSink,
  value: T,
  render: AsyncBoundaryRender<T>,
  options: AsyncBoundaryOptions = {},
): Promise<void> {
  try {
    const resolved = await value;
    await render(sink, resolved);
    if (options.hydrationAwaitId !== undefined) {
      appendAwaitHydrationData(sink, options.hydrationAwaitId, resolved);
    }
  } catch (error) {
    if (options.catch === undefined) {
      throw error;
    }

    await options.catch(sink, error);
  }
}

// Threshold for `<Await>` payload size warnings (UTF-8 byte length of
// JSON-serialized representation). 100KB warn / 1MB error follow the
// "you're sending a lot of data" hint pattern used by other frameworks.
const AWAIT_PAYLOAD_WARN_BYTES = 100 * 1024;
const AWAIT_PAYLOAD_ERROR_BYTES = 1024 * 1024;

function isProductionMode(): boolean {
  // `process` may not exist in cross-runtime environments (Cloudflare/Deno).
  // The server tsconfig does not include `@types/node`, so we look it up
  // through `globalThis` with a minimal local typing.
  const globalProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process;

  try {
    return globalProcess?.env?.["NODE_ENV"] === "production";
  } catch {
    return false;
  }
}

function appendAwaitHydrationData(
  sink: HtmlSink,
  awaitId: string,
  resolved: unknown,
): void {
  const serialized = serializeAwaitHydrationValue(resolved, awaitId);

  if (serialized === undefined) {
    return;
  }

  const idLiteral = JSON.stringify(awaitId).replaceAll("<", "\\u003c");
  sink.append(
    `<script data-mreact-await=${idLiteral}>(self.__mreactAwaitData||(self.__mreactAwaitData={}))[${idLiteral}]={value:${serialized}}</script>`,
  );
}

// Emits a single console.warn in dev when `resolved` contains shapes the
// wire format will silently drop or coerce (Date / Map / Set / RegExp /
// class instance / function / Symbol / nested non-POJO). See
// docs/mreact_router.md `## <Await> value の制約`.
function warnIfNonSerializableAwaitValue(value: unknown, awaitId: string): void {
  if (isProductionMode()) {
    return;
  }

  if (!containsNonSerializableSurface(value)) {
    return;
  }

  console.warn(
    `[mreact] <Await value={...}> for "${awaitId}" includes non-serializable ` +
      `data (Date / Map / Set / RegExp / class instance / function / Symbol). ` +
      `The wire format uses JSON.stringify, so the client-side renderer may ` +
      `receive a different shape after the JSON round-trip. Convert to plain ` +
      `JSON-serializable data (or restore via a reviver in the renderer) — ` +
      `see docs/mreact_router.md "<Await> value の制約".`,
  );
}

function containsNonSerializableSurface(value: unknown): boolean {
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }

  if (value instanceof Date || value instanceof Map || value instanceof Set || value instanceof RegExp) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((entry) => containsNonSerializableSurface(entry));
  }

  const proto = Object.getPrototypeOf(value);

  if (proto !== Object.prototype && proto !== null) {
    return true;
  }

  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (containsNonSerializableSurface(entry)) {
      return true;
    }
  }

  return false;
}

function reportAwaitPayloadSize(json: string, awaitId: string): void {
  const byteLength =
    typeof TextEncoder !== "undefined" ? new TextEncoder().encode(json).length : json.length;

  if (byteLength > AWAIT_PAYLOAD_ERROR_BYTES) {
    console.error(
      `[mreact] <Await> payload for "${awaitId}" is ${(byteLength / 1024 / 1024).toFixed(2)}MB, ` +
        `exceeding the 1MB error threshold. Large payloads inflate HTML response size and ` +
        `client memory pressure. Stream the data via loader or split into smaller boundaries.`,
    );
    return;
  }

  if (byteLength > AWAIT_PAYLOAD_WARN_BYTES) {
    console.warn(
      `[mreact] large await payload for "${awaitId}": ${(byteLength / 1024).toFixed(1)}KB ` +
        `(over the 100KB warning threshold). Consider streaming the data via loader or ` +
        `splitting into smaller boundaries.`,
    );
  }
}

function serializeAwaitHydrationValue(value: unknown, awaitId: string): string | undefined {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) {
      return undefined;
    }

    warnIfNonSerializableAwaitValue(value, awaitId);
    reportAwaitPayloadSize(json, awaitId);

    // Defuse `</script>` and runaway control characters so the data can be
    // safely embedded inside a `<script>` element.
    return json
      .replaceAll("<", "\\u003c")
      .replaceAll(" ", "\\u2028")
      .replaceAll(" ", "\\u2029");
  } catch {
    return undefined;
  }
}

export function renderOutOfOrderBoundary<T>(
  sink: HtmlSink,
  id: string,
  value: T,
  render: AsyncBoundaryRender<T>,
  options: OutOfOrderBoundaryOptions = {},
): void {
  const placeholderSink = createStringSink();
  void options.placeholder?.(placeholderSink);
  const hydrationStart =
    options.hydration === true ? `<!--mreact-h:start:${encodeURIComponent(id)}-->` : "";
  const hydrationEnd =
    options.hydration === true ? `<!--mreact-h:end:${encodeURIComponent(id)}-->` : "";
  sink.append(
    `${hydrationStart}<template data-mreact-oob-placeholder="${escapeAttribute(id)}">${placeholderSink.toString()}</template>${hydrationEnd}`,
  );

  const task = renderOutOfOrderFragment(sink, id, value, render, options);

  if (sink.defer === undefined) {
    void task;
    return;
  }

  sink.defer(task);
}

async function renderOutOfOrderFragment<T>(
  sink: HtmlSink,
  id: string,
  value: T,
  render: AsyncBoundaryRender<T>,
  options: OutOfOrderBoundaryOptions,
): Promise<void> {
  const fragmentSink = createStringSink();
  let resolvedValue: unknown;
  let hasResolvedValue = false;

  await renderAsyncBoundary(
    fragmentSink,
    value,
    async (childSink, resolved) => {
      resolvedValue = resolved;
      hasResolvedValue = true;
      await render(childSink, resolved);
    },
    options.catch === undefined ? {} : { catch: options.catch },
  );

  sink.append(
    `<template data-mreact-oob-fragment="${escapeAttribute(id)}">${fragmentSink.toString()}</template>`,
  );

  if (hasResolvedValue && options.hydrationAwaitId !== undefined) {
    appendAwaitHydrationData(sink, options.hydrationAwaitId, resolvedValue);
  }
}

export function renderOutOfOrderReorderScript(
  sink: HtmlSink,
  options: OutOfOrderReorderScriptOptions = {},
): void {
  const nonceAttribute =
    options.nonce === undefined ? "" : ` nonce="${escapeAttribute(options.nonce)}"`;

  if (options.src !== undefined) {
    sink.append(
      `<script data-mreact-oob-reorder${nonceAttribute} src="${escapeAttribute(options.src)}"></script>`,
    );
    return;
  }

  sink.append(
    `<script data-mreact-oob-reorder${nonceAttribute}>${outOfOrderReorderScript}</script>`,
  );
}

export function renderReactSuspenseBoundary(
  sink: HtmlSink,
  render: (sink: HtmlSink) => void | PromiseLike<void>,
): void | PromiseLike<void> {
  sink.append("<!--$-->");
  const result = render(sink);

  if (isPromiseLike(result)) {
    return result.then(() => {
      sink.append("<!--/$-->");
    });
  }

  sink.append("<!--/$-->");
}

export function renderReactSuspenseOutOfOrderBoundary<T>(
  sink: HtmlSink,
  boundaryId: string,
  segmentId: string,
  value: T,
  render: AsyncBoundaryRender<T>,
  options: ReactSuspenseBoundaryOptions = {},
): void {
  const fallbackSink = createStringSink();
  void options.fallback?.(fallbackSink);
  sink.append(
    `<!--$?--><template id="${escapeAttribute(boundaryId)}"></template>${fallbackSink.toString()}<!--/$-->`,
  );

  const task = renderReactSuspenseSegment(sink, boundaryId, segmentId, value, render, options);

  if (sink.defer === undefined) {
    void task;
    return;
  }

  sink.defer(task);
}

export function renderReactSuspenseClientRenderBoundary(
  sink: HtmlSink,
  fallback: (sink: HtmlSink) => void | PromiseLike<void>,
  options: ReactSuspenseClientRenderOptions = {},
): void | PromiseLike<void> {
  sink.append(`<!--$!--><template${renderReactSuspenseErrorAttributes(options)}></template>`);
  const result = fallback(sink);

  if (isPromiseLike(result)) {
    return result.then(() => {
      sink.append("<!--/$-->");
    });
  }

  sink.append("<!--/$-->");
}

async function renderReactSuspenseSegment<T>(
  sink: HtmlSink,
  boundaryId: string,
  segmentId: string,
  value: T,
  render: AsyncBoundaryRender<T>,
  options: ReactSuspenseBoundaryOptions,
): Promise<void> {
  const segmentSink = createStringSink();

  await renderAsyncBoundary(
    segmentSink,
    value,
    render,
    options.catch === undefined ? {} : { catch: options.catch },
  );

  sink.append(
    `<div hidden id="${escapeAttribute(segmentId)}">${segmentSink.toString()}</div>${renderReactSuspenseRevealScript(boundaryId, segmentId, options)}`,
  );
}

function renderReactSuspenseErrorAttributes(options: ReactSuspenseClientRenderOptions): string {
  const message =
    options.message === undefined ? "" : ` data-msg="${escapeAttribute(options.message)}"`;
  const stack = options.stack === undefined ? "" : ` data-stck="${escapeAttribute(options.stack)}"`;

  return `${message}${stack}`;
}

function renderReactSuspenseRevealScript(
  boundaryId: string,
  segmentId: string,
  options: ReactSuspenseScriptOptions = {},
): string {
  if (options.src !== undefined) {
    return `<script data-mreact-react-suspense-reveal${renderNonceAttribute(options.nonce)} src="${escapeAttribute(options.src)}" data-boundary-id="${escapeAttribute(boundaryId)}" data-segment-id="${escapeAttribute(segmentId)}"></script>`;
  }

  return `<script${renderNonceAttribute(options.nonce)}>${reactSuspenseRevealScriptBody};$RC(${serializeScriptJson(boundaryId)},${serializeScriptJson(segmentId)})</script>`;
}

export function renderHydrationBoundary(
  sink: HtmlSink,
  id: string,
  render: (sink: HtmlSink) => void | PromiseLike<void>,
): void | PromiseLike<void> {
  const markerId = encodeURIComponent(id);
  sink.append(`<!--mreact-h:start:${markerId}-->`);
  const result = render(sink);

  if (isPromiseLike(result)) {
    return result.then(() => {
      sink.append(`<!--mreact-h:end:${markerId}-->`);
    });
  }

  sink.append(`<!--mreact-h:end:${markerId}-->`);
}

export function serializeSsrState(value: unknown): string {
  return serializeScriptJson(value);
}

function serializeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
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

  const result = appendReactNode(sink, element.props.children, state);

  if (isPromiseLike(result)) {
    return result.then(() => {
      sink.append(`</${tagName}>`);
    });
  }

  sink.append(`</${tagName}>`);
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

  if (isPromiseLike(result)) {
    return result.then(() => sink.toString());
  }

  return sink.toString();
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
    value === false ||
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
    return ` ${attributeName}`;
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

function isPromiseLikeNode(value: unknown): value is PromiseLike<unknown> {
  return isPromiseLikeUnknown(value);
}

function isPromiseLikeString(value: unknown): value is PromiseLike<string> {
  return isPromiseLikeUnknown(value);
}

function isPromiseLike(value: unknown): value is PromiseLike<void> {
  return isPromiseLikeUnknown(value);
}

function isPromiseLikeUnknown(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function renderNonceAttribute(nonce: string | undefined): string {
  return nonce === undefined ? "" : ` nonce="${escapeAttribute(nonce)}"`;
}

export function renderToReadableStream(render: StreamRender): ReadableStream<Uint8Array> {
  // Issue 084: append calls go into a coalescing Node Buffer sink. The
  // previous implementation called `controller.enqueue(encoder.encode(chunk))`
  // per `sink.append` — one TextEncoder allocation + one WHATWG queue trip
  // per call. Now we emit one chunk per flush boundary:
  //   1. After the sync portion of `render` returns — the "shell"
  //      pre-flush. Done synchronously so it lands before any deferred
  //      task body fires in a microtask.
  //   2. Whenever the accumulated buffer crosses the flushThreshold
  //      mid-render (e.g. a single very large list rendering).
  //   3. Each `sink.append` made during the deferred phase flushes
  //      immediately — gives each OOB fragment its own HTTP chunk so
  //      the browser can swap it in as soon as it arrives.
  //   4. End of stream — any tail bytes.
  const abortController = new AbortController();
  const queuedChunks: Uint8Array[] = [];
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;
  let cancelled = false;
  let complete = false;
  let queuedBytes = 0;
  let warnedQueuedBytes = false;

  const enqueueOrQueue = (buffer: Uint8Array) => {
    if (cancelled || abortController.signal.aborted) {
      return;
    }

    const controller = controllerRef;
    if (controller === undefined) {
      queueChunk(buffer);
      return;
    }

    if (queuedChunks.length === 0 && (controller.desiredSize ?? 0) > 0) {
      controller.enqueue(buffer);
      return;
    }

    queueChunk(buffer);
  };
  const drainQueuedChunks = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    while (!cancelled && queuedChunks.length > 0 && (controller.desiredSize ?? 0) > 0) {
      const chunk = queuedChunks.shift();
      if (chunk !== undefined) {
        queuedBytes -= chunk.byteLength;
        controller.enqueue(chunk);
      }
    }

    if (!cancelled && complete && queuedChunks.length === 0) {
      controller.close();
    }
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;
      const sink = createStreamingBufferSink({
        onFlush(buffer) {
          enqueueOrQueue(buffer);
        },
      });
      const deferredTasks: PromiseLike<void>[] = [];
      let inDeferredPhase = false;
      let renderResult: void | PromiseLike<void>;

      try {
        renderResult = render({
          append(chunk) {
            if (abortController.signal.aborted) {
              return;
            }
            sink.append(chunk);
            if (inDeferredPhase) {
              // OOB pattern: each deferred task ends with exactly one
              // `sink.append("<template ...>...")`. Flushing here
              // promotes that single append to its own chunk so the
              // browser's MutationObserver can apply it without
              // waiting for other deferred fragments.
              sink.flush();
            }
          },
          defer(task) {
            deferredTasks.push(ignoreAfterAbort(task, abortController.signal));
          },
          signal: abortController.signal,
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        controller.error(error);
        return;
      }

      // Shell pre-flush — synchronous, BEFORE we yield to microtasks.
      // If we awaited render first the deferred tasks' bodies would
      // already have appended their bytes to the same buffer and we
      // would emit one merged chunk.
      sink.flush();

      try {
        if (renderResult !== undefined && renderResult !== null) {
          await raceAbort(renderResult, abortController.signal);
          // Async render may have written more before its tail returned.
          // That tail is also "shell" — flush it before entering the
          // deferred phase.
          sink.flush();
        }

        inDeferredPhase = true;
        await raceAbort(Promise.all(deferredTasks), abortController.signal);
        // Tail flush in case the render closure (or a deferred task)
        // somehow left bytes in the buffer past the per-append flushes.
        sink.flush();
        complete = true;
        drainQueuedChunks(controller);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        controller.error(error);
      }
    },
    pull(controller) {
      drainQueuedChunks(controller);
    },
    cancel(reason) {
      cancelled = true;
      queuedChunks.length = 0;
      queuedBytes = 0;
      abortController.abort(reason);
    },
  });

  function queueChunk(buffer: Uint8Array): void {
    queuedChunks.push(buffer);
    queuedBytes += buffer.byteLength;

    if (
      !warnedQueuedBytes &&
      queuedBytes > streamQueuedChunkSoftLimitBytes &&
      process.env.NODE_ENV !== "production"
    ) {
      warnedQueuedBytes = true;
      console.warn(
        `[mreact] renderToReadableStream queued ${queuedBytes} bytes because the downstream reader is slower than the renderer.`,
      );
    }
  }
}

async function raceAbort<T>(task: PromiseLike<T>, signal: AbortSignal): Promise<T | undefined> {
  if (signal.aborted) {
    return undefined;
  }

  return Promise.race([
    task,
    new Promise<undefined>((resolve) => {
      signal.addEventListener("abort", () => resolve(undefined), { once: true });
    }),
  ]);
}

function ignoreAfterAbort(task: PromiseLike<void>, signal: AbortSignal): Promise<void> {
  return Promise.resolve(task).catch((error) => {
    if (!signal.aborted) {
      throw error;
    }
  });
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const outOfOrderReorderScript = `(()=>{function apply(root){const fragments=Array.from(root.querySelectorAll("template[data-mreact-oob-fragment]"));for(const fragment of fragments){const id=fragment.getAttribute("data-mreact-oob-fragment");if(id===null)continue;const placeholders=Array.from(root.querySelectorAll("[data-mreact-oob-placeholder]"));const placeholder=placeholders.find((candidate)=>candidate.getAttribute("data-mreact-oob-placeholder")===id);if(placeholder===undefined)continue;placeholder.replaceWith(fragment.content.cloneNode(true));fragment.remove();}}apply(document);new MutationObserver(()=>apply(document)).observe(document.documentElement,{childList:true,subtree:true});})();`;

const reactSuspenseRevealScriptBody = `(self.$RC=self.$RC||function(bid,sid){var b=document.getElementById(bid);var s=document.getElementById(sid);if(!b||!s)return;var p=b.parentNode;var e=b.nextSibling;var d=0;var r=[];for(var n=e;n;n=n.nextSibling){if(n.nodeType===8){if(n.data==="$"||n.data==="$?"||n.data==="$!")d++;else if(n.data==="/$"){if(d===0){e=n;break;}d--;}}r.push(n);}for(var i=0;r[i];i++)p.removeChild(r[i]);while(s.firstChild)p.insertBefore(s.firstChild,e);s.remove();b.data="$";})`;

export const reactSuspenseRevealExternalScript = `(()=>{${reactSuspenseRevealScriptBody};var s=document.currentScript;if(!s)return;var b=s.getAttribute("data-boundary-id");var seg=s.getAttribute("data-segment-id");if(b!==null&&seg!==null)self.$RC(b,seg);})();`;
