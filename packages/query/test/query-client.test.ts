import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createQueryClient,
  createQuery,
  dehydrate,
  hydrate,
  hashQueryKey,
  queryDefinition,
} from "../src/index.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("createQueryClient", () => {
  it("expires successful and failed unused prefetches with the client policy", async () => {
    vi.useFakeTimers();
    const client = createQueryClient({ inactiveGcTime: 10 });
    const failure = new Error("prefetch failed");

    await client.prefetchQuery({
      queryKey: ["unused-success"],
      queryFn: () => "cached",
    });
    await client.prefetchQuery({
      queryKey: ["unused-error"],
      queryFn: () => {
        throw failure;
      },
    });
    expect(client.entries()).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(10);

    expect(client.getQueryEntry(["unused-success"])).toBeUndefined();
    expect(client.getQueryEntry(["unused-error"])).toBeUndefined();
  });

  it("cancels inactive expiry while an observer is active and evicts after disposal", async () => {
    vi.useFakeTimers();
    const client = createQueryClient({ inactiveGcTime: 10 });
    await client.prefetchQuery({
      queryKey: ["shared-inactive"],
      queryFn: () => "cached",
    });

    const observer = createQuery(client, {
      autoFetch: false,
      queryKey: ["shared-inactive"],
      queryFn: () => "fresh",
    });
    await vi.advanceTimersByTimeAsync(20);
    expect(client.getQueryEntry(["shared-inactive"])).toBeDefined();

    observer.dispose();
    await vi.advanceTimersByTimeAsync(9);
    expect(client.getQueryEntry(["shared-inactive"])).toBeDefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(client.getQueryEntry(["shared-inactive"])).toBeUndefined();
  });

  it("caps inactive entries without evicting active entries", async () => {
    vi.useFakeTimers();
    const client = createQueryClient({ maxInactiveEntries: 1 });
    const observer = createQuery(client, {
      autoFetch: false,
      queryKey: ["active-entry"],
      queryFn: () => "active",
    });
    client.setQueryData(["active-entry"], "active");
    client.setQueryData(["old-entry"], "old");
    client.setQueryData(["new-entry"], "new");

    expect(client.getQueryEntry(["active-entry"])).toBeDefined();
    expect(client.getQueryEntry(["old-entry"])).toBeUndefined();
    expect(client.getQueryEntry(["new-entry"])).toBeDefined();
    observer.dispose();
  });

  it("uses one typed query definition for fetch, cache reads, and writes", async () => {
    const client = createQueryClient();
    const definition = queryDefinition(["profile", 1] as const, () => ({ name: "Ada" }));

    await client.fetchQuery(definition);
    expect(client.getQueryData(definition)).toEqual({ name: "Ada" });

    client.setQueryData(definition, { name: "Grace" });
    expect(client.getQueryData(definition)).toEqual({ name: "Grace" });
    await client.prefetchQuery(definition, { staleTime: 60_000 });
    expect(client.getQueryData(["profile", 1])).toEqual({ name: "Grace" });
  });

  it("stores function-valued fetch results without invoking them", async () => {
    let calls = 0;
    const data = () => {
      calls += 1;
      return "called";
    };
    const client = createQueryClient();

    const result = await client.fetchQuery({
      queryKey: ["function-data"],
      queryFn: () => data,
    });

    expect(result).toBe(data);
    expect(client.getQueryData(["function-data"])).toBe(data);
    expect(calls).toBe(0);
  });

  it("deduplicates concurrent fetches for the same query key", async () => {
    const client = createQueryClient();
    let calls = 0;

    const first = client.fetchQuery({
      queryKey: ["user", 1],
      queryFn: async () => {
        calls += 1;
        return { id: 1, name: "Ada" };
      },
    });
    const second = client.fetchQuery({
      queryKey: ["user", 1],
      queryFn: async () => {
        calls += 1;
        return { id: 1, name: "Ada" };
      },
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { id: 1, name: "Ada" },
      { id: 1, name: "Ada" },
    ]);
    expect(calls).toBe(1);
  });

  it("returns fresh cached data without calling the query function again", async () => {
    const client = createQueryClient();
    let calls = 0;

    await client.fetchQuery({
      queryKey: ["settings"],
      staleTime: 60_000,
      queryFn: async () => {
        calls += 1;
        return { theme: "dark" };
      },
    });
    const cached = await client.fetchQuery({
      queryKey: ["settings"],
      staleTime: 60_000,
      queryFn: async () => {
        calls += 1;
        return { theme: "light" };
      },
    });

    expect(cached).toEqual({ theme: "dark" });
    expect(calls).toBe(1);
  });

  it("passes an AbortSignal to the query function and cancels in-flight queries", async () => {
    const client = createQueryClient();
    let signal: AbortSignal | undefined;
    const pending = client.fetchQuery({
      queryKey: ["slow"],
      queryFn: ({ signal: nextSignal }) => {
        signal = nextSignal;
        return new Promise<string>((_resolve, reject) => {
          nextSignal.addEventListener("abort", () => reject(nextSignal.reason), { once: true });
        });
      },
    });

    client.cancelQueries({ queryKey: ["slow"] });

    expect(signal?.aborted).toBe(true);
    await expect(pending).rejects.toBe(signal?.reason);
    expect(client.getQueryEntry(["slow"])).toMatchObject({
      error: undefined,
      errorReason: "aborted",
      isFetching: false,
      status: "pending",
    });
  });

  it("does not cache a late result after cancellation when the query ignores its signal", async () => {
    const client = createQueryClient();
    let resolve!: (value: string) => void;
    const pending = client.fetchQuery({
      queryKey: ["signal-ignoring"],
      queryFn: () =>
        new Promise<string>((nextResolve) => {
          resolve = nextResolve;
        }),
    });

    client.cancelQueries({ queryKey: ["signal-ignoring"] });
    resolve("late result");

    await expect(pending).resolves.toBe("late result");
    expect(client.getQueryEntry(["signal-ignoring"])).toMatchObject({
      data: undefined,
      errorReason: "aborted",
      isFetching: false,
      status: "pending",
    });
  });

  it("retries failed queries up to the configured retry count", async () => {
    const client = createQueryClient();
    let calls = 0;

    const data = await client.fetchQuery({
      queryKey: ["retry"],
      retry: 2,
      retryDelay: 0,
      queryFn: async () => {
        calls += 1;
        if (calls < 3) {
          throw new Error(`fail ${calls}`);
        }
        return "ok";
      },
    });

    expect(data).toBe("ok");
    expect(calls).toBe(3);
    expect(client.getQueryEntry(["retry"])).toMatchObject({
      data: "ok",
      errorReason: undefined,
      status: "success",
    });
  });

  it("uses exponential retry backoff when retryDelay is omitted", async () => {
    vi.useFakeTimers();
    const client = createQueryClient();
    let attempts = 0;

    const pending = client.fetchQuery({
      queryKey: ["retry-backoff"],
      retry: 2,
      queryFn: () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error(`fail ${attempts}`);
        }
        return "ok";
      },
    });

    await Promise.resolve();
    expect(attempts).toBe(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(attempts).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(attempts).toBe(2);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(attempts).toBe(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(attempts).toBe(3);
    await expect(pending).resolves.toBe("ok");
  });

  it("classifies retry-exhausted query failures", async () => {
    const client = createQueryClient();
    let calls = 0;
    const error = new Error("still failing");

    await expect(
      client.fetchQuery({
        queryKey: ["retry-exhausted"],
        retry: 1,
        retryDelay: 0,
        queryFn: async () => {
          calls += 1;
          throw error;
        },
      }),
    ).rejects.toBe(error);

    expect(calls).toBe(2);
    expect(client.getQueryEntry(["retry-exhausted"])).toMatchObject({
      error,
      errorReason: "unknown",
      status: "error",
    });
  });

  it("classifies network errors by final cause even after retries are exhausted", async () => {
    const client = createQueryClient();
    let calls = 0;
    const error = new TypeError("offline");

    await expect(
      client.fetchQuery({
        queryKey: ["retry-network"],
        retry: 1,
        retryDelay: 0,
        queryFn: async () => {
          calls += 1;
          throw error;
        },
      }),
    ).rejects.toBe(error);

    expect(calls).toBe(2);
    expect(client.getQueryEntry(["retry-network"])).toMatchObject({
      error,
      errorReason: "network",
      status: "error",
    });
  });

  it("setQueryData aborts and supersedes an in-flight fetch for the same key", async () => {
    const client = createQueryClient();
    const deferred = createDeferred<string>();
    let signal: AbortSignal | undefined;
    const pending = client.fetchQuery({
      queryKey: ["optimistic"],
      queryFn: ({ signal: nextSignal }) => {
        signal = nextSignal;
        return deferred.promise;
      },
    });

    client.setQueryData(["optimistic"], "manual");

    expect(signal?.aborted).toBe(true);
    expect(client.getQueryData(["optimistic"])).toBe("manual");

    deferred.resolve("network");
    await expect(pending).resolves.toBe("network");
    expect(client.getQueryData(["optimistic"])).toBe("manual");
  });

  it("setQueryData resolves updater functions against the current cached value", () => {
    const client = createQueryClient();

    client.setQueryData(["counter"], { count: 1 });
    client.setQueryData(["counter"], (previous: { count: number } | undefined) => ({
      count: (previous?.count ?? 0) + 1,
    }));

    expect(client.getQueryData(["counter"])).toEqual({ count: 2 });
  });

  it("does not structurally share objects when keys change to an undefined value", () => {
    const client = createQueryClient();

    client.setQueryData(["profile"], { name: "Ada" });
    client.setQueryData(["profile"], { displayName: undefined });

    expect(client.getQueryData(["profile"])).toEqual({ displayName: undefined });
  });

  it("prefetchQuery records errors without rejecting fire-and-forget callers", async () => {
    const client = createQueryClient();
    const error = new Error("prefetch failed");

    await expect(
      client.prefetchQuery({
        queryKey: ["prefetch-error"],
        queryFn: () => {
          throw error;
        },
      }),
    ).resolves.toBeUndefined();
    expect(client.getQueryEntry(["prefetch-error"])).toMatchObject({
      error,
      status: "error",
    });
  });

  it("does not retry canceled queries", async () => {
    const client = createQueryClient();
    let calls = 0;

    const pending = client.fetchQuery({
      queryKey: ["cancel-no-retry"],
      retry: 3,
      retryDelay: 0,
      queryFn: ({ signal }) => {
        calls += 1;
        return new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
    });

    client.cancelQueries({ queryKey: ["cancel-no-retry"] });

    await expect(pending).rejects.toBeDefined();
    expect(calls).toBe(1);
  });

  it("removeQueries aborts in-flight queries, evicts matching entries, and notifies subscribers", async () => {
    const client = createQueryClient();
    const events: string[] = [];
    let signal: AbortSignal | undefined;
    client.setQueryData(["todos", "done"], ["old"]);
    client.subscribe(["todos"], (entry) => {
      events.push(
        `${entry.queryKey.join("/")}:${entry.status}:${entry.data === undefined ? "empty" : "data"}`,
      );
    });

    const pending = client.fetchQuery({
      queryKey: ["todos", "open"],
      queryFn: ({ signal: nextSignal }) => {
        signal = nextSignal;
        return new Promise<string[]>((_resolve, reject) => {
          nextSignal.addEventListener("abort", () => reject(nextSignal.reason), { once: true });
        });
      },
    });

    client.removeQueries({ queryKey: ["todos"] });

    expect(signal?.aborted).toBe(true);
    await expect(pending).rejects.toBe(signal?.reason);
    expect(client.getQueryEntry(["todos", "open"])).toBeUndefined();
    expect(client.getQueryEntry(["todos", "done"])).toBeUndefined();
    expect(events).toEqual([
      "todos/open:pending:empty",
      "todos/done:pending:empty",
      "todos/open:pending:empty",
    ]);
  });

  it("invalidates query-key prefixes and refetches otherwise fresh data", async () => {
    const client = createQueryClient();
    const events: string[] = [];
    let calls = 0;

    client.subscribe(["todos"], (entry) => {
      events.push(entry.status);
    });
    client.setQueryData(["todos", "open"], ["a"]);
    client.invalidateQueries({ queryKey: ["todos"] });

    await Promise.resolve();
    expect(events).toEqual(["success", "success"]);
    events.length = 0;

    const data = await client.fetchQuery({
      queryKey: ["todos", "open"],
      staleTime: 60_000,
      queryFn: () => {
        calls += 1;
        return ["b"];
      },
    });

    expect(data).toEqual(["b"]);
    expect(calls).toBe(1);
    expect(events).toEqual(["success", "success"]);
  });

  it("coalesces burst invalidation notifications per query entry", async () => {
    const client = createQueryClient();
    const events: string[] = [];
    let calls = 0;

    client.setQueryData(["todos", "open"], ["a"]);
    client.subscribe(["todos"], (entry) => {
      events.push(entry.status);
    });

    client.invalidateQueries({ queryKey: ["todos"] });
    client.invalidateQueries({ queryKey: ["todos"] });
    client.invalidateQueries({ queryKey: ["todos"] });

    expect(events).toEqual([]);

    await Promise.resolve();
    expect(events).toEqual(["success"]);
    events.length = 0;

    await client.fetchQuery({
      queryKey: ["todos", "open"],
      staleTime: 60_000,
      queryFn: () => {
        calls += 1;
        return ["b"];
      },
    });

    expect(events).toEqual(["success", "success"]);
    expect(calls).toBe(1);
  });

  it("dehydrates successful query data and hydrates it into another client", () => {
    const source = createQueryClient();
    const target = createQueryClient();

    source.setQueryData(["profile"], { name: "Grace" });
    hydrate(target, dehydrate(source));

    expect(target.getQueryData(["profile"])).toEqual({ name: "Grace" });
  });

  it("filters dehydrated queries and excludes entries when the predicate throws", () => {
    const source = createQueryClient();
    source.setQueryData(["public"], { value: "visible" });
    source.setQueryData(["private"], { value: "secret" });
    source.setQueryData(["throws"], { value: "also-secret" });

    const dehydrated = dehydrate(source, {
      shouldDehydrateQuery: (entry) => {
        if (entry.queryKey[0] === "throws") throw new Error("policy failed");
        return entry.queryKey[0] === "public";
      },
    });

    expect(dehydrated.queries.map((query) => query.queryKey)).toEqual([["public"]]);
  });

  it("preserves dehydrated updatedAt timestamps when hydrating query data", () => {
    const target = createQueryClient();

    hydrate(target, {
      queries: [
        {
          data: { name: "Grace" },
          queryHash: hashQueryKey(["profile"]),
          queryKey: ["profile"],
          updatedAt: 123_456,
        },
      ],
    });

    expect(target.getQueryEntry(["profile"])?.updatedAt).toBe(123_456);
  });

  it("hashes object query keys deterministically", () => {
    expect(hashQueryKey(["search", { page: 1, q: "mreact" }])).toBe(
      hashQueryKey(["search", { q: "mreact", page: 1 }]),
    );
  });

  it("treats mutated key input as a new identity and preserves old entry metadata", () => {
    const client = createQueryClient();
    const key = ["profile", { userId: 1 }];

    client.setQueryData(key, "user-1");
    (key[1] as { userId: number }).userId = 2;
    client.setQueryData(key, "user-2");

    expect(client.getQueryData(["profile", { userId: 1 }])).toBe("user-1");
    expect(client.getQueryData(["profile", { userId: 2 }])).toBe("user-2");
    expect(
      client.entries().map((entry) => [entry.queryKey, entry.data]),
    ).toEqual([
      [["profile", { userId: 1 }], "user-1"],
      [["profile", { userId: 2 }], "user-2"],
    ]);
  });

  it.each([
    ["Date", new Date("2026-08-15T00:00:00.000Z"), new Date("2026-08-16T00:00:00.000Z")],
    ["Set", new Set([1, 2]), new Set([1, 3])],
    ["Map", new Map([["page", 1]]), new Map([["page", 2]])],
    ["URL", new URL("https://example.com/a"), new URL("https://example.com/b")],
    ["RegExp", /first/gi, /second/gi],
  ])("keeps %s query-key values in separate cache entries", (_name, first, second) => {
    const client = createQueryClient();
    client.setQueryData(["typed", first], "first");
    client.setQueryData(["typed", second], "second");

    expect(hashQueryKey(["typed", first])).not.toBe(hashQueryKey(["typed", second]));
    expect(client.getQueryData(["typed", first])).toBe("first");
    expect(client.getQueryData(["typed", second])).toBe("second");
  });

  it("hashes Set and Map values independently of insertion order", () => {
    expect(hashQueryKey([new Set([3, 1, 2])])).toBe(hashQueryKey([new Set([1, 2, 3])]));
    expect(
      hashQueryKey([
        new Map<unknown, unknown>([
          ["b", 2],
          ["a", 1],
        ]),
      ]),
    ).toBe(
      hashQueryKey([
        new Map<unknown, unknown>([
          ["a", 1],
          ["b", 2],
        ]),
      ]),
    );
  });

  it("supports BigInt query-key values", () => {
    expect(() => hashQueryKey(["record", 9_007_199_254_740_993n])).not.toThrow();
    expect(hashQueryKey(["record", 1n])).not.toBe(hashQueryKey(["record", 2n]));
  });

  it("rejects unsupported query-key values instead of silently colliding", () => {
    class UnsupportedKey {
      readonly value = 1;
    }

    expect(() => hashQueryKey(["unsupported", new UnsupportedKey()])).toThrow(
      /unsupported query key value.*UnsupportedKey/i,
    );
    expect(() => hashQueryKey(["unsupported", () => 1])).toThrow(
      /unsupported query key value.*function/i,
    );
  });

  it("preserves plain query-key order and undefined-property behavior", () => {
    expect(hashQueryKey(["plain", { a: 1, b: undefined }])).toBe(
      hashQueryKey(["plain", { a: 1 }]),
    );
    expect(hashQueryKey(["plain", { a: 1, b: 2 }])).toBe(
      hashQueryKey(["plain", { b: 2, a: 1 }]),
    );
  });

  it("rehashes mutable query-key input for repeated reads of the same key array", () => {
    const queryKey = ["search", { page: 1, q: "mreact" }] as const;
    const originalStringify = JSON.stringify;
    let stringifyCalls = 0;

    hashQueryKey(queryKey);

    try {
      JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
        stringifyCalls += 1;
        return originalStringify(...args);
      }) as typeof JSON.stringify;

      expect(hashQueryKey(queryKey)).toBe(hashQueryKey(queryKey));
    } finally {
      JSON.stringify = originalStringify;
    }

    expect(stringifyCalls).toBeGreaterThan(0);
  });
});

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}
