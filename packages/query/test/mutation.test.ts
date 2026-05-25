import { describe, expect, it } from "vitest";
import { createMutation, createQueryClient } from "../src/index.js";

describe("createMutation", () => {
  it("tracks mutation state and invalidates configured query keys on success", async () => {
    const client = createQueryClient();
    let calls = 0;
    client.setQueryData(["todos"], ["old"]);
    const mutation = createMutation(client, {
      invalidate: [["todos"]],
      mutationFn: async (title: string) => ({ id: 1, title }),
    });

    const result = await mutation.mutate("write tests");

    expect(result).toEqual({ id: 1, title: "write tests" });
    expect(mutation.result.get()).toMatchObject({
      data: { id: 1, title: "write tests" },
      status: "success",
    });
    await expect(
      client.fetchQuery({
        queryKey: ["todos"],
        staleTime: 60_000,
        queryFn: () => {
          calls += 1;
          return ["fresh"];
        },
      }),
    ).resolves.toEqual(["fresh"]);
    expect(calls).toBe(1);
  });

  it("tracks mutation errors", async () => {
    const client = createQueryClient();
    const error = new Error("nope");
    const mutation = createMutation(client, {
      mutationFn: async () => {
        throw error;
      },
    });

    await expect(mutation.mutate()).rejects.toThrow("nope");

    expect(mutation.result.get()).toMatchObject({
      error,
      status: "error",
    });
  });

  it("runs lifecycle hooks in a stable order around invalidation", async () => {
    const client = createQueryClient();
    const events: string[] = [];
    let refreshCalls = 0;
    client.setQueryData(["todos"], ["old"]);

    const mutation = createMutation(client, {
      invalidate: [["todos"]],
      mutationFn: async (title: string) => {
        events.push(`mutation:${title}`);
        return { id: 1, title };
      },
      onMutate(title) {
        events.push(`mutate:${title}`);
      },
      async onSuccess(data, title) {
        const cached = await client.fetchQuery({
          queryKey: ["todos"],
          staleTime: 60_000,
          queryFn: () => {
            refreshCalls += 1;
            return ["unexpected"];
          },
        });
        events.push(`success:${data.title}:${title}:${cached.join(",")}`);
      },
      async onSettled(result, title) {
        if ("error" in result) {
          events.push(`settled-error:${title}`);
          return;
        }

        const refreshed = await client.fetchQuery({
          queryKey: ["todos"],
          staleTime: 60_000,
          queryFn: () => {
            refreshCalls += 1;
            return ["fresh"];
          },
        });
        events.push(`settled:${result.data.title}:${title}:${refreshed.join(",")}`);
      },
    });

    await expect(mutation.mutate("write tests")).resolves.toEqual({
      id: 1,
      title: "write tests",
    });

    expect(events).toEqual([
      "mutate:write tests",
      "mutation:write tests",
      "success:write tests:write tests:old",
      "settled:write tests:write tests:fresh",
    ]);
    expect(refreshCalls).toBe(1);
  });

  it("runs error lifecycle hooks with the mutation variables", async () => {
    const client = createQueryClient();
    const events: string[] = [];
    const error = new Error("nope");

    const mutation = createMutation(client, {
      mutationFn: async (_title: string) => {
        throw error;
      },
      onError(nextError, title) {
        events.push(`error:${nextError === error}:${title}`);
      },
      onSettled(result, title) {
        events.push(
          "error" in result ? `settled:${result.error === error}:${title}` : "settled-data",
        );
      },
    });

    await expect(mutation.mutate("write tests")).rejects.toBe(error);

    expect(events).toEqual(["error:true:write tests", "settled:true:write tests"]);
  });

  it("passes onMutate context to onError and onSettled for optimistic rollback", async () => {
    const client = createQueryClient();
    const events: string[] = [];
    const error = new Error("save failed");
    client.setQueryData(["todos"], ["old"]);

    const mutation = createMutation(client, {
      mutationFn: async (_title: string) => {
        throw error;
      },
      onMutate(title) {
        const previous = client.getQueryData<string[]>(["todos"]) ?? [];
        client.setQueryData(["todos"], [...previous, title]);
        events.push(`mutate:${client.getQueryData<string[]>(["todos"])?.join(",")}`);
        return { previous };
      },
      onError(nextError, title, context) {
        events.push(`error:${nextError === error}:${title}:${context?.previous.join(",")}`);
        client.setQueryData(["todos"], context?.previous ?? []);
      },
      onSettled(result, title, context) {
        events.push(
          "error" in result
            ? `settled:${result.error === error}:${title}:${context?.previous.join(",")}`
            : "settled-data",
        );
      },
    });

    await expect(mutation.mutate("new")).rejects.toBe(error);

    expect(client.getQueryData(["todos"])).toEqual(["old"]);
    expect(events).toEqual([
      "mutate:old,new",
      "error:true:new:old",
      "settled:true:new:old",
    ]);
  });
});
