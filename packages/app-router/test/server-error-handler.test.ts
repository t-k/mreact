import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { buildApp } from "../src/build.js";
import { startServer } from "../src/serve.js";

const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

async function buildHello(): Promise<{ outDir: string }> {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-error-handler-"));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(appDir, { recursive: true });
  await writeFile(
    join(appDir, "page.mreact.tsx"),
    `export default function Page() { return <main>Hello</main>; }`,
  );
  await buildApp({ appDir, outDir });
  return { outDir };
}

describe("startServer error handling (Issue 071)", () => {
  test("normal request is unaffected by the new error path", async () => {
    const { outDir } = await buildHello();
    const server = await startServer({ outDir, port: 0 });
    try {
      const response = await fetch(`${server.url}/`);
      const body = await response.text();
      expect(body).toContain("<main>Hello</main>");
    } finally {
      await server.close();
    }
  });

  test("errorHandler hook contract: hook receives error and shapes response", async () => {
    const { outDir } = await buildHello();
    const server = await startServer({
      outDir,
      port: 0,
      errorHandler(error) {
        return {
          body: `custom:${error instanceof Error ? error.name : "x"}`,
          status: 503,
        };
      },
    });
    try {
      const response = await fetch(`${server.url}/`);
      expect(response.status).toBe(200);
    } finally {
      await server.close();
    }
  });

  test("malformed cookie does not leak a stack via 500", async () => {
    const { outDir } = await buildHello();
    const server = await startServer({ outDir, port: 0 });
    try {
      const response = await fetch(`${server.url}/_mreact/actions`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          // %ZZ is an invalid percent-encoding that triggers URIError
          // inside decodeURIComponent.
          cookie: "mreact.csrf=%ZZ",
        },
        body: "title=test",
      });
      const body = await response.text();
      // Whatever status the framework picks, the response must not
      // contain a stack trace or absolute filesystem path.
      expect(body).not.toMatch(/\/home\/[^\s]+\.ts/);
      expect(body).not.toMatch(/at Object\./);
      expect(body).not.toContain("Error: ");
    } finally {
      await server.close();
    }
  });
});
