import type { HtmlSink } from "@reckona/mreact-shared/compiler-contract";
import {
  escapeAttribute,
  isPromiseLikeUnknown,
  renderNonceAttribute,
  serializeScriptJson,
} from "./html-internals.js";
import { createStringSink, type StringHtmlSink } from "./sink.js";

/** Options shared by async boundaries that render resolved values or caught errors. */
export interface AsyncBoundaryOptions {
  catch?: (sink: HtmlSink, error: unknown) => void | PromiseLike<void>;
  hydrationAwaitId?: string;
}

/** Options for rendering a boundary whose resolved content can arrive out of order. */
export interface OutOfOrderBoundaryOptions extends AsyncBoundaryOptions {
  hydration?: boolean;
  placeholder?: (sink: HtmlSink) => void;
  placeholderTag?: string;
}

/** Options for emitting the out-of-order fragment reorder script. */
export interface OutOfOrderReorderScriptOptions {
  nonce?: string;
  src?: string;
}

/** Options for script tags that hydrate server-rendered data. */
export interface HydrationScriptOptions {
  nonce?: string;
}

/** Options for scripts that reveal React Suspense segments. */
export interface ReactSuspenseScriptOptions {
  nonce?: string;
  src?: string;
}

/** Options for React Suspense boundaries rendered with streamed segments. */
export interface ReactSuspenseBoundaryOptions extends AsyncBoundaryOptions {
  fallback?: (sink: HtmlSink) => void | PromiseLike<void>;
  nonce?: string;
}

/** Error metadata used when forcing a React Suspense boundary to client render. */
export interface ReactSuspenseClientRenderOptions {
  message?: string;
  stack?: string;
}

/** Renderer invoked with an async boundary's resolved value. */
export type AsyncBoundaryRender<T> = (
  sink: HtmlSink,
  value: Awaited<T>,
) => void | PromiseLike<void>;

const outOfOrderBoundaryInstances = new WeakMap<HtmlSink, Map<string, number>>();

/** Renders a value once it resolves, or renders a configured catch branch on error. */
export async function renderAsyncBoundary<T>(
  sink: HtmlSink,
  value: T,
  render: AsyncBoundaryRender<T>,
  options: AsyncBoundaryOptions = {},
): Promise<void> {
  try {
    const resolved = await value;
    await sink.backpressure?.();
    await render(sink, resolved);
    if (options.hydrationAwaitId !== undefined) {
      appendAwaitHydrationData(sink, options.hydrationAwaitId, resolved);
    }
  } catch (error) {
    if (options.catch === undefined) {
      throw error;
    }

    await sink.backpressure?.();
    await options.catch(sink, error);
  }
}

// Threshold for `<Await>` payload size warnings (UTF-8 byte length of
// JSON-serialized representation). 100KB warn / 1MB error follow the
// "you're sending a lot of data" hint pattern used by other frameworks.
const AWAIT_PAYLOAD_WARN_BYTES = 100 * 1024;
const AWAIT_PAYLOAD_ERROR_BYTES = 1024 * 1024;
const textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : undefined;

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
    `<script data-mreact-await="${escapeAttribute(awaitId)}">(self.__mreactAwaitData||(self.__mreactAwaitData={}))[${idLiteral}]={value:${serialized}}</script>`,
  );
}

// Emits a single console.warn in dev when `resolved` contains shapes the
// wire format will silently drop or coerce (Date / Map / Set / RegExp /
// class instance / function / Symbol / nested non-POJO).
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
      `JSON-serializable data before it reaches <Await>. See ` +
      `https://github.com/t-k/mreact#streaming-loading-and-await.`,
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
  if (json.length * 3 < AWAIT_PAYLOAD_WARN_BYTES) {
    return;
  }

  const byteLength = textEncoder?.encode(json).length ?? json.length;

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
      .replaceAll("\u2028", "\\u2028")
      .replaceAll("\u2029", "\\u2029");
  } catch {
    return undefined;
  }
}

function inheritBackpressure(childSink: StringHtmlSink, parentSink: HtmlSink): StringHtmlSink {
  if (parentSink.backpressure === undefined) {
    return childSink;
  }

  return {
    ...childSink,
    backpressure: parentSink.backpressure,
  };
}

/** Emits a placeholder immediately and defers resolved HTML as an out-of-order fragment. */
export function renderOutOfOrderBoundary<T>(
  sink: HtmlSink,
  id: string,
  value: T,
  render: AsyncBoundaryRender<T>,
  options: OutOfOrderBoundaryOptions = {},
): void {
  const boundaryId = nextOutOfOrderBoundaryInstanceId(sink, id);
  const placeholderSink = createStringSink();
  const placeholderResult = options.placeholder?.(placeholderSink);
  if (!isProductionMode() && isPromiseLikeUnknown(placeholderResult)) {
    throw new Error("renderOutOfOrderBoundary placeholder must be synchronous.");
  }
  const placeholderTag = normalizeOutOfOrderPlaceholderTag(options.placeholderTag);
  const hydrationStart =
    options.hydration === true ? `<!--mreact-h:start:${encodeURIComponent(boundaryId)}-->` : "";
  const hydrationEnd =
    options.hydration === true ? `<!--mreact-h:end:${encodeURIComponent(boundaryId)}-->` : "";
  sink.append(
    `${hydrationStart}<${placeholderTag} data-mreact-oob-placeholder="${escapeAttribute(boundaryId)}">${placeholderSink.toString()}</${placeholderTag}>${hydrationEnd}`,
  );

  const task = renderOutOfOrderFragment(sink, boundaryId, value, render, options);

  if (sink.defer === undefined) {
    void task;
    return;
  }

  sink.defer(task);
}

function normalizeOutOfOrderPlaceholderTag(tag: unknown): string {
  if (typeof tag !== "string") {
    return "span";
  }

  const normalized = tag.trim().toLowerCase();
  return /^[a-z][a-z0-9-]*$/.test(normalized) ? normalized : "span";
}

async function renderOutOfOrderFragment<T>(
  sink: HtmlSink,
  id: string,
  value: T,
  render: AsyncBoundaryRender<T>,
  options: OutOfOrderBoundaryOptions,
): Promise<void> {
  const fragmentSink = inheritBackpressure(createStringSink(), sink);
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
  await fragmentSink.drain();

  sink.append(
    `<template data-mreact-oob-fragment="${escapeAttribute(id)}">${fragmentSink.toString()}</template>`,
  );

  if (hasResolvedValue && options.hydrationAwaitId !== undefined) {
    appendAwaitHydrationData(sink, options.hydrationAwaitId, resolvedValue);
  }
}

/** Emits the client script that swaps out-of-order fragments into their placeholders. */
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

/** Wraps streamed content in React Suspense completion markers. */
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

/** Emits a React Suspense fallback and streams the resolved segment out of order. */
export function renderReactSuspenseOutOfOrderBoundary<T>(
  sink: HtmlSink,
  boundaryId: string,
  segmentId: string,
  value: T,
  render: AsyncBoundaryRender<T>,
  options: ReactSuspenseBoundaryOptions = {},
): void {
  const actualBoundaryId = nextOutOfOrderBoundaryInstanceId(sink, boundaryId);
  const suffix = actualBoundaryId.slice(boundaryId.length);
  const actualSegmentId = `${segmentId}${suffix}`;
  const fallbackSink = createStringSink();
  void options.fallback?.(fallbackSink);
  sink.append(
    `<!--$?--><template id="${escapeAttribute(actualBoundaryId)}"></template>${fallbackSink.toString()}<!--/$-->`,
  );

  const task = renderReactSuspenseSegment(
    sink,
    actualBoundaryId,
    actualSegmentId,
    value,
    render,
    options,
  );

  if (sink.defer === undefined) {
    void task;
    return;
  }

  sink.defer(task);
}

function nextOutOfOrderBoundaryInstanceId(sink: HtmlSink, id: string): string {
  let instances = outOfOrderBoundaryInstances.get(sink);

  if (instances === undefined) {
    instances = new Map();
    outOfOrderBoundaryInstances.set(sink, instances);
  }

  const count = instances.get(id) ?? 0;
  instances.set(id, count + 1);

  return count === 0 ? id : `${id}-${count.toString(36)}`;
}

/** Emits a React Suspense boundary that instructs the client to render the fallback. */
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
  const segmentSink = inheritBackpressure(createStringSink(), sink);

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

/** Wraps server-rendered HTML in hydration start and end markers. */
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

function isPromiseLike(value: unknown): value is PromiseLike<void> {
  return isPromiseLikeUnknown(value);
}

const outOfOrderReorderScript = `(()=>{function apply(root){const fragments=Array.from(root.querySelectorAll("template[data-mreact-oob-fragment]"));for(const fragment of fragments){const id=fragment.getAttribute("data-mreact-oob-fragment");if(id===null)continue;const placeholders=Array.from(root.querySelectorAll("[data-mreact-oob-placeholder]"));const placeholder=placeholders.find((candidate)=>candidate.getAttribute("data-mreact-oob-placeholder")===id);if(placeholder===undefined)continue;placeholder.replaceWith(fragment.content.cloneNode(true));fragment.remove();}}apply(document);new MutationObserver(()=>apply(document)).observe(document.documentElement,{childList:true,subtree:true});})();`;

const reactSuspenseRevealScriptBody = `(self.$RC=self.$RC||function(bid,sid){var b=document.getElementById(bid);var s=document.getElementById(sid);if(!b||!s)return;var p=b.parentNode;var e=b.nextSibling;var d=0;var r=[];for(var n=e;n;n=n.nextSibling){if(n.nodeType===8){if(n.data==="$"||n.data==="$?"||n.data==="$!")d++;else if(n.data==="/$"){if(d===0){e=n;break;}d--;}}r.push(n);}for(var i=0;r[i];i++)p.removeChild(r[i]);while(s.firstChild)p.insertBefore(s.firstChild,e);s.remove();b.data="$";})`;

/** External script body that reveals a React Suspense segment when loaded. */
export const reactSuspenseRevealExternalScript = `(()=>{${reactSuspenseRevealScriptBody};var s=document.currentScript;if(!s)return;var b=s.getAttribute("data-boundary-id");var seg=s.getAttribute("data-segment-id");if(b!==null&&seg!==null)self.$RC(b,seg);})();`;
