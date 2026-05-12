import { describe, expect, test } from "vitest";
import { createMemoryPrerenderStore } from "../src/prerender-store.js";

describe("app-router prerender store adapters", () => {
  test("memory prerender store applies ttl, lru limit, namespace isolation, and lock serialization", async () => {
    let now = 1_000;
    const backing = new Map();
    const storeA = createMemoryPrerenderStore({
      backing,
      maxEntries: 1,
      namespace: "tenant-a",
      now: () => now,
      ttlMs: 50,
    });
    const storeB = createMemoryPrerenderStore({
      backing,
      namespace: "tenant-b",
      now: () => now,
      ttlMs: 50,
    });
    const route = {
      headers: { "content-type": "text/html" },
      html: "<main>A</main>",
      status: 200,
    };

    await storeA.set("/", route);
    expect(await storeA.get("/")).toEqual(route);
    expect(await storeB.get("/")).toBeUndefined();

    await storeA.set("/about", {
      headers: {},
      html: "<main>About</main>",
      status: 200,
    });
    expect(await storeA.get("/")).toBeUndefined();

    now += 60;
    expect(await storeA.get("/about")).toBeUndefined();

    const events: string[] = [];
    await Promise.all([
      storeA.withLock?.("/locked", async () => {
        events.push("a:start");
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push("a:end");
      }),
      storeA.withLock?.("/locked", async () => {
        events.push("b:start");
        events.push("b:end");
      }),
    ]);

    expect(events).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });
});
