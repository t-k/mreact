import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  createFileSystemPrerenderStore,
  createKeyValuePrerenderStore,
  createMemoryPrerenderStore,
} from "../src/prerender-store.js";

describe("router prerender store adapters", () => {
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

  test("filesystem prerender store persists artifacts and serializes locks across instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mreact-prerender-store-"));
    const storeA = createFileSystemPrerenderStore({ directory, namespace: "tenant" });
    const storeB = createFileSystemPrerenderStore({ directory, namespace: "tenant" });
    const entry = {
      headers: { "cache-control": "public" },
      html: "<main>persisted</main>",
      status: 200,
    };
    const events: string[] = [];

    try {
      await storeA.set("/docs", entry);
      expect(await storeB.get("/docs")).toEqual(entry);

      await Promise.all([
        storeA.withLock?.("/docs", async () => {
          events.push("a:start");
          await new Promise((resolve) => setTimeout(resolve, 10));
          events.push("a:end");
        }),
        storeB.withLock?.("/docs", async () => {
          events.push("b:start");
          events.push("b:end");
        }),
      ]);

      await storeB.delete("/docs");
      expect(await storeA.get("/docs")).toBeUndefined();
      expect(events).toEqual(["a:start", "a:end", "b:start", "b:end"]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("key-value prerender store delegates TTL and fencing lock to adapter", async () => {
    const values = new Map<string, string>();
    const locks: string[] = [];
    const ttls: Array<number | undefined> = [];
    const store = createKeyValuePrerenderStore({
      namespace: "edge",
      ttlMs: 1_000,
      adapter: {
        delete: (key) => {
          values.delete(key);
        },
        get: (key) => values.get(key),
        set: (key, value, options) => {
          ttls.push(options?.ttlMs);
          values.set(key, value);
        },
        withLock: async (key, task) => {
          locks.push(key);
          return await task("token-1");
        },
      },
    });

    await store.set("/", { headers: {}, html: "<main>kv</main>", status: 200 });
    expect(Array.from(values.keys())).toEqual(["edge:/"]);
    expect(ttls).toEqual([1_000]);
    expect((await store.get("/"))?.html).toBe("<main>kv</main>");
    await store.withLock?.("/", async () => undefined);
    expect(locks).toEqual(["edge:/"]);
  });
});
