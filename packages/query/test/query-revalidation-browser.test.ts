// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createQuery, createQueryClient } from "../src/index.js";

describe("browser query revalidation", () => {
  it("refetches a stale-time-protected query when the window regains focus", async () => {
    const client = createQueryClient();
    client.setQueryData(["profile"], { name: "cached" });
    let calls = 0;
    const query = createQuery(client, {
      autoFetch: false,
      queryKey: ["profile"],
      refetchOnWindowFocus: true,
      staleTime: Number.POSITIVE_INFINITY,
      queryFn: async () => {
        calls += 1;
        return { name: `fresh-${calls}` };
      },
    });

    window.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(query.result.get()).toMatchObject({
      data: { name: "fresh-1" },
      status: "success",
    });
  });

  it("refetches when the browser reconnects and removes listeners on dispose", async () => {
    const client = createQueryClient();
    client.setQueryData(["notifications"], 0);
    let calls = 0;
    const query = createQuery(client, {
      autoFetch: false,
      queryKey: ["notifications"],
      refetchOnReconnect: true,
      staleTime: Number.POSITIVE_INFINITY,
      queryFn: async () => {
        calls += 1;
        return calls;
      },
    });

    window.dispatchEvent(new Event("online"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(query.result.get().data).toBe(1);

    query.dispose();
    window.dispatchEvent(new Event("online"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toBe(1);
  });
});
