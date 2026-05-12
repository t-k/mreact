import {
  Fragment,
  Suspense as ReactCompatSuspense,
  createElement,
  isValidElement,
  type ReactCompatElement,
  type ReactCompatNode,
} from "@modular-react/react-compat";

export { Fragment } from "@modular-react/react-compat";
export type { ReactCompatNode } from "@modular-react/react-compat";

export interface HtmlSink {
  append(chunk: string): void;
  defer?(task: PromiseLike<void>): void;
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
  const requestedStrategy = options.strategy ?? "array-join";
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
    await render(sink, await value);
  } catch (error) {
    if (options.catch === undefined) {
      throw error;
    }

    await options.catch(sink, error);
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

  await renderAsyncBoundary(
    fragmentSink,
    value,
    render,
    options.catch === undefined ? {} : { catch: options.catch },
  );

  sink.append(
    `<template data-mreact-oob-fragment="${escapeAttribute(id)}">${fragmentSink.toString()}</template>`,
  );
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

  return `<script${renderNonceAttribute(options.nonce)}>${reactSuspenseRevealScriptBody};$RC(${JSON.stringify(boundaryId)},${JSON.stringify(segmentId)})</script>`;
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
  return Object.entries(props)
    .map(([name, value]) => renderHtmlAttribute(name, value))
    .filter((attribute) => attribute !== "")
    .join("");
}

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

  const attributeName = name === "className" ? "class" : name === "htmlFor" ? "for" : name;

  if (value === true) {
    return ` ${attributeName}`;
  }

  return ` ${attributeName}="${escapeAttribute(String(value))}"`;
}

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

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderNonceAttribute(nonce: string | undefined): string {
  return nonce === undefined ? "" : ` nonce="${escapeAttribute(nonce)}"`;
}

export function renderToReadableStream(render: StreamRender): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const deferredTasks: PromiseLike<void>[] = [];

      try {
        await render({
          append(chunk) {
            controller.enqueue(encoder.encode(chunk));
          },
          defer(task) {
            deferredTasks.push(task);
          },
        });
        await Promise.all(deferredTasks);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
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
