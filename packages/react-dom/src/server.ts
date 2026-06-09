import {
  renderToString as renderCompatToString,
  type ReactCompatNode,
} from "@reckona/mreact-compat";

/** React DOM server package version. */
export const version = "19.2.6";

/** Destination accepted by a pipeable server render stream. */
export interface PipeableStreamDestination {
  write(chunk: string | Uint8Array): unknown;
  end?(): unknown;
  destroy?(error?: unknown): unknown;
}

/** Minimal pipeable stream returned by Node-oriented server rendering. */
export interface PipeableStream {
  pipe<TDestination extends PipeableStreamDestination>(destination: TDestination): TDestination;
  abort(reason?: unknown): void;
}

/** External bootstrap script descriptor emitted after the rendered HTML. */
export interface BootstrapScriptDescriptor {
  src: string;
  integrity?: string;
  crossOrigin?: string;
}

/** Import map descriptor emitted as an inline bootstrap resource. */
export interface ReactImportMap {
  imports?: Record<string, string>;
  integrity?: Record<string, string>;
  scopes?: Record<string, Record<string, string>>;
}

/** Bootstrap scripts, modules, and import maps appended to server output. */
export interface RenderBootstrapOptions {
  nonce?: string;
  importMap?: ReactImportMap;
  bootstrapScriptContent?: string;
  bootstrapScripts?: Array<string | BootstrapScriptDescriptor>;
  bootstrapModules?: Array<string | BootstrapScriptDescriptor>;
}

/** Shared server render options accepted by string rendering helpers. */
export interface ServerOptions {
  identifierPrefix?: string;
}

/** Options for rendering HTML to a pipeable stream. */
export interface RenderToPipeableStreamOptions {
  identifierPrefix?: string;
  namespaceURI?: string;
  nonce?: string;
  importMap?: ReactImportMap;
  bootstrapScriptContent?: string;
  bootstrapScripts?: Array<string | BootstrapScriptDescriptor>;
  bootstrapModules?: Array<string | BootstrapScriptDescriptor>;
  headersLengthHint?: number;
  progressiveChunkSize?: number;
  onHeaders?(headers: Headers): void;
  onShellReady?(): void;
  onAllReady?(): void;
  onShellError?(error: unknown): void;
  onError?(error: unknown, errorInfo?: { componentStack: string }): string | void;
  formState?: unknown;
}

/** Options for rendering HTML to a WHATWG readable stream. */
export interface RenderToReadableStreamOptions {
  identifierPrefix?: string;
  namespaceURI?: string;
  nonce?: string;
  importMap?: ReactImportMap;
  bootstrapScriptContent?: string;
  bootstrapScripts?: Array<string | BootstrapScriptDescriptor>;
  bootstrapModules?: Array<string | BootstrapScriptDescriptor>;
  headersLengthHint?: number;
  progressiveChunkSize?: number;
  signal?: AbortSignal;
  onHeaders?(headers: Headers): void;
  onError?(error: unknown, errorInfo?: { componentStack: string }): string | void;
  formState?: unknown;
}

/** Readable stream augmented with the allReady promise used by React DOM server. */
export interface ReactDOMServerReadableStream extends ReadableStream<Uint8Array> {
  allReady: Promise<void>;
}

/** Options accepted by resumable server rendering helpers. */
export type ResumeOptions = RenderToReadableStreamOptions & RenderToPipeableStreamOptions;
/** Placeholder type for postponed render state. */
export type PostponedState = unknown;

/** Renders a React-compatible node to an HTML string. */
export function renderToString(element: ReactCompatNode, _options?: ServerOptions): string {
  return renderCompatToString(() => element);
}

/** Renders a React-compatible node to static HTML without hydration metadata. */
export function renderToStaticMarkup(element: ReactCompatNode, options?: ServerOptions): string {
  void options;
  return renderToString(element);
}

/** Renders a React-compatible node to a WHATWG readable stream. */
export async function renderToReadableStream(
  element: ReactCompatNode,
  options: RenderToReadableStreamOptions = {},
): Promise<ReactDOMServerReadableStream> {
  const encoder = new TextEncoder();
  const html = renderServerHtml(element, options);
  notifyHeaders(options);
  let resolveAllReady: () => void;
  let rejectAllReady: (error: unknown) => void;
  const allReady = new Promise<void>((resolve, reject) => {
    resolveAllReady = resolve;
    rejectAllReady = reject;
  });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (options.signal?.aborted === true) {
        const reason = options.signal.reason;
        rejectAllReady(reason);
        controller.error(reason);
        return;
      }

      const abort = () => {
        const reason = options.signal?.reason;
        rejectAllReady(reason);
        controller.error(reason);
      };
      options.signal?.addEventListener("abort", abort, { once: true });

      try {
        controller.enqueue(encoder.encode(html));
        controller.close();
        resolveAllReady();
      } catch (error) {
        options.onError?.(error, { componentStack: "" });
        rejectAllReady(error);
        controller.error(error);
      } finally {
        options.signal?.removeEventListener("abort", abort);
      }
    },
  });

  return Object.assign(stream, { allReady });
}

/** Renders a React-compatible node to a Node-style pipeable stream. */
export function renderToPipeableStream(
  element: ReactCompatNode,
  options: RenderToPipeableStreamOptions = {},
): PipeableStream {
  let aborted = false;
  let finished = false;

  return {
    pipe(destination) {
      queueMicrotask(() => {
        if (aborted) {
          return;
        }

        try {
          notifyHeaders(options);
          options.onShellReady?.();
          const html = renderServerHtml(element, options);
          options.onAllReady?.();
          destination.write(html);
          destination.end?.();
          finished = true;
        } catch (error) {
          options.onError?.(error, { componentStack: "" });
          options.onShellError?.(error);
          destination.destroy?.(error);
        }
      });

      return destination;
    },
    abort(reason) {
      if (finished) {
        return;
      }

      aborted = true;
      options.onError?.(reason ?? new Error("renderToPipeableStream was aborted."), {
        componentStack: "",
      });
    },
  };
}

/** Resumes postponed server rendering into a WHATWG readable stream. */
export async function resume(
  element: ReactCompatNode,
  _postponedState: PostponedState,
  options: ResumeOptions = {},
): Promise<ReactDOMServerReadableStream> {
  return renderToReadableStream(element, options);
}

/** Resumes postponed server rendering into a Node-style pipeable stream. */
export async function resumeToPipeableStream(
  element: ReactCompatNode,
  _postponedState: PostponedState,
  options: ResumeOptions = {},
): Promise<PipeableStream> {
  return renderToPipeableStream(element, options);
}

function renderServerHtml(element: ReactCompatNode, options: RenderBootstrapOptions): string {
  return `${renderToString(element)}${renderBootstrapResources(options)}`;
}

function renderBootstrapResources(options: RenderBootstrapOptions): string {
  const nonce = options.nonce === undefined ? "" : ` nonce="${escapeAttribute(options.nonce)}"`;
  const importMap =
    options.importMap === undefined
      ? ""
      : `<script type="importmap"${nonce}>${escapeScriptContent(JSON.stringify(options.importMap))}</script>`;
  const inlineScript =
    options.bootstrapScriptContent === undefined
      ? ""
      : `<script${nonce}>${escapeScriptContent(options.bootstrapScriptContent)}</script>`;
  const scripts = (options.bootstrapScripts ?? [])
    .map((script) => renderExternalScript(script, nonce, undefined))
    .join("");
  const modules = (options.bootstrapModules ?? [])
    .map((script) => renderExternalScript(script, nonce, "module"))
    .join("");

  return `${importMap}${inlineScript}${scripts}${modules}`;
}

function renderExternalScript(
  script: string | BootstrapScriptDescriptor,
  nonce: string,
  type: "module" | undefined,
): string {
  const descriptor = typeof script === "string" ? { src: script } : script;
  const typeAttribute = type === undefined ? "" : ` type="${type}"`;
  const src = ` src="${escapeAttribute(descriptor.src)}"`;
  const integrity =
    descriptor.integrity === undefined ? "" : ` integrity="${escapeAttribute(descriptor.integrity)}"`;
  const crossOrigin =
    descriptor.crossOrigin === undefined
      ? ""
      : ` crossorigin="${escapeAttribute(descriptor.crossOrigin)}"`;

  return `<script${typeAttribute}${src}${nonce}${integrity}${crossOrigin}></script>`;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeScriptContent(value: string): string {
  return value
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function notifyHeaders(options: { onHeaders?(headers: Headers): void }): void {
  if (options.onHeaders === undefined) {
    return;
  }

  const headers = new Headers();
  headers.set("content-type", "text/html; charset=utf-8");
  options.onHeaders(headers);
}
