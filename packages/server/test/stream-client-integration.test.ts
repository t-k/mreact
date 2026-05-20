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

    expect(document.body.innerHTML).toBe(
      '<section><strong>Ada</strong><script data-mreact-oob-reorder="">(()=>{function apply(root){const fragments=Array.from(root.querySelectorAll("template[data-mreact-oob-fragment]"));for(const fragment of fragments){const id=fragment.getAttribute("data-mreact-oob-fragment");if(id===null)continue;const placeholders=Array.from(root.querySelectorAll("[data-mreact-oob-placeholder]"));const placeholder=placeholders.find((candidate)=>candidate.getAttribute("data-mreact-oob-placeholder")===id);if(placeholder===undefined)continue;placeholder.replaceWith(fragment.content.cloneNode(true));fragment.remove();}}apply(document);new MutationObserver(()=>apply(document)).observe(document.documentElement,{childList:true,subtree:true});})();</script></section>',
    );
  });
});
