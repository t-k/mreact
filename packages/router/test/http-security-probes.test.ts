import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request as nodeRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import { renderBuiltAppRequest, startServer } from "../src/serve.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("built HTTP security probes", () => {
  test("rejects percent-encoded client asset traversal through the Node server", async () => {
    const { rootDir, outDir } = await buildHello();
    cleanupDirs.push(rootDir);
    await writeFile(join(outDir, "client", "secret.js"), "client-secret");
    await mkdir(join(outDir, "client", "assets"), { recursive: true });
    await writeFile(join(outDir, "client", "assets", "secret.js"), "asset-secret");
    const server = await startServer({ outDir, port: 0 });
    const traversalPaths = [
      "/_mreact/client/..%2F..%2F..%2Fetc%2Fpasswd",
      "/_mreact/client/%2Fetc/passwd",
      "/_mreact/client/%2e%2e/%2e%2e/etc/passwd",
      "/_mreact/client/assets/routes/..%2F..%2F..%2Fetc%2Fpasswd",
      "/_mreact/client/..%2Fserver%2Fimport-policy.json",
      "/_mreact/client/assets/%2e%2e/secret.js",
      "/_mreact/client/%00secret.js",
      "/_mreact/client/assets/%252e%252e/secret.js",
      "/_mreact/client/assets%5Csecret.js",
    ];

    try {
      for (const path of traversalPaths) {
        const response = await rawGet(server.url, path);

        expect(response.status).toBe(404);
        expect(response.body).not.toContain("root:");
        expect(response.body).not.toContain("client-secret");
        expect(response.body).not.toContain("asset-secret");
      }

      const directSecret = await fetch(`${server.url}/_mreact/client/secret.js`);
      expect(directSecret.status).toBe(404);
      await expect(directSecret.text()).resolves.not.toContain("client-secret");

      const directRuntimeTraversal = await renderBuiltAppRequest({
        outDir,
        request: new Request("http://local.test/_mreact/client/assets/%2e%2e/secret.js"),
      });
      expect(directRuntimeTraversal.status).toBe(404);
      await expect(directRuntimeTraversal.text()).resolves.not.toContain("client-secret");
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

async function rawGet(
  origin: string,
  path: string,
): Promise<{ body: string; status: number | undefined }> {
  const url = new URL(origin);

  return await new Promise((resolve, reject) => {
    const req = nodeRequest(
      {
        hostname: url.hostname,
        method: "GET",
        path,
        port: url.port,
      },
      (res) => {
        res.setEncoding("utf8");
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ body, status: res.statusCode });
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

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
