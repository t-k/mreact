import { describe, expect, test } from "vitest";
import {
  __clearDefaultReplayStore,
  __readDefaultReplayStore,
  serverActionCookie,
} from "../src/actions.js";

describe("app-router actions helpers", () => {
  test("serverActionCookie emits the documented HttpOnly + SameSite=Lax shape", () => {
    const cookie = serverActionCookie(
      "deadbeef-dead-beef-dead-beefdeadbeef",
    );
    expect(cookie).toContain("=deadbeef-dead-beef-dead-beefdeadbeef");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("HttpOnly");
  });

  test("serverActionCookie url-encodes the token bytes", () => {
    const cookie = serverActionCookie("a+b/c");
    expect(cookie).toContain("=a%2Bb%2Fc");
  });

  test("__readDefaultReplayStore returns the bounded store and __clearDefaultReplayStore empties it", () => {
    const store = __readDefaultReplayStore();
    expect(store).toBeDefined();
    expect(typeof store.has).toBe("function");
    expect(typeof store.add).toBe("function");

    __clearDefaultReplayStore();
    expect(store.has("anything")).toBe(false);
  });

  test("__readDefaultReplayStore.has lazily evicts an entry whose TTL has elapsed", async () => {
    __clearDefaultReplayStore();
    const store = __readDefaultReplayStore();
    // The default TTL is 10 minutes; we cannot wait that long, so simulate
    // an expired entry by reaching into the internal map.
    const internal = store as unknown as { entries: Map<string, number> };
    internal.entries.set("expired-nonce", Date.now() - 1);
    expect(store.has("expired-nonce")).toBe(false);
    // After has(), the expired entry is purged.
    expect(internal.entries.has("expired-nonce")).toBe(false);
  });

  test("__readDefaultReplayStore.has returns true for an unexpired entry", () => {
    __clearDefaultReplayStore();
    const store = __readDefaultReplayStore();
    store.add("live-nonce");
    expect(store.has("live-nonce")).toBe(true);
  });
});
