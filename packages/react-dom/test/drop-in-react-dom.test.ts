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
});
