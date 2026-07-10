// @vitest-environment happy-dom

import { afterEach, describe, expect, test, vi } from "vitest";
import { createQuery, createQueryClient } from "../src/index.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("query refetch interval", () => {
  test("refetches on an interval and stops after disposal", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const observer = createQuery(createQueryClient(), {
      autoFetch: false,
      queryFn: async () => ++calls,
      queryKey: ["poll"],
      refetchInterval: 100,
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(1);
    observer.dispose();
    await vi.advanceTimersByTimeAsync(300);
    expect(calls).toBe(1);
  });

  test("pauses interval polling while the document is hidden", async () => {
    vi.useFakeTimers();
    let calls = 0;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    const observer = createQuery(createQueryClient(), {
      autoFetch: false,
      queryFn: async () => ++calls,
      queryKey: ["hidden-poll"],
      refetchInterval: 100,
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(0);
    observer.dispose();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  test("can continue interval polling while the document is hidden", async () => {
    vi.useFakeTimers();
    let calls = 0;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    const observer = createQuery(createQueryClient(), {
      autoFetch: false,
      queryFn: async () => ++calls,
      queryKey: ["background-poll"],
      refetchInterval: 100,
      refetchIntervalInBackground: true,
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(1);
    observer.dispose();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });
});
