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

  test("resumes from hidden state on the next cadence without replaying missed ticks", async () => {
    vi.useFakeTimers();
    let calls = 0;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    const observer = createQuery(createQueryClient(), {
      autoFetch: false,
      queryFn: async () => ++calls,
      queryKey: ["hidden-resume"],
      refetchInterval: 100,
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBe(0);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await vi.advanceTimersByTimeAsync(99);
    expect(calls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(1);
    observer.dispose();
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

  test("uses each result-dependent cadence without retaining the previous delay", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const observer = createQuery(createQueryClient(), {
      autoFetch: false,
      queryFn: async () => ++calls,
      queryKey: ["variable-cadence"],
      refetchInterval: (result) => {
        if (result.status === "pending") return 50;
        return result.data === 1 ? 200 : false;
      },
    });

    await vi.advanceTimersByTimeAsync(50);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(199);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBe(2);
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

  test("does not evaluate result-dependent cadence after disposal", async () => {
    vi.useFakeTimers();
    let release!: (value: number) => void;
    const pending = new Promise<number>((resolve) => {
      release = resolve;
    });
    const cadence = vi.fn(() => 100);
    const observer = createQuery(createQueryClient(), {
      autoFetch: false,
      queryFn: () => pending,
      queryKey: ["disposed-cadence"],
      refetchInterval: cadence,
    });

    expect(cadence).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    observer.dispose();
    release(1);
    await Promise.resolve();
    await Promise.resolve();

    expect(cadence).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("does not evaluate result-dependent cadence after cleanup-scope disposal", async () => {
    vi.useFakeTimers();
    let release!: (value: number) => void;
    const pending = new Promise<number>((resolve) => {
      release = resolve;
    });
    const cadence = vi.fn(() => 100);
    const disposers: Array<() => void> = [];
    withCleanupScope((dispose) => disposers.push(dispose), () => {
      createQuery(createQueryClient(), {
        autoFetch: false,
        queryFn: () => pending,
        queryKey: ["scope-disposed-cadence"],
        refetchInterval: cadence,
      });
    });

    expect(cadence).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    disposers[0]?.();
    release(1);
    await Promise.resolve();
    await Promise.resolve();

    expect(cadence).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("deduplicates interval, focus, reconnect, and invalidation triggers", async () => {
    vi.useFakeTimers();
    let calls = 0;
    let release!: (value: number) => void;
    const pending = new Promise<number>((resolve) => {
      release = resolve;
    });
    const client = createQueryClient();
    const observer = createQuery(client, {
      autoFetch: false,
      queryFn: () => {
        calls += 1;
        return pending;
      },
      queryKey: ["trigger-race"],
      refetchInterval: 100,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    });

    await vi.advanceTimersByTimeAsync(100);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    client.invalidateQueries({ queryKey: ["trigger-race"] });
    await Promise.resolve();
    expect(calls).toBe(1);

    release(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
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

  test("deduplicates interval, focus, reconnect, and invalidation for infinite queries", async () => {
    vi.useFakeTimers();
    let calls = 0;
    let release!: (value: number) => void;
    const pending = new Promise<number>((resolve) => {
      release = resolve;
    });
    const client = createQueryClient();
    const observer = createInfiniteQuery(client, {
      autoFetch: false,
      getNextPageParam: () => undefined,
      initialPageParam: 0,
      queryFn: () => {
        calls += 1;
        return pending;
      },
      queryKey: ["infinite-trigger-race"],
      refetchInterval: 100,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    });

    await vi.advanceTimersByTimeAsync(100);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    client.invalidateQueries({ queryKey: ["infinite-trigger-race"] });
    await Promise.resolve();
    expect(calls).toBe(1);

    release(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
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
