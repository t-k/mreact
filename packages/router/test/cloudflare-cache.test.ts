import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installRequestStateStorage, type RequestStateScope } from "@reckona/mreact-reactive-core";
import { Miniflare } from "miniflare";
import { afterEach, expect, test } from "vitest";
import {
  buildApp,
  packageCloudflarePagesArtifact,
  type BuiltServerManifest,
} from "../src/build.js";
import { cacheControl } from "../src/cache.js";
import { rewrite } from "../src/navigation.js";
import {
  createCloudflareBuiltRequestHandler,
  createCloudflareRouteModuleRenderer,
  type CloudflareRouteModule,
  type CloudflareRouteModuleRegistry,
} from "../src/adapters/cloudflare.js";

const execution = { passThroughOnException() {}, waitUntil() {} };
const publicPolicy = { cacheControl: "s-maxage=60, stale-while-revalidate", revalidateSeconds: 60 };

afterEach(() => installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>()));

function handlerFor(
  module: CloudflareRouteModule,
  policy: typeof publicPolicy | null = publicPolicy,
  extra: {
    modules?: CloudflareRouteModuleRegistry;
    onResponse?: (response: Response) => Response;
    unanalysed?: boolean;
  } = {},
) {
  installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>());
  return createCloudflareBuiltRequestHandler({
    clientManifest: { routes: [] },
    serverManifest: {
      version: 1,
      files: {},
      routes: [{ kind: "page", file: "app/page.tsx", path: "/", segments: [] }],
      routeCachePolicies: policy === null ? {} : { "app/page.tsx": policy },
      ...(extra.unanalysed === true ? {} : { routeRequestInputs: { "app/page.tsx": false } }),
    } as BuiltServerManifest,
    renderRoute: createCloudflareRouteModuleRenderer({
      modules: { "app/page.tsx": module, ...extra.modules },
    }),
    ...(extra.onResponse === undefined ? {} : { onResponse: extra.onResponse }),
  });
}

test("applies static policy to direct Cloudflare page responses", async () => {
  const response = await handlerFor({ default: () => "<main>Public</main>" }).fetch(
    new Request("https://app.test/"),
    {},
    execution,
  );
  expect(response.headers.get("cache-control")).toBe(publicPolicy.cacheControl);
});

test("isolates asynchronous runtime cacheControl across concurrent requests and preserves static precedence", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let count = 0;
  const handler = handlerFor(
    {
      async loader() {
        const index = ++count;
        if (index === 1) await pending;
        else release();
        if (index <= 2) cacheControl({ sMaxAge: index * 15, staleWhileRevalidate: 120 });
        return index;
      },
      default: ({ data }) => `<main>${data}</main>`,
    },
    null,
  );
  const responses = await Promise.all(
    [1, 2].map(() => handler.fetch(new Request("https://app.test/"), {}, execution)),
  );
  expect(responses.map((response) => response.headers.get("cache-control"))).toEqual([
    "s-maxage=15, stale-while-revalidate=120",
    "s-maxage=30, stale-while-revalidate=120",
  ]);
  expect(
    (await handler.fetch(new Request("https://app.test/"), {}, execution)).headers.get(
      "cache-control",
    ),
  ).toBeNull();
  const staticResponse = await handlerFor({
    loader() {
      cacheControl({ sMaxAge: 10 });
    },
    default: () => "static",
  }).fetch(new Request("https://app.test/"), {}, execution);
  expect(staticResponse.headers.get("cache-control")).toBe(publicPolicy.cacheControl);
});

test.each([
  { requestHeaders: { cookie: "session=secret" }, responseHeaders: {} },
  { requestHeaders: { authorization: "Bearer secret" }, responseHeaders: {} },
  { requestHeaders: { "cf-access-jwt-assertion": "secret" }, responseHeaders: {} },
  { requestHeaders: {}, responseHeaders: { "set-cookie": "session=secret" } },
  {
    requestHeaders: {},
    responseHeaders: { "content-security-policy": "script-src 'nonce-secret'" },
  },
])(
  "keeps personalized Cloudflare responses out of shared caches ($requestHeaders, $responseHeaders)",
  async ({ requestHeaders, responseHeaders }) => {
    const response = await handlerFor({
      default: () => new Response("private", { headers: responseHeaders }),
    }).fetch(new Request("https://app.test/", { headers: requestHeaders }), {}, execution);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  },
);

test.each(["no-store", "private, max-age=30", "no-cache"])(
  "preserves explicit restrictive cache policy %s",
  async (cachePolicy) => {
    const response = await handlerFor({
      default: () => new Response("private", { headers: { "cache-control": cachePolicy } }),
    }).fetch(new Request("https://app.test/"), {}, execution);
    expect(response.headers.get("cache-control")).toBe(cachePolicy);
  },
);

test("does not share a response whose loader reads user-specific headers", async () => {
  const response = await handlerFor({
    loader: ({ request }) => new Request(request).headers.get("x-variant"),
    default: ({ data }) => String(data),
  }).fetch(new Request("https://app.test/", { headers: { "x-variant": "secret" } }), {}, execution);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

test.each(["named", "default", "rest"])(
  "does not share an unanalysed component that copies the second Request argument (%s)",
  async (kind) => {
    const components: Record<string, CloudflareRouteModule> = {
      named: {
        default: (_props, request) => new Request(request).headers.get("x-variant") ?? "public",
      },
      default: {
        default: (_props, request = new Request("https://unused.test")) =>
          new Request(request).headers.get("x-variant") ?? "public",
      },
      rest: { default: (...args) => new Request(args[1]).headers.get("x-variant") ?? "public" },
    };
    for (const policy of [publicPolicy, { cacheControl: "max-age=60", revalidateSeconds: 0 }]) {
      const handler = handlerFor(components[kind]!, policy, { unanalysed: true });
      const response = await handler.fetch(
        new Request("https://app.test/", { headers: { "x-variant": "visitor-secret" } }),
        {},
        execution,
      );
      expect(await response.text()).toContain("visitor-secret");
      expect(response.headers.get("cache-control"), policy.cacheControl).toBe("private, no-store");
    }
  },
);

test("does not share responses selected by request-dependent middleware", async () => {
  const response = await handlerFor({ default: () => "public" }, publicPolicy, {
    modules: {
      __middleware__: {
        middleware: (request: Request) => rewrite(request.headers.get("x-target") ?? "/"),
      },
    },
  }).fetch(new Request("https://app.test/", { headers: { "x-target": "/" } }), {}, execution);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

test("upgrades weaker existing cache directives when a route declares no-store", async () => {
  const response = await handlerFor(
    {
      default: () =>
        new Response("private", { headers: { "cache-control": "private, max-age=30" } }),
    },
    { cacheControl: "no-store", revalidateSeconds: 0 },
  ).fetch(new Request("https://app.test/"), {}, execution);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("rebuilds version-3 Cloudflare artifacts for unchanged source", async () => {
  const root = await mkdtemp(join(tmpdir(), "mreact-cloudflare-cache-version-"));
  try {
    await mkdir(join(root, "app"));
    await writeFile(
      join(root, "app", "page.tsx"),
      "export const revalidate = 0;\nexport default function Page() { return <main>Private</main>; }",
    );
    const options = {
      appDir: join(root, "app"),
      outDir: join(root, ".mreact"),
      targets: ["cloudflare" as const],
    };
    await buildApp(options);
    const cacheFile = join(root, ".mreact", "build-cache.json");
    const oldCache = JSON.parse(await readFile(cacheFile, "utf8"));
    oldCache.version = 3;
    await writeFile(cacheFile, JSON.stringify(oldCache));
    const manifestFile = join(root, ".mreact", "server", "manifest.json");
    const oldManifest = JSON.parse(await readFile(manifestFile, "utf8"));
    delete oldManifest.routeCachePolicies;
    await writeFile(manifestFile, JSON.stringify(oldManifest));
    await buildApp(options);
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    expect(manifest.routeCachePolicies["page.tsx"]).toEqual({
      cacheControl: "no-store",
      revalidateSeconds: 0,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("applies no-store to loader redirects and lets response hooks override policy", async () => {
  const response = await handlerFor(
    { loader: () => Response.redirect("https://app.test/login"), default: () => "unused" },
    { cacheControl: "no-store", revalidateSeconds: 0 },
  ).fetch(new Request("https://app.test/"), {}, execution);
  expect(response.status).toBe(302);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const hooked = await handlerFor({ default: () => "public" }, publicPolicy, {
    onResponse(response) {
      expect(response.headers.get("cache-control")).toBe(publicPolicy.cacheControl);
      response.headers.set("cache-control", "private, no-store");
      return response;
    },
  }).fetch(new Request("https://app.test/"), {}, execution);
  expect(hooked.headers.get("cache-control")).toBe("private, no-store");
});

test("preserves streaming while applying cache policy and no-transform", async () => {
  let finish!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("first"));
      finish = () => controller.close();
    },
  });
  const response = await handlerFor({
    default: () =>
      new Response(body, { headers: { "content-type": "text/html", "x-mreact-stream": "1" } }),
  }).fetch(new Request("https://app.test/"), {}, execution);
  expect(response.headers.get("cache-control")).toBe(`${publicPolicy.cacheControl}, no-transform`);
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("first");
  finish();
  await reader.cancel();
});

test.each([false, true])(
  "packaged Workers honor static and runtime cache policy (nodejs_compat=%s)",
  async (compat) => {
    const root = await mkdtemp(join(tmpdir(), "mreact-cloudflare-cache-"));
    let worker: Miniflare | undefined;
    try {
      const pages: Record<string, string> = {
        private:
          "export const revalidate = 0;\nexport default function Page() { return <main>Private</main>; }",
        public:
          "export const revalidate = 60;\nexport default function Page() { return <main>Public</main>; }",
        dynamic:
          'import { cacheControl } from "@reckona/mreact-router";\nexport async function loader() { await Promise.resolve(); cacheControl({ sMaxAge: 45, staleWhileRevalidate: 120 }); return "Dynamic"; }\nexport default function Page({ data }) { return <main>{data}</main>; }',
        headers:
          'export const revalidate = 60;\nexport function loader({ request }) { return request.headers.get("x-variant"); }\nexport default function Page({ data }) { return <main>{data}</main>; }',
        alias:
          'export const revalidate = 60;\nexport function loader(ctx) { return ctx["request"].headers.get("x-variant"); }\nexport default function Page({ data }) { return <main>{data}</main>; }',
        rewrite:
          "export const revalidate = 0;\nexport default function Page() { return <main>Unused</main>; }",
      };
      for (const [path, source] of Object.entries(pages)) {
        await mkdir(join(root, "app", path), { recursive: true });
        await writeFile(join(root, "app", path, "page.tsx"), source);
      }
      await writeFile(
        join(root, "app", "middleware.ts"),
        'import { rewrite } from "@reckona/mreact-router";\nexport const config = { matcher: ["/rewrite"] };\nexport function middleware() { return rewrite("/public"); }',
      );
      await writeFile(join(root, "package.json"), JSON.stringify({ type: "module" }));
      await buildApp({
        projectRoot: root,
        routesDir: "app",
        outDir: join(root, ".mreact"),
        targets: ["cloudflare"],
      });
      await packageCloudflarePagesArtifact({
        fromDir: join(root, ".mreact"),
        outDir: join(root, "pages"),
      });
      worker = new Miniflare({
        compatibilityDate: "2026-06-01",
        compatibilityFlags: compat ? ["nodejs_compat"] : [],
        modules: true,
        modulesRoot: join(root, "pages"),
        scriptPath: join(root, "pages", "_worker.js"),
        port: 0,
        inspectorPort: 0,
      });
      const privateResponse = await worker.dispatchFetch("https://app.test/private", {
        headers: { cookie: "session=secret" },
      });
      expect(privateResponse.status).toBe(200);
      expect(privateResponse.headers.get("cache-control")).toBe("no-store");
      for (const path of ["public", "rewrite"]) {
        const response = await worker.dispatchFetch(`https://app.test/${path}`);
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe(publicPolicy.cacheControl);
        expect(await response.text()).toContain("Public");
      }
      const headerResponse = await worker.dispatchFetch("https://app.test/headers", {
        headers: { "x-variant": "secret" },
      });
      expect(headerResponse.headers.get("cache-control")).toBe("private, no-store");
      const aliasedResponse = await worker.dispatchFetch("https://app.test/alias", {
        headers: { "x-variant": "secret" },
      });
      expect(aliasedResponse.headers.get("cache-control")).toBe("private, no-store");
      const dynamicResponse = await worker.dispatchFetch("https://app.test/dynamic");
      expect(dynamicResponse.status).toBe(compat ? 200 : 500);
      if (compat)
        expect(dynamicResponse.headers.get("cache-control")).toBe(
          "s-maxage=45, stale-while-revalidate=120",
        );
      else expect(await dynamicResponse.text()).not.toContain("Dynamic");
    } finally {
      await worker?.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
  30_000,
);
