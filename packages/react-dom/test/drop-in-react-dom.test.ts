// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { createElement } from "../../react/src/index.js";
import { createRoot, hydrateRoot } from "../src/client.js";
import { flushSync, render, unmountComponentAtNode } from "../src/index.js";
import {
  renderToPipeableStream,
  renderToReadableStream,
  renderToStaticMarkup,
  renderToString,
  resume,
  resumeToPipeableStream,
} from "../src/server.js";

describe("react-dom drop-in entrypoints", () => {
  test("client and legacy DOM entrypoints render and hydrate", async () => {
    const clientContainer = document.createElement("div");
    const root = createRoot(clientContainer);

    root.render(createElement("button", null, "Save"));
    expect(clientContainer.innerHTML).toBe("<button>Save</button>");

    flushSync(() => {
      root.render(createElement("button", null, "Saved"));
    });
    expect(clientContainer.innerHTML).toBe("<button>Saved</button>");

    const legacyContainer = document.createElement("div");
    render(createElement("p", null, "Legacy"), legacyContainer);
    expect(legacyContainer.innerHTML).toBe("<p>Legacy</p>");
    expect(unmountComponentAtNode(legacyContainer)).toBe(true);
    expect(legacyContainer.innerHTML).toBe("");

    const hydrationContainer = document.createElement("div");
    hydrationContainer.innerHTML = "<span>Ada</span>";
    const serverSpan = hydrationContainer.querySelector("span");
    hydrateRoot(hydrationContainer, createElement("span", null, "Ada"));
    expect(hydrationContainer.querySelector("span")).toBe(serverSpan);
  });

  test("server entrypoints expose React-style render APIs", async () => {
    const element = createElement("main", null, createElement("h1", null, "Ada"));

    expect(renderToString(element)).toBe("<main><h1>Ada</h1></main>");
    expect(renderToStaticMarkup(element)).toBe("<main><h1>Ada</h1></main>");

    const readable = await renderToReadableStream(element);
    const reader = readable.getReader();
    const firstChunk = await reader.read();

    expect(firstChunk.done).toBe(false);
    expect(new TextDecoder().decode(firstChunk.value)).toBe("<main><h1>Ada</h1></main>");

    const chunks: string[] = [];
    let ended = false;
    const pipeable = renderToPipeableStream(element, {
      onAllReady() {
        chunks.push("ready");
      },
    });
    pipeable.pipe({
      write(chunk: string | Uint8Array) {
        chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      },
      end() {
        ended = true;
      },
    });
    await Promise.resolve();

    expect(chunks).toEqual(["ready", "<main><h1>Ada</h1></main>"]);
    expect(ended).toBe(true);
  });

  test("server readable stream exposes allReady and bootstrap resources", async () => {
    const element = createElement("main", null, createElement("h1", null, "Ada"));
    const headerNames: string[] = [];
    const readable = await renderToReadableStream(element, {
      nonce: "nonce-1",
      importMap: {
        imports: {
          react: "/vendor/react.js",
        },
      },
      onHeaders(headers) {
        headerNames.push(headers.get("content-type") ?? "");
      },
      bootstrapScriptContent: "globalThis.__boot = '<ready>';",
      bootstrapScripts: [
        "/client.js",
        {
          src: "/chunk.js",
          integrity: "sha256-test",
          crossOrigin: "anonymous",
        },
      ],
      bootstrapModules: ["/module.js"],
    });

    const html = await readStream(readable);
    await readable.allReady;

    expect(html).toContain("<main><h1>Ada</h1></main>");
    expect(html).toContain(
      '<script type="importmap" nonce="nonce-1">{"imports":{"react":"/vendor/react.js"}}</script>',
    );
    expect(html).toContain('<script nonce="nonce-1">globalThis.__boot = \'\\u003cready>');
    expect(html).toContain('<script src="/client.js" nonce="nonce-1"></script>');
    expect(html).toContain(
      '<script src="/chunk.js" nonce="nonce-1" integrity="sha256-test" crossorigin="anonymous"></script>',
    );
    expect(html).toContain('<script type="module" src="/module.js" nonce="nonce-1"></script>');
    expect(headerNames).toEqual(["text/html; charset=utf-8"]);
  });

  test("server resume APIs are streaming-compatible drop-in entrypoints", async () => {
    const element = createElement("section", null, "Resumed");
    const readable = await resume(element, { postponed: true });
    await readable.allReady;
    expect(await readStream(readable)).toBe("<section>Resumed</section>");

    const chunks: string[] = [];
    let ended = false;
    const pipeable = await resumeToPipeableStream(element, { postponed: true }, {
      onShellReady() {
        chunks.push("shell");
      },
      onAllReady() {
        chunks.push("all");
      },
    });

    pipeable.pipe({
      write(chunk: string | Uint8Array) {
        chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      },
      end() {
        ended = true;
      },
    });
    await Promise.resolve();

    expect(chunks).toEqual(["shell", "all", "<section>Resumed</section>"]);
    expect(ended).toBe(true);
  });
});

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      return html;
    }
    html += decoder.decode(chunk.value);
  }
}
