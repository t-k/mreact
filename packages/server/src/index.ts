export interface HtmlSink {
  append(chunk: string): void;
}

export interface StringHtmlSink extends HtmlSink {
  toString(): string;
}

export type StreamRender = (
  sink: HtmlSink,
) => void | PromiseLike<void>;

export interface AsyncBoundaryOptions {
  catch?: (sink: HtmlSink, error: unknown) => void | PromiseLike<void>;
}

export type AsyncBoundaryRender<T> = (
  sink: HtmlSink,
  value: Awaited<T>,
) => void | PromiseLike<void>;

export function createStringSink(): StringHtmlSink {
  const chunks: string[] = [];

  return {
    append(chunk) {
      chunks.push(chunk);
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

export async function renderToString(render: StreamRender): Promise<string> {
  const sink = createStringSink();

  await render(sink);

  return sink.toString();
}

export function renderToReadableStream(
  render: StreamRender,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await render({
          append(chunk) {
            controller.enqueue(encoder.encode(chunk));
          },
        });
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
