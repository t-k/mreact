// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
  createQuery,
  createQueryClient,
  syncQueryClientAcrossTabs,
} from "../src/index.js";

describe("cross-tab query sync", () => {
  it("broadcasts invalidations to another query client on the same channel", async () => {
    const channel = uniqueChannelName();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, { channel });
    const disposeSecond = syncQueryClientAcrossTabs(second, { channel });

    try {
      second.setQueryData(["profile"], { name: "cached" });

      first.invalidateQueries({ queryKey: ["profile"] });

      await waitFor(() => second.getQueryEntry(["profile"])?.stale === true);
      expect(second.getQueryEntry(["profile"])?.stale).toBe(true);
    } finally {
      disposeFirst();
      disposeSecond();
    }
  });

  it("shares successful query data when data broadcasting is explicitly enabled", async () => {
    const channel = uniqueChannelName();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, {
      broadcastQueryData: true,
      channel,
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      broadcastQueryData: true,
      channel,
    });
    const observer = createQuery(second, {
      autoFetch: false,
      queryKey: ["profile"],
      queryFn: async () => ({ name: "unused" }),
    });

    try {
      first.setQueryData(["profile"], { name: "Ada" });

      await waitFor(() => second.getQueryData<{ name: string }>(["profile"])?.name === "Ada");
      expect(observer.result.get()).toMatchObject({
        data: { name: "Ada" },
        status: "success",
      });
    } finally {
      observer.dispose();
      disposeFirst();
      disposeSecond();
    }
  });

  it("does not broadcast query data by default", async () => {
    const channel = uniqueChannelName();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, { channel });
    const disposeSecond = syncQueryClientAcrossTabs(second, { channel });

    try {
      first.setQueryData(["private-profile"], { name: "Grace" });
      await delay(20);

      expect(second.getQueryData(["private-profile"])).toBeUndefined();
    } finally {
      disposeFirst();
      disposeSecond();
    }
  });

  it("uses Web Locks and BroadcastChannel handoff to avoid duplicate cross-tab fetches", async () => {
    const channel = uniqueChannelName();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, {
      channel,
      singleFlight: true,
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      channel,
      singleFlight: true,
    });
    let calls = 0;
    const queryKey = ["notifications"];

    try {
      const [firstResult, secondResult] = await Promise.all([
        first.fetchQuery({
          queryKey,
          queryFn: async () => {
            calls += 1;
            await delay(20);
            return { unread: 3 };
          },
        }),
        second.fetchQuery({
          queryKey,
          queryFn: async () => {
            calls += 1;
            return { unread: 99 };
          },
        }),
      ]);

      expect(firstResult).toEqual({ unread: 3 });
      expect(secondResult).toEqual({ unread: 3 });
      expect(second.getQueryData(queryKey)).toEqual({ unread: 3 });
      expect(calls).toBe(1);
    } finally {
      disposeFirst();
      disposeSecond();
    }
  });

  it("single-flights focus revalidation and shares the successful data", async () => {
    const channel = uniqueChannelName();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, {
      channel,
      singleFlight: true,
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      channel,
      singleFlight: true,
    });
    let calls = 0;
    const queryKey = ["focused-profile"];
    const firstObserver = createQuery(first, {
      autoFetch: false,
      queryKey,
      refetchOnWindowFocus: true,
      staleTime: Number.POSITIVE_INFINITY,
      queryFn: async () => {
        calls += 1;
        await delay(20);
        return { name: "fresh-from-focus" };
      },
    });
    const secondObserver = createQuery(second, {
      autoFetch: false,
      queryKey,
      refetchOnWindowFocus: true,
      staleTime: Number.POSITIVE_INFINITY,
      queryFn: async () => {
        calls += 1;
        return { name: "unused-follower-focus" };
      },
    });

    try {
      first.setQueryData(queryKey, { name: "cached-first" });
      second.setQueryData(queryKey, { name: "cached-second" });

      window.dispatchEvent(new Event("focus"));

      await waitFor(() =>
        firstObserver.result.get().data?.name === "fresh-from-focus" &&
        secondObserver.result.get().data?.name === "fresh-from-focus"
      );
      expect(firstObserver.result.get().data).toEqual({ name: "fresh-from-focus" });
      expect(secondObserver.result.get().data).toEqual({ name: "fresh-from-focus" });
      expect(calls).toBe(1);
    } finally {
      firstObserver.dispose();
      secondObserver.dispose();
      disposeFirst();
      disposeSecond();
    }
  });

  it("single-flights reconnect revalidation and shares the successful data", async () => {
    const channel = uniqueChannelName();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, {
      channel,
      singleFlight: true,
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      channel,
      singleFlight: true,
    });
    let calls = 0;
    const queryKey = ["reconnected-notifications"];
    const firstObserver = createQuery(first, {
      autoFetch: false,
      queryKey,
      refetchOnReconnect: true,
      staleTime: Number.POSITIVE_INFINITY,
      queryFn: async () => {
        calls += 1;
        await delay(20);
        return { unread: 7 };
      },
    });
    const secondObserver = createQuery(second, {
      autoFetch: false,
      queryKey,
      refetchOnReconnect: true,
      staleTime: Number.POSITIVE_INFINITY,
      queryFn: async () => {
        calls += 1;
        return { unread: 99 };
      },
    });

    try {
      first.setQueryData(queryKey, { unread: 0 });
      second.setQueryData(queryKey, { unread: 1 });

      window.dispatchEvent(new Event("online"));

      await waitFor(() =>
        firstObserver.result.get().data?.unread === 7 &&
        secondObserver.result.get().data?.unread === 7
      );
      expect(firstObserver.result.get().data).toEqual({ unread: 7 });
      expect(secondObserver.result.get().data).toEqual({ unread: 7 });
      expect(calls).toBe(1);
    } finally {
      firstObserver.dispose();
      secondObserver.dispose();
      disposeFirst();
      disposeSecond();
    }
  });
});

function uniqueChannelName(): string {
  return `mreact-query-test-${Date.now()}-${Math.random()}`;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await delay(5);
  }

  expect(predicate()).toBe(true);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
