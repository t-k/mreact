// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createQuery,
  createQueryClient,
  hashQueryKey,
  syncQueryClientAcrossTabs,
} from "../src/index.js";

describe("cross-tab query sync", () => {
  const originalLocksDescriptor = Object.getOwnPropertyDescriptor(navigator, "locks");

  afterEach(() => {
    if (originalLocksDescriptor === undefined) {
      delete (navigator as { locks?: unknown }).locks;
    } else {
      Object.defineProperty(navigator, "locks", originalLocksDescriptor);
    }
  });

  it("broadcasts invalidations to another query client on the same channel", async () => {
    const channel = uniqueChannelName();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
    });

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

  it("broadcasts removals to another query client on the same channel", async () => {
    const channel = uniqueChannelName();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
    });

    try {
      second.setQueryData(["profile"], { name: "cached" });

      first.removeQueries({ queryKey: ["profile"] });

      await waitFor(() => second.getQueryData(["profile"]) === undefined);
      expect(second.getQueryData(["profile"])).toBeUndefined();
    } finally {
      disposeFirst();
      disposeSecond();
    }
  });

  it("does not broadcast invalidations when invalidation broadcasting is disabled", async () => {
    const channel = uniqueChannelName();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, {
      broadcastInvalidations: false,
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
    });

    try {
      second.setQueryData(["profile"], { name: "cached" });

      first.invalidateQueries({ queryKey: ["profile"] });
      await delay(20);

      expect(second.getQueryEntry(["profile"])?.stale).toBe(false);
    } finally {
      disposeFirst();
      disposeSecond();
    }
  });

  it("does not broadcast removals when removal broadcasting is disabled", async () => {
    const channel = uniqueChannelName();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, {
      broadcastRemovals: false,
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
    });

    try {
      second.setQueryData(["profile"], { name: "cached" });

      first.removeQueries({ queryKey: ["profile"] });
      await delay(20);

      expect(second.getQueryData(["profile"])).toEqual({ name: "cached" });
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
      includeQuery: (queryKey) => queryKey[0] === "profile",
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      broadcastQueryData: true,
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
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

  it("does not cancel an in-flight local fetch when remote success data arrives", async () => {
    const channel = uniqueChannelName();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, {
      broadcastQueryData: true,
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      broadcastQueryData: true,
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
    });
    let resolveLocalFetch: ((data: { name: string }) => void) | undefined;
    let localSignal: AbortSignal | undefined;

    try {
      const localFetch = second.fetchQuery({
        queryKey: ["profile"],
        queryFn: ({ signal }) => {
          localSignal = signal;
          return new Promise<{ name: string }>((resolve, reject) => {
            resolveLocalFetch = resolve;
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        },
      });

      await waitFor(() => localSignal !== undefined);
      first.setQueryData(["profile"], { name: "remote" });
      await delay(20);

      expect(localSignal?.aborted).toBe(false);
      resolveLocalFetch?.({ name: "local" });
      await expect(localFetch).resolves.toEqual({ name: "local" });
      expect(second.getQueryData(["profile"])).toEqual({ name: "local" });
    } finally {
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

  it("does not broadcast invalidations without an explicit query allowlist", async () => {
    const channel = uniqueChannelName();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, { channel });
    const disposeSecond = syncQueryClientAcrossTabs(second, { channel });

    try {
      second.setQueryData(["profile"], { name: "cached" });

      first.invalidateQueries({ queryKey: ["profile"] });
      await delay(20);

      expect(second.getQueryEntry(["profile"])?.stale).toBe(false);
    } finally {
      disposeFirst();
      disposeSecond();
    }
  });

  it("does not broadcast query data without an explicit query allowlist", async () => {
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

    try {
      first.setQueryData(["private-profile"], { token: "request-a" });
      await delay(20);

      expect(second.getQueryData(["private-profile"])).toBeUndefined();
    } finally {
      disposeFirst();
      disposeSecond();
    }
  });

  it("does not broadcast query data on the default channel", async () => {
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, {
      broadcastQueryData: true,
      includeQuery: (queryKey) => queryKey[0] === "private-profile",
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      broadcastQueryData: true,
      includeQuery: (queryKey) => queryKey[0] === "private-profile",
    });

    try {
      first.setQueryData(["private-profile"], { token: "request-a" });
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
      includeQuery: (queryKey) => queryKey[0] === "notifications",
      singleFlight: true,
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "notifications",
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

  it("does not single-flight or hand off data without an explicit query allowlist", async () => {
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
    const queryKey = ["unsafe-single-flight"];

    try {
      const [firstResult, secondResult] = await Promise.all([
        first.fetchQuery({
          queryKey,
          queryFn: async () => {
            calls += 1;
            await delay(10);
            return { source: "first" };
          },
        }),
        second.fetchQuery({
          queryKey,
          queryFn: async () => {
            calls += 1;
            return { source: "second" };
          },
        }),
      ]);

      expect(firstResult).toEqual({ source: "first" });
      expect(secondResult).toEqual({ source: "second" });
      expect(calls).toBe(2);
    } finally {
      disposeFirst();
      disposeSecond();
    }
  });

  it("does not broadcast single-flight success data when Web Locks are unavailable", async () => {
    const channel = uniqueChannelName();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
      singleFlight: true,
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
      singleFlight: true,
    });

    try {
      await first.fetchQuery({
        queryKey: ["profile"],
        queryFn: async () => ({ name: "local-only" }),
      });
      await delay(20);

      expect(second.getQueryData(["profile"])).toBeUndefined();
    } finally {
      disposeFirst();
      disposeSecond();
    }
  });

  it("restores the original client methods when multiple installs are disposed out of order", () => {
    const channel = uniqueChannelName();
    const client = createQueryClient();
    const originalFetchQuery = client.fetchQuery;
    const originalSetQueryData = client.setQueryData;
    const originalInvalidateQueries = client.invalidateQueries;
    const originalRemoveQueries = client.removeQueries;
    const disposeFirst = syncQueryClientAcrossTabs(client, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
    });
    const disposeSecond = syncQueryClientAcrossTabs(client, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
    });

    disposeFirst();
    disposeSecond();

    expect(client.fetchQuery).toBe(originalFetchQuery);
    expect(client.setQueryData).toBe(originalSetQueryData);
    expect(client.invalidateQueries).toBe(originalInvalidateQueries);
    expect(client.removeQueries).toBe(originalRemoveQueries);
  });

  it("clears single-flight handoff timers when disposed", async () => {
    vi.useFakeTimers();
    installUnavailableLockManager();
    const channel = uniqueChannelName();
    const client = createQueryClient();
    const dispose = syncQueryClientAcrossTabs(client, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "profile",
      singleFlight: true,
      singleFlightHandoffTimeoutMs: 60_000,
    });

    try {
      const pendingFetch = client.fetchQuery({
        queryKey: ["profile"],
        queryFn: async () => ({ name: "unused" }),
      });

      expect(vi.getTimerCount()).toBe(1);
      dispose();
      expect(vi.getTimerCount()).toBe(0);
      await expect(pendingFetch).rejects.toThrow("Cross-tab query sync disposed.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not broadcast keyless invalidations across an includeQuery boundary", async () => {
    const channel = uniqueChannelName();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "allowed",
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "allowed",
    });

    try {
      second.setQueryData(["allowed"], { value: "allowed" });
      second.setQueryData(["private"], { value: "private" });

      first.invalidateQueries();
      await delay(20);

      expect(second.getQueryEntry(["allowed"])?.stale).toBe(false);
      expect(second.getQueryEntry(["private"])?.stale).toBe(false);
    } finally {
      disposeFirst();
      disposeSecond();
    }
  });

  it("does not broadcast keyless removals across an includeQuery boundary", async () => {
    const channel = uniqueChannelName();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "allowed",
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "allowed",
    });

    try {
      second.setQueryData(["allowed"], { value: "allowed" });
      second.setQueryData(["private"], { value: "private" });

      first.removeQueries();
      await delay(20);

      expect(second.getQueryData(["allowed"])).toEqual({ value: "allowed" });
      expect(second.getQueryData(["private"])).toEqual({ value: "private" });
    } finally {
      disposeFirst();
      disposeSecond();
    }
  });

  it("registers the handoff waiter before trying the Web Lock", async () => {
    const firstApi = await import("../src/index.js?fast-leader-a") as typeof import("../src/index.js");
    const secondApi = await import("../src/index.js?fast-leader-b") as typeof import("../src/index.js");
    const channel = uniqueChannelName();
    const first = firstApi.createQueryClient();
    const second = secondApi.createQueryClient();
    installRetainedLockManager();
    const disposeFirst = firstApi.syncQueryClientAcrossTabs(first, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "race",
      singleFlight: true,
      singleFlightHandoffTimeoutMs: 50,
    });
    const disposeSecond = secondApi.syncQueryClientAcrossTabs(second, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "race",
      singleFlight: true,
      singleFlightHandoffTimeoutMs: 50,
    });
    let calls = 0;
    const queryKey = ["race"];

    try {
      const firstResultPromise = first.fetchQuery({
        queryKey,
        queryFn: async () => {
          calls += 1;
          return { source: "leader" };
        },
      });
      await firstResultPromise;

      const secondResult = await second.fetchQuery({
        queryKey,
        queryFn: async () => {
          calls += 1;
          return { source: "follower" };
        },
      });

      expect(secondResult).toEqual({ source: "leader" });
      expect(calls).toBe(1);
    } finally {
      disposeFirst();
      disposeSecond();
    }
  });

  it("uses separate Web Locks for separate channels with the same query key", async () => {
    const locks = installNamedLockManager();
    const first = createQueryClient();
    const second = createQueryClient();
    const disposeFirst = syncQueryClientAcrossTabs(first, {
      channel: `${uniqueChannelName()}:a`,
      includeQuery: (queryKey) => queryKey[0] === "shared-key",
      singleFlight: true,
      singleFlightHandoffTimeoutMs: 120,
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      channel: `${uniqueChannelName()}:b`,
      includeQuery: (queryKey) => queryKey[0] === "shared-key",
      singleFlight: true,
      singleFlightHandoffTimeoutMs: 120,
    });
    let calls = 0;
    const queryKey = ["shared-key"];

    try {
      const [firstResult, secondResult] = await Promise.all([
        first.fetchQuery({
          queryKey,
          queryFn: async () => {
            calls += 1;
            await delay(20);
            return { channel: "a" };
          },
        }),
        second.fetchQuery({
          queryKey,
          queryFn: async () => {
            calls += 1;
            return { channel: "b" };
          },
        }),
      ]);

      expect(firstResult).toEqual({ channel: "a" });
      expect(secondResult).toEqual({ channel: "b" });
      expect(calls).toBe(2);
      expect(locks.blockedRequests()).toBe(0);
    } finally {
      disposeFirst();
      disposeSecond();
    }
  });

  it("ignores success messages whose query hash does not match the query key", async () => {
    const firstApi = await import("../src/index.js?hash-mismatch-a") as typeof import("../src/index.js");
    const secondApi = await import("../src/index.js?hash-mismatch-b") as typeof import("../src/index.js");
    const channel = uniqueChannelName();
    const first = firstApi.createQueryClient();
    const second = secondApi.createQueryClient();
    installRetainedLockManager();
    const includeWaitingOrAllowed = (queryKey: readonly unknown[]) =>
      queryKey[0] === "waiting" || queryKey[0] === "allowed";
    const disposeFirst = firstApi.syncQueryClientAcrossTabs(first, {
      channel,
      includeQuery: includeWaitingOrAllowed,
      singleFlight: true,
      singleFlightHandoffTimeoutMs: 50,
    });
    const disposeSecond = secondApi.syncQueryClientAcrossTabs(second, {
      channel,
      includeQuery: includeWaitingOrAllowed,
      singleFlight: true,
      singleFlightHandoffTimeoutMs: 50,
    });
    let calls = 0;

    try {
      const leaderFetch = first.fetchQuery({
        queryKey: ["waiting"],
        queryFn: async () => {
          calls += 1;
          await delay(20);
          return { source: "leader" };
        },
      });
      await delay(0);
      const fetchResult = second.fetchQuery({
        queryKey: ["waiting"],
        queryFn: async () => {
          calls += 1;
          return { source: "fallback" };
        },
      });
      await delay(0);
      postMalformedSuccess(channel, {
        data: { source: "poisoned-waiter" },
        queryHash: hashQueryKey(["waiting"]),
        queryKey: ["allowed"],
      });

      await expect(leaderFetch).resolves.toEqual({ source: "leader" });
      await expect(fetchResult).resolves.toEqual({ source: "leader" });
      expect(calls).toBe(1);
      expect(second.getQueryData(["allowed"])).toBeUndefined();
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
      includeQuery: (queryKey) => queryKey[0] === "focused-profile",
      singleFlight: true,
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "focused-profile",
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
      includeQuery: (queryKey) => queryKey[0] === "reconnected-notifications",
      singleFlight: true,
    });
    const disposeSecond = syncQueryClientAcrossTabs(second, {
      channel,
      includeQuery: (queryKey) => queryKey[0] === "reconnected-notifications",
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

function installRetainedLockManager(): void {
  let locked = false;
  const lockManager = {
    async request<T>(
      _name: string,
      optionsOrCallback: { ifAvailable?: boolean | undefined } | ((lock: unknown) => T | Promise<T>),
      maybeCallback?: (lock: unknown | null) => T | Promise<T>,
    ): Promise<T> {
      if (typeof optionsOrCallback === "function") {
        return optionsOrCallback({});
      }

      if (locked) {
        return maybeCallback?.(null) as T | Promise<T>;
      }

      locked = true;
      const result = await maybeCallback?.({});
      setTimeout(() => {
        locked = false;
      }, 20);
      return result as T;
    },
  };

  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: lockManager,
  });
}

function installUnavailableLockManager(): void {
  const lockManager = {
    async request<T>(
      _name: string,
      optionsOrCallback: { ifAvailable?: boolean | undefined } | ((lock: unknown) => T | Promise<T>),
      maybeCallback?: (lock: unknown | null) => T | Promise<T>,
    ): Promise<T> {
      if (typeof optionsOrCallback === "function") {
        return optionsOrCallback({});
      }

      return maybeCallback?.(null) as T | Promise<T>;
    },
  };

  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: lockManager,
  });
}

function installNamedLockManager(): { blockedRequests(): number } {
  const lockedNames = new Set<string>();
  let blockedRequests = 0;
  const lockManager = {
    async request<T>(
      name: string,
      optionsOrCallback: { ifAvailable?: boolean | undefined } | ((lock: unknown) => T | Promise<T>),
      maybeCallback?: (lock: unknown | null) => T | Promise<T>,
    ): Promise<T> {
      if (typeof optionsOrCallback === "function") {
        return optionsOrCallback({});
      }

      if (lockedNames.has(name)) {
        blockedRequests += 1;
        return maybeCallback?.(null) as T | Promise<T>;
      }

      lockedNames.add(name);
      try {
        return await maybeCallback?.({}) as T;
      } finally {
        lockedNames.delete(name);
      }
    },
  };

  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: lockManager,
  });

  return {
    blockedRequests: () => blockedRequests,
  };
}

function postMalformedSuccess(
  channel: string,
  message: {
    data: unknown;
    queryHash: string;
    queryKey: readonly unknown[];
  },
): void {
  const broadcast = new BroadcastChannel(channel);
  broadcast.postMessage({
    ...message,
    senderId: `malformed-${Math.random()}`,
    type: "success",
    updatedAt: Date.now(),
    version: 1,
  });
  broadcast.close();
}

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
