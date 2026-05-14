import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import {
  createCloudflareBuiltRequestHandler,
  createCloudflarePrerenderStore,
  createCloudflareRequestHandler,
  createCloudflareStaticAssetLoader,
} from "../src/adapters/cloudflare.js";

describe("mreact Cloudflare Workers adapter", () => {
  test("serves prerendered routes and client assets without filesystem access", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-adapter-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export const prerender = true;
export default function Page() { return <main>Cloudflare route</main>; }`,
    );
    await buildApp({ appDir, outDir });
    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    );
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    );
    const handler = createCloudflareRequestHandler({
      assets: {
        async fetch(pathname) {
          if (pathname === "/_mreact/client/manifest.json") {
            return new Response(JSON.stringify(clientManifest), {
              headers: { "content-type": "application/json" },
            });
          }

          return undefined;
        },
      },
      clientManifest,
      serverManifest,
    });

    const routeResponse = await handler.fetch(
      new Request("https://app.example/"),
      {},
      createExecutionContext(),
    );
    const assetResponse = await handler.fetch(
      new Request("https://app.example/_mreact/client/manifest.json"),
      {},
      createExecutionContext(),
    );

    expect(routeResponse.status).toBe(200);
    expect(await routeResponse.text()).toContain("<main>Cloudflare route</main>");
    expect(assetResponse.status).toBe(200);
    await expect(assetResponse.json()).resolves.toEqual(clientManifest);
  });

  test("delegates dynamic routes to an injected edge render function", async () => {
    const handler = createCloudflareRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      render(request) {
        return new Response(`dynamic:${new URL(request.url).pathname}`);
      },
      serverManifest: {
        files: {},
        routes: [{ file: "page.tsx", kind: "page", path: "/", segments: [] }],
        version: 1,
      },
    });

    const response = await handler.fetch(
      new Request("https://app.example/dashboard"),
      { accountId: "acct_1" },
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("dynamic:/dashboard");
  });

  test("matches dynamic built routes before calling the Cloudflare route renderer", async () => {
    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      renderRoute(_request, context) {
        return new Response(`${context.route.path}:${context.params.id}`);
      },
      serverManifest: {
        files: {},
        routes: [
          {
            file: "users/$id/page.tsx",
            kind: "page",
            path: "/users/:id",
            segments: [
              { kind: "static", value: "users" },
              { kind: "dynamic", name: "id" },
            ],
          },
        ],
        version: 1,
      },
    });

    const response = await handler.fetch(
      new Request("https://app.example/users/ada%20lovelace"),
      {},
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("/users/:id:ada lovelace");
  });

  test("serves only allow-listed client assets from a Cloudflare asset binding", async () => {
    const requested: string[] = [];
    const loader = createCloudflareStaticAssetLoader({
      binding: {
        fetch(request) {
          requested.push(new URL(request.url).pathname);
          return new Response("asset");
        },
      },
      clientManifest: {
        routes: [
          {
            client: true,
            kind: "page",
            path: "/",
            script: "assets/routes/index.abc123.js",
            sourceMap: "assets/routes/index.abc123.js.map",
          },
        ],
      },
    });
    const context = createExecutionContext();

    await expect(
      loader.fetch?.(
        "/_mreact/client/assets/routes/index.abc123.js",
        new Request("https://app.example/_mreact/client/assets/routes/index.abc123.js"),
        {},
        context,
      ),
    ).resolves.toHaveProperty("status", 200);
    await expect(
      loader.fetch?.(
        "/_mreact/client/assets/routes/../secrets.js",
        new Request("https://app.example/_mreact/client/assets/routes/../secrets.js"),
        {},
        context,
      ),
    ).resolves.toBeUndefined();
    await expect(
      loader.fetch?.(
        "/_mreact/client/assets/routes/%2e%2e/secrets.js",
        new Request("https://app.example/_mreact/client/assets/routes/%2e%2e/secrets.js"),
        {},
        context,
      ),
    ).resolves.toBeUndefined();

    expect(requested).toEqual(["/_mreact/client/assets/routes/index.abc123.js"]);
  });

  test("stores prerendered entries through the Cloudflare Cache API shape", async () => {
    const cache = createMemoryCloudflareCache();
    const store = createCloudflarePrerenderStore({ cache });

    await store.set("/about", {
      headers: { "content-type": "text/html; charset=utf-8" },
      html: "<main>About</main>",
      status: 200,
    });

    await expect(store.get("/about")).resolves.toEqual({
      headers: { "content-type": "text/html; charset=utf-8" },
      html: "<main>About</main>",
      status: 200,
    });
    await store.delete("/about");
    await expect(store.get("/about")).resolves.toBeUndefined();
  });

  test("keeps the Cloudflare adapter runtime free of Node imports", async () => {
    const source = await readFile(
      join(process.cwd(), "packages/router/src/adapters/cloudflare.ts"),
      "utf8",
    );

    expect(source).not.toContain("node:");
    expect(source).not.toContain("fs/promises");
    expect(source).not.toContain("node:path");
  });
});

function createExecutionContext(): ExecutionContext {
  return {
    passThroughOnException() {},
    waitUntil() {},
  };
}

interface ExecutionContext {
  passThroughOnException(): void;
  waitUntil(promise: Promise<unknown>): void;
}

function createMemoryCloudflareCache() {
  const entries = new Map<string, Response>();

  return {
    async delete(input: Request | string): Promise<boolean> {
      return entries.delete(cacheKey(input));
    },
    async match(input: Request | string): Promise<Response | undefined> {
      return entries.get(cacheKey(input))?.clone();
    },
    async put(input: Request | string, response: Response): Promise<void> {
      entries.set(cacheKey(input), response.clone());
    },
  };
}

function cacheKey(input: Request | string): string {
  return typeof input === "string" ? input : input.url;
}
