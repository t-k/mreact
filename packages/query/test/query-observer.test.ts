import { describe, expect, it } from "vitest";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
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

  it("does not re-read the observer query key while processing matching updates", async () => {
    const client = createQueryClient();
    let allowQueryKeyRead = true;
    const filter = {};
    Object.defineProperty(filter, "value", {
      enumerable: true,
      get() {
        if (!allowQueryKeyRead) {
          throw new Error("query key was re-read");
        }
        return "active";
      },
    });
    const query = createQuery(client, {
      autoFetch: false,
      queryKey: ["profile", filter],
      queryFn: async () => ({ name: "Ada" }),
    });
    allowQueryKeyRead = false;

    expect(() => {
      client.setQueryData(["profile", { value: "active" }], { name: "Grace" });
    }).not.toThrow();
    await flushEffects();

    expect(query.result.get()).toMatchObject({
      data: { name: "Grace" },
      status: "success",
    });
  });

  it("resets observed data when removeQueries evicts the entry", async () => {
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

    client.removeQueries({ queryKey: ["profile"] });
    await flushEffects();

    expect(query.result.get()).toMatchObject({
      data: undefined,
      status: "pending",
    });
  });

  it("does not notify disposed observers during subscription churn", async () => {
    const client = createQueryClient();
    const disposedQueries = Array.from({ length: 100 }, () =>
      createQuery(client, {
        queryKey: ["profile"],
        queryFn: async () => ({ name: "Ada" }),
      }),
    );

    for (const query of disposedQueries) {
      query.dispose();
    }

    const liveQuery = createQuery(client, {
      queryKey: ["profile"],
      queryFn: async () => ({ name: "Ada" }),
    });
    client.setQueryData(["profile"], { name: "Grace" });
    await flushEffects();

    for (const query of disposedQueries) {
      expect(query.result.get()).toMatchObject({
        data: undefined,
        status: "pending",
      });
    }
    expect(liveQuery.result.get()).toMatchObject({
      data: { name: "Grace" },
      status: "success",
    });
  });
});
