import { describe, expect, test } from "vitest";
import { createHnClient } from "./client.js";

function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("HN API client", () => {
  test("loads top story ids and applies a limit", async () => {
    const client = createHnClient({
      fetch: async (url) => {
        expect(url).toBe("https://hacker-news.firebaseio.com/v0/topstories.json");
        return jsonResponse([3, 2, 1]);
      },
    });

    const result = await client.getStoryIds("top", 2);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([3, 2]);
  });

  test("loads an item by id", async () => {
    const client = createHnClient({
      fetch: async (url) => {
        expect(url).toBe("https://hacker-news.firebaseio.com/v0/item/42.json");
        return jsonResponse({ id: 42, title: "Story", type: "story" });
      },
    });

    const result = await client.getItem(42);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: 42, title: "Story", type: "story" });
  });

  test("logs API request duration and status", async () => {
    const events: unknown[] = [];
    const client = createHnClient({
      fetch: async () => jsonResponse({ id: 42, title: "Story", type: "story" }),
      logger(event) {
        events.push(event);
      },
      now: (() => {
        const values = [100, 137];
        return () => values.shift() ?? 137;
      })(),
    });

    const result = await client.getItem(42);

    expect(result.isOk()).toBe(true);
    expect(events).toEqual([
      {
        durationMs: 37,
        path: "/v0/item/42.json",
        status: 200,
        type: "hn:request:end",
      },
    ]);
  });

  test("returns an http error for non-ok responses", async () => {
    const client = createHnClient({
      fetch: async () => jsonResponse({ error: "unavailable" }, { status: 503 }),
    });

    const result = await client.getItem(42);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({ kind: "http", status: 503 });
  });

  test("returns invalid-json for invalid JSON responses", async () => {
    const client = createHnClient({
      fetch: async () => new Response("{", { headers: { "content-type": "application/json" } }),
    });

    const result = await client.getItem(42);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({ kind: "invalid-json" });
  });

  test("returns network for fetch failures", async () => {
    const client = createHnClient({
      fetch: async () => {
        throw new Error("connection reset");
      },
    });

    const result = await client.getItem(42);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      kind: "network",
      message: "connection reset",
    });
  });

  test("returns invalid-data for invalid item ids without calling fetch", async () => {
    let fetchCalls = 0;
    const client = createHnClient({
      fetch: async () => {
        fetchCalls += 1;
        return jsonResponse({ id: 1 });
      },
    });

    const result = await client.getItem(-1);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      kind: "invalid-data",
      message: "Expected item id to be a non-negative integer.",
      url: "https://hacker-news.firebaseio.com/v0/item/-1.json",
    });
    expect(fetchCalls).toBe(0);
  });

  test("returns invalid-data for invalid item data", async () => {
    const client = createHnClient({
      fetch: async () => jsonResponse({ id: 42, title: 123 }),
    });

    const result = await client.getItem(42);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({ kind: "invalid-data" });
  });

  test("loads displayable stories and skips deleted or null items", async () => {
    const responses = new Map<string, Response>([
      ["https://hacker-news.firebaseio.com/v0/topstories.json", jsonResponse([1, 2, 3, 4])],
      [
        "https://hacker-news.firebaseio.com/v0/item/1.json",
        jsonResponse({ id: 1, title: "Visible" }),
      ],
      ["https://hacker-news.firebaseio.com/v0/item/2.json", jsonResponse({ id: 2, deleted: true })],
      ["https://hacker-news.firebaseio.com/v0/item/3.json", jsonResponse(null)],
      [
        "https://hacker-news.firebaseio.com/v0/item/4.json",
        jsonResponse({ id: 4, title: "Also visible" }),
      ],
    ]);
    const client = createHnClient({
      fetch: async (url) => {
        const response = responses.get(String(url));
        if (response === undefined) return jsonResponse({ error: "missing" }, { status: 404 });

        return response;
      },
    });

    const result = await client.getStories("top", 10);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      { id: 1, title: "Visible" },
      { id: 4, title: "Also visible" },
    ]);
  });

  test("skips individual item HTTP errors when loading stories", async () => {
    const responses = new Map<string, Response>([
      ["https://hacker-news.firebaseio.com/v0/topstories.json", jsonResponse([1, 2, 3])],
      [
        "https://hacker-news.firebaseio.com/v0/item/1.json",
        jsonResponse({ id: 1, title: "Visible" }),
      ],
      [
        "https://hacker-news.firebaseio.com/v0/item/2.json",
        jsonResponse({ error: "missing" }, { status: 503 }),
      ],
      [
        "https://hacker-news.firebaseio.com/v0/item/3.json",
        jsonResponse({ id: 3, title: "Still visible" }),
      ],
    ]);
    const client = createHnClient({
      fetch: async (url) => {
        const response = responses.get(String(url));
        if (response === undefined) return jsonResponse({ error: "missing" }, { status: 404 });

        return response;
      },
    });

    const result = await client.getStories("top", 10);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      { id: 1, title: "Visible" },
      { id: 3, title: "Still visible" },
    ]);
  });

  test("loads displayable items for a provided story id batch", async () => {
    const responses = new Map<string, Response>([
      [
        "https://hacker-news.firebaseio.com/v0/item/10.json",
        jsonResponse({ id: 10, title: "First batch story" }),
      ],
      [
        "https://hacker-news.firebaseio.com/v0/item/11.json",
        jsonResponse({ id: 11, deleted: true }),
      ],
      [
        "https://hacker-news.firebaseio.com/v0/item/12.json",
        jsonResponse({ error: "missing" }, { status: 503 }),
      ],
      [
        "https://hacker-news.firebaseio.com/v0/item/13.json",
        jsonResponse({ id: 13, title: "Second batch story" }),
      ],
    ]);
    const client = createHnClient({
      fetch: async (url) => {
        const response = responses.get(String(url));
        if (response === undefined) return jsonResponse({ error: "missing" }, { status: 404 });

        return response;
      },
    });

    const result = await client.getItems([10, 11, 12, 13]);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      { id: 10, title: "First batch story" },
      { id: 13, title: "Second batch story" },
    ]);
  });

  test("loads a user by id", async () => {
    const client = createHnClient({
      fetch: async (url) => {
        expect(url).toBe("https://hacker-news.firebaseio.com/v0/user/ada.json");
        return jsonResponse({ id: "ada", karma: 100 });
      },
    });

    const result = await client.getUser("ada");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: "ada", karma: 100 });
  });

  test("encodes user ids in URLs", async () => {
    const client = createHnClient({
      fetch: async (url) => {
        expect(url).toBe("https://hacker-news.firebaseio.com/v0/user/ada%2Flovelace%3Fx%3D1.json");
        return jsonResponse({ id: "ada/lovelace?x=1" });
      },
    });

    const result = await client.getUser("ada/lovelace?x=1");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ id: "ada/lovelace?x=1" });
  });

  test("returns invalid-data for invalid user data", async () => {
    const client = createHnClient({
      fetch: async () => jsonResponse({ id: "ada", submitted: ["bad"] }),
    });

    const result = await client.getUser("ada");

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({ kind: "invalid-data" });
  });
});
