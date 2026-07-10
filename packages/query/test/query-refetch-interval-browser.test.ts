// @vitest-environment happy-dom

import { afterEach, describe, expect, test, vi } from "vitest";
import { withCleanupScope } from "@reckona/mreact-reactive-core/internal";
import { createInfiniteQuery, createQuery, createQueryClient } from "../src/index.js";

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

  test("stops polling when a result-dependent interval resolves to false", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const observer = createQuery(createQueryClient(), {
      autoFetch: false,
      queryFn: async () => ++calls,
      queryKey: ["result-dependent-poll"],
      refetchInterval: (result) => (result.status === "success" ? false : 100),
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(300);

    expect(calls).toBe(1);
    observer.dispose();
  });

  test("does not overlap an in-flight interval request", async () => {
    vi.useFakeTimers();
    let calls = 0;
    let release!: (value: number) => void;
    const pending = new Promise<number>((resolve) => {
      release = resolve;
    });
    const observer = createQuery(createQueryClient(), {
      autoFetch: false,
      queryFn: () => {
        calls += 1;
        return pending;
      },
      queryKey: ["in-flight-poll"],
      refetchInterval: 100,
    });

    await vi.advanceTimersByTimeAsync(400);
    expect(calls).toBe(1);

    release(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(2);
    observer.dispose();
  });

  test("polls infinite queries through the same interval lifecycle", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const observer = createInfiniteQuery(createQueryClient(), {
      autoFetch: false,
      getNextPageParam: () => undefined,
      initialPageParam: 0,
      queryFn: async () => ++calls,
      queryKey: ["infinite-poll"],
      refetchInterval: 100,
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(calls).toBe(1);
    expect(observer.result.get().pages).toEqual([1]);
    observer.dispose();
  });

  test("stops interval polling when its cleanup scope is disposed", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const disposers: Array<() => void> = [];
    withCleanupScope((dispose) => disposers.push(dispose), () => {
      createQuery(createQueryClient(), {
        autoFetch: false,
        queryFn: async () => ++calls,
        queryKey: ["scoped-poll"],
        refetchInterval: 100,
      });
    });

    disposers[0]?.();
    await vi.advanceTimersByTimeAsync(300);

    expect(calls).toBe(0);
  });

  test("removes focus, visibility, and reconnect listeners with its cleanup scope", async () => {
    let calls = 0;
    const disposers: Array<() => void> = [];
    withCleanupScope((dispose) => disposers.push(dispose), () => {
      createQuery(createQueryClient(), {
        autoFetch: false,
        queryFn: async () => ++calls,
        queryKey: ["scoped-browser-revalidation"],
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
      });
    });

    disposers[0]?.();
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();

    expect(calls).toBe(0);
  });
});
