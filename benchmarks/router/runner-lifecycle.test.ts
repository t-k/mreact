import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { runRouterBenchmarks } from "./runner.js";
import type { RouterBenchmarkAdapter } from "./types.js";

const fastRun = { benchTimeMs: 1, warmupTimeMs: 1 };

describe("router benchmark lifecycle", () => {
  it.each(["setup", "render"])("closes an allocated server after %s fails", async (phase) => {
    const server = createServer((_request, response) => response.end("ready"));
    let cleanupCalls = 0;
    const close = async () => {
      if (server.listening)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
    };
    const adapter: RouterBenchmarkAdapter = {
      name: "mreact-app-router",
      version: "test",
      async setup() {
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        if (phase === "setup") throw new Error("setup failed after allocation");
      },
      async renderToString() {
        throw new Error("initial render failed");
      },
      async teardown() {
        cleanupCalls += 1;
        await close();
      },
    };
    try {
      await runRouterBenchmarks([adapter], fastRun);
      expect(cleanupCalls).toBe(1);
      expect(server.listening).toBe(false);
    } finally {
      await close();
    }
  });

  it("retains rows and reports cleanup failures after all adapters close", async () => {
    const events: string[] = [];
    const result = await runRouterBenchmarks(
      [
        {
          name: "mreact-app-router",
          version: "test",
          measureBuildOutputGzipBytes: async () => 123,
          async teardown() {
            events.push("first");
            throw new Error("close failed");
          },
        },
        {
          name: "marko-run",
          version: "test",
          async teardown() {
            events.push("second");
          },
        },
      ],
      fastRun,
    );
    expect(events).toEqual(["first", "second"]);
    expect(result).toMatchObject({
      rows: expect.arrayContaining([
        expect.objectContaining({
          caseName: "app build output gzip bytes",
          value: 123,
          status: "completed",
        }),
      ]),
      cleanup: [
        { adapter: "mreact-app-router", status: "failed", error: "close failed" },
        { adapter: "marko-run", status: "completed" },
      ],
    });
  });

  it("saves measurements before cleanup and still cleans up if saving fails", async () => {
    const events: string[] = [];
    await expect(
      runRouterBenchmarks(
        [
          {
            name: "mreact-app-router",
            version: "test",
            async teardown() {
              events.push("cleanup");
            },
          },
        ],
        {
          ...fastRun,
          async onMeasurementsComplete() {
            events.push("save");
            throw new Error("disk full");
          },
        },
      ),
    ).rejects.toThrow("disk full");
    expect(events).toEqual(["save", "cleanup"]);
  });
});
