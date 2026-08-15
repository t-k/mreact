import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, request as nodeRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import { createNodeRequestHandler } from "../src/adapters/node.js";
import { renderBuiltAppRequest, startServer } from "../src/serve.js";

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("built HTTP security probes", () => {
  test.each(["createNodeRequestHandler", "startServer"] as const)(
    "%s keeps strict allowedHosts authoritative for protocol-relative request targets",
    async (entryPoint) => {
      const { rootDir, outDir } = await buildRequestUrlEcho();
      cleanupDirs.push(rootDir);
      const server =
        entryPoint === "startServer"
          ? await startServer({
              allowedHosts: ["api.example"],
              hostPolicy: "strict",
              outDir,
              port: 0,
            })
          : await startNodeHandlerServer(outDir);

      try {
        for (const target of [
          "//evil.example/echo",
          "///evil.example/echo?x=1",
          "//user@evil.example:8443/echo",
        ]) {
          const response = await rawGet(server.url, target, "api.example");

          expect(response.status).toBe(200);
          expect(response.body).toBe(`http://api.example${target}`);
        }

        const ordinary = await rawGet(
          server.url,
          "/echo?x=%2Fvalue&name=a%20b",
          "api.example",
        );
        expect(ordinary.status).toBe(200);
        expect(ordinary.body).toBe("http://api.example/echo?x=%2Fvalue&name=a%20b");
      } finally {
        await server.close();
      }
    },
  );

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
  host?: string,
): Promise<{ body: string; status: number | undefined }> {
  const url = new URL(origin);

  return await new Promise((resolve, reject) => {
    const req = nodeRequest(
      {
        hostname: url.hostname,
        method: "GET",
        path,
        port: url.port,
        ...(host === undefined ? {} : { headers: { host } }),
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

async function startNodeHandlerServer(
  outDir: string,
): Promise<{ close(): Promise<void>; url: string }> {
  const server = createServer(
    createNodeRequestHandler({
      allowedHosts: ["api.example"],
      hostPolicy: "strict",
      outDir,
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;

  return {
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    },
    url: `http://127.0.0.1:${port}`,
  };
}

async function buildRequestUrlEcho(): Promise<{ outDir: string; rootDir: string }> {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-node-request-target-"));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(join(appDir, "$...path"), { recursive: true });
  await writeFile(
    join(appDir, "$...path", "route.ts"),
    `export function GET(request) {
  return new Response(request.url, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}`,
  );
  await buildApp({ appDir, outDir });
  return { outDir, rootDir };
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
