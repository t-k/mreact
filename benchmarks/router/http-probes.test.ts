import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { measureConcurrentRequests } from "./http-probes.js";

describe("router HTTP probes", () => {
  it("issues exactly totalRequests under bounded concurrency and returns finite summaries", async () => {
    let requestCount = 0;
    const server = createServer((_request, response) => {
      requestCount += 1;
      response.setHeader("content-type", "text/html");
      response.end("<main>ok</main>");
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;

    try {
      const result = await measureConcurrentRequests(`http://127.0.0.1:${port}`, {
        concurrency: 2,
        path: "/",
        totalRequests: 5,
        validate(body) {
          expect(body).toContain("ok");
        },
      });

      expect(requestCount).toBe(5);
      expect(Number.isFinite(result.p99Ms)).toBe(true);
      expect(Number.isFinite(result.rssDeltaBytes)).toBe(true);
      expect(Number.isFinite(result.throughputOps)).toBe(true);
      expect(result.throughputOps).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    }
  });
});
