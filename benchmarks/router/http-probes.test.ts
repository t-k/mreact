import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  measureConcurrentRequests,
  measureConcurrentRequestsWithServerRss,
} from "./http-probes.js";

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

  it("reports raw RSS deltas without clamping negative samples", async () => {
    const source = await readFile(new URL("./http-probes.ts", import.meta.url), "utf8");
    const resultSource = source.slice(source.indexOf("return {"), source.indexOf("function percentile"));

    expect(resultSource).not.toContain("Math.max(0");
    expect(resultSource).toContain("process.memoryUsage().rss - beforeRss");
  });

  it("measures RSS delta from the server child process instead of the runner process", async () => {
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { createServer } from "node:http";
const retained = [];
const server = createServer((_request, response) => {
  retained.push(Buffer.alloc(8 * 1024 * 1024, 1));
  response.setHeader("content-type", "text/html");
  response.end("<main>ok</main>");
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  console.log(JSON.stringify({ port: address.port }));
});`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    try {
      const port = await waitForChildPort(child);
      const pid = child.pid;
      if (pid === undefined) {
        throw new Error("child process did not expose a pid");
      }

      const result = await measureConcurrentRequestsWithServerRss(
        `http://127.0.0.1:${port}`,
        pid,
        {
          concurrency: 1,
          path: "/",
          totalRequests: 3,
          validate(body) {
            expect(body).toContain("ok");
          },
        },
      );

      expect(result.rssDeltaBytes).toBeGreaterThan(0);
      expect(Number.isFinite(result.p99Ms)).toBe(true);
      expect(result.throughputOps).toBeGreaterThan(0);
    } finally {
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    }
  });
});

async function waitForChildPort(child: ReturnType<typeof spawn>): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      reject(new Error(`child server did not report a port: ${stderr}`));
    }, 10_000);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      for (const line of stdout.split(/\r?\n/)) {
        try {
          const parsed = JSON.parse(line) as { port?: unknown };
          if (typeof parsed.port === "number") {
            clearTimeout(timeout);
            resolve(parsed.port);
          }
        } catch {
          // Keep waiting for complete JSON.
        }
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
