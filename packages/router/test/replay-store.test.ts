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
    const claim = store.claim("nonce-1");
    expect(claim.status).toBe("claimed");
    expect(store.claim("nonce-1")).toEqual({ status: "replay" });
  });

  test("starts the TTL when an in-flight claim is finalized", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T00:00:00Z"));
    const store = __readDefaultReplayStore();
    const claim = store.claim("nonce-ttl");
    expect(claim.status).toBe("claimed");

    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(store.claim("nonce-ttl")).toEqual({ status: "replay" });
    if (claim.status === "claimed") claim.finalize();

    vi.advanceTimersByTime(9 * 60 * 1000 + 59 * 1000);
    expect(store.claim("nonce-ttl")).toEqual({ status: "replay" });
    vi.advanceTimersByTime(2 * 1000);
    expect(store.claim("nonce-ttl").status).toBe("claimed");
  });

  test("fails closed at capacity without evicting active claims", () => {
    const store = __readDefaultReplayStore();
    for (let i = 0; i < 50_000; i += 1) {
      expect(store.claim(`flood-${i}`).status).toBe("claimed");
    }
    expect(store.claim("flood-next")).toEqual({ status: "capacity-exceeded" });
    expect(store.claim("flood-0")).toEqual({ status: "replay" });
    const sized = store as unknown as { size: () => number };
    expect(sized.size()).toBe(50_000);
  });

  test("reclaims expired completed entries before reporting capacity", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-06T00:00:00Z"));
    const store = __readDefaultReplayStore();

    for (let i = 0; i < 50_000; i += 1) {
      const claim = store.claim(`steady-${i}`);
      if (claim.status === "claimed") claim.finalize();
    }
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(store.claim("steady-next").status).toBe("claimed");
    expect(store.claim("steady-0").status).toBe("claimed");
  });
});
