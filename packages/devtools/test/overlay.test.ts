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
