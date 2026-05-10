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
  placeholder?: (sink: HtmlSink) => void | PromiseLike<void>;
}

export interface OutOfOrderReorderScriptOptions {
  nonce?: string;
  src?: string;
}

export interface HydrationScriptOptions {
  nonce?: string;
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
  sink.append(
    `<template data-mreact-oob-placeholder="${escapeAttribute(id)}">${placeholderSink.toString()}</template>`,
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
