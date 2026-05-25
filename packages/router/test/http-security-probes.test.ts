import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import { startServer } from "../src/serve.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("built HTTP security probes", () => {
  test("rejects percent-encoded client asset traversal through the Node server", async () => {
    const { rootDir, outDir } = await buildHello();
    cleanupDirs.push(rootDir);
    const server = await startServer({ outDir, port: 0 });
    const traversalPaths = [
      "/_mreact/client/..%2F..%2F..%2Fetc%2Fpasswd",
      "/_mreact/client/%2e%2e/%2e%2e/etc/passwd",
      "/_mreact/client/assets/routes/..%2F..%2F..%2Fetc%2Fpasswd",
    ];

    try {
      for (const path of traversalPaths) {
        const response = await fetch(`${server.url}${path}`);
        const body = await response.text();

        expect(response.status).toBe(404);
        expect(body).not.toContain("root:");
      }
    } finally {
      await server.close();
    }
  });

  test("returns no response body for HEAD requests to built pages", async () => {
    const { rootDir, outDir } = await buildHello();
    cleanupDirs.push(rootDir);
    const server = await startServer({ outDir, port: 0 });

    try {
      const response = await fetch(`${server.url}/`, { method: "HEAD" });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("");
    } finally {
      await server.close();
    }
  });

  test("rejects unsafe page methods through the Node server without serving page HTML", async () => {
    const { rootDir, outDir } = await buildHello();
    cleanupDirs.push(rootDir);
    const server = await startServer({ outDir, port: 0 });

    try {
      for (const method of ["PATCH", "PUT", "DELETE", "PROPFIND", "MKCOL"]) {
        const response = await fetch(`${server.url}/`, { method });
        const body = await response.text();

        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
        expect(body).toBe("Method Not Allowed");
        expect(body).not.toContain("<main>");
      }
    } finally {
      await server.close();
    }
  });
});

async function buildHello(): Promise<{ outDir: string; rootDir: string }> {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-http-security-"));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(appDir, { recursive: true });
  await writeFile(
    join(appDir, "page.mreact.tsx"),
    `export default function Page() { return <main>Hello</main>; }`,
  );
  await buildApp({ appDir, outDir });
  return { outDir, rootDir };
}
