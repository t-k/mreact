import { describe, expect, test } from "vitest";
import {
  createStringSink,
  renderAsyncBoundary,
  renderOutOfOrderBoundary,
  renderOutOfOrderReorderScript,
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

  test("async boundary renders resolved content after awaiting value", async () => {
    const sink = createStringSink();

    sink.append("<section>");
    await renderAsyncBoundary(sink, Promise.resolve("Ada"), (boundarySink, name) => {
      boundarySink.append(`<span>${name}</span>`);
    });
    sink.append("</section>");

    expect(sink.toString()).toBe("<section><span>Ada</span></section>");
  });

  test("async boundary renders catch content for rejected values", async () => {
    const sink = createStringSink();

    await renderAsyncBoundary(
      sink,
      Promise.reject(new Error("load failed")),
      (boundarySink, name) => {
        boundarySink.append(`<span>${name}</span>`);
      },
      {
        catch(boundarySink, error) {
          boundarySink.append(
            `<strong>${(error as Error).message}</strong>`,
          );
        },
      },
    );

    expect(sink.toString()).toBe("<strong>load failed</strong>");
  });

  test("out-of-order boundary appends placeholder before later sync html and fragment after resolution", async () => {
    const html = await renderToString((sink) => {
      sink.append("<section>");
      renderOutOfOrderBoundary(
        sink,
        "mreact-0",
        Promise.resolve("Ada"),
        (boundarySink, name) => {
          boundarySink.append(`<span>${name}</span>`);
        },
        {
          placeholder(boundarySink) {
            boundarySink.append("<span>Loading</span>");
          },
        },
      );
      sink.append("<p>After</p>");
      sink.append("</section>");
    });

    expect(html).toBe(
      '<section><template data-mreact-oob-placeholder="mreact-0"><span>Loading</span></template><p>After</p></section><template data-mreact-oob-fragment="mreact-0"><span>Ada</span></template>',
    );
  });

  test("out-of-order boundary appends catch fragment for rejected values", async () => {
    const html = await renderToString((sink) => {
      renderOutOfOrderBoundary(
        sink,
        "mreact-1",
        Promise.reject(new Error("load failed")),
        (boundarySink, name) => {
          boundarySink.append(`<span>${name}</span>`);
        },
        {
          placeholder(boundarySink) {
            boundarySink.append("<span>Loading</span>");
          },
          catch(boundarySink, error) {
            boundarySink.append(
              `<strong>${(error as Error).message}</strong>`,
            );
          },
        },
      );
    });

    expect(html).toBe(
      '<template data-mreact-oob-placeholder="mreact-1"><span>Loading</span></template><template data-mreact-oob-fragment="mreact-1"><strong>load failed</strong></template>',
    );
  });

  test("out-of-order reorder bootstrap appends a marker script", () => {
    const sink = createStringSink();

    renderOutOfOrderReorderScript(sink);

    expect(sink.toString()).toContain("<script data-mreact-oob-reorder>");
    expect(sink.toString()).toContain("</script>");
  });

  test("out-of-order reorder bootstrap observes future fragments", () => {
    const sink = createStringSink();

    renderOutOfOrderReorderScript(sink);

    expect(sink.toString()).toContain("data-mreact-oob-fragment");
    expect(sink.toString()).toContain("data-mreact-oob-placeholder");
    expect(sink.toString()).toContain("MutationObserver");
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
