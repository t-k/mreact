import { describe, expect, test } from "vitest";
import { createElement, Suspense } from "@reckona/mreact-compat";
import { html } from "../src/index.js";

async function readDecodedChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
  const result = await reader.read();
  return result.done ? "" : new TextDecoder().decode(result.value);
}

async function readDecodedChunkWithin(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  ms: number,
): Promise<string> {
  return Promise.race([
    readDecodedChunk(reader),
    new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error("timed out waiting for streamed chunk")), ms);
    }),
  ]);
}

async function readDecodedRest(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  let text = "";
  for (;;) {
    const chunk = await readDecodedChunk(reader);
    if (chunk === "") {
      return text;
    }
    text += chunk;
  }
}

describe("Next-style HTML response", () => {
  test("renders JSX-like nodes to a Response stream", async () => {
    const response = html(
      createElement("main", null, createElement("h1", null, "mreact streaming route")),
    );

    await expect(response.text()).resolves.toBe(
      "<main><h1>mreact streaming route</h1></main>",
    );
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  test("streams async Suspense children with React-compatible reveal markers", async () => {
    function StreamedContent() {
      return Promise.resolve(createElement("p", { "data-state": "ready" }, "ready"));
    }

    const response = html(
      createElement(
        "main",
        null,
        createElement(
          Suspense,
          {
            fallback: createElement("p", { "data-state": "fallback" }, "loading"),
          },
          createElement(StreamedContent, null),
        ),
      ),
    );

    const body = await response.text();

    expect(body).toContain("<!--$?-->");
    expect(body).toContain('<p data-state="fallback">loading</p>');
    expect(body).toContain('<!--/$--></main><div hidden id="');
    expect(body).toContain('<p data-state="ready">ready</p>');
    expect(body).toContain("self.$RC=");
  });

  test("streams fallback for buffered list children before their deferred work resolves", async () => {
    let resolveLead: (value: unknown) => void = () => {};
    let resolveReady: (value: unknown) => void = () => {};
    const lead = new Promise((resolve) => {
      resolveLead = resolve;
    });
    const ready = new Promise((resolve) => {
      resolveReady = resolve;
    });
    const response = html(
      createElement(
        "main",
        null,
        lead,
        createElement(
          Suspense,
          {
            fallback: createElement("p", { "data-state": "fallback" }, "loading"),
          },
          ready,
        ),
      ),
    );
    const reader = response.body!.getReader();

    await expect(readDecodedChunk(reader)).resolves.toBe("<main>");
    resolveLead(createElement("h1", null, "lead"));

    const fallbackChunk = await readDecodedChunkWithin(reader, 50);
    expect(fallbackChunk).toContain("<h1>lead</h1>");
    expect(fallbackChunk).toContain('<p data-state="fallback">loading</p>');
    expect(fallbackChunk).not.toContain('<p data-state="ready">ready</p>');

    resolveReady(createElement("p", { "data-state": "ready" }, "ready"));
    const rest = await readDecodedRest(reader);
    expect(`${fallbackChunk}${rest}`).toContain('<p data-state="ready">ready</p>');
  });
});
