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
