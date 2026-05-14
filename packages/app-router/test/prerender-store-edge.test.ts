import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { BuiltPrerenderedRoute } from "../src/build.js";
import {
  createFileSystemPrerenderStore,
  createKeyValuePrerenderStore,
  createMemoryPrerenderStore,
} from "../src/prerender-store.js";

const entry = (suffix = ""): BuiltPrerenderedRoute => ({
  body: `<p>${suffix}</p>`,
  contentType: "text/html",
  status: 200,
} as unknown as BuiltPrerenderedRoute);

describe("prerender-store edge branches", () => {
  test("memory store evicts the least-recently-accessed entry when maxEntries is reached", () => {
    let virtualNow = 0;
    const store = createMemoryPrerenderStore({
      maxEntries: 2,
      now: () => (virtualNow += 1),
    });

    store.set("/a", entry("a"));
    store.set("/b", entry("b"));
    void store.get("/a");
    store.set("/c", entry("c"));

    // /b was least recently accessed -> evicted.
    expect(store.get("/a")).toBeDefined();
    expect(store.get("/b")).toBeUndefined();
    expect(store.get("/c")).toBeDefined();
  });

  test("memory store expires entries based on ttlMs", () => {
    let virtualNow = 0;
    const store = createMemoryPrerenderStore({
      ttlMs: 10,
      now: () => virtualNow,
    });
    store.set("/x", entry("x"));
    virtualNow = 5;
    expect(store.get("/x")).toBeDefined();
    virtualNow = 200;
    expect(store.get("/x")).toBeUndefined();
  });

  test("memory store delete removes the entry", () => {
    const store = createMemoryPrerenderStore();
    store.set("/x", entry("x"));
    expect(store.get("/x")).toBeDefined();
    store.delete("/x");
    expect(store.get("/x")).toBeUndefined();
  });

  test("memory store withLock serializes overlapping tasks per path", async () => {
    const store = createMemoryPrerenderStore();
    const events: string[] = [];

    const taskA = store.withLock!("/x", async () => {
      events.push("A:start");
      await new Promise((r) => setTimeout(r, 5));
      events.push("A:end");
      return "A";
    });
    const taskB = store.withLock!("/x", async () => {
      events.push("B:start");
      events.push("B:end");
      return "B";
    });

    await Promise.all([taskA, taskB]);
    expect(events).toEqual(["A:start", "A:end", "B:start", "B:end"]);
  });

  test("file system store returns undefined for a missing entry", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mreact-fs-store-"));
    try {
      const store = createFileSystemPrerenderStore({ directory });
      expect(await store.get("/missing")).toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("file system store delete is a no-op when the file is absent (does not throw)", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mreact-fs-store-del-"));
    try {
      const store = createFileSystemPrerenderStore({ directory });
      await expect(store.delete("/never-existed")).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("file system store round-trips a written entry", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mreact-fs-store-rt-"));
    try {
      const store = createFileSystemPrerenderStore({ directory });
      await store.set("/page", entry("x"));
      expect(await store.get("/page")).toMatchObject({ body: "<p>x</p>" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("kv store falls back to a plain task call when the adapter has no withLock", async () => {
    const data = new Map<string, string>();
    const store = createKeyValuePrerenderStore({
      adapter: {
        delete: (key) => {
          data.delete(key);
        },
        get: (key) => data.get(key),
        set: (key, value) => {
          data.set(key, value);
        },
      },
    });
    expect(store.withLock).toBeUndefined();
    await store.set("/k", entry("k"));
    expect(await store.get("/k")).toMatchObject({ body: "<p>k</p>" });
  });

  test("kv store delegates to the adapter's withLock when provided", async () => {
    const data = new Map<string, string>();
    const witnesses: string[] = [];
    const store = createKeyValuePrerenderStore({
      adapter: {
        delete: (key) => {
          data.delete(key);
        },
        get: (key) => data.get(key),
        set: (key, value) => {
          data.set(key, value);
        },
        async withLock(key, task) {
          witnesses.push(`lock:${key}`);
          return task("token");
        },
      },
    });
    expect(store.withLock).toBeTypeOf("function");
    await store.withLock!("/x", async () => "ok");
    expect(witnesses).toContain("lock:default:/x");
  });
});
