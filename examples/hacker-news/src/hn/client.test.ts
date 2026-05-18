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

  test("returns an http error for non-ok responses", async () => {
    const client = createHnClient({
      fetch: async () => jsonResponse({ error: "unavailable" }, { status: 503 }),
    });

    const result = await client.getItem(42);

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({ kind: "http", status: 503 });
  });

  test("loads displayable stories and skips deleted or null items", async () => {
    const responses = new Map<string, Response>([
      ["https://hacker-news.firebaseio.com/v0/topstories.json", jsonResponse([1, 2, 3, 4])],
      ["https://hacker-news.firebaseio.com/v0/item/1.json", jsonResponse({ id: 1, title: "Visible" })],
      ["https://hacker-news.firebaseio.com/v0/item/2.json", jsonResponse({ id: 2, deleted: true })],
      ["https://hacker-news.firebaseio.com/v0/item/3.json", jsonResponse(null)],
      ["https://hacker-news.firebaseio.com/v0/item/4.json", jsonResponse({ id: 4, title: "Also visible" })],
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
});
