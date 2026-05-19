import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import {
  createCloudflareBuiltRequestHandler,
  createCloudflarePrerenderStore,
  createCloudflareRequestHandler,
  createCloudflareRouteModuleRenderer,
  createCloudflareStaticAssetLoader,
  collectCloudflareRouteModules,
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

  test("renders matched dynamic routes from a Cloudflare route module registry", async () => {
    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest: {
        routes: [
          {
            bytes: 128,
            client: true,
            kind: "page",
            path: "/users/:id",
            script: "assets/routes/users-id.abc123.js",
          },
        ],
      },
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: {
          "users/$id/page.tsx": {
            loader({ params, request }) {
              return {
                id: params.id,
                url: request.url,
              };
            },
            default({ data, params }) {
              return `<main>${params.id}:${data.id}</main>`;
            },
          },
        },
      }),
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
      new Request("https://app.example/users/ada"),
      {},
      createExecutionContext(),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(html).toContain(
      '<link rel="modulepreload" href="/_mreact/client/assets/routes/users-id.abc123.js">',
    );
    expect(html).toContain("<main>ada:ada</main>");
  });

  test("collects Cloudflare route modules from an import.meta.glob-style registry", async () => {
    const registry = collectCloudflareRouteModules(
      {
        "./cloudflare-routes/users/$id/page.js": () =>
          Promise.resolve({
            default({ params }) {
              return `<main>${params.id}</main>`;
            },
          }),
      },
      {
        manifest: {
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
      },
    );
    const module = await registry["users/$id/page.tsx"]?.();

    expect(
      module?.default?.({
        clientManifest: { routes: [] },
        context: createExecutionContext(),
        data: undefined,
        env: {},
        params: { id: "ada" },
        request: new Request("https://app.example/users/ada"),
        route: {
          file: "users/$id/page.tsx",
          kind: "page",
          path: "/users/:id",
          segments: [
            { kind: "static", value: "users" },
            { kind: "dynamic", name: "id" },
          ],
        },
        serverManifest: { files: {}, routes: [], version: 1 },
      }),
    ).toBe("<main>ada</main>");
  });

  test("build emits a Workers-safe route module registry for dynamic pages", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-built-modules-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "components"), { recursive: true });
    await mkdir(join(appDir, "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "components", "Name.tsx"),
      `export function Name(props) {
  return <strong>{props.value}</strong>;
}`,
    );
    await writeFile(
      join(appDir, "users", "$id", "page.tsx"),
      `import { Name } from "../../components/Name";

export async function loader({ params }) {
  return { value: params.id.toUpperCase() };
}

export default function Page(props) {
  return <main>User <Name value={props.data.value} /></main>;
}`,
    );
    await buildApp({ appDir, outDir });
    const registryPath = join(outDir, "cloudflare", "route-modules.mjs");
    const registrySource = await readFile(registryPath, "utf8");
    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    );
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    );
    const registry = (await import(pathToFileURL(registryPath).href)) as {
      routeModules: Record<string, () => Promise<unknown>>;
    };

    expect(registrySource).not.toContain("import.meta.glob");
    expect(Object.keys(registry.routeModules)).toEqual(["users/$id/page.tsx"]);

    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest,
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: registry.routeModules,
      }),
      serverManifest,
    });
    const response = await handler.fetch(
      new Request("https://app.example/users/ada"),
      {},
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>User <strong>ADA</strong></main>");
  });

  test("build fails when a dynamic Cloudflare route module cannot be generated", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-unsupported-module-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "users", "$id", "page.tsx"),
      `import { createHash } from "node:crypto";

export default function Page() {
  return <main>{createHash("sha256").update("ada").digest("hex")}</main>;
}`,
    );

    await expect(buildApp({ appDir, outDir })).rejects.toThrow(
      /Failed to build Cloudflare route module/,
    );
  });

  test("build emits a Workers-safe route module for stream pages", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-stream-route-module-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "components"), { recursive: true });
    await mkdir(join(appDir, "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "components", "Name.mreact.tsx"),
      `export function Name(props) {
  return <strong>{props.value}</strong>;
}`,
    );
    await writeFile(
      join(appDir, "users", "$id", "page.tsx"),
      `import { Name } from "../../components/Name.mreact";

export const stream = true;

export async function loader({ params }) {
  return { value: params.id.toUpperCase() };
}

export default function Page(props) {
  return <main>User <Name value={props.data.value} /> <Await value={Promise.resolve(props.data.value)} placeholder={<em>loading</em>}>{name => <span>{name}</span>}</Await></main>;
}`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registryPath = join(outDir, "cloudflare", "route-modules.mjs");
    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    );
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    );
    const registry = (await import(pathToFileURL(registryPath).href)) as {
      routeModules: Record<string, () => Promise<unknown>>;
    };
    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest,
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: registry.routeModules,
      }),
      serverManifest,
    });
    const response = await handler.fetch(
      new Request("https://app.example/users/ada"),
      {},
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(await response.text()).toContain("<strong>ADA</strong>");
  });

  test("built stream route modules render when Buffer is unavailable", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-no-buffer-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export const stream = true;

export default function Page() {
  return <main><Await value={Promise.resolve("Ada")} placeholder={<em>loading</em>}>{name => <strong>{name}</strong>}</Await></main>;
}`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registry = (await import(
      pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href
    )) as {
      routeModules: Record<string, () => Promise<unknown>>;
    };
    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    );
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    );
    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest,
      onError(error) {
        throw error;
      },
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: registry.routeModules,
      }),
      serverManifest,
    });
    const globalWithBuffer = globalThis as typeof globalThis & { Buffer?: unknown };
    const previousBuffer = globalWithBuffer.Buffer;

    try {
      globalWithBuffer.Buffer = { ...(previousBuffer as object), allocUnsafe: undefined };
      const response = await handler.fetch(
        new Request("https://app.example/"),
        {},
        createExecutionContext(),
      );
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("x-mreact-stream")).toBe("1");
      expect(html).toContain("<strong>Ada</strong>");
    } finally {
      globalWithBuffer.Buffer = previousBuffer;
    }
  });

  test("build preserves conditional mapped lists inside Cloudflare stream Await renderers", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-await-map-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export const stream = true;

export default function Page() {
  const batch = Promise.resolve({
    kind: "loaded",
    stories: [{ title: "Ada" }, { title: "Grace" }],
  });

  return (
    <Await value={batch} placeholder={<ol />}>
      {(value) => (
        <>
          {value.kind === "loaded" && value.stories.length > 0 ? (
            <ol>
              {value.stories.map((story, index) => (
                <li value={index + 1}>{story.title}</li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </Await>
  );
}`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registry = (await import(
      pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href
    )) as {
      routeModules: Record<string, () => Promise<unknown>>;
    };
    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    );
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    );
    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest,
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: registry.routeModules,
      }),
      serverManifest,
    });
    const response = await handler.fetch(
      new Request("https://app.example/"),
      {},
      createExecutionContext(),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).toContain('<ol><li value="1">Ada</li><li value="2">Grace</li></ol>');
  });

  test("fails loudly when Cloudflare route module glob entries drift from the manifest", () => {
    const manifest = {
      files: {},
      routes: [
        {
          file: "users/$id/page.tsx",
          kind: "page" as const,
          path: "/users/:id",
          segments: [
            { kind: "static" as const, value: "users" },
            { kind: "dynamic" as const, name: "id" },
          ],
        },
      ],
      version: 1 as const,
    };

    expect(() => collectCloudflareRouteModules({}, { manifest })).toThrow(
      /Missing Cloudflare route module.*users\/\$id\/page\.tsx/,
    );

    expect(() =>
      collectCloudflareRouteModules(
        {
          "./cloudflare-routes/extra/page.js": {},
          "./cloudflare-routes/users/$id/page.js": {},
        },
        { manifest },
      ),
    ).toThrow(/Extra Cloudflare route module.*extra\/page/);
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
