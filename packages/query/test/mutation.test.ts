import { describe, expect, it } from "vitest";
import { createMutation, createQueryClient } from "../src/index.js";

describe("createMutation", () => {
  it("tracks mutation state and invalidates configured query keys on success", async () => {
    const client = createQueryClient();
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
    expect(client.getQueryEntry(["todos"])?.stale).toBe(true);
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
      onSuccess(data, title) {
        events.push(`success:${data.title}:${title}:${client.getQueryEntry(["todos"])?.stale}`);
      },
      onSettled(result, title) {
        events.push(
          "data" in result
            ? `settled:${result.data.title}:${title}:${client.getQueryEntry(["todos"])?.stale}`
            : `settled-error:${title}`,
        );
      },
    });

    await expect(mutation.mutate("write tests")).resolves.toEqual({
      id: 1,
      title: "write tests",
    });

    expect(events).toEqual([
      "mutate:write tests",
      "mutation:write tests",
      "success:write tests:write tests:false",
      "settled:write tests:write tests:true",
    ]);
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
});
