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

    vi.advanceTimersByTime(9 * 60 * 1000);
    expect(store.claim("nonce-ttl")).toEqual({ status: "replay" });
    if (claim.status === "claimed") claim.finalize();

    vi.advanceTimersByTime(9 * 60 * 1000 + 59 * 1000);
    expect(store.claim("nonce-ttl")).toEqual({ status: "replay" });
    vi.advanceTimersByTime(2 * 1000);
    expect(store.claim("nonce-ttl").status).toBe("claimed");
  });

  test("fails closed at capacity without evicting unexpired active claims", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = __readDefaultReplayStore();
    for (let i = 0; i < 50_000; i += 1) {
      expect(store.claim(`flood-${i}`).status).toBe("claimed");
    }
    expect(store.claim("flood-next")).toEqual({ status: "capacity-exceeded" });
    expect(store.claim("flood-0")).toEqual({ status: "replay" });
    const sized = store as unknown as { size: () => number };
    expect(sized.size()).toBe(50_000);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/replay store.*size=50000.*maxEntries=50000/i),
    );
    error.mockRestore();
  });

  test("evicts the oldest completed claim instead of rejecting sustained traffic", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = __readDefaultReplayStore();

    for (let i = 0; i < 50_001; i += 1) {
      const claim = store.claim(`completed-${i}`);
      expect(claim.status).toBe("claimed");
      if (claim.status === "claimed") claim.finalize();
    }

    expect(store.size()).toBe(50_000);
    expect(error).toHaveBeenCalledTimes(1);
    expect(store.claim("completed-0").status).toBe("claimed");
    error.mockRestore();
  });

  test("reclaims an abandoned in-flight claim after its bounded lease", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00Z"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = __readDefaultReplayStore();
    const abandoned = store.claim("abandoned");

    expect(abandoned.status).toBe("claimed");
    vi.advanceTimersByTime(10 * 60 * 1000 - 1);
    expect(store.claim("abandoned")).toEqual({ status: "replay" });
    vi.advanceTimersByTime(2);

    const replacement = store.claim("abandoned");
    expect(replacement.status).toBe("claimed");
    if (abandoned.status === "claimed") abandoned.finalize();
    expect(store.claim("abandoned")).toEqual({ status: "replay" });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/leaseMs=600000/));
    error.mockRestore();
  });

  test("reclaims expired in-flight slots while keeping memory bounded", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00Z"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = __readDefaultReplayStore();
    for (let i = 0; i < 50_000; i += 1) {
      expect(store.claim(`abandoned-${i}`).status).toBe("claimed");
    }

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(store.claim("after-abandoned").status).toBe("claimed");
    expect(store.size()).toBeLessThanOrEqual(50_000);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
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
