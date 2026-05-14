import { afterEach, describe, expect, test, vi } from "vitest";
import {
  __clearDefaultReplayStore,
  __readDefaultReplayStore,
} from "../src/actions.js";

afterEach(() => {
  __clearDefaultReplayStore();
  vi.useRealTimers();
});

describe("BoundedReplayStore (Issue 069)", () => {
  test("blocks replay of the same nonce", () => {
    const store = __readDefaultReplayStore();
    expect(store.has("nonce-1")).toBe(false);
    store.add("nonce-1");
    expect(store.has("nonce-1")).toBe(true);
  });

  test("forgets entries after TTL expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T00:00:00Z"));
    const store = __readDefaultReplayStore();
    store.add("nonce-ttl");
    expect(store.has("nonce-ttl")).toBe(true);

    // Just before TTL: still seen.
    vi.advanceTimersByTime(9 * 60 * 1000 + 59 * 1000);
    expect(store.has("nonce-ttl")).toBe(true);

    // After TTL: forgotten.
    vi.advanceTimersByTime(2 * 1000);
    expect(store.has("nonce-ttl")).toBe(false);
  });

  test("evicts old entries when max size is reached", () => {
    const store = __readDefaultReplayStore();
    // Fill the store deliberately past the FIFO line; we don't depend on
    // the exact size, only on the bound being enforced.
    for (let i = 0; i < 50_010; i += 1) {
      store.add(`flood-${i}`);
    }
    // Oldest entries must have been evicted.
    expect(store.has("flood-0")).toBe(false);
    expect(store.has("flood-50009")).toBe(true);
    // Total size is capped at the configured max.
    const sized = store as unknown as { size: () => number };
    expect(sized.size()).toBeLessThanOrEqual(50_000);
  });
});
