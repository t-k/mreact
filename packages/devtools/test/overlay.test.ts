// @vitest-environment happy-dom

import { afterEach, describe, expect, test } from "vitest";
import { createDevtools } from "../src/index.js";
import { mountDevtoolsOverlay } from "../src/overlay.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mreact devtools overlay", () => {
  test("mounts an inspector UI with reactive, query, and router tabs", () => {
    const devtools = createDevtools();
    devtools.resources().register({ kind: "effect", ownerId: "screen" });
    devtools.emit({
      id: "effect:1",
      package: "@reckona/mreact-reactive-core",
      subscribers: 2,
      type: "effect:run",
    });
    devtools.emit({
      key: ["user", "ada"],
      package: "@reckona/mreact-query",
      status: "success",
      type: "query:settled",
    });
    devtools.emit({
      durationMs: 12,
      package: "@reckona/mreact-router",
      routeId: "/users/[id]",
      type: "router:navigation",
    });

    const mounted = mountDevtoolsOverlay({ devtools });

    expect(document.querySelector("[data-mreact-devtools-overlay]")).toBe(mounted.element);
    expect(tabText()).toEqual(["Reactive 1", "Query 1", "Router 1"]);
    expect(mounted.element.textContent).toContain("effect:run");
    expect(mounted.element.textContent).toContain("Live resources (1)");
    expect(mounted.element.textContent).not.toContain("query:settled");

    clickTab("Query");
    expect(mounted.element.textContent).toContain("query:settled");
    expect(mounted.element.textContent).toContain('"status":"success"');
    expect(mounted.element.textContent).not.toContain("router:navigation");

    clickTab("Router");
    expect(mounted.element.textContent).toContain("router:navigation");
    expect(mounted.element.textContent).toContain('"routeId":"/users/[id]"');

    mounted.dispose();
    expect(document.querySelector("[data-mreact-devtools-overlay]")).toBeNull();
  });

  test("subscribes to new events and stops updating after dispose", async () => {
    const devtools = createDevtools();
    const mounted = mountDevtoolsOverlay({ devtools, maxEvents: 2 });

    devtools.emit({ package: "@reckona/mreact-query", type: "query:first" });
    devtools.emit({ package: "@reckona/mreact-query", type: "query:second" });
    devtools.emit({ package: "@reckona/mreact-query", type: "query:third" });
    await nextRenderBatch();
    clickTab("Query");

    expect(mounted.element.textContent).not.toContain("query:first");
    expect(mounted.element.textContent).toContain("query:second");
    expect(mounted.element.textContent).toContain("query:third");

    mounted.dispose();
    devtools.emit({ package: "@reckona/mreact-query", type: "query:ignored" });
    await nextRenderBatch();

    expect(mounted.element.textContent).not.toContain("query:ignored");
  });

  test("summarizes the latest query states above the raw event log", () => {
    const devtools = createDevtools();
    devtools.emit({
      isFetching: true,
      package: "@reckona/mreact-query",
      queryHash: '["profile"]',
      stale: false,
      status: "pending",
      type: "query:update",
    });
    devtools.emit({
      isFetching: false,
      package: "@reckona/mreact-query",
      queryHash: '["profile"]',
      stale: false,
      status: "success",
      type: "query:update",
    });

    const mounted = mountDevtoolsOverlay({ devtools });
    clickTab("Query");

    expect(mounted.element.textContent).toContain("Current queries");
    expect(mounted.element.textContent).toContain('["profile"]');
    expect(mounted.element.textContent).toContain("success");
    expect(mounted.element.textContent).not.toContain("pending | fetching");
  });

  test("caps large event details and survives cyclic details", () => {
    const devtools = createDevtools();
    const large = "x".repeat(20_000);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    devtools.emit({
      large,
      package: "@reckona/mreact-query",
      type: "query:large",
    });
    devtools.emit({
      cyclic,
      package: "@reckona/mreact-query",
      type: "query:cyclic",
    });

    const mounted = mountDevtoolsOverlay({ devtools });
    clickTab("Query");
    const details = Array.from(mounted.element.querySelectorAll("pre")).map(
      (item) => item.textContent ?? "",
    );

    const largeDetails = details.find((item) => item.includes("..."));
    const cyclicDetails = details.find((item) => item.includes("[unserializable]"));

    expect(largeDetails?.length).toBeLessThanOrEqual(4_200);
    expect(largeDetails).toBeDefined();
    expect(cyclicDetails).toBeDefined();
  });
});

function clickTab(label: string): void {
  const button = Array.from(document.querySelectorAll("button")).find((item) =>
    item.textContent?.startsWith(label),
  );
  button?.click();
}

function tabText(): string[] {
  return Array.from(document.querySelectorAll("button")).map((item) => item.textContent ?? "");
}

function nextRenderBatch(): Promise<void> {
  return Promise.resolve();
}
