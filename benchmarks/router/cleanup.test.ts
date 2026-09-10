import { describe, expect, it } from "vitest";
import { runCleanupTasks } from "./cleanup.js";

describe("benchmark cleanup tasks", () => {
  it("waits for every task after synchronous and asynchronous failures", async () => {
    const events: string[] = [];
    const release = Promise.withResolvers<void>();
    let settled = false;
    const cleanup = runCleanupTasks([
      {
        name: "first",
        run() {
          events.push("first");
          throw new Error("sync failure");
        },
      },
      {
        name: "second",
        async run() {
          events.push("second");
          throw new Error("async failure");
        },
      },
      {
        name: "third",
        async run() {
          events.push("third");
          await release.promise;
          events.push("closed");
        },
      },
    ]).catch((error: unknown) => {
      settled = true;
      return error;
    });
    try {
      await expect.poll(() => events).toContain("third");
      expect(settled).toBe(false);
    } finally {
      release.resolve();
    }
    const error = await cleanup;
    expect(events).toEqual(["first", "second", "third", "closed"]);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors.map((entry: Error) => entry.message)).toEqual([
      "first: sync failure",
      "second: async failure",
    ]);
    expect((error as Error).message).toContain("first: sync failure");
    expect((error as Error).message).toContain("second: async failure");
    expect((error as Error).message).toBe("first: sync failure; second: async failure");
    expect((error as AggregateError).errors[0].cause.message).toBe("sync failure");
  });

  it("runs successful tasks in order exactly once", async () => {
    const events: string[] = [];
    await runCleanupTasks([
      {
        name: "first",
        async run() {
          events.push("first");
        },
      },
      {
        name: "second",
        run() {
          events.push("second");
        },
      },
    ]);
    expect(events).toEqual(["first", "second"]);
    await expect(runCleanupTasks([])).resolves.toBeUndefined();
  });
});
