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
      errorReason: "retry-exhausted",
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

  it("invalidates query-key prefixes and notifies subscribers", async () => {
    const client = createQueryClient();
    const events: string[] = [];

    client.subscribe(["todos"], (entry) => {
      events.push(entry.status);
    });
    client.setQueryData(["todos", "open"], ["a"]);
    client.invalidateQueries({ queryKey: ["todos"] });

    const entry = client.getQueryEntry(["todos", "open"]);
    expect(entry?.stale).toBe(true);
    expect(events).toEqual(["success", "success"]);
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
});
