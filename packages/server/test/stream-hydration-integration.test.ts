// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  createStringSink,
  renderOutOfOrderBoundary,
} from "../src/index.js";
import { applyOutOfOrderFragments } from "../src/reorder.js";
import {
  createElement,
  hydrateRoot,
  Suspense,
} from "../../react-compat/src/index.js";

describe("server streaming hydration integration", () => {
  test("hydrates a resolved out-of-order boundary by its streamed resume marker", async () => {
    const sink = createStringSink();
    let clicks = 0;

    sink.append("<main><span>outside</span>");
    renderOutOfOrderBoundary(
      sink,
      "suspense-1",
      Promise.resolve("Ada"),
      (boundarySink, name) => {
        boundarySink.append(`<button>${name}</button>`);
      },
      {
        hydration: true,
        placeholder(boundarySink) {
          boundarySink.append("<em>loading</em>");
        },
      },
    );
    sink.append("</main>");
    await sink.drain();

    document.body.innerHTML = sink.toString();
    applyOutOfOrderFragments(document);
    const serverButton = document.body.querySelector("button");
    const outside = document.body.querySelector("span");

    hydrateRoot(
      document.body,
      createElement(
        Suspense,
        { fallback: createElement("em", null, "loading") },
        createElement("button", { onClick: () => { clicks += 1; } }, "Ada"),
      ),
      { resumeId: "suspense-1", consumeResumeMarkers: true },
    );

    expect(document.body.querySelector("span")).toBe(outside);
    expect(document.body.querySelector("button")).toBe(serverButton);
    document.body.querySelector("button")?.click();
    expect(clicks).toBe(1);
    expect(document.body.innerHTML).toBe(
      "<main><span>outside</span><button>Ada</button></main>",
    );
  });
});
