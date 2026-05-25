import { describe, expect, it } from "vitest";
import { createInfiniteQuery, createQueryClient } from "../src/index.js";

interface TimelinePage {
  items: readonly string[];
  nextCursor?: number | undefined;
}

describe("createInfiniteQuery", () => {
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
});
