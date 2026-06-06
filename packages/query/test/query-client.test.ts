import { describe, expect, it } from "vitest";
import { createQueryClient, dehydrate, hydrate, hashQueryKey } from "../src/index.js";

describe("createQueryClient", () => {
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

  it("hashes object query keys deterministically", () => {
    expect(hashQueryKey(["search", { page: 1, q: "mreact" }])).toBe(
      hashQueryKey(["search", { q: "mreact", page: 1 }]),
    );
  });

  it("memoizes query-key hashes for repeated reads of the same key array", () => {
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

    expect(stringifyCalls).toBe(0);
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
