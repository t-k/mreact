import { describe, expect, test } from "vitest";
import { withCleanupScope } from "@reckona/mreact-reactive-core/internal";
import { createInfiniteQuery, createQuery, createQueryClient } from "../src/index.js";

describe("query cleanup scope ownership", () => {
  test("disposes a query observer when its cleanup scope ends", () => {
    const disposers: Array<() => void> = [];
    const client = createQueryClient();
    let observer: ReturnType<typeof createQuery<number>> | undefined;

    withCleanupScope((dispose) => disposers.push(dispose), () => {
      observer = createQuery(client, {
        autoFetch: false,
        queryFn: async () => 1,
        queryKey: ["scoped"],
      });
    });

    expect(disposers).toHaveLength(1);
    disposers[0]?.();
    client.setQueryData(["scoped"], 2);

    expect(observer?.result.get().data).toBeUndefined();
  });

  test("disposes an infinite observer when its cleanup scope ends", () => {
    const disposers: Array<() => void> = [];
    const client = createQueryClient();
    let observer: ReturnType<typeof createInfiniteQuery<number, number>> | undefined;

    withCleanupScope((dispose) => disposers.push(dispose), () => {
      observer = createInfiniteQuery(client, {
        autoFetch: false,
        getNextPageParam: () => undefined,
        initialPageParam: 0,
        queryFn: async () => 1,
        queryKey: ["scoped-infinite"],
      });
    });

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
});
