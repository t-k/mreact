// @vitest-environment happy-dom

import { afterEach, describe, expect, test, vi } from "vitest";
import { withCleanupScope } from "@reckona/mreact-reactive-core/internal";
import {
  createCleanupScope,
  runDetached,
  runWithCleanupScope,
} from "@reckona/mreact-reactive-core";
import { createVirtualGrid } from "@reckona/mreact-virtual";
import { createInfiniteQuery, createQuery, createQueryClient } from "../src/index.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("query cleanup scope ownership", () => {
  test("keeps a detached query and grid controller live across render scope disposal", () => {
    const renderScope = createCleanupScope();
    const controllerScope = createCleanupScope();
    const client = createQueryClient();
    const { query, grid } = runWithCleanupScope(renderScope, () =>
      runDetached(() =>
        runWithCleanupScope(controllerScope, () => {
          const query = createInfiniteQuery<number[], number>(client, {
            autoFetch: false,
            getNextPageParam: () => undefined,
            initialPageParam: 0,
            queryFn: async () => [1],
            queryKey: ["detached-grid"],
          });
          const grid = createVirtualGrid({
            estimateItemSize: () => 20,
            getColumnCount: () => 2,
            getKey: (item: number) => item,
            items: () => query.result.get().pages.flat(),
            overscan: 0,
            scrollOffset: () => 0,
            viewportSize: () => 40,
          });
          return { query, grid };
        }),
      ),
    );
    expect(grid.entries.get()).toEqual([]);
    renderScope.dispose();
    client.setQueryData(["detached-grid"], { pageParams: [0], pages: [[1, 2, 3]] });
    expect(grid.entries.get().map((entry) => entry.key)).toEqual([1, 2, 3]);
    expect(query.result.get().pages).toEqual([[1, 2, 3]]);
    controllerScope.dispose();
    expect(() => grid.entries.get()).toThrow("disposed computed");
    client.setQueryData(["detached-grid"], { pageParams: [0], pages: [[4]] });
    expect(query.result.get().pages).toEqual([[1, 2, 3]]);
  });

  test("keeps a detached query observer subscribed until manual disposal", () => {
    const scope = createCleanupScope();
    const client = createQueryClient();
    const query = runWithCleanupScope(scope, () =>
      runDetached(() =>
        createQuery(client, {
          autoFetch: false,
          gcTime: 0,
          queryKey: ["detached-query"],
          queryFn: async () => 1,
        }),
      ),
    );
    scope.dispose();
    client.setQueryData(["detached-query"], 2);
    expect(query.result.get().data).toBe(2);
    query.dispose();
    client.setQueryData(["detached-query"], 3);
    expect(query.result.get().data).toBe(2);
  });

  test("disposes a query observer when its cleanup scope ends", () => {
    const disposers: Array<() => void> = [];
    const client = createQueryClient();
    let observer: ReturnType<typeof createQuery<number>> | undefined;

    withCleanupScope(
      (dispose) => disposers.push(dispose),
      () => {
        observer = createQuery(client, {
          autoFetch: false,
          queryFn: async () => 1,
          queryKey: ["scoped"],
        });
      },
    );

    expect(disposers).toHaveLength(1);
    disposers[0]?.();
    client.setQueryData(["scoped"], 2);

    expect(observer?.result.get().data).toBeUndefined();
  });

  test("disposes an infinite observer when its cleanup scope ends", () => {
    const disposers: Array<() => void> = [];
    const client = createQueryClient();
    let observer: ReturnType<typeof createInfiniteQuery<number, number>> | undefined;

    withCleanupScope(
      (dispose) => disposers.push(dispose),
      () => {
        observer = createInfiniteQuery(client, {
          autoFetch: false,
          getNextPageParam: () => undefined,
          initialPageParam: 0,
          queryFn: async () => 1,
          queryKey: ["scoped-infinite"],
        });
      },
    );

    disposers[0]?.();
    client.setQueryData(["scoped-infinite"], { pageParams: [0], pages: [2] });

    expect(observer?.result.get().pages).toEqual([]);
  });

  test("allows idempotent disposal outside a cleanup scope", () => {
    const client = createQueryClient();
    const observer = createQuery(client, {
      autoFetch: false,
      queryFn: async () => 1,
      queryKey: ["manual-dispose"],
    });

    observer.dispose();
    observer.dispose();
    client.setQueryData(["manual-dispose"], 2);

    expect(observer.result.get().data).toBeUndefined();
  });

  test.each(["manual", "scope"] as const)(
    "cancels browser revalidation queued before %s disposal",
    async (disposal) => {
      let calls = 0;
      const disposers: Array<() => void> = [];
      const create = () =>
        createQuery(createQueryClient(), {
          autoFetch: false,
          queryFn: async () => ++calls,
          queryKey: ["queued-focus-dispose", disposal],
          refetchOnWindowFocus: true,
        });
      const observer =
        disposal === "scope"
          ? withCleanupScope((dispose) => disposers.push(dispose), create)
          : create();

      window.dispatchEvent(new Event("focus"));
      if (disposal === "scope") disposers[0]?.();
      else observer.dispose();
      await Promise.resolve();

      expect(calls).toBe(0);
    },
  );

  test.each(["manual-first", "scope-first"] as const)(
    "disposes an infinite observer idempotently when order is %s",
    (order) => {
      const client = createQueryClient();
      const disposers: Array<() => void> = [];
      const observer = withCleanupScope(
        (dispose) => disposers.push(dispose),
        () =>
          createInfiniteQuery(client, {
            autoFetch: false,
            getNextPageParam: () => undefined,
            initialPageParam: 0,
            queryFn: async () => 1,
            queryKey: ["infinite-disposal-order", order],
          }),
      );

      if (order === "manual-first") {
        observer.dispose();
        disposers[0]?.();
      } else {
        disposers[0]?.();
        observer.dispose();
      }
      client.setQueryData(["infinite-disposal-order", order], {
        pageParams: [0],
        pages: [2],
      });

      expect(observer.result.get().pages).toEqual([]);
    },
  );

  test.each(["manual-first", "scope-first"] as const)(
    "starts gcTime once when disposal order is %s",
    async (order) => {
      vi.useFakeTimers();
      const client = createQueryClient();
      const disposers: Array<() => void> = [];
      const observer = withCleanupScope(
        (dispose) => disposers.push(dispose),
        () =>
          createQuery(client, {
            autoFetch: false,
            gcTime: 100,
            queryFn: async () => 1,
            queryKey: ["gc-disposal-order", order],
          }),
      );
      client.setQueryData(["gc-disposal-order", order], 1);

      if (order === "manual-first") {
        observer.dispose();
        disposers[0]?.();
      } else {
        disposers[0]?.();
        observer.dispose();
      }

      await vi.advanceTimersByTimeAsync(99);
      expect(client.getQueryData(["gc-disposal-order", order])).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(client.getQueryData(["gc-disposal-order", order])).toBeUndefined();
    },
  );

  test("keeps an outside-scope observer live until manual disposal", () => {
    const client = createQueryClient();
    const observer = createQuery(client, {
      autoFetch: false,
      queryFn: async () => 1,
      queryKey: ["outside-scope-live"],
    });

    client.setQueryData(["outside-scope-live"], 1);
    expect(observer.result.get().data).toBe(1);
    observer.dispose();
    client.setQueryData(["outside-scope-live"], 2);
    expect(observer.result.get().data).toBe(1);
  });
});
