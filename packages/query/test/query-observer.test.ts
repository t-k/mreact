import { describe, expect, it } from "vitest";
import { flushEffects } from "@modular-react/reactive-core/testing";
import { createQuery, createQueryClient } from "../src/index.js";

describe("createQuery", () => {
  it("exposes a reactive query result and refetches data", async () => {
    const client = createQueryClient();
    let calls = 0;
    const query = createQuery(client, {
      queryKey: ["count"],
      queryFn: async () => {
        calls += 1;
        return calls;
      },
    });

    expect(query.result.get().status).toBe("pending");
    await query.refetch();
    await flushEffects();

    expect(query.result.get()).toMatchObject({
      data: 1,
      isFetching: false,
      status: "success",
    });

    await query.refetch();
    expect(query.result.get().data).toBe(2);
  });

  it("observes externally written query data", async () => {
    const client = createQueryClient();
    const query = createQuery(client, {
      queryKey: ["profile"],
      queryFn: async () => ({ name: "Ada" }),
    });

    client.setQueryData(["profile"], { name: "Grace" });
    await flushEffects();

    expect(query.result.get()).toMatchObject({
      data: { name: "Grace" },
      status: "success",
    });
  });
});
