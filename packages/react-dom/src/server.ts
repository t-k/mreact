import {
  renderToString as renderCompatToString,
  type ReactCompatNode,
} from "@modular-react/react-compat";

export interface PipeableStreamDestination {
  write(chunk: string | Uint8Array): unknown;
  end?(): unknown;
  destroy?(error?: unknown): unknown;
}

export interface PipeableStream {
  pipe<TDestination extends PipeableStreamDestination>(destination: TDestination): TDestination;
  abort(reason?: unknown): void;
}

export interface RenderToPipeableStreamOptions {
  onShellReady?(): void;
  onAllReady?(): void;
  onShellError?(error: unknown): void;
  onError?(error: unknown): void;
}

export interface RenderToReadableStreamOptions {
  signal?: AbortSignal;
  onError?(error: unknown): void;
}

export function renderToString(element: ReactCompatNode): string {
  return renderCompatToString(() => element);
}

export function renderToStaticMarkup(element: ReactCompatNode): string {
  return renderToString(element);
}

export async function renderToReadableStream(
  element: ReactCompatNode,
  options: RenderToReadableStreamOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  const html = renderToString(element);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (options.signal?.aborted === true) {
        controller.error(options.signal.reason);
        return;
      }

      const abort = () => {
        controller.error(options.signal?.reason);
      };
      options.signal?.addEventListener("abort", abort, { once: true });

      try {
        controller.enqueue(encoder.encode(html));
        controller.close();
      } catch (error) {
        options.onError?.(error);
        controller.error(error);
      } finally {
        options.signal?.removeEventListener("abort", abort);
      }
    },
  });
}

export function renderToPipeableStream(
  element: ReactCompatNode,
  options: RenderToPipeableStreamOptions = {},
): PipeableStream {
  let aborted = false;

  return {
    pipe(destination) {
      queueMicrotask(() => {
        if (aborted) {
          return;
        }

        try {
          options.onShellReady?.();
          options.onAllReady?.();
          destination.write(renderToString(element));
          destination.end?.();
        } catch (error) {
          options.onError?.(error);
          destination.destroy?.(error);
        }
      });

      return destination;
    },
    abort(reason) {
      aborted = true;
      options.onError?.(reason ?? new Error("renderToPipeableStream was aborted."));
    },
  };
}
