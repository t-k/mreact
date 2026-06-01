import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
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

  test("propagates default security headers from built app responses", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-security-headers-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>Cloudflare security</main>;
}`,
    );
    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registry = await import(pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href) as {
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
      renderRoute: createCloudflareRouteModuleRenderer<typeof env>({
        modules: registry.routeModules,
      }),
      serverManifest,
    });

    const response = await handler.fetch(
      new Request("https://app.example/"),
      {},
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("permissions-policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });

  test("Cloudflare route modules can import parseMultipartStream from the router entrypoint", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-multipart-shim-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "api", "upload"), { recursive: true });
    await writeFile(
      join(appDir, "api", "upload", "route.ts"),
      `import { parseMultipartStream } from "@reckona/mreact-router";

export async function POST(request: Request) {
  let count = 0;
  for await (const _part of parseMultipartStream(request)) {
    count += 1;
  }
  return Response.json({ count });
}`,
    );

    await expect(buildApp({ appDir, outDir, targets: ["cloudflare"] })).resolves.toBeDefined();
  });

  test("skips Cloudflare prerendered HTML bodies for client navigation requests", async () => {
    const handler = createCloudflareRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      serverManifest: {
        files: {},
        prerenderedRoutes: {
          "/": {
            headers: { "content-type": "text/html; charset=utf-8" },
            html: "<!DOCTYPE html><html><body><main>Prerendered</main></body></html>",
            status: 200,
          },
        },
        routes: [{ file: "page.tsx", kind: "page", path: "/", segments: [] }],
        version: 1,
      },
    });

    const response = await handler.fetch(
      new Request("https://app.example/", {
        headers: { "x-mreact-navigation": "1" },
      }),
      {},
      createExecutionContext(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("x-mreact-navigation")).toBe("reload");
    expect(await response.text()).toBe("");
  });

  test("serves navigation-compatible Cloudflare prerendered HTML with route markers", async () => {
    const handler = createCloudflareRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      serverManifest: {
        files: {},
        prerenderedRoutes: {
          "/": {
            headers: { "content-type": "text/html; charset=utf-8" },
            html: '<!DOCTYPE html><div data-mreact-route-id="index"><main>Prerendered</main></div>',
            status: 200,
          },
        },
        routes: [{ file: "page.tsx", kind: "page", path: "/", segments: [] }],
        version: 1,
      },
    });

    const response = await handler.fetch(
      new Request("https://app.example/", {
        headers: { "x-mreact-navigation": "1" },
      }),
      {},
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-navigation")).toBeNull();
    expect(await response.text()).toContain('data-mreact-route-id="index"');
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

  test("marks streamed HTML so Cloudflare does not gzip-buffer the first paint", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("<main>shell</main>"));
        controller.close();
      },
    });
    const handler = createCloudflareRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      render() {
        return new Response(stream, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-mreact-stream": "1",
          },
        });
      },
      serverManifest: {
        files: {},
        routes: [{ file: "page.tsx", kind: "page", path: "/", segments: [] }],
        version: 1,
      },
    });

    const response = await handler.fetch(
      new Request("https://app.example/"),
      {},
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(response.headers.get("cache-control")).toBe("no-transform");
    expect(response.headers.get("content-encoding")).toBe("identity");
    expect(await response.text()).toBe("<main>shell</main>");
  });

  test("applies the global response hook to Cloudflare rendered responses", async () => {
    const handler = createCloudflareRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      onResponse(response) {
        response.headers.set("x-frame-options", "DENY");
      },
      render() {
        return new Response("<main>secure</main>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
      serverManifest: {
        files: {},
        routes: [{ file: "page.tsx", kind: "page", path: "/", segments: [] }],
        version: 1,
      },
    });

    const response = await handler.fetch(
      new Request("https://app.example/"),
      {},
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(await response.text()).toBe("<main>secure</main>");
  });

  test("serves generated public asset entries from the Cloudflare asset binding", async () => {
    const fetched: string[] = [];
    const loader = createCloudflareStaticAssetLoader({
      binding: {
        fetch(request) {
          fetched.push(new URL(request.url).pathname);
          return new Response("asset");
        },
      },
      clientManifest: {
        publicAssets: ["/styles.css", "/robots.txt"],
        routes: [],
      },
    });

    const styles = await loader.fetch?.(
      "/styles.css",
      new Request("https://app.example/styles.css"),
      {},
      createExecutionContext(),
    );
    const missing = await loader.fetch?.(
      "/secret.txt",
      new Request("https://app.example/secret.txt"),
      {},
      createExecutionContext(),
    );

    expect(styles?.status).toBe(200);
    expect(await styles?.text()).toBe("asset");
    expect(missing).toBeUndefined();
    expect(fetched).toEqual(["/styles.css"]);
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

  test("passes Cloudflare env and execution context to server route handlers", async () => {
    const executionContext = createExecutionContext();
    const env = {
      MEDIA: {
        async put(key: string, value: string) {
          return `${key}:${value}`;
        },
      },
    };
    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      renderRoute: createCloudflareRouteModuleRenderer<typeof env>({
        modules: {
          "api/upload/route.ts": {
            async POST(request, context) {
              const result = await context.env.MEDIA.put(
                context.params.id,
                await request.text(),
              );

              return Response.json({
                contextMatches: context.context === executionContext,
                method: request.method,
                requestMatches: context.request === request,
                result,
                route: context.route.path,
              });
            },
          },
        },
      }),
      serverManifest: {
        files: {},
        routes: [
          {
            file: "api/upload/route.ts",
            kind: "server",
            path: "/api/upload/:id",
            segments: [
              { kind: "static", value: "api" },
              { kind: "static", value: "upload" },
              { kind: "dynamic", name: "id" },
            ],
          },
        ],
        version: 1,
      },
    });
    const request = new Request("https://app.example/api/upload/avatar", {
      body: "bytes",
      method: "POST",
    });

    const response = await handler.fetch(request, env, executionContext);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      contextMatches: true,
      method: "POST",
      requestMatches: true,
      result: "avatar:bytes",
      route: "/api/upload/:id",
    });
  });

  test("skips Cloudflare route module rendering for client navigation requests", async () => {
    let loaded = 0;
    let rendered = 0;
    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: {
          "page.tsx": () => {
            loaded += 1;
            return {
              default() {
                rendered += 1;
                return "<main>Cloudflare route</main>";
              },
            };
          },
        },
      }),
      serverManifest: {
        files: {},
        routes: [{ file: "page.tsx", kind: "page", path: "/", segments: [] }],
        version: 1,
      },
    });

    const response = await handler.fetch(
      new Request("https://app.example/", {
        headers: { "x-mreact-navigation": "1" },
      }),
      {},
      createExecutionContext(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("x-mreact-navigation")).toBe("reload");
    expect(await response.text()).toBe("");
    expect(loaded).toBe(0);
    expect(rendered).toBe(0);
  });

  test("renders matched dynamic routes from a Cloudflare route module registry", async () => {
    const env = { mode: "cloudflare" };
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
            loader({ env: loaderEnv, params, request }) {
              return {
                envMatches: loaderEnv === env,
                id: params.id,
                mode: loaderEnv.mode,
                url: request.url,
              };
            },
            default({ data, env: componentEnv, params }) {
              const loaderData = data as {
                envMatches: boolean;
                id: string;
                mode: string;
              };
              return `<main>${params.id}:${loaderData.id}:${loaderData.mode}:${loaderData.envMatches}:${componentEnv === env}</main>`;
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
      env,
      createExecutionContext(),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(html).toContain(
      '<link rel="modulepreload" href="/_mreact/client/assets/routes/users-id.abc123.js">',
    );
    expect(html).toContain("<main>ada:ada:cloudflare:true:true</main>");
  });

  test("passes through Response values thrown from Cloudflare page loaders", async () => {
    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: {
          "page.tsx": {
            loader({ request }) {
              throw Response.redirect(new URL("/login", request.url), 303);
            },
            default() {
              return "<main>Home</main>";
            },
          },
        },
      }),
      serverManifest: {
        files: {},
        routes: [{ file: "page.tsx", kind: "page", path: "/", segments: [] }],
        version: 1,
      },
    });

    const response = await handler.fetch(
      new Request("https://app.example/"),
      {},
      createExecutionContext(),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example/login");
    expect(await response.text()).toBe("");
  });

  test("returns 404 when a Cloudflare page loader throws notFound", async () => {
    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: {
          "blog/$...slug/page.tsx": {
            loader() {
              const error = new Error("Not Found");
              error.name = "MReactNotFound";
              throw error;
            },
            default() {
              return "<main>Blog</main>";
            },
          },
        },
      }),
      serverManifest: {
        files: {},
        routes: [
          {
            file: "blog/$...slug/page.tsx",
            kind: "page",
            path: "/blog/:...slug",
            segments: [
              { kind: "static", value: "blog" },
              { kind: "catch-all", name: "slug" },
            ],
          },
        ],
        version: 1,
      },
    });

    const response = await handler.fetch(
      new Request("https://app.example/blog/missing"),
      {},
      createExecutionContext(),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Not Found");
  });

  test("build emits Cloudflare route modules for metadata conventions", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-metadata-routes-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      "export const prerender = true; export default function Page() { return <main>Home</main>; }",
    );
    await writeFile(
      join(appDir, "sitemap.ts"),
      `export default function sitemap({ baseUrl }) {
  return [{ url: baseUrl + "/" }];
}
`,
    );
    await writeFile(
      join(appDir, "robots.ts"),
      `export default function robots({ baseUrl }) {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: baseUrl + "/sitemap.xml" };
}
`,
    );
    await writeFile(
      join(appDir, "manifest.ts"),
      `export default function manifest() {
  return { name: "Cloudflare Metadata", short_name: "CFM" };
}
`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registryPath = join(outDir, "cloudflare", "route-modules.mjs");
    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    );
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    );
    const registry = await import(pathToFileURL(registryPath).href) as {
      routeModules: Record<string, () => Promise<unknown>>;
    };

    expect(Object.keys(registry.routeModules).sort()).toEqual([
      "manifest.ts",
      "robots.ts",
      "sitemap.ts",
    ]);

    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest,
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: registry.routeModules,
      }),
      serverManifest,
    });
    const sitemap = await handler.fetch(
      new Request("https://app.example/sitemap.xml"),
      {},
      createExecutionContext(),
    );
    const robots = await handler.fetch(
      new Request("https://app.example/robots.txt"),
      {},
      createExecutionContext(),
    );
    const manifest = await handler.fetch(
      new Request("https://app.example/manifest.webmanifest"),
      {},
      createExecutionContext(),
    );

    expect(sitemap.status).toBe(200);
    expect(sitemap.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(await sitemap.text()).toContain("<loc>https://app.example/</loc>");
    expect(robots.status).toBe(200);
    expect(await robots.text()).toContain("Sitemap: https://app.example/sitemap.xml");
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get("content-type")).toBe("application/manifest+json; charset=utf-8");
    expect(await manifest.json()).toMatchObject({ name: "Cloudflare Metadata" });
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

    expect(module?.default?.({
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
    })).toBe("<main>ada</main>");
  });

  test("renders shared page component functions that are exported under generated names", async () => {
    const sharedAuthPage = () => "<main>Shared auth</main>";
    const serverManifest = {
      files: {},
      routes: [
        {
          file: "src/app/login/page.tsx",
          kind: "page" as const,
          path: "/login",
          segments: [{ kind: "static" as const, value: "login" }],
        },
        {
          file: "src/app/signup/page.tsx",
          kind: "page" as const,
          path: "/signup",
          segments: [{ kind: "static" as const, value: "signup" }],
        },
      ],
      version: 1 as const,
    };
    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: {
          "src/app/login/page.tsx": { routeComponent: sharedAuthPage },
          "src/app/signup/page.tsx": { routeComponent: sharedAuthPage },
        },
      }),
      serverManifest,
    });

    const login = await handler.fetch(
      new Request("https://app.example/login"),
      {},
      createExecutionContext(),
    );
    const signup = await handler.fetch(
      new Request("https://app.example/signup"),
      {},
      createExecutionContext(),
    );

    expect(login.status).toBe(200);
    expect(await login.text()).toContain("<main>Shared auth</main>");
    expect(signup.status).toBe(200);
    expect(await signup.text()).toContain("<main>Shared auth</main>");
  });

  test("renders page modules whose default App and slots exports are live-binding accessors", async () => {
    // Regression coverage for docs/issues/open/2026-06-01-196: Cloudflare
    // route facades expose ESM re-exports as accessors in workerd diagnostics.
    // The adapter must read the default page component through those accessors,
    // even when App and slots are shared identities across sibling routes.
    const sharedApp = () => "<main>shared shell</main>";
    const sharedSlots = {};
    const alphaPage = () => "<main>alpha</main>";
    const betaPage = () => "<main>beta</main>";
    const liveBindingModule = (page: () => string) => {
      const module = {};
      Object.defineProperties(module, {
        App: {
          enumerable: true,
          get: () => sharedApp,
        },
        default: {
          enumerable: true,
          get: () => page,
        },
        slots: {
          enumerable: true,
          get: () => sharedSlots,
        },
      });
      return module;
    };
    const serverManifest = {
      files: {},
      routes: [
        {
          file: "src/app/alpha/page.tsx",
          kind: "page" as const,
          path: "/alpha",
          segments: [{ kind: "static" as const, value: "alpha" }],
        },
        {
          file: "src/app/beta/page.tsx",
          kind: "page" as const,
          path: "/beta",
          segments: [{ kind: "static" as const, value: "beta" }],
        },
      ],
      version: 1 as const,
    };
    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: {
          "src/app/alpha/page.tsx": liveBindingModule(alphaPage),
          "src/app/beta/page.tsx": liveBindingModule(betaPage),
        },
      }),
      serverManifest,
    });

    const alpha = await handler.fetch(
      new Request("https://app.example/alpha"),
      {},
      createExecutionContext(),
    );
    const beta = await handler.fetch(
      new Request("https://app.example/beta"),
      {},
      createExecutionContext(),
    );

    expect(alpha.status).toBe(200);
    expect(await alpha.text()).toContain("<main>alpha</main>");
    expect(beta.status).toBe(200);
    expect(await beta.text()).toContain("<main>beta</main>");
  });

  test("dereferences Cloudflare page component accessor exports once", async () => {
    let defaultReads = 0;
    const page = () => "<main>single-read accessor</main>";
    const module = {};
    Object.defineProperties(module, {
      App: {
        enumerable: true,
        get: () => undefined,
      },
      default: {
        enumerable: true,
        get: () => {
          defaultReads += 1;
          return defaultReads === 1 ? page : undefined;
        },
      },
      slots: {
        enumerable: true,
        get: () => undefined,
      },
    });
    const serverManifest = {
      files: {},
      routes: [
        {
          file: "src/app/login/page.tsx",
          kind: "page" as const,
          path: "/login",
          segments: [{ kind: "static" as const, value: "login" }],
        },
      ],
      version: 1 as const,
    };
    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: {
          "src/app/login/page.tsx": module,
        },
      }),
      serverManifest,
    });

    const response = await handler.fetch(
      new Request("https://app.example/login"),
      {},
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>single-read accessor</main>");
    expect(defaultReads).toBe(1);
  });

  test("uses explicit CloudflareRouteComponent export when default and App accessors are unresolved", async () => {
    // Regression for docs/issues/2026-06-01-203: packaged Pages workers can
    // expose route facades whose default/App live bindings are present as
    // accessors but unresolved when the adapter selects the page component.
    // The generated facade also exports CloudflareRouteComponent explicitly,
    // so the adapter should not rely on Object.keys fallback discovery.
    const page = () => "<main>root fallback component</main>";
    const module = {};
    Object.defineProperties(module, {
      App: {
        enumerable: true,
        get: () => undefined,
      },
      CloudflareRouteComponent: {
        enumerable: false,
        value: page,
      },
      default: {
        enumerable: true,
        get: () => undefined,
      },
      slots: {
        enumerable: true,
        get: () => undefined,
      },
    });
    const serverManifest = {
      files: {},
      routes: [
        {
          file: "src/app/page.tsx",
          kind: "page" as const,
          path: "/",
          segments: [],
        },
      ],
      version: 1 as const,
    };
    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: {
          "src/app/page.tsx": module,
        },
      }),
      serverManifest,
    });

    const response = await handler.fetch(
      new Request("https://app.example/"),
      {},
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>root fallback component</main>");
  });

  test("missing page component 500 names the resolved exports for diagnosis", async () => {
    // Self-diagnosing message for docs/issues/open/2026-06-01-194: when `default`
    // resolves to a non-function (e.g. a client-reference object), the response
    // must reveal the export names + typeof so the cause is obvious in one round-trip.
    const serverManifest = {
      files: {},
      routes: [
        {
          file: "src/app/login/page.tsx",
          kind: "page" as const,
          path: "/login",
          segments: [{ kind: "static" as const, value: "login" }],
        },
      ],
      version: 1 as const,
    };
    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: {
          // `default` present but not a function (mimics a client-reference object).
          "src/app/login/page.tsx": { default: { $$typeof: "client.reference" } },
        },
      }),
      serverManifest,
    });

    const response = await handler.fetch(
      new Request("https://app.example/login"),
      {},
      createExecutionContext(),
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toContain("No Cloudflare page component registered for src/app/login/page.tsx.");
    expect(body).toContain("default=object");
    expect(body).toContain("App=absent");
    expect(body).toContain("slots=absent");
  });

  test("missing page component 500 does not expose arbitrary module export names", async () => {
    const serverManifest = {
      files: {},
      routes: [
        {
          file: "src/app/login/page.tsx",
          kind: "page" as const,
          path: "/login",
          segments: [{ kind: "static" as const, value: "login" }],
        },
      ],
      version: 1 as const,
    };
    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest: { routes: [] },
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: {
          "src/app/login/page.tsx": { internalSecretName: "do-not-leak" },
        },
      }),
      serverManifest,
    });

    const response = await handler.fetch(
      new Request("https://app.example/login"),
      {},
      createExecutionContext(),
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toContain("default=absent");
    expect(body).toContain("App=absent");
    expect(body).toContain("slots=absent");
    expect(body).not.toContain("internalSecretName");
    expect(body).not.toContain("do-not-leak");
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
    const registry = await import(pathToFileURL(registryPath).href) as {
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

  test("build emits Workers-safe route modules for server routes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-server-route-modules-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "api", "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "api", "users", "$id", "route.ts"),
      `export function GET(request: Request, context: { params: Record<string, string> }) {
  return Response.json({
    id: context.params.id,
    method: request.method,
    runtime: "cloudflare"
  });
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
    const registry = await import(pathToFileURL(registryPath).href) as {
      routeModules: Record<string, () => Promise<unknown>>;
    };

    expect(Object.keys(registry.routeModules)).toEqual(["api/users/$id/route.ts"]);

    const handler = createCloudflareBuiltRequestHandler({
      assets: {},
      clientManifest,
      renderRoute: createCloudflareRouteModuleRenderer({
        modules: registry.routeModules,
      }),
      serverManifest,
    });
    const response = await handler.fetch(
      new Request("https://app.example/api/users/ada"),
      {},
      createExecutionContext(),
    );
    const missingMethod = await handler.fetch(
      new Request("https://app.example/api/users/ada", { method: "POST" }),
      {},
      createExecutionContext(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "ada",
      method: "GET",
      runtime: "cloudflare",
    });
    expect(missingMethod.status).toBe(405);
  });

  test("builds dynamic Cloudflare route modules that import Node builtins", async () => {
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

    await expect(buildApp({ appDir, outDir })).resolves.toMatchObject({
      routes: [expect.objectContaining({ path: "/users/:id" })],
    });
    const routeFiles = await readdir(join(outDir, "cloudflare", "routes"));
    const routeCode = await Promise.all(
      routeFiles.map((file) => readFile(join(outDir, "cloudflare", "routes", file), "utf8")),
    );
    expect(routeCode.join("\n")).toContain("node:crypto");
  });

  test("built string route modules preserve the app layout shell", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-string-layout-shell-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return (
    <html>
      <head><link rel="stylesheet" href="/styles.css" /></head>
      <body>
        <header>Cloudflare shell</header>
        <Slot />
      </body>
    </html>
  );
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main><strong>Ada</strong></main>;
}`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registry = await import(pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href) as {
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
    expect(response.headers.get("x-mreact-stream")).toBeNull();
    expect(html).toContain('<link rel="stylesheet" href="/styles.css">');
    expect(html).toContain("<header>Cloudflare shell</header>");
    expect(html).toContain("<main><strong>Ada</strong></main>");
  });

  test("built string route modules preserve and override head titles", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-string-metadata-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "upload"), { recursive: true });
    await mkdir(join(appDir, "plain"), { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Image Vault</title>
      </head>
      <body><Slot /></body>
    </html>
  );
}`,
    );
    await writeFile(
      join(appDir, "upload", "page.tsx"),
      `export const metadata = { title: "Upload" };
export default function Page() {
  return <main>Upload media</main>;
}`,
    );
    await writeFile(
      join(appDir, "plain", "page.tsx"),
      `export default function Page() {
  return <main>Plain page</main>;
}`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registry = await import(pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href) as {
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

    const upload = await handler.fetch(
      new Request("https://app.example/upload"),
      {},
      createExecutionContext(),
    );
    const plain = await handler.fetch(
      new Request("https://app.example/plain"),
      {},
      createExecutionContext(),
    );
    const uploadHtml = await upload.text();
    const plainHtml = await plain.text();

    expect(upload.status).toBe(200);
    expect(uploadHtml).toContain("<title>Upload</title>");
    expect(uploadHtml).not.toContain("<title>Image Vault</title>");
    expect(plain.status).toBe(200);
    expect(plainHtml).toContain("<title>Image Vault</title>");
  });

  test("built string route modules preserve server wrappers around nested client boundaries", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-wrapper-boundary-"));
    const appDir = join(rootDir, "app");
    const componentsDir = join(rootDir, "components");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentsDir, { recursive: true });
    await writeFile(
      join(componentsDir, "LocaleSwitcher.client.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function LocaleSwitcher() {
  const locale = cell("ja");
  return <button type="button" onClick={() => locale.set("en")}>{locale.get()}</button>;
}`,
    );
    await writeFile(
      join(componentsDir, "Header.tsx"),
      `import { LocaleSwitcher } from "./LocaleSwitcher.client";

export function Header() {
  return <header><h1>Cloudflare</h1><LocaleSwitcher /></header>;
}`,
    );
    await writeFile(
      join(appDir, "layout.tsx"),
      `import { Header } from "../components/Header";

export default function Layout() {
  return <html><body><Header /><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main><strong>Ada</strong></main>;
}`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registry = await import(pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href) as {
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
    expect(html).toContain("<header><h1>Cloudflare</h1>");
    expect(html).toContain('data-mreact-client-boundary="LocaleSwitcher"');
    expect(html).not.toContain('data-mreact-client-boundary="Header"');
  });

  test("built string route modules preserve named slots in layouts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-string-layout-slots-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return <html><body><aside><Slot name="aside" /></aside><section><Slot /></section></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export function Aside() { return <p>Route aside</p>; }
export const slots = { aside: Aside };

export default function Page() {
  return <main><strong>Ada</strong></main>;
}`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registry = await import(pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href) as {
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
    expect(response.headers.get("x-mreact-stream")).toBeNull();
    expect(html).toContain("<aside><p>Route aside</p></aside>");
    expect(html).toContain("<section><main><strong>Ada</strong></main></section>");
    expect(html).not.toContain("<slot");
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
    const registry = await import(pathToFileURL(registryPath).href) as {
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
    expect(response.headers.get("cache-control")).toBe("no-transform");
    expect(response.headers.get("content-encoding")).toBe("identity");
    expect(await response.text()).toContain("<strong>ADA</strong>");
  });

  test("built stream route modules preserve streamList mapped Await output", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-stream-list-route-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { streamList } from "@reckona/mreact-router/stream-list";

export default function Page() {
  const batches = streamList([1, 2, 3], {
    batchSize: 2,
    loadBatch: async (ids) => ids.map((id) => "story-" + id),
  });

  return (
    <main>
      {batches.map((batch) => (
        <Await
          key={batch.index}
          value={batch.value}
          placeholderAs="div"
          placeholder={<ol start={batch.start + 1}><li>Loading {batch.index}</li></ol>}
        >
          {(resolved) => (
            <ol start={resolved.start + 1}>
              {resolved.items.map((story) => <li key={story}>{story}</li>)}
            </ol>
          )}
        </Await>
      ))}
    </main>
  );
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
    const registry = await import(pathToFileURL(registryPath).href) as {
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
      new Request("https://app.example/"),
      {},
      createExecutionContext(),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).toContain("Loading 0");
    expect(html).toContain("Loading 1");
    expect(html).toContain("<li>story-1</li>");
    expect(html).toContain("<li>story-2</li>");
    expect(html).toContain("<li>story-3</li>");
  });

  test("built stream route modules preserve the app layout shell", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-stream-layout-shell-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return (
    <html>
      <head><link rel="stylesheet" href="/styles.css" /></head>
      <body>
        <header>Cloudflare shell</header>
        <nav><a href="/">Top</a></nav>
        <Slot />
      </body>
    </html>
  );
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export const stream = true;

export default function Page() {
  return <main><Await value={Promise.resolve("Ada")} placeholder={<em>loading</em>}>{name => <strong>{name}</strong>}</Await></main>;
}`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registry = await import(pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href) as {
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
    expect(html).toContain('<link rel="stylesheet" href="/styles.css">');
    expect(html).toContain("<header>Cloudflare shell</header>");
    expect(html).toContain("<nav><a href=\"/\">Top</a></nav>");
    expect(html).toContain("<main>");
    expect(html).toContain("<strong>Ada</strong>");
  });

  test("built stream route modules preserve named slots in layouts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-stream-layout-slots-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return <html><body><aside><Slot name="aside" /></aside><section><Slot /></section></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export const stream = true;
export function Aside() { return <p>Route aside</p>; }
export const slots = { aside: Aside };

export default function Page() {
  return <main><Await value={Promise.resolve("Ada")} placeholder={<em>loading</em>}>{name => <strong>{name}</strong>}</Await></main>;
}`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registry = await import(pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href) as {
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
    expect(html).toContain("<aside><p>Route aside</p></aside>");
    expect(html).toContain("<section><main>");
    expect(html).toContain("<strong>Ada</strong>");
    expect(html).not.toContain("<slot");
  });

  test("built stream route modules preserve nested layouts and templates", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-stream-nested-shells-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "docs"), { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() {
  return <html><body><header>Root shell</header><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "docs", "layout.tsx"),
      `export default function DocsLayout() {
  return <section><h1>Docs shell</h1><Slot /></section>;
}`,
    );
    await writeFile(
      join(appDir, "docs", "template.tsx"),
      `export default function DocsTemplate() {
  return <article><Slot /></article>;
}`,
    );
    await writeFile(
      join(appDir, "docs", "page.tsx"),
      `export const stream = true;

export default function Page() {
  return <main><Await value={Promise.resolve("Ada")} placeholder={<em>loading</em>}>{name => <strong>{name}</strong>}</Await></main>;
}`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registry = await import(pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href) as {
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
      new Request("https://app.example/docs"),
      {},
      createExecutionContext(),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).toContain("<header>Root shell</header>");
    expect(html).toContain("<section");
    expect(html).toContain("<h1>Docs shell</h1>");
    expect(html).toContain("<article");
    expect(html).toContain("<main>");
    expect(html).toContain("<strong>Ada</strong>");
  });

  test("built stream route modules render when Buffer.allocUnsafe is unavailable", async () => {
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
    const registry = await import(pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href) as {
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

  test("built stream route modules render Link inside Await renderers", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-await-link-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Link } from "@reckona/mreact-router";

export const stream = true;

export default function Page() {
  const item = Promise.resolve({ id: 123, title: "Ada" });

  return (
    <main>
      <Await value={item} placeholder={<span>Loading</span>}>
        {(value) => <Link href={\`/item/\${value.id}\`}>{value.title}</Link>}
      </Await>
    </main>
  );
}`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registry = await import(pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href) as {
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
    expect(html).toContain('<a href="/item/123">Ada</a>');
  });

  test("built stream route modules render mapped Link rows inside Await renderers", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-await-link-map-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Link } from "@reckona/mreact-router";

export const stream = true;

export default function Page() {
  const batch = Promise.resolve({
    kind: "loaded",
    stories: [
      { id: 123, title: "Ada" },
      { id: 456, title: "Grace" },
    ],
  });

  return (
    <main>
      <Await value={batch} placeholder={<ol />}>
        {(value) => (
          <>
            {value.kind === "loaded" && value.stories.length > 0 ? (
              <ol>
                {value.stories.map((story, index) => (
                  <li value={index + 1}>
                    <Link data-testid="story-link" href={\`/item/\${story.id}\`} class="hover:underline">
                      {story.title}
                    </Link>
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        )}
      </Await>
    </main>
  );
}`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registry = await import(pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href) as {
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
    expect(html).toContain('data-testid="story-link"');
    expect(html).toContain('class="hover:underline"');
    expect(html).toContain('href="/item/123">Ada</a>');
    expect(html).toContain('href="/item/456">Grace</a>');
  });

  test("built stream route modules render conditional Link branches inside Await renderers", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-await-link-conditional-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Link } from "@reckona/mreact-router";

export const stream = true;

export default function Page() {
  const batch = Promise.resolve({
    stories: [
      { id: 123, title: "Ada", by: "alice" },
      { id: 456, title: "Grace" },
    ],
  });

  return (
    <main>
      <Await value={batch} placeholder={<ol />}>
        {(value) => (
          <ol>
            {value.stories.map((story, index) => (
              <li value={index + 1}>
                <Link data-testid="story-link" href={\`/item/\${story.id}\`}>
                  {story.title}
                </Link>
                <span>
                  {" by "}
                  {story.by === undefined ? (
                    "unknown"
                  ) : (
                    <Link
                      data-testid="story-user-link"
                      href={\`/user/\${encodeURIComponent(story.by)}\`}
                      class="hover:underline"
                    >
                      {story.by}
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Await>
    </main>
  );
}`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registry = await import(pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href) as {
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
    expect(html).toContain('data-testid="story-link"');
    expect(html).toContain('data-testid="story-user-link"');
    expect(html).toContain('class="hover:underline"');
    expect(html).toContain('href="/user/alice">alice</a>');
    expect(html).toContain("unknown");
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
        assets: [
          "assets/chunks/BrandLogo.def456.js",
          "../secret.js",
          "assets/%2e%2e/secret.js",
          "/absolute.js",
          "assets\\secret.js",
        ],
        routes: [
          {
            client: true,
            css: ["assets/routes/shared.f810e3ef.e0edde13.css"],
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
    // Regression for docs/issues/open/2026-06-01-194 (secondary): route CSS that
    // the generated route head links via <link rel="stylesheet"> must be allow-listed
    // for the static asset loader, otherwise it 404s even though present on disk.
    await expect(
      loader.fetch?.(
        "/_mreact/client/assets/routes/shared.f810e3ef.e0edde13.css",
        new Request("https://app.example/_mreact/client/assets/routes/shared.f810e3ef.e0edde13.css"),
        {},
        context,
      ),
    ).resolves.toHaveProperty("status", 200);
    await expect(
      loader.fetch?.(
        "/_mreact/client/assets/chunks/BrandLogo.def456.js",
        new Request("https://app.example/_mreact/client/assets/chunks/BrandLogo.def456.js"),
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
    await expect(
      loader.fetch?.(
        "/_mreact/client/secret.js",
        new Request("https://app.example/_mreact/client/secret.js"),
        {},
        context,
      ),
    ).resolves.toBeUndefined();
    await expect(
      loader.fetch?.(
        "/_mreact/client/assets/%2e%2e/secret.js",
        new Request("https://app.example/_mreact/client/assets/%2e%2e/secret.js"),
        {},
        context,
      ),
    ).resolves.toBeUndefined();
    await expect(
      loader.fetch?.(
        "/absolute.js",
        new Request("https://app.example/absolute.js"),
        {},
        context,
      ),
    ).resolves.toBeUndefined();
    await expect(
      loader.fetch?.(
        "/_mreact/client/assets/secret.js",
        new Request("https://app.example/_mreact/client/assets/secret.js"),
        {},
        context,
      ),
    ).resolves.toBeUndefined();

    expect(requested).toEqual([
      "/_mreact/client/assets/routes/index.abc123.js",
      "/_mreact/client/assets/routes/shared.f810e3ef.e0edde13.css",
      "/_mreact/client/assets/chunks/BrandLogo.def456.js",
    ]);
  });

  test("escapes Cloudflare client route hydration JSON and attributes", async () => {
    const renderer = createCloudflareRouteModuleRenderer({
      modules: {
        "payload/page.tsx": {
          default() {
            return "<main>Payload</main>";
          },
          loader() {
            return {
              marker: "</script><script>alert(1)</script>",
            };
          },
        },
      },
    });
    const response = await renderer(
      new Request(
        "https://app.example/payload/%3C/script%3E?next=%3C/script%3E%3Cscript%3Ealert(1)%3C/script%3E",
      ),
      {
        clientManifest: {
          routes: [
            {
              client: true,
              kind: "page",
              path: "/payload",
              routeId: 'payload" data-injected="yes<',
              script: 'assets/routes/payload."<&.js',
            },
          ],
        },
        context: createExecutionContext(),
        env: {},
        params: {
          slug: "</script><script>alert(1)</script>",
        },
        route: {
          file: "payload/page.tsx",
          kind: "page",
          path: "/payload",
          segments: [],
        },
        serverManifest: { files: {}, routes: [], version: 1 },
      },
    );
    const html = await response.text();
    const propsJson = /<script type="application\/json" id="mreact-props-[^"]+">([\s\S]*?)<\/script>/.exec(html)?.[1];

    expect(response.status).toBe(200);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain(' data-injected="yes');
    expect(html).toContain('data-mreact-route-id="payload&quot; data-injected=&quot;yes&lt;"');
    expect(html).toContain(
      'src="/_mreact/client/assets/routes/payload.&quot;&lt;&amp;.js"',
    );
    expect(propsJson).toBeDefined();
    expect(propsJson).not.toContain("<");
    expect(propsJson).toContain("\\u003c/script>");
    expect(propsJson).toContain("\\u003cscript>alert(1)");
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

  test("Cloudflare bundle re-exports CSRF helpers from @reckona/mreact-router", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-csrf-shim-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "api", "upload"), { recursive: true });
    await writeFile(
      join(appDir, "api", "upload", "route.ts"),
      `import { createFormCsrfToken, formCsrfCookie, formCsrfFieldName, validateFormCsrf } from "@reckona/mreact-router";

export function GET(request) {
  const token = createFormCsrfToken(request);
  return new Response(formCsrfFieldName + ":" + token, {
    headers: { "set-cookie": formCsrfCookie(token) },
  });
}

export async function POST(request) {
  const form = await request.formData();
  return validateFormCsrf(request, form) ?? Response.json({ ok: true });
}
`,
    );
    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const registry = await import(pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href) as {
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

    const getResponse = await handler.fetch(
      new Request("https://app.example/api/upload"),
      {},
      createExecutionContext(),
    );
    const [fieldName, token] = (await getResponse.text()).split(":");
    const cookie = getResponse.headers.get("set-cookie")?.split(";")[0] ?? "";
    const validForm = new FormData();
    validForm.set(fieldName ?? "", token ?? "");
    const validPost = await handler.fetch(
      new Request("https://app.example/api/upload", {
        body: validForm,
        headers: { cookie },
        method: "POST",
      }),
      {},
      createExecutionContext(),
    );
    const invalidForm = new FormData();
    invalidForm.set(fieldName ?? "", "wrong");
    const invalidPost = await handler.fetch(
      new Request("https://app.example/api/upload", {
        body: invalidForm,
        headers: { cookie },
        method: "POST",
      }),
      {},
      createExecutionContext(),
    );

    expect(getResponse.status).toBe(200);
    expect(validPost.status).toBe(200);
    await expect(validPost.json()).resolves.toEqual({ ok: true });
    expect(invalidPost.status).toBe(403);
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
