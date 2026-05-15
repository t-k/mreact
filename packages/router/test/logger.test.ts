import { createServer } from "node:http";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import { createNodeRequestHandler } from "../src/adapters/node.js";
import { startServer } from "../src/serve.js";
import type { AppRouterLogEvent, AppRouterLogger } from "../src/logger.js";

describe("router logger", () => {
  test("startServer emits non-sensitive request lifecycle events", async () => {
    const { outDir } = await buildFixture("mreact-router-logger-start-", {
      "page.tsx": "export default function Page() { return <main>Logger</main>; }",
    });
    const events: AppRouterLogEvent[] = [];
    const logger: AppRouterLogger = {
      info(event) {
        events.push(event);
      },
    };
    const server = await startServer({ logger, outDir, port: 0 });

    try {
      const response = await fetch(`${server.url}/?token=secret`, {
        headers: {
          authorization: "Bearer secret",
        },
      });

      expect(response.status).toBe(200);
      await eventually(() => {
        expect(events.map((event) => event.type)).toEqual([
          "router:request:start",
          "router:request:end",
        ]);
      });
      expect(events[0]).toMatchObject({
        method: "GET",
        path: "/",
        runtime: "node",
        type: "router:request:start",
      });
      expect(events[1]).toMatchObject({
        method: "GET",
        path: "/",
        runtime: "node",
        status: 200,
        type: "router:request:end",
      });
      expect(JSON.stringify(events)).not.toContain("secret");
      expect(JSON.stringify(events)).not.toContain("authorization");
    } finally {
      await server.close();
    }
  });

  test("logger failures do not fail the handled request", async () => {
    const { outDir } = await buildFixture("mreact-router-logger-throw-", {
      "page.tsx": "export default function Page() { return <main>Logger survives</main>; }",
    });
    let calls = 0;
    const logger: AppRouterLogger = {
      async info() {
        calls += 1;
        throw new Error("logger sink failed");
      },
    };
    const server = await startServer({ logger, outDir, port: 0 });

    try {
      const response = await fetch(`${server.url}/`);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain("<main>Logger survives</main>");
      await eventually(() => {
        expect(calls).toBeGreaterThan(0);
      });
    } finally {
      await server.close();
    }
  });

  test("Node adapter emits request lifecycle events through the logger", async () => {
    const { outDir } = await buildFixture("mreact-router-logger-node-", {
      "page.tsx": "export default function Page() { return <main>Node logger</main>; }",
    });
    const events: AppRouterLogEvent[] = [];
    const logger: AppRouterLogger = {
      error(event) {
        events.push(event);
      },
      info(event) {
        events.push(event);
      },
    };
    const handler = createNodeRequestHandler({
      allowedHosts: ["example.test"],
      logger,
      outDir,
    });
    const server = createServer(handler);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);

      expect(response.status).toBe(200);
      await eventually(() => {
        expect(events.some((event) => event.type === "router:request:end")).toBe(true);
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    }
  });
});

async function buildFixture(
  prefix: string,
  files: Record<string, string>,
): Promise<{ outDir: string }> {
  const rootDir = await mkdtemp(join(tmpdir(), prefix));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(appDir, { recursive: true });

  for (const [file, code] of Object.entries(files)) {
    await writeFile(join(appDir, file), code);
  }

  await buildApp({ appDir, outDir });

  return { outDir };
}

async function eventually(assertion: () => void): Promise<void> {
  const started = performance.now();
  let lastError: unknown;

  while (performance.now() - started < 500) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}
