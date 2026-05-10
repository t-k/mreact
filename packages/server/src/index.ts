export interface HtmlSink {
  append(chunk: string): void;
}

export interface StringHtmlSink extends HtmlSink {
  toString(): string;
}

export type StreamRender = (
  sink: HtmlSink,
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
