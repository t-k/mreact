import { describe, expect, test } from "vitest";
import {
  createEventHydrationManifest,
  createStringSink,
  renderEventHydrationManifest,
  renderHydrationBoundary,
  renderSsrState,
  serializeSsrState,
} from "../src/index.js";

describe("server hydration protocol", () => {
  test("renders resume boundary comment markers", () => {
    const sink = createStringSink();

    renderHydrationBoundary(sink, "root:1", (boundarySink) => {
      boundarySink.append("<button>Click</button>");
    });

    expect(sink.toString()).toBe(
      "<!--mreact-h:start:root%3A1--><button>Click</button><!--mreact-h:end:root%3A1-->",
    );
  });

  test("serializes SSR state without script breaking", () => {
    expect(serializeSsrState({ text: "</script><script>alert(1)</script>" }))
      .toBe("{\"text\":\"\\u003c/script>\\u003cscript>alert(1)\\u003c/script>\"}");
  });

  test("renders SSR state script", () => {
    const sink = createStringSink();

    renderSsrState(sink, { count: 1 }, { nonce: "nonce-1" });

    expect(sink.toString()).toBe(
      '<script type="application/json" data-mreact-ssr-state nonce="nonce-1">{"count":1}</script>',
    );
  });

  test("renders event hydration manifest", () => {
    const sink = createStringSink();
    const manifest = createEventHydrationManifest([
      { id: "btn:1", event: "click", handler: "App.onClick" },
    ]);

    renderEventHydrationManifest(sink, manifest);

    expect(sink.toString()).toBe(
      '<script type="application/json" data-mreact-event-manifest>{"version":1,"events":[{"id":"btn:1","event":"click","handler":"App.onClick"}]}</script>',
    );
  });
});
