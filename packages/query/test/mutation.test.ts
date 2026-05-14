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
});
