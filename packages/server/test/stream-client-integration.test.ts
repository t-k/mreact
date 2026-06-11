// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  renderOutOfOrderBoundary,
  renderOutOfOrderReorderScript,
  renderToString,
} from "../src/index.js";
import { applyOutOfOrderFragments } from "../src/reorder.js";

describe("server stream and client runtime integration", () => {
  test("out-of-order Await placeholder is visible before fragment reorder", async () => {
    const html = await renderToString((sink) => {
      sink.append("<section>");
      renderOutOfOrderBoundary(
        sink,
        "mreact-0",
        Promise.resolve("Ada"),
        (boundarySink, name) => {
          boundarySink.append(`<strong>${name}</strong>`);
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

    document.body.innerHTML = html;

    expect(document.body.querySelector("template[data-mreact-oob-placeholder]")).toBeNull();
    expect(document.body.textContent).toContain("Loading");
    expect(document.body.textContent).toContain("After");
  });

  test("client reorder runtime replaces rejected Await placeholders with catch content", async () => {
    const html = await renderToString((sink) => {
      sink.append("<section>");
      renderOutOfOrderBoundary(
        sink,
        "mreact-1",
        Promise.reject(new Error("load failed")),
        (boundarySink, name) => {
          boundarySink.append(`<strong>${name}</strong>`);
        },
        {
          placeholder(boundarySink) {
            boundarySink.append("<span>Loading</span>");
          },
          catch(boundarySink, error) {
            boundarySink.append(`<strong>${(error as Error).message}</strong>`);
          },
        },
      );
      sink.append("</section>");
    });

    document.body.innerHTML = html;

    expect(document.body.textContent).toContain("Loading");

    applyOutOfOrderFragments(document);

    expect(document.body.innerHTML).toBe("<section><strong>load failed</strong></section>");
  });

  test("client reorder runtime applies streamed out-of-order fragments", async () => {
    const html = await renderToString((sink) => {
      sink.append("<section>");
      renderOutOfOrderBoundary(
        sink,
        "mreact-0",
        Promise.resolve("Ada"),
        (boundarySink, name) => {
          boundarySink.append(`<strong>${name}</strong>`);
        },
        {
          placeholder(boundarySink) {
            boundarySink.append("<span>Loading</span>");
          },
        },
      );
      renderOutOfOrderReorderScript(sink);
      sink.append("</section>");
    });

    document.body.innerHTML = html;
    applyOutOfOrderFragments(document);

    expect(document.body.querySelector("template[data-mreact-oob-fragment]")).toBeNull();
    expect(document.body.querySelector("[data-mreact-oob-complete]")).toBeNull();
    expect(document.body.innerHTML).toContain("<section><strong>Ada</strong>");
    expect(document.body.innerHTML).toContain('script data-mreact-oob-reorder=""');
    expect(document.body.innerHTML).toContain("data-mreact-oob-complete");
  });
});
