// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  createEventHydrationManifest,
  createStringSink,
  renderOutOfOrderBoundary,
  renderEventHydrationManifest,
} from "../src/index.js";
import {
  createStreamingHydrationRoot,
  createElement,
  hydrateRoot,
  Suspense,
} from "../../react-compat/src/index.js";
import { applyOutOfOrderFragments } from "../src/reorder.js";

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

  test("creates a streaming hydration root that applies fragments and replays manifest events", async () => {
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
    renderEventHydrationManifest(
      sink,
      createEventHydrationManifest([
        { id: "suspense-1:0", event: "click", handler: "onClick" },
      ]),
    );
    sink.append("</main>");
    await sink.drain();

    document.body.innerHTML = sink.toString();
    const streamingRoot = createStreamingHydrationRoot(document.body);
    const serverButton = document.body.querySelector("button");
    const outside = document.body.querySelector("span");

    if (serverButton === null) {
      throw new Error("Expected streamed button.");
    }

    serverButton.click();
    streamingRoot.hydrate(
      createElement(
        Suspense,
        { fallback: createElement("em", null, "loading") },
        createElement("button", { onClick: () => { clicks += 1; } }, "Ada"),
      ),
      { resumeId: "suspense-1", consumeResumeMarkers: true },
    );

    expect(document.body.querySelector("span")).toBe(outside);
    expect(document.body.querySelector("button")).toBe(serverButton);
    expect(clicks).toBe(1);
    expect(document.body.innerHTML).toBe(
      '<main><span>outside</span><button>Ada</button><script type="application/json" data-mreact-event-manifest="">{"version":1,"events":[{"id":"suspense-1:0","event":"click","handler":"onClick"}]}</script></main>',
    );
  });

  test("observes late out-of-order fragments for streaming hydration", async () => {
    document.body.innerHTML =
      '<main><!--mreact-h:start:suspense-1--><template data-mreact-oob-placeholder="suspense-1"><em>loading</em></template><!--mreact-h:end:suspense-1--></main>';

    const streamingRoot = createStreamingHydrationRoot(document.body, {
      observeOutOfOrderFragments: true,
    });

    expect(document.body.querySelector("template[data-mreact-oob-placeholder]")).not.toBeNull();
    document.body.insertAdjacentHTML(
      "beforeend",
      '<template data-mreact-oob-fragment="suspense-1"><button>Ada</button></template>',
    );
    await Promise.resolve();

    expect(document.body.querySelector("button")?.textContent).toBe("Ada");
    expect(document.body.querySelector("template[data-mreact-oob-fragment]")).toBeNull();
    streamingRoot.dispose();
  });

  test("selectively hydrates a streamed boundary when a manifest event is captured", async () => {
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
    renderEventHydrationManifest(
      sink,
      createEventHydrationManifest([
        { id: "suspense-1:0", event: "click", handler: "onClick" },
      ]),
    );
    sink.append("</main>");
    await sink.drain();

    document.body.innerHTML = sink.toString();
    const outside = document.body.querySelector("span");
    const streamingRoot = createStreamingHydrationRoot(document.body, {
      selectiveHydration: {
        element: createElement(
          Suspense,
          { fallback: createElement("em", null, "loading") },
          createElement("button", { onClick: () => { clicks += 1; } }, "Ada"),
        ),
        options: { resumeId: "suspense-1", consumeResumeMarkers: true },
      },
    });
    const serverButton = document.body.querySelector("button");

    if (serverButton === null) {
      throw new Error("Expected streamed button.");
    }

    serverButton.click();

    expect(document.body.querySelector("span")).toBe(outside);
    expect(document.body.querySelector("button")).toBe(serverButton);
    expect(clicks).toBe(1);
    expect(document.body.innerHTML).toBe(
      '<main><span>outside</span><button>Ada</button><script type="application/json" data-mreact-event-manifest="">{"version":1,"events":[{"id":"suspense-1:0","event":"click","handler":"onClick"}]}</script></main>',
    );
    streamingRoot.dispose();
  });
});
