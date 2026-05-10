import { describe, expect, test } from "vitest";
import {
  createStringSink,
  renderToReadableStream,
  renderToString,
} from "../src/index.js";

describe("server streaming runtime", () => {
  test("string sink preserves appended chunk order", () => {
    const sink = createStringSink();

    sink.append("<p>");
    sink.append("Hello");
    sink.append("</p>");

    expect(sink.toString()).toBe("<p>Hello</p>");
  });

  test("renderToString waits for async render before returning HTML", async () => {
    const html = await renderToString(async (sink) => {
      sink.append("<p>");
      await Promise.resolve();
      sink.append("Async");
      sink.append("</p>");
    });

    expect(html).toBe("<p>Async</p>");
  });

  test("renderToReadableStream emits appended chunks in order", async () => {
    const stream = renderToReadableStream((sink) => {
      sink.append("<p>");
      sink.append("Stream");
      sink.append("</p>");
    });

    await expect(readStream(stream)).resolves.toBe("<p>Stream</p>");
  });
});

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = "";

  for (;;) {
    const result = await reader.read();

    if (result.done) {
      html += decoder.decode();
      return html;
    }

    html += decoder.decode(result.value, { stream: true });
  }
}
