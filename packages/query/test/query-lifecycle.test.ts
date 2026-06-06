import { describe, expect, it } from "vitest";
import { createQueryLifecycle } from "../src/query-lifecycle.js";

describe("query entry lifecycle", () => {
  it("invalidated fresh data is refetched through observable fetch behavior", async () => {
    const lifecycle = createQueryLifecycle();
    let calls = 0;

    lifecycle.setQueryData(["todos"], ["cached"]);
    lifecycle.invalidateQueries({ queryKey: ["todos"] });
    await Promise.resolve();

    const data = await lifecycle.fetchQuery({
      queryKey: ["todos"],
      staleTime: 60_000,
      queryFn: () => {
        calls += 1;
        return ["fresh"];
      },
    });

    expect(data).toEqual(["fresh"]);
    expect(calls).toBe(1);
  });

  it("removal notifies observers and subsequent reads behave like an empty cache", async () => {
    const lifecycle = createQueryLifecycle();
    const statuses: string[] = [];

    lifecycle.setQueryData(["profile"], { name: "Ada" });
    lifecycle.subscribe(["profile"], (entry) => {
      statuses.push(`${entry.status}:${entry.data === undefined ? "empty" : "data"}`);
    });

    lifecycle.removeQueries({ queryKey: ["profile"] });

    expect(lifecycle.getQueryData(["profile"])).toBeUndefined();
    expect(statuses).toEqual(["pending:empty"]);
  });

  it("notifies exact-key subscribers without snapshotting the full subscription set", () => {
    const lifecycle = createQueryLifecycle();
    const originalFrom = Array.from;
    let arrayFromCalls = 0;

    for (let index = 0; index < 25; index += 1) {
      lifecycle.subscribe(["item", index], () => {});
    }

    try {
      Array.from = ((...args: Parameters<typeof Array.from>) => {
        arrayFromCalls += 1;
        return originalFrom(...args);
      }) as typeof Array.from;

      lifecycle.setQueryData(["item", 10], "updated");
    } finally {
      Array.from = originalFrom;
    }

    expect(arrayFromCalls).toBe(0);
  });
});
