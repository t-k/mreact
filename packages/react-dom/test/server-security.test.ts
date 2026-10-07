import { describe, expect, test } from "vitest";
import { createElement, renderToString as renderCompiledHtml } from "@reckona/mreact-compat";
import {
  renderToString,
  renderToStaticMarkup,
  renderToReadableStream,
  renderToPipeableStream,
  resume,
  resumeToPipeableStream,
  type PipeableStream,
} from "../src/server.js";

const text = '<b data-probe="root">untrusted & text</b>';
const escaped = "&lt;b data-probe=&quot;root&quot;&gt;untrusted &amp; text&lt;/b&gt;";

function readPipeable(stream: PipeableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = "";
    stream.pipe({
      write(chunk) { html += String(chunk); },
      end() { resolve(html); },
      destroy(error) { reject(error); },
    });
  });
}

describe("React DOM server text boundary", () => {
  test.each([renderToString, renderToStaticMarkup])("escapes a string root with %s", (render) => {
    expect(render(text)).toBe(escaped);
    expect(render(createElement("div", null, text))).toBe(`<div>${escaped}</div>`);
  });

  test("escapes readable stream roots and resumed roots", async () => {
    for (const stream of [await renderToReadableStream(text), await resume(text, null)]) {
      await expect(new Response(stream).text()).resolves.toBe(escaped);
      await stream.allReady;
    }
  });

  test("escapes pipeable stream roots and resumed roots", async () => {
    await expect(readPipeable(renderToPipeableStream(text))).resolves.toBe(escaped);
    await expect(readPipeable(await resumeToPipeableStream(text, null))).resolves.toBe(escaped);
  });

  test("preserves the compiled HTML contract of the internal renderer", () => {
    expect(renderCompiledHtml(() => "<p>compiled</p>")).toBe("<p>compiled</p>");
    expect(renderToString(createElement(() => text, null))).toBe(escaped);
  });
});
