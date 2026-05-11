export interface HtmlSink {
  append(chunk: string): void;
  defer?(task: PromiseLike<void>): void;
}

export interface StringHtmlSink extends HtmlSink {
  drain(): Promise<void>;
  toString(): string;
}

export type StreamRender = (
  sink: HtmlSink,
) => void | PromiseLike<void>;

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

export type AsyncBoundaryRender<T> = (
  sink: HtmlSink,
  value: Awaited<T>,
) => void | PromiseLike<void>;

export function createStringSink(): StringHtmlSink {
  const chunks: string[] = [];
  const deferredTasks: PromiseLike<void>[] = [];

  return {
    append(chunk) {
      chunks.push(chunk);
    },
    defer(task) {
      deferredTasks.push(task);
    },
    async drain() {
      await Promise.all(deferredTasks);
    },
    toString() {
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
    options.hydration === true
      ? `<!--mreact-h:start:${encodeURIComponent(id)}-->`
      : "";
  const hydrationEnd =
    options.hydration === true
      ? `<!--mreact-h:end:${encodeURIComponent(id)}-->`
      : "";
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
    options.nonce === undefined
      ? ""
      : ` nonce="${escapeAttribute(options.nonce)}"`;

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

  const task = renderReactSuspenseSegment(
    sink,
    boundaryId,
    segmentId,
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

export function renderReactSuspenseClientRenderBoundary(
  sink: HtmlSink,
  fallback: (sink: HtmlSink) => void | PromiseLike<void>,
  options: ReactSuspenseClientRenderOptions = {},
): void | PromiseLike<void> {
  sink.append(
    `<!--$!--><template${renderReactSuspenseErrorAttributes(options)}></template>`,
  );
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

function renderReactSuspenseErrorAttributes(
  options: ReactSuspenseClientRenderOptions,
): string {
  const message =
    options.message === undefined
      ? ""
      : ` data-msg="${escapeAttribute(options.message)}"`;
  const stack =
    options.stack === undefined
      ? ""
      : ` data-stck="${escapeAttribute(options.stack)}"`;

  return `${message}${stack}`;
}

function renderReactSuspenseRevealScript(
  boundaryId: string,
  segmentId: string,
  options: ReactSuspenseScriptOptions = {},
): string {
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

export function renderScriptAsset(
  sink: HtmlSink,
  options: ScriptAssetOptions,
): void {
  const integrityAttribute =
    options.integrity === undefined
      ? ""
      : ` integrity="${escapeAttribute(options.integrity)}"`;
  const crossOrigin =
    options.integrity === undefined
      ? options.crossOrigin
      : (options.crossOrigin ?? "anonymous");
  const crossOriginAttribute =
    crossOrigin === undefined
      ? ""
      : ` crossorigin="${escapeAttribute(crossOrigin)}"`;

  sink.append(
    `<script src="${escapeAttribute(options.src)}"${renderNonceAttribute(options.nonce)}${integrityAttribute}${crossOriginAttribute}></script>`,
  );
}

export async function renderToString(render: StreamRender): Promise<string> {
  const sink = createStringSink();

  await render(sink);
  await sink.drain();

  return sink.toString();
}

function isPromiseLike(value: unknown): value is PromiseLike<void> {
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

export function renderToReadableStream(
  render: StreamRender,
): ReadableStream<Uint8Array> {
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
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const outOfOrderReorderScript = `(()=>{function apply(root){const fragments=Array.from(root.querySelectorAll("template[data-mreact-oob-fragment]"));for(const fragment of fragments){const id=fragment.getAttribute("data-mreact-oob-fragment");if(id===null)continue;const placeholders=Array.from(root.querySelectorAll("template[data-mreact-oob-placeholder]"));const placeholder=placeholders.find((candidate)=>candidate.getAttribute("data-mreact-oob-placeholder")===id);if(placeholder===undefined)continue;placeholder.replaceWith(fragment.content.cloneNode(true));fragment.remove();}}apply(document);new MutationObserver(()=>apply(document)).observe(document.documentElement,{childList:true,subtree:true});})();`;

const reactSuspenseRevealScriptBody = `(self.$RC=self.$RC||function(bid,sid){var b=document.getElementById(bid);var s=document.getElementById(sid);if(!b||!s)return;var p=b.parentNode;var e=b.nextSibling;var d=0;var r=[];for(var n=e;n;n=n.nextSibling){if(n.nodeType===8){if(n.data==="$"||n.data==="$?"||n.data==="$!")d++;else if(n.data==="/$"){if(d===0){e=n;break;}d--;}}r.push(n);}for(var i=0;r[i];i++)p.removeChild(r[i]);while(s.firstChild)p.insertBefore(s.firstChild,e);s.remove();b.data="$";})`;
