// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
  __MREACT_QUERY_STATE_SCRIPT_ID,
  __resetQueryClientForTesting,
  createQuery,
  createQueryClient,
  dehydrate,
  getQueryClient,
  hashQueryKey,
} from "../src/index.js";

describe("browser query client hand-off", () => {
  it("hydrates a client singleton from the injected query state script", () => {
    __resetQueryClientForTesting();
    document.body.innerHTML = "";
    const serverClient = createQueryClient();
    serverClient.setQueryData(["profile"], { name: "Grace" });
    const script = document.createElement("script");
    script.id = __MREACT_QUERY_STATE_SCRIPT_ID;
    script.type = "application/json";
    script.textContent = JSON.stringify(dehydrate(serverClient));
    document.body.append(script);

    const first = getQueryClient();
    const second = getQueryClient();

    expect(second).toBe(first);
    expect(first.getQueryData(["profile"])).toEqual({ name: "Grace" });
  });

  it("ignores malformed injected query state", () => {
    __resetQueryClientForTesting();
    document.body.innerHTML = `<script id="${__MREACT_QUERY_STATE_SCRIPT_ID}" type="application/json">{bad json</script>`;

    const client = getQueryClient();

    expect(client.entries()).toEqual([]);
  });

  it("auto-fetches empty client-side queries by default", async () => {
    __resetQueryClientForTesting();
    document.body.innerHTML = "";
    const client = getQueryClient();
    const query = createQuery(client, {
      queryKey: ["client-only"],
      queryFn: async () => "ready",
    });

    expect(query.result.get()).toMatchObject({
      isFetching: true,
      status: "pending",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(query.result.get()).toMatchObject({
      data: "ready",
      isFetching: false,
      status: "success",
    });
  });

  it("revalidates stale hydrated query data on mount", () => {
    __resetQueryClientForTesting();
    injectQueryState({
      queries: [
        {
          data: "server",
          queryHash: hashQueryKey(["time"]),
          queryKey: ["time"],
          updatedAt: Date.now() - 1_000,
        },
      ],
    });
    const client = getQueryClient();
    let calls = 0;

    const query = createQuery(client, {
      queryKey: ["time"],
      staleTime: 100,
      queryFn: () => {
        calls += 1;
        return "client";
      },
    });

    expect(calls).toBe(1);
    expect(query.result.get()).toMatchObject({
      data: "server",
      isFetching: true,
      status: "success",
    });
  });

  it("revalidates hydrated data whose server timestamp is ahead of the client clock", () => {
    __resetQueryClientForTesting();
    injectQueryState({
      queries: [
        {
          data: "server",
          queryHash: hashQueryKey(["future-time"]),
          queryKey: ["future-time"],
          updatedAt: Date.now() + 60_000,
        },
      ],
    });
    const client = getQueryClient();
    let calls = 0;

    const query = createQuery(client, {
      queryKey: ["future-time"],
      staleTime: 0,
      queryFn: () => {
        calls += 1;
        return "client";
      },
    });

    expect(calls).toBe(1);
    expect(query.result.get()).toMatchObject({
      data: "server",
      isFetching: true,
      status: "success",
    });
  });

  it("keeps fresh hydrated query data on mount when staleTime covers the server timestamp", () => {
    __resetQueryClientForTesting();
    injectQueryState({
      queries: [
        {
          data: "server",
          queryHash: hashQueryKey(["time"]),
          queryKey: ["time"],
          updatedAt: Date.now(),
        },
      ],
    });
    const client = getQueryClient();
    let calls = 0;

    const query = createQuery(client, {
      queryKey: ["time"],
      staleTime: 60_000,
      queryFn: () => {
        calls += 1;
        return "client";
      },
    });

    expect(calls).toBe(0);
    expect(query.result.get()).toMatchObject({
      data: "server",
      isFetching: false,
      status: "success",
    });
  });

  it("finds hydrated built-in query-key values after JSON hand-off", () => {
    __resetQueryClientForTesting();
    const keys = [
      ["typed", new Date("2026-08-15T00:00:00.000Z")],
      ["typed", new Set([1, 2])],
      ["typed", new Map([["page", 1]])],
      ["typed", new URL("https://example.com/report")],
      ["typed", /report/gi],
    ] as const;
    const serverClient = createQueryClient();
    keys.forEach((queryKey, index) => serverClient.setQueryData(queryKey, `server-${index}`));
    injectQueryState(dehydrate(serverClient));

    const client = getQueryClient();

    keys.forEach((queryKey, index) => {
      expect(client.getQueryData(queryKey)).toBe(`server-${index}`);
    });
  });
});

function injectQueryState(state: unknown): void {
  document.body.innerHTML = "";
  const script = document.createElement("script");
  script.id = __MREACT_QUERY_STATE_SCRIPT_ID;
  script.type = "application/json";
  script.textContent = JSON.stringify(state);
  document.body.append(script);
}
