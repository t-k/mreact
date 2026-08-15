import { describe, expect, it } from "vitest";
import { createInfiniteQuery, createQueryClient } from "../src/index.js";

interface TimelinePage {
  items: readonly string[];
  nextCursor?: number | undefined;
}

describe("createInfiniteQuery", () => {
  it("does not advertise another page after the first page fails", async () => {
    const client = createQueryClient();
    let calls = 0;
    const query = createInfiniteQuery<TimelinePage, number>(client, {
      autoFetch: false,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: 0,
      queryKey: ["failing-first-page"],
      queryFn: async () => {
        calls += 1;
        throw new Error("endpoint failed");
      },
    });

    await expect(query.refetch()).rejects.toThrow("endpoint failed");

    expect(query.result.get()).toMatchObject({
      hasNextPage: false,
      status: "error",
    });
    expect(calls).toBe(1);
  });

  it("issues one network request for each explicit refetch", async () => {
    const client = createQueryClient();
    let calls = 0;
    const query = createInfiniteQuery<TimelinePage, number>(client, {
      autoFetch: true,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: 0,
      queryKey: ["single-infinite-refetch"],
      queryFn: async () => {
        calls += 1;
        return { items: [`story-${calls}`], nextCursor: undefined };
      },
    });

    await waitForTimer();
    expect(calls).toBe(1);

    await query.refetch();
    await waitForTimer();

    expect(calls).toBe(2);
    expect(query.result.get().pages).toEqual([
      { items: ["story-2"], nextCursor: undefined },
    ]);
  });

  it("runs a fresh first-page request when refetch overlaps an in-flight fetch", async () => {
    const client = createQueryClient();
    const releases: Array<(value: TimelinePage) => void> = [];
    let calls = 0;
    const query = createInfiniteQuery<TimelinePage, number>(client, {
      autoFetch: true,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: 0,
      queryKey: ["in-flight-infinite-refetch"],
      queryFn: () => {
        calls += 1;
        return new Promise<TimelinePage>((resolve) => releases.push(resolve));
      },
    });

    expect(calls).toBe(1);
    const refetch = query.refetch();
    releases[0]?.({ items: ["before-refetch"], nextCursor: undefined });
    await waitForMicrotasks();

    expect(calls).toBe(2);
    releases[1]?.({ items: ["after-refetch"], nextCursor: undefined });
    await expect(refetch).resolves.toMatchObject({
      pages: [{ items: ["after-refetch"], nextCursor: undefined }],
    });
    expect(client.getQueryEntry(["in-flight-infinite-refetch"])?.stale).toBe(false);
  });

  it("stores cursor pages and page params without caller-managed page state", async () => {
    const client = createQueryClient();
    const query = createInfiniteQuery<TimelinePage, number>(client, {
      autoFetch: false,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: 0,
      queryKey: ["timeline"],
      queryFn: async ({ pageParam }) => ({
        items: [`story-${pageParam}`],
        nextCursor: pageParam < 2 ? pageParam + 1 : undefined,
      }),
    });

    expect(query.result.get()).toMatchObject({
      hasNextPage: true,
      pages: [],
      pageParams: [],
      status: "pending",
    });

    await query.refetch();
    await query.fetchNextPage();

    expect(query.result.get()).toMatchObject({
      hasNextPage: true,
      pages: [
        { items: ["story-0"], nextCursor: 1 },
        { items: ["story-1"], nextCursor: 2 },
      ],
      pageParams: [0, 1],
      status: "success",
    });
    expect(client.getQueryData(["timeline"])).toEqual({
      pages: [
        { items: ["story-0"], nextCursor: 1 },
        { items: ["story-1"], nextCursor: 2 },
      ],
      pageParams: [0, 1],
    });
  });

  it("dedupes concurrent next-page fetches and appends the cursor once", async () => {
    const client = createQueryClient();
    let calls = 0;
    let releaseNextPage!: (value: TimelinePage) => void;
    const nextPage = new Promise<TimelinePage>((resolve) => {
      releaseNextPage = resolve;
    });
    const query = createInfiniteQuery<TimelinePage, number>(client, {
      autoFetch: false,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: 0,
      queryKey: ["deduped-timeline"],
      queryFn: ({ pageParam }) => {
        calls += 1;
        if (pageParam === 0) {
          return { items: ["story-0"], nextCursor: 1 };
        }
        return nextPage;
      },
    });

    await query.refetch();

    const first = query.fetchNextPage();
    const second = query.fetchNextPage();

    expect(query.result.get()).toMatchObject({
      isFetching: true,
      isFetchingNextPage: true,
    });
    expect(calls).toBe(2);

    releaseNextPage({ items: ["story-1"], nextCursor: undefined });
    await Promise.all([first, second]);

    expect(calls).toBe(2);
    expect(query.result.get()).toMatchObject({
      hasNextPage: false,
      pages: [
        { items: ["story-0"], nextCursor: 1 },
        { items: ["story-1"], nextCursor: undefined },
      ],
      pageParams: [0, 1],
    });
  });

  it("uses per-page cache entries only while a next-page fetch is in flight", async () => {
    const client = createQueryClient();
    const query = createInfiniteQuery<TimelinePage, number>(client, {
      autoFetch: false,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: 0,
      queryKey: ["retained-timeline"],
      queryFn: async ({ pageParam }) => ({
        items: [`story-${pageParam}`],
        nextCursor: pageParam < 4 ? pageParam + 1 : undefined,
      }),
    });

    await query.refetch();
    await query.fetchNextPage();
    await query.fetchNextPage();
    await query.fetchNextPage();
    await query.fetchNextPage();

    expect(query.result.get().pages.map((page) => page.items[0])).toEqual([
      "story-0",
      "story-1",
      "story-2",
      "story-3",
      "story-4",
    ]);
    expect(client.entries().map((entry) => entry.queryKey)).toEqual([["retained-timeline"]]);
  });

  it("surfaces a next-page failure without retaining its temporary cache entry", async () => {
    const client = createQueryClient();
    const pageError = new Error("next page failed");
    const query = createInfiniteQuery<TimelinePage, number>(client, {
      autoFetch: false,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: 0,
      queryKey: ["failed-next-page"],
      queryFn: async ({ pageParam }) => {
        if (pageParam === 0) {
          return { items: ["story-0"], nextCursor: 1 };
        }
        throw pageError;
      },
    });

    await query.refetch();
    await expect(query.fetchNextPage()).rejects.toBe(pageError);

    expect(query.result.get()).toMatchObject({
      error: pageError,
      errorReason: "unknown",
      hasNextPage: false,
      pages: [{ items: ["story-0"], nextCursor: 1 }],
      pageParams: [0],
      status: "error",
    });
    expect(client.entries().map((entry) => entry.queryKey)).toEqual([["failed-next-page"]]);
  });

  it("applies the configured retry policy to a next-page fetch", async () => {
    const client = createQueryClient();
    const retryAttempts: number[] = [];
    let nextPageCalls = 0;
    const query = createInfiniteQuery<TimelinePage, number>(client, {
      autoFetch: false,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: 0,
      queryKey: ["retried-next-page"],
      queryFn: async ({ pageParam }) => {
        if (pageParam === 0) {
          return { items: ["story-0"], nextCursor: 1 };
        }
        nextPageCalls += 1;
        if (nextPageCalls === 1) {
          throw new Error("transient failure");
        }
        return { items: ["story-1"], nextCursor: undefined };
      },
      retry: 1,
      retryDelay: (attempt) => {
        retryAttempts.push(attempt);
        return 0;
      },
    });

    await query.refetch();
    await query.fetchNextPage();

    expect(nextPageCalls).toBe(2);
    expect(retryAttempts).toEqual([1]);
    expect(query.result.get()).toMatchObject({
      error: undefined,
      hasNextPage: false,
      pages: [
        { items: ["story-0"], nextCursor: 1 },
        { items: ["story-1"], nextCursor: undefined },
      ],
      status: "success",
    });
    expect(client.entries().map((entry) => entry.queryKey)).toEqual([["retried-next-page"]]);
  });

  it("cleans stale per-page entries when the aggregate infinite query refetches", async () => {
    const client = createQueryClient();
    const query = createInfiniteQuery<TimelinePage, number>(client, {
      autoFetch: false,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: 0,
      queryKey: ["refetched-timeline"],
      queryFn: async ({ pageParam }) => ({
        items: [`story-${pageParam}`],
        nextCursor: pageParam < 2 ? pageParam + 1 : undefined,
      }),
    });

    await query.refetch();
    await query.fetchNextPage();
    client.setQueryData(["refetched-timeline", "__infinite_page", 99], {
      items: ["stale"],
      nextCursor: undefined,
    });

    await query.refetch();

    expect(query.result.get()).toMatchObject({
      pages: [{ items: ["story-0"], nextCursor: 1 }],
      pageParams: [0],
    });
    expect(client.entries().map((entry) => entry.queryKey)).toEqual([["refetched-timeline"]]);
  });
});

function waitForTimer(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function waitForMicrotasks(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}
