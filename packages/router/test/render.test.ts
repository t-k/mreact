import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mdx from "@mdx-js/rollup";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { describe, expect, test, vi } from "vitest";
import { createQueryClient } from "@reckona/mreact-query";
import { createAppFixture, readQueryState, responseText } from "@reckona/mreact-test-utils";
import type { AppRouterCache } from "../src/cache.js";
import type { AppRouterLogEvent } from "../src/logger.js";
import { bundleMiddlewareModuleCode, renderAppRequest } from "../src/render.js";

describe("mreact app request rendering", () => {
  test("renders a .mreact.tsx page route to HTML", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-render-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main><h1>Hello app router</h1></main>; }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("<main><h1>Hello app router</h1></main>");
  });

  test("does not allocate an extra Headers object for default HTML responses", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-default-headers-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>Default headers</main>; }",
    );
    const request = new Request("http://local.test/");
    const OriginalHeaders = globalThis.Headers;
    let headerAllocations = 0;

    class CountingHeaders extends OriginalHeaders {
      constructor(init?: HeadersInit) {
        headerAllocations += 1;
        super(init);
      }
    }

    globalThis.Headers = CountingHeaders;

    try {
      const response = await renderAppRequest({
        appDir,
        request,
      });

      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(headerAllocations).toBe(0);
    } finally {
      globalThis.Headers = OriginalHeaders;
    }
  });

  test("applies global response hook to rendered pages and middleware responses", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-response-hook-"));
    await writeFile(
      join(appDir, "middleware.ts"),
      `export function middleware(request: Request) {
  if (new URL(request.url).pathname === "/blocked") {
    return new Response("Blocked", { status: 403 });
  }
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>Home</main>; }",
    );
    const onResponse = (response: Response) => {
      response.headers.set("strict-transport-security", "max-age=31536000");
      response.headers.set("x-content-type-options", "nosniff");
    };

    const pageResponse = await renderAppRequest({
      appDir,
      onResponse,
      request: new Request("http://local.test/"),
    });
    const middlewareResponse = await renderAppRequest({
      appDir,
      onResponse,
      request: new Request("http://local.test/blocked"),
    });

    expect(pageResponse.headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(pageResponse.headers.get("x-content-type-options")).toBe("nosniff");
    expect(middlewareResponse.status).toBe(403);
    expect(middlewareResponse.headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(middlewareResponse.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("prefers an explicit response hook over the app convention", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-response-hook-precedence-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>Home</main>; }",
    );
    await writeFile(
      join(appDir, "on-response.ts"),
      `export function onResponse(response: Response) {
  response.headers.set("x-response-hook", "convention");
}`,
    );

    const completedStatuses: number[] = [];
    const response = await renderAppRequest({
      appDir,
      instrumentation: {
        onRequestEnd(event) {
          completedStatuses.push(event.status);
        },
      },
      onResponse(rendered) {
        return new Response(rendered.body, {
          headers: { ...Object.fromEntries(rendered.headers), "x-response-hook": "explicit" },
          status: 403,
        });
      },
      request: new Request("http://local.test/"),
    });

    expect(response.headers.get("x-response-hook")).toBe("explicit");
    expect(response.status).toBe(403);
    expect(completedStatuses).toEqual([403]);
  });

  test("rejects an invalid response hook convention export", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-invalid-response-hook-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>Home</main>; }",
    );
    await writeFile(join(appDir, "on-response.ts"), `export const onResponse = "invalid";`);

    await expect(
      renderAppRequest({
        appDir,
        request: new Request("http://local.test/"),
      }),
    ).rejects.toThrow(/Invalid on-response convention.*on-response\.ts.*onResponse/u);
  });

  test("passes dynamic route params to page components", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-params-"));
    await mkdir(join(appDir, "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "users", "$id", "page.mreact.tsx"),
      "export default function Page(props) { return <main><h1>User {props.params.id}</h1></main>; }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/users/ada"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main><h1>User ada</h1></main>");
  });

  test("reuses dev page modules until the dev source cache version changes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-page-module-cache-"));
    const state = globalThis as { __mreactDevPageModuleLoads?: number };
    state.__mreactDevPageModuleLoads = 0;
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `const state = globalThis;
state.__mreactDevPageModuleLoads = (state.__mreactDevPageModuleLoads ?? 0) + 1;

export default function Page() {
  return <main>loads:{state.__mreactDevPageModuleLoads}</main>;
}`,
    );

    const render = async (devServerModuleCacheVersion: string) =>
      await renderAppRequest({
        appDir,
        dev: true,
        devServerModuleCacheVersion,
        request: new Request("http://local.test/"),
      });

    const first = await render("dev-source-1");
    const second = await render("dev-source-1");
    const third = await render("dev-source-2");

    expect(await first.text()).toContain("<main>loads:1</main>");
    expect(await second.text()).toContain("<main>loads:1</main>");
    expect(await third.text()).toContain("<main>loads:2</main>");
  });

  test("reuses dev metadata modules until the dev source cache version changes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-metadata-module-cache-"));
    const state = globalThis as { __mreactDevMetadataModuleLoads?: number };
    state.__mreactDevMetadataModuleLoads = 0;
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `const state = globalThis;
state.__mreactDevMetadataModuleLoads = (state.__mreactDevMetadataModuleLoads ?? 0) + 1;

export function generateMetadata() {
  return { title: "loads:" + state.__mreactDevMetadataModuleLoads };
}

export default function Page() {
  return <main>metadata cache</main>;
}`,
    );

    const render = async (devServerModuleCacheVersion: string) =>
      await renderAppRequest({
        appDir,
        dev: true,
        devServerModuleCacheVersion,
        request: new Request("http://local.test/"),
      });

    const first = await render("dev-source-1");
    const second = await render("dev-source-1");
    const third = await render("dev-source-2");

    expect(await first.text()).toContain("<title>loads:2</title>");
    expect(await second.text()).toContain("<title>loads:2</title>");
    expect(await third.text()).toContain("<title>loads:4</title>");
  });

  test("reuses dev loader modules until the dev source cache version changes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-loader-module-cache-"));
    const state = globalThis as { __mreactDevLoaderModuleLoads?: number };
    state.__mreactDevLoaderModuleLoads = 0;
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `const state = globalThis;
state.__mreactDevLoaderModuleLoads = (state.__mreactDevLoaderModuleLoads ?? 0) + 1;
const loaderModuleLoads = state.__mreactDevLoaderModuleLoads;

export function loader() {
  return { loads: loaderModuleLoads };
}

export default function Page(props) {
  return <main>loader loads:{props.data.loads}</main>;
}`,
    );

    const render = async (devServerModuleCacheVersion: string) =>
      await renderAppRequest({
        appDir,
        dev: true,
        devServerModuleCacheVersion,
        request: new Request("http://local.test/"),
      });

    const first = await render("dev-source-1");
    const second = await render("dev-source-1");
    const third = await render("dev-source-2");

    expect(await first.text()).toContain("<main>loader loads:1</main>");
    expect(await second.text()).toContain("<main>loader loads:1</main>");
    expect(await third.text()).toContain("<main>loader loads:3</main>");
  });

  test("passes loader data to page components", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export function loader() {
  return { title: "Loaded" };
}

export default function Page(props) {
  return <main><h1>{props.data.title}</h1></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main><h1>Loaded</h1></main>");
  });

  test("passes render env to page loaders", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-env-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export function loader({ env }) {
  return { apiBaseUrl: env?.SSR_API_BASE_URL ?? "missing" };
}

export default function Page(props) {
  return <main><h1>{props.data.apiBaseUrl}</h1></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      env: { SSR_API_BASE_URL: "http://127.0.0.1:12345" },
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main><h1>http://127.0.0.1:12345</h1></main>");
  });

  test("provides a request-scoped query client to loaders and page components", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-query-context-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export async function loader({ queryClient }) {
  await queryClient.prefetchQuery({
    queryKey: ["profile"],
    queryFn: async () => ({ name: "Ada" }),
  });
}

export default function Page(props) {
  const profile = props.queryClient.getQueryData(["profile"]);
  return <main>{profile.name}</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>Ada</main>");
  });

  test("makes the request-scoped query client available through getQueryClient", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-query-handoff-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `import { getQueryClient } from "@reckona/mreact-query";

export async function loader({ queryClient }) {
  await queryClient.prefetchQuery({
    queryKey: ["profile"],
    queryFn: async () => ({ name: "Grace" }),
  });
}

export default function Page() {
  const profile = getQueryClient().getQueryData(["profile"]);
  return <main>{profile.name}</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>Grace</main>");
  });

  test("can use an injected query client and emits escaped dehydrated state", async () => {
    const fixture = await createAppFixture("mreact-app-query-dehydrate");
    const queryClient = createQueryClient();
    await fixture.write(
      "page.tsx",
      `export async function loader({ queryClient }) {
  await queryClient.prefetchQuery({
    queryKey: ["profile"],
    queryFn: async () => ({ name: "Ada <Grace>" }),
  });
}

export default function Page(props) {
  const profile = props.queryClient.getQueryData(["profile"]);
  return <html><head></head><body><main>{profile.name}</main></body></html>;
}`,
    );

    const response = await fixture.render("/", {
      queryClient,
    });
    const html = await responseText(response);
    const queryState = readQueryState(html);

    expect(queryClient.getQueryData(["profile"])).toEqual({ name: "Ada <Grace>" });
    expect(html).toContain("<main>Ada &lt;Grace&gt;</main>");
    expect(queryState).toEqual({
      queries: [
        expect.objectContaining({
          data: { name: "Ada <Grace>" },
          queryKey: ["profile"],
        }),
      ],
    });
    expect(html).not.toContain('{"name":"Ada <Grace>"}');
  });

  test("injects dehydrated query state without replace-dollar expansion", async () => {
    const fixture = await createAppFixture("mreact-app-query-dollar-state");
    const queryClient = createQueryClient();
    const marker = "before-body-marker";
    const value = "A$`B$'C$&D$$E";
    await fixture.write(
      "page.tsx",
      `export async function loader({ queryClient }) {
  await queryClient.prefetchQuery({
    queryKey: ["profile"],
    queryFn: async () => ({ name: ${JSON.stringify(value)} }),
  });
}

export default function Page(props) {
  const profile = props.queryClient.getQueryData(["profile"]);
  return <html><head></head><body><main>${marker}</main><p>{profile.name}</p></body></html>;
}`,
    );

    const response = await fixture.render("/", {
      queryClient,
    });
    const html = await responseText(response);
    const queryStateScript = html.match(
      /<script type="application\/json" id="__mreact_query_state">([\s\S]*?)<\/script>/,
    )?.[1];

    expect(readQueryState(html).queries[0]?.data).toEqual({ name: value });
    expect(queryStateScript).not.toContain(marker);
    expect(queryStateScript).not.toContain("</body>");
  });

  test("injects dehydrated query state before the final body close tag", async () => {
    const fixture = await createAppFixture("mreact-app-query-final-body-state");
    const queryClient = createQueryClient();
    await fixture.write(
      "page.tsx",
      `export async function loader({ queryClient }) {
  await queryClient.prefetchQuery({
    queryKey: ["profile"],
    queryFn: async () => ({ name: "Ada" }),
  });
}

export default function Page(props) {
  return <html><head></head><body><script dangerouslySetInnerHTML={{ __html: "const marker = \\"</body>\\";" }} /></body></html>;
}`,
    );

    const response = await fixture.render("/", {
      queryClient,
    });
    const html = await responseText(response);
    const literalBodyClose = html.indexOf('const marker = "</body>";');
    const script = html.indexOf('<script type="application/json" id="__mreact_query_state">');
    const finalBodyClose = html.toLowerCase().lastIndexOf("</body>");

    expect(literalBodyClose).toBeGreaterThan(-1);
    expect(script).toBeGreaterThan(literalBodyClose);
    expect(script).toBeLessThan(finalBodyClose);
  });

  test("injects auth claims without replace-dollar expansion", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-auth-dollar-state-"));
    const value = "claim$`before$'after$&whole";
    await writeFile(
      join(appDir, "page.tsx"),
      `export const auth = "include-claims";

export default function Page() {
  return <html><body><main>auth-body-marker</main></body></html>;
}`,
    );
    const authRuntime = ((
      globalThis as {
        __mreactAuthRuntimeState?: {
          storage?: import("node:async_hooks").AsyncLocalStorage<{ claims?: unknown }>;
        };
      }
    ).__mreactAuthRuntimeState ??= {});
    authRuntime.storage = new AsyncLocalStorage<{ claims?: unknown }>();

    const response = await authRuntime.storage.run({ claims: { sub: value } }, () =>
      renderAppRequest({
        appDir,
        request: new Request("http://local.test/"),
      }),
    );
    const html = await response.text();
    const authStateScript = html.match(
      /<script type="application\/json" id="__mreact_auth_session">([\s\S]*?)<\/script>/,
    )?.[1];

    expect(authStateScript).toBeDefined();
    expect(JSON.parse(authStateScript ?? "{}")).toEqual({ sub: value });
    expect(authStateScript).not.toContain("auth-body-marker");
    expect(authStateScript).not.toContain("</body>");
  });

  test("injects route metadata into the document head", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-metadata-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = {
  title: "Ada & Grace",
  description: "Compiler <runtime>",
};

export default function Page() {
  return <main>Metadata</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain("<head>");
    expect(html).toContain("<title>Ada &amp; Grace</title>");
    expect(html).toContain('<meta name="description" content="Compiler &lt;runtime&gt;">');
    expect(html).toContain("<main>Metadata</main>");
  });

  test("injects route metadata lang onto the document element", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-metadata-lang-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = {
  lang: "ja",
  title: "日本語",
};

export default function Page() {
  return <html lang="en"><head></head><body><main>日本語</main></body></html>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain('<html lang="ja">');
    expect(html).toContain("<title>日本語</title>");
  });

  test("injects dynamic metadata generated from loader data", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dynamic-metadata-"));
    await mkdir(join(appDir, "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "users", "$id", "page.tsx"),
      `export function loader({ params }) {
  return { id: params.id, name: params.id === "ada" ? "Ada Lovelace" : "Grace Hopper" };
}

export async function generateMetadata({ data, params, request }) {
  return {
    title: data.name + " - Users",
    description: "Profile for " + data.name + " at " + new URL(request.url).host,
    openGraph: { title: data.name },
    alternates: { canonical: "https://example.test/users/" + params.id },
  };
}

export default function Page(props) {
  return <main>{props.data.name}</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/users/ada"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<title>Ada Lovelace - Users</title>");
    expect(html).toContain(
      '<meta name="description" content="Profile for Ada Lovelace at local.test">',
    );
    expect(html).toContain('<meta property="og:title" content="Ada Lovelace">');
    expect(html).toContain('<link rel="canonical" href="https://example.test/users/ada">');
  });

  test("merges static metadata with generateMetadata field overrides", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dynamic-metadata-merge-"));
    await writeFile(
      join(appDir, "layout.tsx"),
      `export const metadata = {
  title: "Root title",
  description: "Root description",
  openGraph: { description: "Root OG description" },
};
export default function Layout(props) {
  return <html><head></head><body>{props.children}</body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = {
  description: "Static page description",
  openGraph: { title: "Static OG title" },
};

export function generateMetadata() {
  return {
    title: "Dynamic page title",
    openGraph: { title: "Dynamic OG title" },
  };
}

export default function Page() {
  return <main>Dynamic metadata merge</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain("<title>Dynamic page title</title>");
    expect(html).toContain('<meta name="description" content="Static page description">');
    expect(html).toContain('<meta property="og:title" content="Dynamic OG title">');
    expect(html).toContain('<meta property="og:description" content="Root OG description">');
  });

  test("falls back to static metadata when generateMetadata throws", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dynamic-metadata-fallback-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = {
  title: "Static fallback",
  description: "Static fallback description",
};

export function generateMetadata() {
  throw new Error("metadata failed");
}

export default function Page() {
  return <main>Fallback metadata</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<title>Static fallback</title>");
    expect(html).toContain('<meta name="description" content="Static fallback description">');
  });

  test("merges metadata from parent layouts before page metadata", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-layout-metadata-"));
    await mkdir(join(appDir, "docs"), { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      `export const metadata = {
  title: "Root title",
  description: "Root description",
  alternates: { canonical: "https://example.test" },
  openGraph: { title: "Root OG", images: ["/root-og.png"] },
  head: [{ tag: "meta", attrs: { name: "root-layout", content: "yes" } }],
};

export default function Layout(props) {
  return <html><head></head><body>{props.children}</body></html>;
}`,
    );
    await writeFile(
      join(appDir, "docs", "layout.tsx"),
      `export const metadata = {
  description: "Docs description",
  openGraph: { description: "Docs OG", images: ["/docs-og.png"] },
};

export default function Layout(props) {
  return <section>{props.children}</section>;
}`,
    );
    await writeFile(
      join(appDir, "docs", "page.tsx"),
      `export const metadata = {
  title: "Page title",
  openGraph: { title: "Page OG", images: ["/page-og.png"] },
  head: [{ tag: "meta", attrs: { name: "page", content: "yes" } }],
};

export default function Page() {
  return <main>Docs page</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/docs"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<title>Page title</title>");
    expect(html).toContain('<meta name="description" content="Docs description">');
    expect(html).toContain('<link rel="canonical" href="https://example.test">');
    expect(html).toContain('<meta property="og:title" content="Page OG">');
    expect(html).toContain('<meta property="og:description" content="Docs OG">');
    expect(html).toContain('<meta property="og:image" content="/root-og.png">');
    expect(html).toContain('<meta property="og:image" content="/docs-og.png">');
    expect(html).toContain('<meta property="og:image" content="/page-og.png">');
    expect(html).toContain('<meta name="root-layout" content="yes">');
    expect(html).toContain('<meta name="page" content="yes">');
  });

  test("injects extended route metadata into deterministic safe head tags", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-extended-metadata-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = {
  title: "Docs",
  description: "Runtime docs",
  alternates: { canonical: "https://example.test/docs" },
  openGraph: {
    title: "OG Docs",
    description: "OG <description>",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  robots: { index: false, follow: true },
  themeColor: "#101820",
  viewport: "width=device-width, initial-scale=1",
};

export default function Page() {
  return <html><head></head><body><main>Extended metadata</main></body></html>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain('<link rel="canonical" href="https://example.test/docs">');
    expect(html).toContain('<meta property="og:title" content="OG Docs">');
    expect(html).toContain('<meta property="og:description" content="OG &lt;description&gt;">');
    expect(html).toContain('<meta property="og:image" content="/og.png">');
    expect(html).toContain('<link rel="icon" href="/favicon.ico">');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
    expect(html).toContain('<meta name="robots" content="noindex,follow">');
    expect(html).toContain('<meta name="theme-color" content="#101820">');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
  });

  test("serves robots, sitemap, and manifest file conventions", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-file-conventions-"));
    await writeFile(
      join(appDir, "page.tsx"),
      "export default function Page() { return <main>File conventions</main>; }",
    );
    await writeFile(
      join(appDir, "robots.ts"),
      `export default function robots({ baseUrl, host }) {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin"] }],
    sitemap: baseUrl + "/sitemap.xml",
    host,
  };
}`,
    );
    await writeFile(
      join(appDir, "sitemap.ts"),
      `export default async function sitemap({ baseUrl }) {
  return [
    { url: baseUrl + "/", lastModified: new Date("2026-05-22T00:00:00.000Z"), priority: 1 },
  ];
}`,
    );
    await writeFile(
      join(appDir, "manifest.ts"),
      `export default function manifest() {
  return { name: "mreact app", start_url: "/", display: "standalone" };
}`,
    );

    const [robots, sitemap, manifest] = await Promise.all([
      renderAppRequest({ appDir, request: new Request("https://app.test/robots.txt") }),
      renderAppRequest({ appDir, request: new Request("https://app.test/sitemap.xml") }),
      renderAppRequest({ appDir, request: new Request("https://app.test/manifest.webmanifest") }),
    ]);

    expect(robots.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await robots.text()).toBe(
      "User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: https://app.test/sitemap.xml\nHost: app.test\n",
    );
    expect(sitemap.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(await sitemap.text()).toContain("<loc>https://app.test/</loc>");
    expect(manifest.headers.get("content-type")).toBe("application/manifest+json; charset=utf-8");
    expect(await manifest.json()).toEqual({
      display: "standalone",
      name: "mreact app",
      start_url: "/",
    });
  });

  test("serves route-local dynamic Open Graph image conventions", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dynamic-og-image-"));
    await mkdir(join(appDir, "posts", "$slug"), { recursive: true });
    await writeFile(
      join(appDir, "posts", "$slug", "page.tsx"),
      `export const metadata = { title: "Post" };

export default function Page(props) {
  return <main>{props.params.slug}</main>;
}`,
    );
    await writeFile(
      join(appDir, "posts", "$slug", "opengraph-image.tsx"),
      `export default function Image({ params }) {
  return new Response("<svg>" + params.slug + "</svg>", {
    headers: { "content-type": "image/svg+xml" },
  });
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/posts/hello/opengraph-image"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(await response.text()).toBe("<svg>hello</svg>");

    const page = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/posts/hello"),
    });
    const html = await page.text();

    expect(page.status).toBe(200);
    expect(html).toContain('<meta property="og:image" content="/posts/hello/opengraph-image">');
  });

  test("serves static file conventions and injects icon metadata fallbacks", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-static-file-conventions-"));
    await writeFile(join(appDir, "robots.txt"), "User-agent: *\nDisallow: /preview\n");
    await writeFile(join(appDir, "sitemap.xml"), "<urlset></urlset>");
    await writeFile(join(appDir, "manifest.webmanifest"), '{"name":"static manifest"}');
    await writeFile(join(appDir, "icon.png"), new Uint8Array([137, 80, 78, 71]));
    await writeFile(join(appDir, "apple-icon.png"), new Uint8Array([137, 80, 78, 71]));
    await writeFile(join(appDir, "opengraph-image.png"), new Uint8Array([137, 80, 78, 71]));
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = { title: "Static conventions", openGraph: { title: "OG" } };
export default function Page() {
  return <html><head></head><body><main>Static conventions</main></body></html>;
}`,
    );

    const page = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await page.text();
    const icon = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/icon"),
    });
    const robots = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/robots.txt"),
    });

    expect(html).toContain('<link rel="icon" href="/icon">');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-icon">');
    expect(html).toContain('<meta property="og:image" content="/opengraph-image">');
    expect(icon.headers.get("content-type")).toBe("image/png");
    expect(await icon.arrayBuffer()).toHaveProperty("byteLength", 4);
    expect(await robots.text()).toBe("User-agent: *\nDisallow: /preview\n");
  });

  test("injects metadata for routes that import reactive-core", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-metadata-reactive-core-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export const metadata = {
  title: "Counter",
  description: "Interactive route metadata",
};

export default function Page() {
  const count = cell(0);
  return <main>count: {count.get()}</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<title>Counter</title>");
    expect(html).toContain('<meta name="description" content="Interactive route metadata">');
    expect(html).toContain("<main>count: 0</main>");
  });

  test("escapes hostile route hydration props JSON for HTML script transport", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-props-json-escape-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function loader() {
  const payload = ${JSON.stringify("</script><script>globalThis.__mreactPwned=1</script><!--&>")} + "\\u2028" + "\\u2029" + "\\ud800";
  return { payload };
}

export default function Page(props) {
  const count = cell(0);
  return <main>payload length: {props.data.payload.length}, count: {count.get()}</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    const propsJson = html.match(
      /<script type="application\/json" id="mreact-props-index">([\s\S]*?)<\/script>/,
    )?.[1];
    expect(response.status, html).toBe(200);
    expect(propsJson).toBeDefined();
    expect(propsJson).not.toMatch(/[<>&]/);
    expect(propsJson).not.toContain("\u2028");
    expect(propsJson).not.toContain("\u2029");
    expect(propsJson).not.toContain("</script>");
    expect(propsJson).not.toContain("<!--");
    expect(JSON.parse(propsJson ?? "{}")).toMatchObject({
      data: { payload: expect.stringContaining("</script><script>") },
    });
  });

  test("serializes inferred client reference manifest into route hydration transport", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-reference-transport-"));
    await writeFile(
      join(appDir, "Counter.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>count: {count.get()}</button>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Counter } from "./Counter";

export default function Page() {
  return <main><Counter /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain('id="mreact-client-references-index"');
    expect(html).toContain('"moduleId":"./Counter"');
    expect(html).toContain('"exportName":"Counter"');
  });

  test("serializes inferred client boundary props next to the server placeholder", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-boundary-props-"));
    await writeFile(
      join(appDir, "Counter.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter(props) {
  const count = cell(props.initial);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{props.label}: {count.get()}</button>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Counter } from "./Counter";

export default function Page() {
  return <main><Counter initial={2} label="Count" /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain('<template data-mreact-client-boundary="Counter"></template>');
    expect(html).toContain('data-mreact-client-boundary-props="Counter"');
    expect(html).toContain('{"initial":2,"label":"Count"}');
  });

  test("emits .client files and component use client directives with the same boundary SSR shape", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-boundary-equivalence-"));
    await writeFile(
      join(appDir, "FileMarker.client.tsx"),
      `export function FileMarker() {
  return <button type="button">File marker HTML</button>;
}`,
    );
    await writeFile(
      join(appDir, "DirectiveMarker.tsx"),
      `"use client";

export function DirectiveMarker() {
  return <button type="button">Directive marker HTML</button>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { FileMarker } from "./FileMarker.client";
import { DirectiveMarker } from "./DirectiveMarker";

export default function Page() {
  return <main><FileMarker /><DirectiveMarker /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain('<template data-mreact-client-boundary="FileMarker"></template>');
    expect(html).toContain('<template data-mreact-client-boundary="DirectiveMarker"></template>');
    expect(html).toContain('data-mreact-client-boundary-props="FileMarker"');
    expect(html).toContain('data-mreact-client-boundary-props="DirectiveMarker"');
    expect(html).not.toContain("File marker HTML");
    expect(html).not.toContain("Directive marker HTML");
  });

  test("renders client routes with block-bodied JSX map callbacks", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-map-block-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const selected = cell("");

function getFamilyMemberIds() {
  return ["ada", "grace"];
}

function getFamilyMember(memberId) {
  return memberId === "ada" ? { user: { displayName: "Ada" } } : null;
}

export default function Page() {
  return <main>{getFamilyMemberIds().map((memberId) => {
    const member = getFamilyMember(memberId);
    if (!member) return null;
    return <button type="button" key={memberId} onClick={() => selected.set(memberId)}>{member.user.displayName}</button>;
  })}</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status, html).toBe(200);
    expect(html).toContain('<main><button type="button">Ada</button></main>');
    expect(html).toContain("/_mreact/client/routes/index.js");
  });

  test("marks inferred client boundary props with event handlers as nonserializable", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-boundary-handler-props-"));
    await writeFile(
      join(appDir, "FormField.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function FormField(props) {
  const value = cell(props.value);
  return <input value={value.get()} onInput={props.onInput} />;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { FormField } from "./FormField";

export default function Page() {
  return <main><FormField value="" onInput={() => {}} /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(html).toContain(
      '<template data-mreact-client-boundary="FormField" data-mreact-client-boundary-nonserializable="true"></template>',
    );
    expect(html).toContain('data-mreact-client-boundary-props="FormField"');
  });

  test("keeps server-renderable children visible for inferred client boundary wrappers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-boundary-wrapper-children-"));
    await writeFile(
      join(appDir, "PullToRefresh.tsx"),
      `export function PullToRefresh(props) {
  return (
    <div
      data-testid="pull-to-refresh"
      onTouchStart={() => {}}
      onTouchMove={() => {}}
      onTouchEnd={() => props.onRefresh()}
    >
      {props.children}
    </div>
  );
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { PullToRefresh } from "./PullToRefresh";

export default function Page() {
  return (
    <main>
      <PullToRefresh onRefresh={() => {}}>
        <div data-testid="timeline-virtual-grid"><article>First story</article></div>
      </PullToRefresh>
    </main>
  );
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status, html).toBe(200);
    expect(html).toContain('data-mreact-client-boundary="PullToRefresh"');
    expect(html).toContain('data-mreact-client-boundary-nonserializable="true"');
    expect(html).toContain(
      '<div data-testid="timeline-virtual-grid"><article>First story</article></div>',
    );

    const propsJson = html.match(
      /<script type="application\/json" data-mreact-client-boundary-props="PullToRefresh">([\s\S]*?)<\/script>/,
    )?.[1];
    expect(propsJson).toBeDefined();
    expect(propsJson).not.toContain("timeline-virtual-grid");
  });

  test("renders SSR fallback HTML for arrow-parameter destructured optional callback guards", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-arrow-callback-boundary-"));
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "TimelineCard.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type TimelineCardProps = {
  readonly onOpenMedia?: ((id: string) => void) | undefined;
};

export const TimelineCard = ({ onOpenMedia }: TimelineCardProps) => {
  const title = cell("Timeline fallback").get();
  return (
    <article data-testid="timeline-card">
      <button
        type="button"
        onClick={onOpenMedia === undefined ? undefined : () => onOpenMedia("media-1")}
      >
        {title}
      </button>
      <img src="/media/thumb.jpg" alt="fallback image" />
    </article>
  );
};`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { TimelineCard } from "./components/TimelineCard";

export default function Page() {
  return <main><TimelineCard /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status, html).toBe(200);
    expect(html).toContain('data-mreact-client-boundary="TimelineCard"');
    expect(html).toContain('data-testid="timeline-card"');
    expect(html).toContain("Timeline fallback");
    expect(html).toContain('src="/media/thumb.jpg"');
  });

  test("keeps inferred boundary fallback HTML visible with query client handoff", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-query-boundary-fallback-"));
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "ProfilePanel.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

type ProfilePanelProps = {
  readonly name: string;
  readonly onOpenProfile?: ((name: string) => void) | undefined;
};

export function ProfilePanel(props: ProfilePanelProps) {
  const label = cell(props.name).get();
  return (
    <article data-testid="profile-panel">
      <button
        type="button"
        onClick={props.onOpenProfile === undefined ? undefined : () => props.onOpenProfile?.(props.name)}
      >
        {label}
      </button>
    </article>
  );
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { ProfilePanel } from "./components/ProfilePanel";

export async function loader({ queryClient }) {
  await queryClient.prefetchQuery({
    queryKey: ["profile"],
    queryFn: async () => ({ name: "Ada" }),
  });
}

export default function Page(props) {
  const profile = props.queryClient.getQueryData(["profile"]);
  return <main><ProfilePanel name={profile.name} /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();
    const queryState = readQueryState(html);

    expect(response.status, html).toBe(200);
    expect(html).toContain('data-mreact-client-boundary="ProfilePanel"');
    expect(html).toContain('data-testid="profile-panel"');
    expect(html).toContain('<button type="button">Ada</button>');
    expect(queryState.queries[0]).toMatchObject({
      data: { name: "Ada" },
      queryKey: ["profile"],
    });
  });

  test("serializes inferred client reference manifest into stream hydration transport", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-client-reference-transport-"));
    await writeFile(
      join(appDir, "Counter.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>count: {count.get()}</button>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { Counter } from "./Counter";

export const stream = true;

export default function Page() {
  const name = Promise.resolve("Ada");
  return <main><Counter /><Await value={name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</Await></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).toContain('id="mreact-client-references-index"');
    expect(html).toContain('"moduleId":"./Counter"');
    expect(html).toContain('"exportName":"Counter"');
    expect(html).toContain('<template data-mreact-client-boundary="Counter"></template>');
    expect(html).toContain('data-mreact-client-boundary-props="Counter"');
  });

  test("marks streamed client boundary props with event handlers as nonserializable", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-boundary-handler-props-"));
    await writeFile(
      join(appDir, "FormField.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function FormField(props) {
  const value = cell(props.value);
  return <input value={value.get()} onInput={props.onInput} />;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { FormField } from "./FormField";

export const stream = true;

export default function Page() {
  return <main><FormField value="" onInput={() => {}} /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).toContain(
      '<template data-mreact-client-boundary="FormField" data-mreact-client-boundary-nonserializable="true"></template>',
    );
    expect(html).toContain('data-mreact-client-boundary-props="FormField"');
  });

  test("keeps streamed server-renderable children visible for inferred client boundary wrappers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-boundary-wrapper-children-"));
    await writeFile(
      join(appDir, "PullToRefresh.tsx"),
      `export function PullToRefresh(props) {
  return (
    <div data-testid="pull-to-refresh" onTouchStart={() => props.onRefresh()}>
      {props.children}
    </div>
  );
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { PullToRefresh } from "./PullToRefresh";

export const stream = true;

export default function Page() {
  return (
    <main>
      <PullToRefresh onRefresh={() => {}}>
        <div data-testid="timeline-virtual-grid"><article>First story</article></div>
      </PullToRefresh>
    </main>
  );
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).toContain('data-mreact-client-boundary="PullToRefresh"');
    expect(html).toContain('data-mreact-client-boundary-nonserializable="true"');
    expect(html).toContain(
      '<div data-testid="timeline-virtual-grid"><article>First story</article></div>',
    );

    const propsJson = html.match(
      /<script type="application\/json" data-mreact-client-boundary-props="PullToRefresh">([\s\S]*?)<\/script>/,
    )?.[1];
    expect(propsJson).toBeDefined();
    expect(propsJson).not.toContain("timeline-virtual-grid");
  });

  test("formats numeric metadata values before escaping attributes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-metadata-numeric-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = {
  title: "Numeric metadata",
  themeColor: { media: "(prefers-color-scheme: dark)", color: "#101820" },
  viewport: { width: "device-width", initialScale: 1, maximumScale: 5 },
};

export default function Page() {
  return <main>Numeric metadata</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">',
    );
    expect(html).toContain(
      '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#101820">',
    );
  });

  test("accepts Next-style Open Graph image metadata objects", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-metadata-og-image-object-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = {
  title: "Open Graph objects",
  openGraph: {
    images: [
      { url: "/og/hello.png", width: 1200, height: 630, alt: "Hello" },
      "/og/fallback.png",
    ],
  },
};

export default function Page() {
  return <main>Open Graph objects</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<meta property="og:image" content="/og/hello.png">');
    expect(html).toContain('<meta property="og:image" content="/og/fallback.png">');
  });

  test("injects arbitrary safe head descriptors and content security policy", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-csp-head-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = {
  csp: {
    nonce: "nonce-123",
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'"],
    },
  },
  head: [
    { tag: "link", attrs: { rel: "preload", href: "/app.js", as: "script" } },
    { tag: "script", attrs: { type: "application/json", id: "boot" }, nonce: true, content: "{\\"ok\\":true}" },
    { tag: "style", nonce: true, content: "body{color:red}" },
  ],
};

export default function Page() {
  return <html><head></head><body><main>CSP</main></body></html>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.headers.get("content-security-policy")).toBe(
      "default-src 'self'; script-src 'self' 'nonce-nonce-123'; style-src 'self' 'nonce-nonce-123'",
    );
    expect(html).toContain('<link rel="preload" href="/app.js" as="script">');
    expect(html).toContain('<script type="application/json" id="boot" nonce="nonce-123">');
    expect(html).toContain('<style nonce="nonce-123">body{color:red}</style>');
  });

  test("warns in dev when nonced style-src would block un-nonced inline layout styles", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-csp-inline-style-warn-"));
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout(props) {
  return <html><head></head><body><style>{"body{color:red}"}</style>{props.children}</body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = {
  csp: {
    nonce: "nonce-123",
    directives: { "style-src": ["'self'"] },
  },
};

export default function Page() {
  return <main>CSP inline style warning</main>;
}`,
    );

    try {
      const response = await renderAppRequest({
        appDir,
        request: new Request("http://local.test/"),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-security-policy")).toBe(
        "style-src 'self' 'nonce-nonce-123'",
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("inline <style> without a matching nonce"),
      );
    } finally {
      warn.mockRestore();
    }
  });

  test("emits a router logger event for nonced inline CSP warnings", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-csp-inline-logger-warn-"));
    const events: AppRouterLogEvent[] = [];
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout(props) {
  return <html><head></head><body><style>{"body{color:red}"}</style>{props.children}</body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = {
  csp: {
    nonce: "nonce-123",
    directives: { "style-src": ["'self'"] },
  },
};

export default function Page() {
  return <main>CSP inline logger warning</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      logger: {
        warn(event) {
          events.push(event);
        },
      },
      request: new Request("http://local.test/"),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(response.status).toBe(200);
    expect(events).toContainEqual({
      directive: "style-src",
      path: "/",
      tag: "style",
      type: "router:csp:inline-nonce-warning",
    });
  });

  test("warns in dev when nonced script-src would block executable inline scripts", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-csp-inline-script-warn-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = {
  csp: {
    nonce: "nonce-123",
    directives: { "script-src": ["'self'"] },
  },
  head: [
    { tag: "script", content: "console.log(1)" },
  ],
};

export default function Page() {
  return <html><head></head><body><main>CSP inline script warning</main></body></html>;
}`,
    );

    try {
      const response = await renderAppRequest({
        appDir,
        request: new Request("http://local.test/"),
      });

      expect(response.status).toBe(200);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("inline <script> without a matching nonce"),
      );
    } finally {
      warn.mockRestore();
    }
  });

  test("honors explicit CSP nonce source expressions without metadata.csp.nonce", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-csp-explicit-nonce-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = {
  csp: {
    directives: { "style-src": ["'self'", "'nonce-explicit-123'"] },
  },
  head: [
    { tag: "style", attrs: { nonce: "explicit-123" }, content: "body{color:green}" },
    { tag: "style", content: "main{color:red}" },
  ],
};

export default function Page() {
  return <html><head></head><body><main>CSP explicit nonce warning</main></body></html>;
}`,
    );

    try {
      const response = await renderAppRequest({
        appDir,
        request: new Request("http://local.test/"),
      });

      expect(response.status).toBe(200);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("inline <style> without a matching nonce"),
      );
    } finally {
      warn.mockRestore();
    }
  });

  test("warns for uppercase raw inline style tags under nonced style-src", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-csp-uppercase-style-warn-"));
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout(props) {
  return <html><head></head><body><div dangerouslySetInnerHTML={{ __html: "<STYLE>body{color:red}</STYLE>" }} />{props.children}</body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = {
  csp: {
    nonce: "nonce-123",
    directives: { "style-src": ["'self'"] },
  },
};

export default function Page() {
  return <main>CSP uppercase inline style warning</main>;
}`,
    );

    try {
      const response = await renderAppRequest({
        appDir,
        request: new Request("http://local.test/"),
      });

      expect(response.status).toBe(200);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("inline <style> without a matching nonce"),
      );
    } finally {
      warn.mockRestore();
    }
  });

  test("does not warn for inline CSP-safe scripts, nonced styles, or external resources", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-csp-inline-no-warn-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = {
  csp: {
    nonce: "nonce-123",
    directives: {
      "script-src": ["'self'"],
      "style-src": ["'self'"],
    },
  },
  head: [
    { tag: "script", attrs: { type: "application/json", id: "data" }, content: "{\\"ok\\":true}" },
    { tag: "script", attrs: { src: "/app.js" } },
    { tag: "script", nonce: true, content: "console.log(1)" },
    { tag: "style", nonce: true, content: "body{color:green}" },
  ],
};

export default function Page() {
  return <html><head></head><body><main>CSP safe inline content</main></body></html>;
}`,
    );

    try {
      const response = await renderAppRequest({
        appDir,
        request: new Request("http://local.test/"),
      });

      expect(response.status).toBe(200);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test("applies default security headers and route-level security overrides", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-security-headers-"));
    await mkdir(join(appDir, "embed"), { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      `export const metadata = {
  security: {
    frameOptions: "DENY",
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  },
};
export default function Layout(props) {
  return <html><head></head><body>{props.children}</body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>Secure page</main>;
}`,
    );
    await writeFile(
      join(appDir, "embed", "page.tsx"),
      `export const metadata = {
  security: {
    referrerPolicy: null,
    frameOptions: null,
    permissionsPolicy: { camera: ["self"], microphone: [], geolocation: null },
  },
};
export default function Page() {
  return <main>Embed page</main>;
}`,
    );

    const secure = await renderAppRequest({
      appDir,
      request: new Request("https://app.test/"),
    });
    const insecure = await renderAppRequest({
      appDir,
      request: new Request("http://app.test/"),
    });
    const embed = await renderAppRequest({
      appDir,
      request: new Request("https://app.test/embed"),
    });

    expect(secure.headers.get("x-content-type-options")).toBe("nosniff");
    expect(secure.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(secure.headers.get("permissions-policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(secure.headers.get("x-frame-options")).toBe("DENY");
    expect(secure.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains; preload",
    );
    expect(insecure.headers.get("strict-transport-security")).toBeNull();
    expect(embed.headers.get("referrer-policy")).toBeNull();
    expect(embed.headers.get("x-frame-options")).toBeNull();
    expect(embed.headers.get("permissions-policy")).toBe("camera=(self), microphone=()");
  });

  test("rejects unsafe security header metadata values", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-security-header-injection-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export const metadata = {
  security: {
    referrerPolicy: "strict-origin\\nset-cookie: hacked=1",
  },
};
export default function Page() {
  return <main>Unsafe security metadata</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("https://app.test/"),
    });

    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Internal Server Error");
  });

  test("applies route-local CSP replace, remove, and disable overrides", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-csp-overrides-"));
    await mkdir(join(appDir, "checkout"), { recursive: true });
    await mkdir(join(appDir, "callback"), { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      `export const metadata = {
  csp: {
    directives: {
      "default-src": ["'self'"],
      "connect-src": ["'self'", "https://api.example.test"],
      "report-uri": ["/csp-report"],
    },
  },
};

export default function Layout(props) {
  return <html><head></head><body>{props.children}</body></html>;
}`,
    );
    await writeFile(
      join(appDir, "checkout", "page.tsx"),
      `export const metadata = {
  csp: {
    replace: {
      "connect-src": ["'self'", "https://pay.example.test"],
    },
    remove: ["report-uri"],
  },
};

export default function Page() {
  return <main>Checkout</main>;
}`,
    );
    await writeFile(
      join(appDir, "callback", "page.tsx"),
      `export const metadata = {
  csp: { disable: true },
};

export default function Page() {
  return <main>Callback</main>;
}`,
    );

    const checkoutResponse = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/checkout"),
    });
    const callbackResponse = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/callback"),
    });

    expect(checkoutResponse.headers.get("content-security-policy")).toBe(
      "default-src 'self'; connect-src 'self' https://pay.example.test",
    );
    expect(callbackResponse.headers.get("content-security-policy")).toBeNull();
  });

  test("supports redirect and notFound helpers from loaders", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-navigation-helpers-"));
    await mkdir(join(appDir, "missing"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { redirect } from "@reckona/mreact-router";

export function loader() {
  redirect("/login");
}

export default function Page() {
  return <main>private</main>;
}`,
    );
    await writeFile(
      join(appDir, "missing", "page.tsx"),
      `import { notFound } from "@reckona/mreact-router";

export function loader() {
  notFound();
}

export default function Page() {
  return <main>missing page</main>;
}`,
    );
    await writeFile(
      join(appDir, "not-found.tsx"),
      "export default function NotFound() { return <main>Custom missing</main>; }",
    );

    const redirectResponse = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const notFoundResponse = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/missing"),
    });

    expect(redirectResponse.status).toBe(303);
    expect(redirectResponse.headers.get("location")).toBe("/login");
    expect(notFoundResponse.status).toBe(404);
    expect(await notFoundResponse.text()).toContain("<main>Custom missing</main>");
  });

  test("passes through Response values returned from page loaders", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-response-"));
    await mkdir(join(appDir, "login"), { recursive: true });
    await writeFile(
      join(appDir, "login", "page.tsx"),
      `export function loader() {
  return new Response(null, {
    status: 303,
    headers: {
      location: "/",
      "set-cookie": "pending_oidc=1; Path=/; HttpOnly; SameSite=Lax",
    },
  });
}

export default function Page() {
  return <main>Login</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/login"),
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("set-cookie")).toContain("pending_oidc=1");
    expect(await response.text()).toBe("");
  });

  test("passes through Response values thrown from page loaders", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-thrown-response-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export function loader({ request }) {
  throw Response.redirect(new URL("/login", request.url), 303);
}

export default function Page() {
  return <main>Home</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://localhost/"),
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(await response.text()).toBe("");
  });

  test("ignores arbitrary named helper exports when rendering page modules", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-page-helper-export-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export async function handleProductionLoginRequest(): Promise<Response> {
  return new Response(null, { status: 303 });
}

export default function Page() {
  return <main>Login</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>Login</main>");
  });

  test("runs app middleware before page rendering", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-middleware-"));
    await writeFile(
      join(appDir, "middleware.ts"),
      `export function middleware(request: Request) {
  if (new URL(request.url).pathname === "/blocked") {
    return new Response("blocked", {
      headers: { "x-middleware": "hit" },
      status: 451,
    });
  }
}`,
    );
    await mkdir(join(appDir, "blocked"), { recursive: true });
    await writeFile(
      join(appDir, "blocked", "page.tsx"),
      "export default function Page() { return <main>blocked page</main>; }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/blocked"),
    });

    expect(response.status).toBe(451);
    expect(response.headers.get("x-middleware")).toBe("hit");
    expect(await response.text()).toBe("blocked");
  });

  test("reuses dev middleware modules until the dev source cache version changes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-middleware-module-cache-"));
    const state = globalThis as { __mreactDevMiddlewareModuleLoads?: number };
    state.__mreactDevMiddlewareModuleLoads = 0;
    await writeFile(
      join(appDir, "middleware.ts"),
      `const state = globalThis;
state.__mreactDevMiddlewareModuleLoads = (state.__mreactDevMiddlewareModuleLoads ?? 0) + 1;
const middlewareModuleLoads = state.__mreactDevMiddlewareModuleLoads;

export function middleware() {
  return new Response("loads:" + middlewareModuleLoads, {
    headers: { "x-middleware-loads": String(middlewareModuleLoads) },
  });
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>middleware cache</main>; }",
    );

    const render = async (devServerModuleCacheVersion: string) =>
      await renderAppRequest({
        appDir,
        dev: true,
        devServerModuleCacheVersion,
        request: new Request("http://local.test/"),
      });

    const first = await render("dev-source-1");
    const second = await render("dev-source-1");
    const third = await render("dev-source-2");

    expect(first.headers.get("x-middleware-loads")).toBe("1");
    expect(second.headers.get("x-middleware-loads")).toBe("1");
    expect(third.headers.get("x-middleware-loads")).toBe("2");
  });

  test("externalizes react compat runtime aliases from dev middleware bundles", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-middleware-compat-runtime-"));
    const file = join(appDir, "middleware.ts");
    const code = `import { createElement } from "react";
import { jsx } from "react/jsx-runtime";

export function middleware() {
  return new Response(typeof createElement + ":" + typeof jsx);
}
`;
    await writeFile(file, code);
    await writeFile(join(appDir, "page.mreact.tsx"), "export default function Page() { return null; }");

    const bundled = await bundleMiddlewareModuleCode({
      appDir,
      code,
      file,
    });

    expect(bundled).toContain('from "file://');
    expect(bundled).not.toContain("REACT_COMPAT_ELEMENT_TYPE");
    expect(bundled).not.toContain("react-compat/dist");

    const response = await renderAppRequest({
      appDir,
      dev: true,
      devServerModuleCacheVersion: "dev-compat-runtime",
      request: new Request("http://local.test/"),
    });
    await expect(response.text()).resolves.toBe("function:function");
  });

  test("supports route-local middleware skip controls", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-middleware-skip-"));
    await mkdir(join(appDir, "health"), { recursive: true });
    await mkdir(join(appDir, "webhook"), { recursive: true });
    await mkdir(join(appDir, "blocked"), { recursive: true });
    await writeFile(
      join(appDir, "middleware.ts"),
      `export const config = { id: "auth" };

export function middleware() {
  return new Response("blocked", {
    headers: { "x-middleware": "auth" },
    status: 451,
  });
}`,
    );
    await writeFile(
      join(appDir, "health", "page.tsx"),
      `export const middleware = { skip: true };

export default function Page() {
  return <main>health</main>;
}`,
    );
    await writeFile(
      join(appDir, "webhook", "page.tsx"),
      `export const middleware = { skip: ["auth"] };

export default function Page() {
  return <main>webhook</main>;
}`,
    );
    await writeFile(
      join(appDir, "blocked", "page.tsx"),
      "export default function Page() { return <main>blocked page</main>; }",
    );

    const health = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/health"),
    });
    const webhook = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/webhook"),
    });
    const blocked = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/blocked"),
    });

    expect(health.status).toBe(200);
    expect(await health.text()).toContain("<main>health</main>");
    expect(webhook.status).toBe(200);
    expect(await webhook.text()).toContain("<main>webhook</main>");
    expect(blocked.status).toBe(451);
    expect(blocked.headers.get("x-middleware")).toBe("auth");
  });

  test("supports middleware matcher config, request helpers, and rewrite helper", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-middleware-rewrite-"));
    await mkdir(join(appDir, "admin"), { recursive: true });
    await mkdir(join(appDir, "login"), { recursive: true });
    await writeFile(
      join(appDir, "middleware.ts"),
      `import { cookies, headers, next, rewrite } from "@reckona/mreact-router";

export const config = { matcher: "/admin/:path*" };

export function middleware(request: Request) {
  const url = new URL(request.url);
  if (headers(request).get("x-allow-admin") === "1" || cookies(request).get("allow") === "1") {
    return next();
  }
  return url.searchParams.get("allow") === "1" ? next() : rewrite("/login");
}`,
    );
    await writeFile(
      join(appDir, "admin", "page.tsx"),
      "export default function Admin() { return <main>Admin</main>; }",
    );
    await writeFile(
      join(appDir, "login", "page.tsx"),
      "export default function Login() { return <main>Login</main>; }",
    );

    const rewritten = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/admin"),
    });
    const passed = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/admin?allow=1"),
    });
    const passedByCookie = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/admin", {
        headers: { cookie: "allow=1" },
      }),
    });
    const outsideMatcher = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/login"),
    });

    expect(await rewritten.text()).toContain("<main>Login</main>");
    expect(await passed.text()).toContain("<main>Admin</main>");
    expect(await passedByCookie.text()).toContain("<main>Admin</main>");
    expect(await outsideMatcher.text()).toContain("<main>Login</main>");
  }, 10_000);

  test("skips importing middleware modules when a static matcher excludes the request", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-middleware-static-skip-"));
    await mkdir(join(appDir, "healthz"), { recursive: true });
    await mkdir(join(appDir, "admin"), { recursive: true });
    await writeFile(
      join(appDir, "middleware.ts"),
      `const state = globalThis;
state.__mreactRenderStaticMatcherMiddlewareImports = (state.__mreactRenderStaticMatcherMiddlewareImports ?? 0) + 1;

export const config = { matcher: "/admin/:path*" };

export function middleware() {
  return new Response(null, { headers: { location: "/login" }, status: 303 });
}`,
    );
    await writeFile(
      join(appDir, "healthz", "page.tsx"),
      "export default function Healthz() { return <main>ok</main>; }",
    );
    await writeFile(
      join(appDir, "admin", "page.tsx"),
      "export default function Admin() { return <main>admin</main>; }",
    );
    const state = globalThis as {
      __mreactRenderStaticMatcherMiddlewareImports?: number | undefined;
    };
    state.__mreactRenderStaticMatcherMiddlewareImports = 0;

    const healthz = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/healthz"),
    });

    expect(healthz.status).toBe(200);
    expect(await healthz.text()).toContain("<main>ok</main>");
    expect(state.__mreactRenderStaticMatcherMiddlewareImports).toBe(0);

    const admin = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/admin"),
    });

    expect(admin.status).toBe(303);
    expect(admin.headers.get("location")).toBe("/login");
    expect(state.__mreactRenderStaticMatcherMiddlewareImports).toBe(1);
  });

  test("supports default and ALL route handlers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-handler-extensions-"));
    await mkdir(join(appDir, "api", "default"), { recursive: true });
    await mkdir(join(appDir, "api", "all"), { recursive: true });
    await writeFile(
      join(appDir, "api", "default", "route.ts"),
      `export default function handler(request: Request) {
  return Response.json({ method: request.method, type: "default" });
}`,
    );
    await writeFile(
      join(appDir, "api", "all", "route.ts"),
      `export function ALL(request: Request) {
  return Response.json({ method: request.method, type: "all" });
}`,
    );

    const defaultResponse = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/api/default", { method: "PATCH" }),
    });
    const allResponse = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/api/all", { method: "DELETE" }),
    });

    expect(await defaultResponse.json()).toEqual({ method: "PATCH", type: "default" });
    expect(await allResponse.json()).toEqual({ method: "DELETE", type: "all" });
  });

  test("passes dynamic route params to route handlers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-handler-params-"));
    await mkdir(join(appDir, "api", "families", "$id", "billing-override", "grant"), {
      recursive: true,
    });
    await writeFile(
      join(appDir, "api", "families", "$id", "billing-override", "grant", "route.ts"),
      `export function POST(request: Request, context: { params: Record<string, string> }) {
  return Response.json({ id: context.params.id, method: request.method });
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/api/families/fam_123/billing-override/grant", {
        method: "POST",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "fam_123", method: "POST" });
  });

  test("preserves streaming bodies from catch-all route handlers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-handler-stream-"));
    await mkdir(join(appDir, "api", "connect", "$...slug"), { recursive: true });
    await writeFile(
      join(appDir, "api", "connect", "$...slug", "route.ts"),
      `export function GET(_request: Request, context: { params: { slug: string[] } }) {
  const encoder = new TextEncoder();

  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify({ slug: context.params.slug }) + "\\n"));
      setTimeout(() => {
        controller.enqueue(encoder.encode("late\\n"));
        controller.close();
      }, 50);
    },
  }), {
    headers: { "content-type": "application/x-ndjson" },
  });
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/api/connect/chat.v1.ChatService/StreamMessages"),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson");
    expect(response.body).not.toBeNull();

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const first = await reader.read();

    expect(first.done).toBe(false);
    expect(decoder.decode(first.value)).toBe('{"slug":["chat.v1.ChatService","StreamMessages"]}\n');

    const secondRead = reader.read();
    const earlySecond = await Promise.race([
      secondRead.then(() => "chunk"),
      new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 10)),
    ]);
    expect(earlySecond).toBe("pending");

    const second = await secondRead;
    expect(second.done).toBe(false);
    expect(decoder.decode(second.value)).toBe("late\n");
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
  });

  test("passes request, route, and env to node route handlers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-handler-env-"));
    await mkdir(join(appDir, "api", "media", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "api", "media", "$id", "route.ts"),
      `export async function POST(request: Request, context) {
  return Response.json({
    id: context.params.id,
    mode: context.env.mode,
    requestMatches: context.request === request,
    route: context.route.path
  });
}`,
    );

    const env = { mode: "node" };
    const response = await renderAppRequest({
      appDir,
      env,
      request: new Request("http://local.test/api/media/avatar", {
        body: "ignored",
        method: "POST",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "avatar",
      mode: "node",
      requestMatches: true,
      route: "/api/media/:id",
    });
  });

  test("route handlers can validate multipart CSRF fields", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-handler-csrf-"));
    await mkdir(join(appDir, "api", "upload"), { recursive: true });
    const routerEntry = join(process.cwd(), "packages", "router", "dist", "index.js");
    await writeFile(
      join(appDir, "api", "upload", "route.ts"),
      `import { formCsrfFieldName, validateFormCsrf } from ${JSON.stringify(routerEntry)};

export async function POST(request: Request) {
  const form = await request.formData();
  const csrfResponse = validateFormCsrf(request, form);
  if (csrfResponse !== undefined) {
    return csrfResponse;
  }

  return Response.json({ ok: true, fileName: form.get("file").name, field: formCsrfFieldName });
}`,
    );
    const validForm = new FormData();
    validForm.set("__mreact_csrf", "csrf-route-upload");
    validForm.set("file", new File(["bytes"], "avatar.png", { type: "image/png" }));
    const invalidForm = new FormData();
    invalidForm.set("__mreact_csrf", "wrong");
    invalidForm.set("file", new File(["bytes"], "avatar.png", { type: "image/png" }));

    const valid = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/api/upload", {
        body: validForm,
        headers: { cookie: "mreact.csrf=csrf-route-upload" },
        method: "POST",
      }),
    });
    const invalid = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/api/upload", {
        body: invalidForm,
        headers: { cookie: "mreact.csrf=csrf-route-upload" },
        method: "POST",
      }),
    });

    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({
      field: "__mreact_csrf",
      fileName: "avatar.png",
      ok: true,
    });
    expect(invalid.status).toBe(403);
    expect(await invalid.json()).toEqual({ error: "Invalid CSRF token.", ok: false });
  });

  test("caches rendered route HTML for exported revalidate seconds", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-cache-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const revalidate = 60;

export function loader() {
  const state = globalThis as { __mreactRouteCacheCalls?: number };
  state.__mreactRouteCacheCalls = (state.__mreactRouteCacheCalls ?? 0) + 1;
  return { calls: state.__mreactRouteCacheCalls };
}

export default function Page(props) {
  return <main>calls: {props.data.calls}</main>;
}`,
    );

    const first = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const second = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(first.headers.get("cache-control")).toBe("s-maxage=60, stale-while-revalidate");
    expect(await first.text()).toContain("<main>calls: 1</main>");
    expect(await second.text()).toContain("<main>calls: 1</main>");
  });

  test("keeps security headers on cached route responses", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-cache-headers-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const revalidate = 60;

export const metadata = {
  csp: { directives: { "default-src": "'self'" } },
  security: { frameOptions: "DENY" },
};

export default function Page() {
  return <main>guarded</main>;
}`,
    );

    const miss = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const hit = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(miss.headers.get("x-mreact-cache")).toBe("MISS");
    expect(hit.headers.get("x-mreact-cache")).toBe("HIT");

    for (const response of [miss, hit]) {
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("content-security-policy")).toBe("default-src 'self'");
      expect(response.headers.get("cache-control")).toBe("s-maxage=60, stale-while-revalidate");
    }
  });

  test("does not advertise a shared lifetime for a header dependent max-age route", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-cache-maxage-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cacheControl } from "@reckona/mreact-router";

export function loader({ request }) {
  cacheControl({ maxAge: 300 });
  return { locale: request.headers.get("accept-language") ?? "en" };
}

export default function Page(props) {
  return <main>locale: {props.data.locale}</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", { headers: { "accept-language": "ja" } }),
    });

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toContain("<main>locale: ja</main>");
  });

  test("does not disclose a visitor's client IP to the next visitor", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-cache-ip-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const revalidate = 60;

export function loader({ request }) {
  return { ip: request.headers.get("cf-connecting-ip") ?? "none" };
}

export default function Page(props) {
  return <main>ip: {props.data.ip}</main>;
}`,
    );

    const first = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", {
        headers: { "cf-connecting-ip": "203.0.113.7" },
      }),
    });
    const second = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", {
        headers: { "cf-connecting-ip": "198.51.100.42" },
      }),
    });

    expect(await first.text()).toContain("<main>ip: 203.0.113.7</main>");
    expect(await second.text()).toContain("<main>ip: 198.51.100.42</main>");
  });

  test("marks a header dependent route as uncacheable for shared caches", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-cache-dynamic-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const revalidate = 60;

export function loader({ request }) {
  return { country: request.headers.get("cf-ipcountry") ?? "unknown" };
}

export default function Page(props) {
  return <main>country: {props.data.country}</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", {
        headers: { "cf-ipcountry": "JP" },
      }),
    });

    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-mreact-cache")).toBe("DYNAMIC");
    expect(await response.text()).toContain("<main>country: JP</main>");
  });

  test("does not advertise a shared lifetime when a layout sets the cache policy", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-cache-layout-policy-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `import { cacheControl } from "@reckona/mreact-router";

export default function Layout(props) {
  cacheControl({ sMaxAge: 120, staleWhileRevalidate: true });
  return <div id="shell">{props.children}</div>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export function loader({ request }) {
  return { locale: request.headers.get("accept-language") ?? "en" };
}

export default function Page(props) {
  return <main>locale: {props.data.locale}</main>;
}`,
    );

    const english = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", { headers: { "accept-language": "en" } }),
    });
    const japanese = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", { headers: { "accept-language": "ja" } }),
    });

    expect(english.headers.get("cache-control")).not.toContain("s-maxage");
    expect(await english.text()).toContain("<main>locale: en</main>");
    expect(await japanese.text()).toContain("<main>locale: ja</main>");
  });

  test("keeps sharing cached HTML when a layout reads no request header", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-cache-shared-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `export default function Layout(props) {
  return <div id="shell">{props.children}</div>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const revalidate = 60;

export function loader({ request }) {
  const state = globalThis as { __mreactSharedCacheCalls?: number };
  state.__mreactSharedCacheCalls = (state.__mreactSharedCacheCalls ?? 0) + 1;
  return { calls: state.__mreactSharedCacheCalls, path: new URL(request.url).pathname };
}

export default function Page(props) {
  return <main>calls: {props.data.calls}</main>;
}`,
    );

    const first = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", {
        headers: { "accept-language": "en" },
      }),
    });
    const second = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", {
        headers: { "accept-language": "ja" },
      }),
    });

    expect(first.headers.get("cache-control")).toBe("s-maxage=60, stale-while-revalidate");
    expect(second.headers.get("x-mreact-cache")).toBe("HIT");
    expect(await first.text()).toContain("<main>calls: 1</main>");
    expect(await second.text()).toContain("<main>calls: 1</main>");
  });

  test("isolates cached route HTML by Accept-Language", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-cache-locale-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const revalidate = 60;

export function loader({ request }) {
  return { locale: request.headers.get("accept-language") ?? "en" };
}

export default function Page(props) {
  return <main>locale: {props.data.locale}</main>;
}`,
    );

    const english = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", {
        headers: { "accept-language": "en" },
      }),
    });
    const japanese = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", {
        headers: { "accept-language": "ja" },
      }),
    });

    expect(await english.text()).toContain("<main>locale: en</main>");
    expect(await japanese.text()).toContain("<main>locale: ja</main>");
  });

  test("caches rendered route HTML for cacheControl called from a loader", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-cache-control-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `import { cacheControl } from "@reckona/mreact-router";

export function loader() {
  cacheControl({
    maxAge: 5,
    sMaxAge: 60,
    staleWhileRevalidate: 300,
  });
  const state = globalThis as { __mreactCacheControlCalls?: number };
  state.__mreactCacheControlCalls = (state.__mreactCacheControlCalls ?? 0) + 1;
  return { calls: state.__mreactCacheControlCalls };
}

export default function Page(props) {
  return <main>calls: {props.data.calls}</main>;
}`,
    );

    const first = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const second = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(first.headers.get("cache-control")).toBe(
      "max-age=5, s-maxage=60, stale-while-revalidate=300",
    );
    expect(await first.text()).toContain("<main>calls: 1</main>");
    expect(await second.text()).toContain("<main>calls: 1</main>");
    expect(second.headers.get("x-mreact-cache")).toBe("HIT");
  });

  test("keeps interleaved page route-cache state request-local", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-cache-interleaved-"));
    await mkdir(join(appDir, "a"), { recursive: true });
    await mkdir(join(appDir, "b"), { recursive: true });
    let resolveAStarted: (() => void) | undefined;
    let resolveBStarted: (() => void) | undefined;
    let releaseA: (() => void) | undefined;
    let releaseB: (() => void) | undefined;
    const aStarted = new Promise<void>((resolve) => {
      resolveAStarted = resolve;
    });
    const bStarted = new Promise<void>((resolve) => {
      resolveBStarted = resolve;
    });
    const waitForA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const waitForB = new Promise<void>((resolve) => {
      releaseB = resolve;
    });
    const state = globalThis as {
      __mreactInterleavedRouteCache?: {
        aStarted(): void;
        bStarted(): void;
        waitForA: Promise<void>;
        waitForB: Promise<void>;
      };
    };
    state.__mreactInterleavedRouteCache = {
      aStarted: () => resolveAStarted?.(),
      bStarted: () => resolveBStarted?.(),
      waitForA,
      waitForB,
    };
    await writeFile(
      join(appDir, "a", "page.tsx"),
      `import { cacheControl, revalidatePath } from "@reckona/mreact-router";

export async function loader() {
  const state = globalThis.__mreactInterleavedRouteCache;
  state.aStarted();
  await state.waitForA;
  cacheControl({ sMaxAge: 11 });
  revalidatePath("/a");
  return {};
}

export default function Page() { return <main>A</main>; }`,
    );
    await writeFile(
      join(appDir, "b", "page.tsx"),
      `import { revalidatePath } from "@reckona/mreact-router";

export const revalidate = 0;

export async function loader() {
  const state = globalThis.__mreactInterleavedRouteCache;
  revalidatePath("/b");
  state.bStarted();
  await state.waitForB;
  return {};
}

export default function Page() { return <main>B</main>; }`,
    );
    const cacheA = createRecordingRouteCache();
    const cacheB = createRecordingRouteCache();

    try {
      const responseA = renderAppRequest({
        appDir,
        request: new Request("http://local.test/a"),
        routeCache: cacheA,
      });
      await aStarted;
      const responseB = renderAppRequest({
        appDir,
        request: new Request("http://local.test/b"),
        routeCache: cacheB,
      });
      await bStarted;
      releaseA?.();
      const renderedA = await responseA;
      releaseB?.();
      const renderedB = await responseB;

      expect(renderedA.headers.get("cache-control")).toBe("s-maxage=11");
      expect(renderedB.headers.get("cache-control")).toBe("no-store");
      expect(cacheA.calls).toContain("deleteByPath:/a");
      expect(cacheA.calls).not.toContain("deleteByPath:/b");
      expect(cacheB.calls).toContain("deleteByPath:/b");
      expect(cacheB.calls).not.toContain("deleteByPath:/a");
    } finally {
      releaseA?.();
      releaseB?.();
      delete state.__mreactInterleavedRouteCache;
    }
  }, 20_000);

  test("does not cache routes exported with revalidate zero", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-no-store-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const revalidate = 0;

export function loader() {
  const state = globalThis as { __mreactNoStoreCalls?: number };
  state.__mreactNoStoreCalls = (state.__mreactNoStoreCalls ?? 0) + 1;
  return { calls: state.__mreactNoStoreCalls };
}

export default function Page(props) {
  return <main>calls: {props.data.calls}</main>;
}`,
    );

    const first = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const second = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(await first.text()).toContain("<main>calls: 1</main>");
    expect(await second.text()).toContain("<main>calls: 2</main>");
  });

  test("uses an injected route cache adapter for cached page responses", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-cache-adapter-"));
    const cache = createRecordingRouteCache();
    await writeFile(
      join(appDir, "page.tsx"),
      `export const revalidate = 60;

export function loader() {
  const state = globalThis as { __mreactAdapterCacheCalls?: number };
  state.__mreactAdapterCacheCalls = (state.__mreactAdapterCacheCalls ?? 0) + 1;
  return { calls: state.__mreactAdapterCacheCalls };
}

export default function Page(props) {
  return <main>calls: {props.data.calls}</main>;
}`,
    );

    const first = await renderAppRequest({
      appDir,
      routeCache: cache,
      request: new Request("http://local.test/"),
    });
    const second = await renderAppRequest({
      appDir,
      routeCache: cache,
      request: new Request("http://local.test/"),
    });

    expect(await first.text()).toContain("<main>calls: 1</main>");
    expect(await second.text()).toContain("<main>calls: 1</main>");
    expect(cache.calls.filter((call) => call.startsWith("get:"))).toHaveLength(2);
    expect(cache.calls.filter((call) => call.startsWith("set:"))).toHaveLength(1);
  });

  test("bypasses cached route HTML when navigation requests reload after a client mutation", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-cache-navigation-reload-"));
    const cache = createRecordingRouteCache();
    await writeFile(
      join(appDir, "page.tsx"),
      `export const revalidate = 60;

export function loader() {
  const state = globalThis as { __mreactNavigationReloadCalls?: number };
  state.__mreactNavigationReloadCalls = (state.__mreactNavigationReloadCalls ?? 0) + 1;
  return { calls: state.__mreactNavigationReloadCalls };
}

export default function Page(props) {
  return <main>calls: {props.data.calls}</main>;
}`,
    );

    const first = await renderAppRequest({
      appDir,
      routeCache: cache,
      request: new Request("http://local.test/"),
    });
    const second = await renderAppRequest({
      appDir,
      routeCache: cache,
      request: new Request("http://local.test/", {
        headers: {
          "x-mreact-navigation": "1",
          "x-mreact-navigation-cache": "reload",
        },
      }),
    });

    expect(await first.text()).toContain("<main>calls: 1</main>");
    expect(await second.text()).toContain("<main>calls: 2</main>");
    expect(second.headers.get("x-mreact-cache")).toBe("MISS");
    expect(cache.calls.filter((call) => call.startsWith("get:"))).toHaveLength(1);
    expect(cache.calls.filter((call) => call.startsWith("set:"))).toHaveLength(2);
  });

  test("does not consult route cache for pages without a revalidate policy", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-cache-skip-"));
    const cache = createRecordingRouteCache();
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>uncached</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      routeCache: cache,
      request: new Request("http://local.test/"),
    });

    expect(await response.text()).toContain("<main>uncached</main>");
    expect(cache.calls).toEqual([]);
  });

  test("passes data from typed loader signatures to typed page components", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-typed-loader-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `interface LoaderContext {
  params: Record<string, string>;
  request: Request;
}

interface PageData {
  title: string;
}

export async function loader(context: LoaderContext): Promise<PageData> {
  return { title: context.request.url.includes("local.test") ? "Typed Loaded" : "Missing" };
}

export default function Page(props: { data: PageData }): JSX.Element {
  return <main><h1>{props.data.title}</h1></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main><h1>Typed Loaded</h1></main>");
  });

  test("executes imported async loader modules before rendering", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-import-"));
    await writeFile(
      join(appDir, "data.ts"),
      `export function titleFor(id: string) {
  return { nested: { title: \`User \${id}\` } };
}`,
    );
    await mkdir(join(appDir, "users", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "users", "$id", "page.mreact.tsx"),
      `import { titleFor } from "../../data";

export async function loader({ params }) {
  const data = titleFor(params.id);
  return { title: data.nested.title };
}

export default function Page(props) {
  return <main><h1>{props.data.title}</h1></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/users/ada"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main><h1>User ada</h1></main>");
  });

  test("isolates loader module scope between requests", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-isolation-"));
    await writeFile(
      join(appDir, "state.ts"),
      `let calls = 0;

export function nextCall() {
  calls += 1;
  return calls;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { nextCall } from "./state";

export function loader() {
  return { calls: nextCall() };
}

export default function Page(props) {
  return <main>calls: {props.data.calls}</main>;
}`,
    );

    const first = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const second = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(await first.text()).toContain("<main>calls: 1</main>");
    expect(await second.text()).toContain("<main>calls: 1</main>");
  });

  test("rejects loader imports that escape the app directory", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-sandbox-"));
    const appDir = join(rootDir, "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(rootDir, "secret.ts"), "export const secret = 'leaked';");
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { secret } from "../secret";

export function loader() {
  return { secret };
}

export default function Page(props) {
  return <main>{props.data.secret}</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe("Internal Server Error");
  });

  test("includes migration guidance for server JSX spread attribute diagnostics", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-server-spread-guidance-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `const baseProps = { class: "icon", viewBox: "0 0 24 24" };

export default function Page() {
  return <svg {...baseProps} />;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('<svg class="icon" viewBox="0 0 24 24"></svg>');
  });

  test("allows loader imports from Node built-ins", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-node-import-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { createHash } from "node:crypto";

export function loader() {
  return { digest: createHash("sha1").update("mreact").digest("hex").slice(0, 6) };
}

export default function Page(props) {
  return <main>{props.data.digest}</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>9f7217</main>");
  });

  test("allows loader package dependencies that require Node built-ins from CommonJS", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-cjs-node-builtins-"));
    const packageDir = join(appDir, "node_modules", "fixture-cjs-events");
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, "package.json"), JSON.stringify({ main: "./index.cjs" }));
    await writeFile(
      join(packageDir, "index.cjs"),
      `const { EventEmitter } = require("events");

exports.readValue = function readValue() {
  const emitter = new EventEmitter();
  let value = "missing";
  emitter.on("ready", (nextValue) => {
    value = nextValue;
  });
  emitter.emit("ready", "events-ok");
  return value;
};
`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { readValue } from "fixture-cjs-events";

export function loader() {
  return { value: readValue() };
}

export default function Page(props) {
  return <main>{props.data.value}</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      importPolicy: { allowedPackages: ["fixture-cjs-events"] },
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>events-ok</main>");
  });

  test("keeps loader hybrid package CJS default interop native", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-hybrid-cjs-"));
    const packageDir = join(appDir, "node_modules", "fixture-hybrid-admin");
    await mkdir(join(packageDir, "lib", "esm", "firestore"), { recursive: true });
    await mkdir(join(packageDir, "lib", "app"), { recursive: true });
    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify({
        exports: {
          "./firestore": "./lib/esm/firestore/index.js",
        },
        name: "fixture-hybrid-admin",
        type: "module",
      }),
    );
    await writeFile(
      join(packageDir, "lib", "esm", "firestore", "package.json"),
      JSON.stringify({ type: "module" }),
    );
    await writeFile(
      join(packageDir, "lib", "app", "package.json"),
      JSON.stringify({ type: "commonjs" }),
    );
    await writeFile(
      join(packageDir, "lib", "app", "index.js"),
      `const path = require("node:path");

module.exports = {
  SDK_VERSION: "fixture-sdk",
  dirnameLeaf: path.basename(__dirname),
};
`,
    );
    await writeFile(
      join(packageDir, "lib", "esm", "firestore", "index.js"),
      `import mod from "../../app/index.js";

export const SDK_VERSION = mod.SDK_VERSION;
export const dirnameLeaf = mod.dirnameLeaf;
`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { SDK_VERSION, dirnameLeaf } from "fixture-hybrid-admin/firestore";

export function loader() {
  return { value: SDK_VERSION + ":" + dirnameLeaf };
}

export default function Page(props) {
  return <main>{props.data.value}</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      importPolicy: { allowedPackages: ["fixture-hybrid-admin"] },
      request: new Request("http://local.test/"),
    });

    const text = await response.text();

    expect(response.status, text).toBe(200);
    expect(text).toContain("<main>fixture-sdk:app</main>");
  });

  test("rejects loader package imports unless explicitly allowed", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-package-import-"));
    await writePackageFixture(appDir);
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { version } from "fixture-lib";

export function loader() {
  return { version };
}

export default function Page(props) {
  return <main>{props.data.version}</main>;
}`,
    );

    const blocked = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const allowed = await renderAppRequest({
      appDir,
      importPolicy: { allowedPackages: ["fixture-lib"] },
      request: new Request("http://local.test/"),
    });

    expect(blocked.status).toBe(500);
    await expect(blocked.text()).resolves.toBe("Internal Server Error");
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toContain("<main>fixture-ok</main>");
  });

  test("rejects loader dynamic package imports unless explicitly allowed", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-dynamic-package-import-"));
    await writePackageFixture(appDir);
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export async function loader() {
  const mod = await import("fixture-lib");
  return { version: mod.version };
}

export default function Page(props) {
  return <main>{props.data.version}</main>;
}`,
    );

    const blocked = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const allowed = await renderAppRequest({
      appDir,
      importPolicy: { allowedPackages: ["fixture-lib"] },
      request: new Request("http://local.test/"),
    });

    expect(blocked.status).toBe(500);
    await expect(blocked.text()).resolves.toBe("Internal Server Error");
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toContain("<main>fixture-ok</main>");
  });

  test("wraps pages with root and nested layouts", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-layout-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      "export default function Layout() { return <html><body><header>Root</header><Slot /></body></html>; }",
    );
    await mkdir(join(appDir, "docs"), { recursive: true });
    await writeFile(
      join(appDir, "docs", "layout.mreact.tsx"),
      "export default function DocsLayout() { return <section><h1>Docs</h1><Slot /></section>; }",
    );
    await writeFile(
      join(appDir, "docs", "page.mreact.tsx"),
      "export default function Page() { return <article>Nested page</article>; }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/docs"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      '<!DOCTYPE html><html data-mreact-layout-boundary="root"><body><header>Root</header><section data-mreact-layout-boundary="docs"><h1>Docs</h1><article>Nested page</article></section></body></html>',
    );
  });

  test("renders page exports into named layout slots", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-named-slots-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      'export default function Layout() { return <html><body><header><Slot name="header" /></header><aside><Slot name="sidebar" /></aside><main><Slot /></main></body></html>; }',
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export function Header() { return <h1>Named title</h1>; }
export function Sidebar() { return <nav>Docs nav</nav>; }
export const slots = { header: Header, sidebar: Sidebar };
export default function Page() { return <article>Main page</article>; }`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      '<!DOCTYPE html><html data-mreact-layout-boundary="root"><body><header><h1>Named title</h1></header><aside><nav>Docs nav</nav></aside><main><article>Main page</article></main></body></html>',
    );
  });

  test("renders named and default slots when Slot carries extra attributes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-slot-attrs-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      'export default function Layout() { return <html><body><header><Slot data-testid="docs-header" name="header" /></header><aside><Slot name="sidebar" aria-label="Docs nav" /></aside><main><Slot class="content" /></main></body></html>; }',
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export function Header() { return <h1>Docs title</h1>; }
export function Sidebar() { return <nav>Docs nav</nav>; }
export const slots = { header: Header, sidebar: Sidebar };
export default function Page() { return <article>Docs body</article>; }`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<header><h1>Docs title</h1></header>");
    expect(html).toContain("<aside><nav>Docs nav</nav></aside>");
    expect(html).toContain("<main><article>Docs body</article></main>");
    expect(html).not.toContain("<slot");
  });

  test("renders layout slots around pages that import local server components", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-imported-server-component-"));
    const appDir = join(rootDir, "src", "app");
    await mkdir(join(rootDir, "src", "components"), { recursive: true });
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "layout.tsx"),
      "export default function Layout() { return <html><body><Slot /></body></html>; }",
    );
    await writeFile(
      join(rootDir, "src", "components", "Frame.mreact.tsx"),
      "export function Frame(props) { return <main><h1>{props.title}</h1>{props.children}</main>; }",
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Frame } from "../components/Frame.mreact";
const items = ["A", "B"];

export default function Page() {
  return <Frame title="Home"><p>Body</p>{items.map((item) => <span key={item}>{item}</span>)}</Frame>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      '<!DOCTYPE html><html data-mreact-layout-boundary="root"><body><main><h1>Home</h1><p>Body</p><span>A</span><span>B</span></main></body></html>',
    );
  });

  test("renders route-local SVG helper components with child paths", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-svg-helper-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `function SettingsIcon(props: { readonly icon: "mail" | "trash" }) {
  if (props.icon === "mail") {
    return (
      <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16v12H4z" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    );
  }

  return (
    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 7h8M10 7V5h4v2M6 7h12l-1 13H7L6 7Z" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}

export default function Page() {
  return <main><SettingsIcon icon="mail" /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      '<main><svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4z"></path><path d="m4 7 8 6 8-6"></path></svg></main>',
    );
    expect(html).not.toContain("[object Object]");
  });

  test("renders imported discriminated union helper components with switch returns", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-route-switch-helper-"));
    const appDir = join(rootDir, "src", "app");
    await mkdir(join(rootDir, "src", "components", "legal"), { recursive: true });
    await mkdir(join(appDir, "legal", "terms"), { recursive: true });
    await writeFile(
      join(rootDir, "src", "components", "legal", "LegalPage.tsx"),
      `type LegalBlock =
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "orderedList"; readonly start?: number; readonly items: readonly string[] }
  | { readonly kind: "table"; readonly headers: readonly string[]; readonly rows: readonly (readonly string[])[] };

function LegalDocumentBlockView(props: { readonly block: LegalBlock }) {
  switch (props.block.kind) {
    case "paragraph":
      return <p>{props.block.text}</p>;
    case "orderedList":
      return (
        <ol start={props.block.start}>
          {props.block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      );
    case "table":
      return (
        <table>
          <tbody>
            {props.block.rows.map((row) => (
              <tr key={row.join("|")}>
                {row.map((cell) => (
                  <td key={cell}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

const blocks: readonly LegalBlock[] = [
  { kind: "paragraph", text: "Intro" },
  { kind: "orderedList", start: 3, items: ["One", "Two"] },
  { kind: "table", headers: ["Name"], rows: [["Ada"], ["Linus"]] },
];

export function LegalPage() {
  return <main>{blocks.map((block) => <LegalDocumentBlockView key={block.kind} block={block} />)}</main>;
}`,
    );
    await writeFile(
      join(appDir, "legal", "terms", "page.tsx"),
      `import { LegalPage } from "../../../components/legal/LegalPage";

export default function Page() {
  return <LegalPage />;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/legal/terms"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      '<main><p>Intro</p><ol start="3"><li>One</li><li>Two</li></ol><table><tbody><tr><td>Ada</td></tr><tr><td>Linus</td></tr></tbody></table></main>',
    );
  });

  test("renders router Link inside imported shared server components", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-imported-server-link-"));
    const appDir = join(rootDir, "src", "app");
    await mkdir(join(rootDir, "src", "hn"), { recursive: true });
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(rootDir, "src", "hn", "render.tsx"),
      `import { Link } from "@reckona/mreact-router/link";

export function Nav() {
  return <nav><Link href="/newest" prefetch="viewport">New</Link></nav>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Nav } from "../hn/render";

export default function Page() {
  return <main><Nav /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      '<main><nav><a href="/newest" data-mreact-prefetch="viewport">New</a></nav></main>',
    );
    expect(html).not.toContain("[object Object]");
  });

  test("renders router Link inside imported shared renderer function calls", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-imported-renderer-link-"));
    const appDir = join(rootDir, "src", "app");
    await mkdir(join(rootDir, "src", "hn"), { recursive: true });
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(rootDir, "src", "hn", "render.tsx"),
      `import { Link } from "@reckona/mreact-router/link";

export function renderNav() {
  return <nav aria-label="Story feeds"><Link href="/newest">New</Link></nav>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { renderNav } from "../hn/render";

export default function Page() {
  return <main>{renderNav()}</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      '<main><nav aria-label="Story feeds"><a href="/newest">New</a></nav></main>',
    );
    expect(html).not.toContain("[object Object]");
  });

  test("renders router Link element children as nested SSR elements", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-link-element-children-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Link } from "@reckona/mreact-router/link";

export default function Page() {
  return (
    <main>
      <Link href="/next"><span class="dir">Next</span><span class="ttl">Title</span></Link>
    </main>
  );
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(
      '<main><a href="/next"><span class="dir">Next</span><span class="ttl">Title</span></a></main>',
    );
    expect(html).not.toContain("&lt;span");
  });

  test("renders router Link component-returned SVG children as nested SSR elements", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-link-component-svg-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Link } from "@reckona/mreact-router/link";

function SettingsIcon() {
  return <svg class="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4z" /></svg>;
}

export default function Page() {
  return (
    <main>
      <Link href="/settings/profile" class="block"><span class="icon"><SettingsIcon /></span></Link>
    </main>
  );
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<a class="block" href="/settings/profile"><span class="icon"><svg');
    expect(html).toContain('<path d="M4 6h16v12H4z"></path>');
    expect(html).not.toContain("&lt;svg");
  });

  test("escapes router Link text expression children exactly once in SSR", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-link-text-escape-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Link } from "@reckona/mreact-router/link";

export default function Page() {
  const label = "Status & Limitations";
  return <main><Link href="/status">{label}</Link></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<main><a href="/status">Status &amp; Limitations</a></main>');
    expect(html).not.toContain("&amp;amp;");
  });

  test("renders dynamic MDX registry components without stringifying SSR output", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-dynamic-mdx-registry-"));
    const appDir = join(rootDir, "src", "app");
    await mkdir(join(rootDir, "src", "content"), { recursive: true });
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(rootDir, "src", "content", "hello.mdx"),
      `export const title = "Hello MDX";

# Hello Registry
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import Post from "../content/hello.mdx";

export default function Page() {
  const pages = { hello: { Component: Post } };
  const Content = pages.hello.Component;
  return <main><Content /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
      vitePlugins: [
        mdx({
          jsxImportSource: "@reckona/mreact",
          jsxRuntime: "automatic",
          remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
        }),
      ],
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<h1>Hello Registry</h1>");
    expect(html).not.toContain("[object Object]");
  });

  test("renders import.meta.glob MDX component maps without stringifying SSR output", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-glob-mdx-registry-"));
    const appDir = join(rootDir, "src", "app");
    await mkdir(join(rootDir, "src", "content"), { recursive: true });
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(rootDir, "src", "content", "hello.mdx"),
      `export const title = "Hello MDX";

# Hello Glob
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `const modules = import.meta.glob("../content/*.mdx", { eager: true });

export default function Page() {
  const components = {};
  for (const [path, mod] of Object.entries(modules)) {
    const slug = path.replace("../content/", "").replace(".mdx", "");
    components[slug] = mod.default;
  }
  const Content = components.hello;
  return <main><Content /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
      vitePlugins: [
        mdx({
          jsxImportSource: "@reckona/mreact",
          jsxRuntime: "automatic",
          remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
        }),
      ],
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<h1>Hello Glob</h1>");
    expect(html).not.toContain("[object Object]");
  });

  test("warns in dev when page slot exports are not consumed by layouts", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-slot-warn-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      'export default function Layout() { return <html><body><aside><Slot name="aside" /></aside><main><Slot /></main></body></html>; }',
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export function Aside() { return <p>aside</p>; }
export function Typo() { return <p>typo</p>; }
export function DefaultSlot() { return <p>default</p>; }
export const slots = { aside: Aside, asid: Typo, default: DefaultSlot };
export default function Page() { return <article>Body</article>; }`,
    );

    try {
      const response = await renderAppRequest({
        appDir,
        request: new Request("http://local.test/"),
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toContain("<aside><p>aside</p></aside>");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("slots.{asid}"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("slots.default"));
    } finally {
      warn.mockRestore();
    }
  });

  test("renders standard tsx pages with standard tsx layouts and error boundaries", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-standard-tsx-"));
    await writeFile(
      join(appDir, "layout.tsx"),
      "export default function Layout() { return <html><body><Slot /></body></html>; }",
    );
    await writeFile(
      join(appDir, "error.tsx"),
      "export default function ErrorPage(props) { return <main>error: {props.error.message}</main>; }",
    );
    await writeFile(
      join(appDir, "page.tsx"),
      'export default function Page() { throw new Error("tsx failed"); }',
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(500);
    expect(await response.text()).toContain(
      '<html data-mreact-layout-boundary="root"><body><main>error: tsx failed</main></body></html>',
    );
  });

  test("passes safe request, route, trace, and dev debug context to error boundaries", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-error-context-"));
    await writeFile(
      join(appDir, "layout.tsx"),
      "export default function Layout() { return <html><body><Slot /></body></html>; }",
    );
    await writeFile(
      join(appDir, "error.tsx"),
      `export default function ErrorPage(props) {
  return <main>
    <p>request: {props.requestId}</p>
    <p>route: {props.routeId}</p>
    <p>trace: {props.traceId}</p>
    <p>debug: {props.debug?.stack?.includes("tsx failed") ? "yes" : "no"}</p>
  </main>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      'export default function Page() { throw new Error("tsx failed"); }',
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/", {
        headers: {
          traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
          "x-request-id": "req-123",
        },
      }),
    });
    const html = await response.text();

    expect(response.status).toBe(500);
    expect(html).toContain("<p>request: req-123</p>");
    expect(html).toContain("<p>route: index</p>");
    expect(html).toContain("<p>trace: 4bf92f3577b34da6a3ce929d0e0e4736</p>");
    expect(html).toContain("<p>debug: yes</p>");
  });

  test("does not pass debug error details to production error boundaries", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-production-error-context-"));
    await writeFile(
      join(appDir, "error.tsx"),
      `export default function ErrorPage(props) {
  return <main>{props.debug === undefined ? "no debug" : props.debug.stack}</main>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      'export default function Page() { throw new Error("production failed"); }',
    );

    try {
      const response = await renderAppRequest({
        appDir,
        request: new Request("http://local.test/"),
      });
      const html = await response.text();

      expect(response.status).toBe(500);
      expect(html).toContain("<main>no debug</main>");
      expect(html).not.toContain("production failed");
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  test("emits request and loader instrumentation hooks with parsed trace context", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-instrumentation-"));
    await writeFile(
      join(appDir, "middleware.ts"),
      `export function middleware() {
  return undefined;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export function loader() {
  return { name: "Ada" };
}

export default function Page(props) {
  return <main>{props.data.name}</main>;
}`,
    );
    const events: Array<{ name: string; routeId?: string; traceId?: string }> = [];

    const response = await renderAppRequest({
      appDir,
      instrumentation: {
        onLoaderEnd(event) {
          events.push({
            name: "loader:end",
            routeId: event.routeId,
            traceId: event.trace?.traceId,
          });
        },
        onLoaderStart(event) {
          events.push({
            name: "loader:start",
            routeId: event.routeId,
            traceId: event.trace?.traceId,
          });
        },
        onMiddlewareEnd(event) {
          events.push({
            name: "middleware:end",
            traceId: event.trace?.traceId,
          });
        },
        onMiddlewareStart(event) {
          events.push({
            name: "middleware:start",
            traceId: event.trace?.traceId,
          });
        },
        onRequestEnd(event) {
          events.push({
            name: "request:end",
            traceId: event.trace?.traceId,
          });
        },
        onRequestStart(event) {
          events.push({
            name: "request:start",
            traceId: event.trace?.traceId,
          });
        },
      },
      request: new Request("http://local.test/", {
        headers: {
          traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>Ada</main>");
    expect(events).toEqual([
      { name: "request:start", traceId: "4bf92f3577b34da6a3ce929d0e0e4736" },
      { name: "middleware:start", traceId: "4bf92f3577b34da6a3ce929d0e0e4736" },
      { name: "middleware:end", traceId: "4bf92f3577b34da6a3ce929d0e0e4736" },
      { name: "loader:start", routeId: "index", traceId: "4bf92f3577b34da6a3ce929d0e0e4736" },
      { name: "loader:end", routeId: "index", traceId: "4bf92f3577b34da6a3ce929d0e0e4736" },
      { name: "request:end", traceId: "4bf92f3577b34da6a3ce929d0e0e4736" },
    ]);
  });

  test("wraps pages with root and nested templates inside layouts", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-template-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      "export default function Layout() { return <html><body><Slot /></body></html>; }",
    );
    await writeFile(
      join(appDir, "template.mreact.tsx"),
      'export default function Template() { return <div data-template="root"><Slot /></div>; }',
    );
    await mkdir(join(appDir, "docs"), { recursive: true });
    await writeFile(
      join(appDir, "docs", "layout.mreact.tsx"),
      "export default function DocsLayout() { return <section><Slot /></section>; }",
    );
    await writeFile(
      join(appDir, "docs", "template.mreact.tsx"),
      'export default function DocsTemplate() { return <article data-template="docs"><Slot /></article>; }',
    );
    await writeFile(
      join(appDir, "docs", "page.mreact.tsx"),
      "export default function Page() { return <p>Template page</p>; }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/docs"),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      '<!DOCTYPE html><html data-mreact-layout-boundary="root"><body><div data-template="root" data-mreact-template-boundary="root"><section data-mreact-layout-boundary="docs"><article data-template="docs" data-mreact-template-boundary="docs"><p>Template page</p></article></section></div></body></html>',
    );
  });

  test("marks layout and template boundaries for client navigation retention", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-shell-markers-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      "export default function Layout() { return <section><Slot /></section>; }",
    );
    await writeFile(
      join(appDir, "template.mreact.tsx"),
      "export default function Template() { return <article><Slot /></article>; }",
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>Marked</main>; }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('data-mreact-layout-boundary="root"');
    expect(html).toContain('data-mreact-template-boundary="root"');
  });

  test("dispatches route.ts handlers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-"));
    await mkdir(join(appDir, "api", "time"), { recursive: true });
    await writeFile(
      join(appDir, "api", "time", "route.ts"),
      "export function GET() { return Response.json({ ok: true }); }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/api/time"),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("route handlers return an Allow header for unsupported methods", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-allow-"));
    await mkdir(join(appDir, "api", "time"), { recursive: true });
    await writeFile(
      join(appDir, "api", "time", "route.ts"),
      "export function GET() { return Response.json({ ok: true }); }\nexport function POST() { return Response.json({ ok: true }); }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/api/time", { method: "DELETE" }),
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST");
    expect(await response.text()).toBe("Method Not Allowed");
  });

  test("runtime route handlers honor user Vite plugins", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-route-vite-plugin-"));
    await mkdir(join(appDir, "api", "message"), { recursive: true });
    await mkdir(join(appDir, "content"), { recursive: true });
    await writeFile(join(appDir, "content", "message.fixture"), "message: Runtime Route OK");
    await writeFile(
      join(appDir, "api", "message", "route.ts"),
      `import { message } from "../../content/message.fixture";

export function GET() {
  return new Response(message);
}
`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/api/message"),
      vitePlugins: [
        {
          name: "fixture-runtime-route-plugin",
          transform(code, id) {
            if (!id.endsWith(".fixture")) {
              return;
            }
            const [, value = ""] = code.split(":");
            return {
              code: `export const message = ${JSON.stringify(value.trim())};`,
              map: null,
            };
          },
        },
      ],
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("Runtime Route OK");
  });

  test("passes through Response values thrown by route handlers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-thrown-response-route-"));
    await mkdir(join(appDir, "api", "csrf"), { recursive: true });
    await writeFile(
      join(appDir, "api", "csrf", "route.ts"),
      `export function POST() {
  throw new Response("CSRF verification failed", {
    status: 403,
    headers: { "x-guard": "csrf" },
  });
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/api/csrf", { method: "POST" }),
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("x-guard")).toBe("csrf");
    expect(await response.text()).toBe("CSRF verification failed");
  });

  test("renders root not-found route for missing paths", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-not-found-"));
    await writeFile(
      join(appDir, "not-found.mreact.tsx"),
      "export default function NotFound() { return <main><h1>Custom not found</h1></main>; }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/missing"),
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("<main><h1>Custom not found</h1></main>");
  });

  test("renders root not-found.tsx route for missing paths", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-standard-not-found-"));
    await writeFile(
      join(appDir, "not-found.tsx"),
      "export default function NotFound() { return <main><h1>Standard not found</h1></main>; }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/missing"),
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("<main><h1>Standard not found</h1></main>");
  });

  test("renders root error route when loader throws", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-error-route-"));
    await writeFile(
      join(appDir, "error.mreact.tsx"),
      "export default function ErrorPage(props) { return <main><h1>Error</h1><p>{props.error.message}</p></main>; }",
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export function loader() {
  throw new Error("loader failed");
}

export default function Page() {
  return <main>ok</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(500);
    expect(await response.text()).toContain("<main><h1>Error</h1><p>loader failed</p></main>");
  });

  test("wraps client route error recovery HTML in route markers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-client-error-route-"));
    await writeFile(
      join(appDir, "error.mreact.tsx"),
      "export default function ErrorPage(props) { return <main><h1>Error</h1><p>{props.error.message}</p></main>; }",
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export function loader() {
  throw new Error("client loader failed");
}

export default function Page() {
  return <button onClick={() => undefined}>client route</button>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(500);
    expect(html).toContain('data-mreact-route-id="index"');
    expect(html).toContain("<main><h1>Error</h1><p>client loader failed</p></main>");
  });

  test("uses nearest nested not-found route for missing child paths", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-nested-not-found-"));
    await mkdir(join(appDir, "docs"), { recursive: true });
    await writeFile(
      join(appDir, "not-found.mreact.tsx"),
      "export default function RootNotFound() { return <main>Root not found</main>; }",
    );
    await writeFile(
      join(appDir, "docs", "not-found.mreact.tsx"),
      "export default function DocsNotFound() { return <main>Docs not found</main>; }",
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/docs/missing"),
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("<main>Docs not found</main>");
  });

  test("uses nearest nested not-found.tsx route for loader notFound boundaries", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-nested-standard-not-found-"));
    await mkdir(join(appDir, "docs", "$slug"), { recursive: true });
    await writeFile(
      join(appDir, "not-found.tsx"),
      "export default function RootNotFound() { return <main>Root standard not found</main>; }",
    );
    await writeFile(
      join(appDir, "docs", "not-found.tsx"),
      "export default function DocsNotFound() { return <main>Docs standard not found</main>; }",
    );
    await writeFile(
      join(appDir, "docs", "$slug", "page.mreact.tsx"),
      `import { notFound } from "@reckona/mreact-router";

export function loader() {
  notFound();
}

export default function DocsPage() {
  return <main>Docs</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/docs/missing"),
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("<main>Docs standard not found</main>");
  });

  test("uses nearest nested error route when rendering fails", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-nested-error-"));
    await mkdir(join(appDir, "docs"), { recursive: true });
    await writeFile(
      join(appDir, "error.mreact.tsx"),
      "export default function RootError() { return <main>Root error</main>; }",
    );
    await writeFile(
      join(appDir, "docs", "error.mreact.tsx"),
      "export default function DocsError(props) { return <main>Docs error: {props.error.message}</main>; }",
    );
    await writeFile(
      join(appDir, "docs", "page.mreact.tsx"),
      `export function loader() {
  throw new Error("docs failed");
}

export default function DocsPage() {
  return <main>Docs</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/docs"),
    });

    expect(response.status).toBe(500);
    expect(await response.text()).toContain("<main>Docs error: docs failed</main>");
  });

  test("renders stream routes with the server stream compiler target", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const stream = true;

export default function Page() {
  const name = Promise.resolve("Ada");
  return <main><Await value={name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</Await></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).toContain(
      '<main><span data-mreact-oob-placeholder="mreact-0"><em>loading</em></span></main>',
    );
    expect(html).toContain('data-mreact-oob-fragment="mreact-0"');
    expect(html.indexOf('data-mreact-oob-complete="mreact-0"')).toBeGreaterThan(
      html.indexOf('data-mreact-oob-fragment="mreact-0"'),
    );
    expect(html).toContain("<strong>Ada</strong>");
  });

  test("emits stream route pre-header timing phases for first-byte profiling", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-timing-"));
    const events: Array<{ phases?: Record<string, number>; type: string }> = [];
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const stream = true;

export default function Page() {
  const name = Promise.resolve("Ada");
  return <main><Await value={name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</Await></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      logger: {
        debug(event) {
          events.push(event);
        },
      },
      request: new Request("http://local.test/"),
    });
    await Promise.resolve();
    const timing = events.find((event) => event.type === "router:render:timing");

    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(timing?.phases).toEqual(
      expect.objectContaining({
        routeScanMs: expect.any(Number),
        middlewareMs: expect.any(Number),
        routeMatchMs: expect.any(Number),
        readSourceMs: expect.any(Number),
        sourceAnalysisMs: expect.any(Number),
        routeCacheMs: expect.any(Number),
        serverActionsMs: expect.any(Number),
        outOfOrderAnalysisMs: expect.any(Number),
        streamTransformMs: expect.any(Number),
        streamConstructionMs: expect.any(Number),
      }),
    );
  });

  test("emits non-stream route timing phases for render profiling", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-render-timing-non-stream-"));
    const events: Array<{ phases?: Record<string, number>; status?: number; type: string }> = [];
    await writeFile(
      join(appDir, "page.tsx"),
      `export function loader() {
  return { message: "timed" };
}

export default function Page({ data }) {
  return <main>{data.message}</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      logger: {
        debug(event) {
          events.push(event);
        },
      },
      request: new Request("http://local.test/"),
    });
    await response.text();
    const timing = events.find((event) => event.type === "router:render:timing");

    expect(timing?.status).toBe(200);
    expect(timing?.phases).toEqual(
      expect.objectContaining({
        layoutRenderMs: expect.any(Number),
        loaderStartMs: expect.any(Number),
        loaderWaitMs: expect.any(Number),
        pageRenderMs: expect.any(Number),
        readSourceMs: expect.any(Number),
        routeCodeAnalysisMs: expect.any(Number),
        routeMatchMs: expect.any(Number),
        routeScanMs: expect.any(Number),
        serverActionsMs: expect.any(Number),
        sourceAnalysisMs: expect.any(Number),
        stringTransformMs: expect.any(Number),
      }),
    );
  });

  test("splits page and layout render timing into module and component phases", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-render-timing-deep-"));
    const events: Array<{ phases?: Record<string, number>; status?: number; type: string }> = [];
    await writeFile(
      join(appDir, "layout.tsx"),
      `await new Promise((resolve) => setTimeout(resolve, 5));

export default async function Layout() {
  await new Promise((resolve) => setTimeout(resolve, 5));
  return <html><body><aside><Slot name="sidebar" /></aside><main><Slot /></main></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `await new Promise((resolve) => setTimeout(resolve, 5));

export const slots = {
  sidebar: async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return "sidebar";
  },
};

export default async function Page() {
  await new Promise((resolve) => setTimeout(resolve, 5));
  return <main>timed</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      logger: {
        debug(event) {
          events.push(event);
        },
      },
      request: new Request("http://local.test/"),
    });
    await response.text();
    const timing = events.find((event) => event.type === "router:render:timing");

    expect(timing?.status).toBe(200);
    expect(timing?.phases).toEqual(
      expect.objectContaining({
        layoutComponentRenderMs: expect.any(Number),
        layoutModuleLoadMs: expect.any(Number),
        pageComponentRenderMs: expect.any(Number),
        pageModuleLoadMs: expect.any(Number),
        routeSlotsRenderMs: expect.any(Number),
      }),
    );
    expect(timing?.phases?.layoutComponentRenderMs).toBeGreaterThanOrEqual(4);
    expect(timing?.phases?.layoutModuleLoadMs).toBeGreaterThanOrEqual(4);
    expect(timing?.phases?.pageComponentRenderMs).toBeGreaterThanOrEqual(4);
    expect(timing?.phases?.pageModuleLoadMs).toBeGreaterThanOrEqual(4);
    expect(timing?.phases?.routeSlotsRenderMs).toBeGreaterThanOrEqual(4);
  });

  test("defers non-stream page transform until after loader redirects settle", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-redirect-transform-"));
    const events: Array<{ phases?: Record<string, number>; status?: number; type: string }> = [];
    await writeFile(
      join(appDir, "page.tsx"),
      `import { redirect } from "@reckona/mreact-router";

export function loader() {
  redirect("/login", { status: 303 });
}

export default function Page() {
  return <main>should not render</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      logger: {
        debug(event) {
          events.push(event);
        },
      },
      request: new Request("http://local.test/"),
    });
    const timing = events.find((event) => event.type === "router:render:timing");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(timing?.status).toBe(303);
    expect(timing?.phases).toEqual(
      expect.objectContaining({
        loaderStartMs: expect.any(Number),
        loaderWaitMs: expect.any(Number),
      }),
    );
    expect(timing?.phases).not.toHaveProperty("stringTransformMs");
    expect(timing?.phases).not.toHaveProperty("pageRenderMs");
    expect(timing?.phases).not.toHaveProperty("layoutRenderMs");
  });

  test("does not load page-only imports before loader redirects settle", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-redirect-import-split-"));
    await writeFile(
      join(appDir, "heavy-page-dependency.ts"),
      `globalThis.__mreactRenderHeavyPageDependencyLoaded =
  (globalThis.__mreactRenderHeavyPageDependencyLoaded ?? 0) + 1;

export function Heavy() {
  return "heavy";
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { redirect } from "@reckona/mreact-router";
import { Heavy } from "./heavy-page-dependency";

export function loader() {
  redirect("/login", { status: 303 });
}

export default function Page() {
  return <main>{Heavy()}</main>;
}`,
    );
    const state = globalThis as {
      __mreactRenderHeavyPageDependencyLoaded?: number | undefined;
    };
    state.__mreactRenderHeavyPageDependencyLoaded = 0;

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(state.__mreactRenderHeavyPageDependencyLoaded).toBe(0);
  });

  test("calls the explicit server render artifact loader only when rendering proceeds", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-explicit-render-artifact-loader-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>render artifact loader</main>;
}`,
    );
    const loadedRouteFiles: string[] = [];

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
      serverRenderArtifactLoader: {
        async load(routeFile) {
          loadedRouteFiles.push(routeFile);
        },
      },
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>render artifact loader</main>");
    expect(loadedRouteFiles).toHaveLength(1);
    expect(loadedRouteFiles[0]?.endsWith("page.tsx")).toBe(true);
  });

  test("does not call the explicit server render artifact loader before loader redirects settle", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-redirect-render-artifact-loader-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `import { redirect } from "@reckona/mreact-router";

export function loader() {
  redirect("/login", { status: 303 });
}

export default function Page() {
  return <main>should not render</main>;
}`,
    );
    const loadedRouteFiles: string[] = [];

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
      serverRenderArtifactLoader: {
        async load(routeFile) {
          loadedRouteFiles.push(routeFile);
        },
      },
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(loadedRouteFiles).toEqual([]);
  });

  test("splits loader module load and loader execution timing for redirects", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loader-redirect-timing-split-"));
    const events: Array<{ phases?: Record<string, number>; status?: number; type: string }> = [];
    await writeFile(
      join(appDir, "page.tsx"),
      `import { redirect } from "@reckona/mreact-router";

await new Promise((resolve) => setTimeout(resolve, 5));

export async function loader() {
  await new Promise((resolve) => setTimeout(resolve, 5));
  redirect("/login", { status: 303 });
}

export default function Page() {
  return <main>should not render</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      logger: {
        debug(event) {
          events.push(event);
        },
      },
      request: new Request("http://local.test/"),
    });
    const timing = events.find((event) => event.type === "router:render:timing");

    expect(response.status).toBe(303);
    expect(timing?.status).toBe(303);
    expect(timing?.phases).toEqual(
      expect.objectContaining({
        loaderExecutionMs: expect.any(Number),
        loaderModuleLoadMs: expect.any(Number),
        loaderWaitMs: expect.any(Number),
      }),
    );
    expect(timing?.phases?.loaderExecutionMs).toBeGreaterThanOrEqual(4);
    expect(timing?.phases?.loaderModuleLoadMs).toBeGreaterThanOrEqual(4);
    expect(timing?.phases).not.toHaveProperty("stringTransformMs");
  });

  test("splits middleware module load and middleware execution timing", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-middleware-timing-split-"));
    const events: Array<{ phases?: Record<string, number>; status?: number; type: string }> = [];
    await writeFile(
      join(appDir, "middleware.ts"),
      `await new Promise((resolve) => setTimeout(resolve, 5));

export async function middleware() {
  await new Promise((resolve) => setTimeout(resolve, 5));
  return new Response(null, { status: 204 });
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>should not render</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      logger: {
        debug(event) {
          events.push(event);
        },
      },
      request: new Request("http://local.test/"),
    });
    const timing = events.find((event) => event.type === "router:render:timing");

    expect(response.status).toBe(204);
    expect(timing?.status).toBe(204);
    expect(timing?.phases).toEqual(
      expect.objectContaining({
        middlewareExecutionMs: expect.any(Number),
        middlewareModuleLoadMs: expect.any(Number),
        middlewareMs: expect.any(Number),
      }),
    );
    expect(timing?.phases?.middlewareExecutionMs).toBeGreaterThanOrEqual(4);
    expect(timing?.phases?.middlewareModuleLoadMs).toBeGreaterThanOrEqual(4);
  });

  test("defers stream fallback page transform until after loader redirects settle", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-loader-redirect-transform-"));
    const events: Array<{ phases?: Record<string, number>; status?: number; type: string }> = [];
    await writeFile(
      join(appDir, "page.tsx"),
      `import { redirect } from "@reckona/mreact-router";

export const stream = true;

export function loader() {
  redirect("/login", { status: 303 });
}

export default function Page() {
  return <main>should not render</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      logger: {
        debug(event) {
          events.push(event);
        },
      },
      request: new Request("http://local.test/"),
    });
    const timing = events.find((event) => event.type === "router:render:timing");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(timing?.status).toBe(303);
    expect(timing?.phases).toEqual(
      expect.objectContaining({
        loaderStartMs: expect.any(Number),
        loaderWaitMs: expect.any(Number),
      }),
    );
    expect(timing?.phases).not.toHaveProperty("stringTransformMs");
    expect(timing?.phases).not.toHaveProperty("streamTransformMs");
    expect(timing?.phases).not.toHaveProperty("pageRenderMs");
    expect(timing?.phases).not.toHaveProperty("layoutRenderMs");
  });

  test("defers stream out-of-order page transform until after loader redirects settle", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-oob-loader-redirect-"));
    const events: Array<{ phases?: Record<string, number>; status?: number; type: string }> = [];
    await writeFile(
      join(appDir, "page.tsx"),
      `import { redirect } from "@reckona/mreact-router";

export const stream = true;

export function loader() {
  redirect("/login", { status: 303 });
}

export default function Page() {
  const name = Promise.resolve("Ada");
  return <main><Await value={name}>{value => <strong>{value}</strong>}</Await></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      logger: {
        debug(event) {
          events.push(event);
        },
      },
      request: new Request("http://local.test/"),
    });
    const timing = events.find((event) => event.type === "router:render:timing");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(timing?.status).toBe(303);
    expect(timing?.phases).toEqual(
      expect.objectContaining({
        loaderStartMs: expect.any(Number),
        loaderWaitMs: expect.any(Number),
      }),
    );
    expect(timing?.phases).not.toHaveProperty("streamTransformMs");
    expect(timing?.phases).not.toHaveProperty("streamConstructionMs");
  });

  test("defers stream loading boundary render until after loader redirects settle", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-loading-loader-redirect-"));
    const events: Array<{ phases?: Record<string, number>; status?: number; type: string }> = [];
    await writeFile(
      join(appDir, "loading.mreact.tsx"),
      `export default function Loading() {
  return <p>loading</p>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { redirect } from "@reckona/mreact-router";

export const stream = true;

export function loader() {
  redirect("/login", { status: 303 });
}

export default function Page() {
  return <main>should not render</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      logger: {
        debug(event) {
          events.push(event);
        },
      },
      request: new Request("http://local.test/"),
    });
    const timing = events.find((event) => event.type === "router:render:timing");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(timing?.status).toBe(303);
    expect(timing?.phases).toEqual(
      expect.objectContaining({
        loaderStartMs: expect.any(Number),
        loaderWaitMs: expect.any(Number),
      }),
    );
    expect(timing?.phases).not.toHaveProperty("streamTransformMs");
    expect(timing?.phases).not.toHaveProperty("streamConstructionMs");
  });

  test("renders stream routes that import local server components", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-imported-server-component-"));
    const appDir = join(rootDir, "src", "app");
    await mkdir(join(rootDir, "src", "components"), { recursive: true });
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(rootDir, "src", "components", "Frame.mreact.tsx"),
      "export function Frame(props) { return <main><h1>{props.title}</h1>{props.children}</main>; }",
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { Frame } from "../components/Frame.mreact";

export const stream = true;

export default function Page() {
  return <Frame title="Stream"><p>Body</p></Frame>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("<main><h1>Stream</h1>");
    expect(html).toContain("<p>Body</p>");
  });

  test("renders stream route-local SVG helper components with early JSX returns", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-route-svg-helper-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `function SettingsIcon(props: { readonly icon: "mail" | "trash" }) {
  if (props.icon === "mail") {
    return <svg aria-hidden="true"><path d="M4 6h16v12H4z" /></svg>;
  }

  return <svg aria-hidden="true"><path d="M8 7h8" /></svg>;
}

export const stream = true;

export default function Page() {
  return <main><SettingsIcon icon="mail" /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).toContain(
      '<main><svg aria-hidden="true"><path d="M4 6h16v12H4z"></path></svg></main>',
    );
    expect(html).not.toContain("[object Object]");
  });

  test("renders Await boundaries inside imported local server components on stream routes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-imported-await-"));
    const appDir = join(rootDir, "src", "app");
    await mkdir(join(rootDir, "src", "components"), { recursive: true });
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(rootDir, "src", "components", "Profile.mreact.tsx"),
      `export function Profile(props) {
  return <section><Await value={props.name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</Await></section>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { Profile } from "../components/Profile.mreact";

export const stream = true;

export default function Page() {
  const name = Promise.resolve("Ada");
  return <main><Profile name={name} /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).not.toContain("[object Promise]");
    expect(html).toContain(
      '<main><section><span data-mreact-oob-placeholder="mreact-0"><em>loading</em></span></section></main>',
    );
    expect(html).toContain('data-mreact-oob-fragment="mreact-0"');
    expect(html).toContain("<strong>Ada</strong>");
  });

  test("renders Await boundaries inside app directory helper components on stream routes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-app-helper-await-"));
    const appDir = join(rootDir, "src", "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "dashboard-stats.tsx"),
      `export function DashboardStats() {
  return <section><Await value={Promise.resolve("admin_audit_logs")} placeholder={<p>Loading table statistics...</p>}>{value => <table><tbody><tr><td>{value}</td></tr></tbody></table>}</Await></section>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { DashboardStats } from "./dashboard-stats";

export const stream = true;

export default function Page() {
  return <main><h2>Table statistics</h2><DashboardStats /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).toContain("Table statistics");
    expect(html).toContain("Loading table statistics");
    expect(html).toContain("admin_audit_logs");
  });

  test("renders Await boundaries passed through component children on stream routes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-await-children-diagnostic-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export const stream = true;

function AdminFrame(props) {
  return <main><h1>{props.title}</h1>{props.children}</main>;
}

function StatsTable(props) {
  return <table><tbody>{props.items.map((item) => <tr><td>{item}</td></tr>)}</tbody></table>;
}

export default function Page() {
  const stats = Promise.resolve(["admin_audit_logs"]);

  return (
    <AdminFrame title="Dashboard">
      <h2>Table statistics</h2>
      <Await value={stats} placeholder={<p>Loading table statistics...</p>}>
        {(items) => <StatsTable items={items} />}
      </Await>
    </AdminFrame>
  );
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(text).toContain("Table statistics");
    expect(text).toContain("Loading table statistics");
    expect(text).toContain("admin_audit_logs");
    expect(text).toContain('data-mreact-oob-placeholder="mreact-0"');
    expect(text).toContain('data-mreact-oob-fragment="mreact-0"');
  });

  test("assigns unique out-of-order ids for repeated stream component instances", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-repeated-await-"));
    const appDir = join(rootDir, "src", "app");
    await mkdir(join(rootDir, "src", "components"), { recursive: true });
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(rootDir, "src", "components", "Batch.mreact.tsx"),
      `export function Batch(props) {
  return <Await value={props.value} placeholder={<ol start={props.start} />}>{value => <ol start={props.start}><li>{value}</li></ol>}</Await>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { Batch } from "../components/Batch.mreact";

export const stream = true;

const delayed = (value, delay) => new Promise((resolve) => setTimeout(() => resolve(value), delay));

export default function Page() {
  return <main>
    <Batch value={delayed("first", 30)} start={1} />
    <Batch value={delayed("second", 10)} start={6} />
    <Batch value={delayed("third", 0)} start={11} />
  </main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();
    const placeholderIds = Array.from(
      html.matchAll(/data-mreact-oob-placeholder="([^"]+)"/g),
      (match) => match[1],
    );
    const fragmentIds = Array.from(
      html.matchAll(/data-mreact-oob-fragment="([^"]+)"/g),
      (match) => match[1],
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(placeholderIds).toEqual(["mreact-0", "mreact-0-1", "mreact-0-2"]);
    expect(new Set(fragmentIds)).toEqual(new Set(placeholderIds));
    expect(html).toContain("<li>first</li>");
    expect(html).toContain("<li>second</li>");
    expect(html).toContain("<li>third</li>");
  });

  test("renders streamList batches through direct sibling Await boundaries", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-list-recipe-"));
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

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).toContain("Loading 0");
    expect(html).toContain("Loading 1");
    expect(html).toContain("<li>story-1</li>");
    expect(html).toContain("<li>story-2</li>");
    expect(html).toContain("<li>story-3</li>");
    expect(html).toContain('data-mreact-oob-placeholder="mreact-0"');
    expect(html).toContain('data-mreact-oob-placeholder="mreact-0-1"');
  });

  test("renders Await boundaries inside transitive local server imports on stream routes", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-transitive-await-"));
    const appDir = join(rootDir, "src", "app");
    await mkdir(join(rootDir, "src", "components"), { recursive: true });
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(rootDir, "src", "components", "Inner.mreact.tsx"),
      `export function Inner(props) {
  return <Await value={props.name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</Await>;
}`,
    );
    await writeFile(
      join(rootDir, "src", "components", "Profile.mreact.tsx"),
      `import { Inner } from "./Inner.mreact.js";

export function Profile(props) {
  return <section><Inner name={props.name} /></section>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { Profile } from "../components/Profile.mreact.js";

export const stream = true;

export default function Page() {
  return <main><Profile name={Promise.resolve("Ada")} /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).not.toContain("[object Promise]");
    expect(html).toContain('data-mreact-oob-fragment="mreact-0"');
    expect(html).toContain("<strong>Ada</strong>");
  });

  test("renders Await boundaries declared by route layouts on stream routes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-layout-await-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `function Sidebar() {
  const rows = Promise.resolve(["Ada"]);

  return (
    <aside>
      <h2>Recent</h2>
      <Await value={rows} placeholder={<p>Loading recent...</p>}>
        {(items) => <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>}
      </Await>
    </aside>
  );
}

export default function Layout() {
  return <html><body><Sidebar /><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const stream = true;

export default function Page() {
  return <main>Home</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).toContain("<h2>Recent</h2>");
    expect(html).toContain("Loading recent...");
    expect(html).toContain("<li>Ada</li>");
    expect(html).not.toContain("[object Promise]");
  });

  test("renders conditional Await renderer output from imported components", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-imported-await-conditional-"));
    const appDir = join(rootDir, "src", "app");
    await mkdir(join(rootDir, "src", "components"), { recursive: true });
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(rootDir, "src", "components", "Sidebar.mreact.tsx"),
      `function SidebarList(props) {
  return props.rows.length === 0
    ? <p>No conversations yet.</p>
    : <p>have {props.rows.length} conversations</p>;
}

export function ConversationSidebar(props) {
  return (
    <aside>
      <Await value={props.rows} placeholder={<p>Loading...</p>}>
        {(rows) => rows.length === 0 ? (
          <p>No conversations yet.</p>
        ) : (
          <SidebarList rows={rows} />
        )}
      </Await>
    </aside>
  );
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { ConversationSidebar } from "../components/Sidebar.mreact.js";

export const stream = true;

export default function Page() {
  return <main><ConversationSidebar rows={Promise.resolve(["a", "b"])} /></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(html).toContain("Loading...");
    expect(html).toContain("have 2 conversations");
    expect(html).not.toContain("[object Object]");
  });

  test("returns stream route responses before an async layout shell resolves", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-lazy-layout-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `export default async function Layout() {
  await new Promise((resolve) => setTimeout(resolve, 80));
  return <html><body><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const stream = true;

export default function Page() {
  const name = Promise.resolve("Ada");
  return <main><Await value={name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</Await></main>;
}`,
    );

    const startedAt = Date.now();
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const responseDelay = Date.now() - startedAt;

    expect(responseDelay).toBeLessThan(70);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    await expect(response.text()).resolves.toContain("<strong>Ada</strong>");
  });

  test("streams nearest loading boundary while async loader is pending", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loading-boundary-"));
    const state = globalThis as { __mreactResolveLoadingDocs?: () => void };
    state.__mreactResolveLoadingDocs = undefined;
    await mkdir(join(appDir, "docs"), { recursive: true });
    await writeFile(
      join(appDir, "docs", "loading.mreact.tsx"),
      "export default function Loading() { return <p>Loading docs...</p>; }",
    );
    await writeFile(
      join(appDir, "docs", "page.mreact.tsx"),
      `export const stream = true;

export async function loader() {
  const state = globalThis;
  return await new Promise((resolve) => {
    state.__mreactResolveLoadingDocs = () => resolve({ title: "Loaded docs" });
  });
}

export default function Page(props) {
  return <main><h1>{props.data.title}</h1></main>;
}`,
    );

    try {
      const response = await expectResolvesWithin(
        renderAppRequest({
          appDir,
          request: new Request("http://local.test/docs"),
        }),
        1000,
        "stream loading boundary response",
      );
      const fullResponse = response.clone();
      const firstChunk = await expectResolvesWithin(
        readUntilChunkIncludes(response, "Loading docs"),
        1000,
        "stream loading boundary first chunk",
      );

      expect(response.headers.get("x-mreact-stream")).toBe("1");
      expect(firstChunk).toContain(
        '<div data-mreact-oob-placeholder="mreact-route"><p>Loading docs...</p></div>',
      );
      expect(firstChunk).not.toContain("Loaded docs");
      expect(state.__mreactResolveLoadingDocs).toBeTypeOf("function");
      state.__mreactResolveLoadingDocs?.();

      const html = await fullResponse.text();
      expect(html).toContain("<main><h1>Loaded docs</h1></main>");
    } finally {
      delete state.__mreactResolveLoadingDocs;
    }
  });

  test("flushes nested Await fragments inside a streamed loading route boundary", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loading-nested-await-"));
    await mkdir(join(appDir, "conversation", "$id"), { recursive: true });
    await writeFile(
      join(appDir, "conversation", "$id", "loading.mreact.tsx"),
      "export default function Loading() { return <p>Loading conversation...</p>; }",
    );
    await writeFile(
      join(appDir, "conversation", "$id", "page.mreact.tsx"),
      `import { defer } from "@reckona/mreact-router";

export const stream = true;

export async function loader() {
  return await new Promise((resolve) => setTimeout(() => resolve(defer({
    messages: Promise.resolve({ items: ["Hello"] }),
  })), 30));
}

export default function Page(props) {
  return (
    <main>
      <Await value={props.data.messages} placeholder={<p>Loading messages...</p>}>
        {(page) => <ol>{page.items.map((item) => <li key={item}>{item}</li>)}</ol>}
      </Await>
    </main>
  );
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/conversation/abc"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('data-mreact-oob-placeholder="mreact-route"');
    expect(html).toContain('data-mreact-oob-fragment="mreact-route"');
    expect(html).toContain('data-mreact-oob-placeholder="mreact-0"');
    expect(html).toContain('data-mreact-oob-fragment="mreact-0"');
    expect(html).toContain("<li>Hello</li>");
  });

  test("flushes Await fragments rendered by layouts in stream routes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-layout-await-"));
    await mkdir(join(appDir, "messages"), { recursive: true });
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `function listItems() {
  return Promise.resolve(["Inbox"]);
}

export default function Layout() {
  return (
    <html lang="en">
      <body>
        <aside>
          <h2>Recent</h2>
          <Await value={listItems()} placeholder={<p>Loading recent...</p>}>
            {(items) => <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>}
          </Await>
        </aside>
        <Slot />
      </body>
    </html>
  );
}`,
    );
    await writeFile(
      join(appDir, "messages", "page.mreact.tsx"),
      `export const stream = true;

export default function Page() {
  return <main>Messages</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/messages"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<h2>Recent</h2>");
    expect(html).toContain('data-mreact-oob-placeholder="mreact-0"');
    expect(html).toContain('data-mreact-oob-fragment="mreact-0"');
    expect(html).toContain("<li>Inbox</li>");
    expect(html).not.toContain("[object Promise]");
  });

  test("flushes Await fragments rendered by imported layout components in stream routes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-imported-layout-await-"));
    await mkdir(join(appDir, "messages"), { recursive: true });
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "Sidebar.tsx"),
      `function listItems() {
  return Promise.resolve(["Inbox"]);
}

export function Sidebar() {
  return (
    <aside>
      <h2>Recent</h2>
      <Await value={listItems()} placeholder={<p>Loading recent...</p>}>
        {(items) => <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>}
      </Await>
    </aside>
  );
}`,
    );
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      `import { Sidebar } from "./components/Sidebar";

export default function Layout() {
  return (
    <html lang="en">
      <body>
        <Sidebar />
        <Slot />
      </body>
    </html>
  );
}`,
    );
    await writeFile(
      join(appDir, "messages", "page.mreact.tsx"),
      `export const stream = true;

export default function Page() {
  return <main>Messages</main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/messages"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<h2>Recent</h2>");
    expect(html).toContain('data-mreact-oob-placeholder="mreact-0"');
    expect(html).toContain('data-mreact-oob-fragment="mreact-0"');
    expect(html).toContain("<li>Inbox</li>");
    expect(html).not.toContain("[object Promise]");
  });

  test("renders imported Await renderer conditionals and component references", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-imported-await-renderer-"));
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "ConversationSidebar.tsx"),
      `function listItems() {
  return Promise.resolve([]);
}

function SidebarList(props) {
  return props.rows.length === 0
    ? <p>No conversations yet.</p>
    : <ul>{props.rows.map((row) => <li key={row}>{row}</li>)}</ul>;
}

export function ConditionalSidebar() {
  return (
    <Await value={listItems()} placeholder={<p>Loading conditional...</p>}>
      {(rows) => rows.length === 0 ? <p>No conversations yet.</p> : <p>Have conversations</p>}
    </Await>
  );
}

export function ComponentSidebar() {
  return (
    <Await value={listItems()} placeholder={<p>Loading component...</p>}>
      {(rows) => <SidebarList rows={rows} />}
    </Await>
  );
}`,
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { ComponentSidebar, ConditionalSidebar } from "./components/ConversationSidebar";

export const stream = true;

export default function Page() {
  return (
    <main>
      <ConditionalSidebar />
      <ComponentSidebar />
    </main>
  );
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('data-mreact-oob-fragment="mreact-0"');
    expect(html).toContain('data-mreact-oob-fragment="mreact-0-1"');
    expect(html.split("<p>No conversations yet.</p>").length - 1).toBe(2);
    expect(html).not.toContain("[object Object]");
  });

  test("finds loading boundaries from built server source files without filesystem access", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-built-loading-boundary-"));
    const pageFile = join(appDir, "docs", "page.mreact.tsx");
    const loadingFile = join(appDir, "docs", "loading.mreact.tsx");
    const state = globalThis as { __mreactResolveBuiltLoadingDocs?: () => void };
    state.__mreactResolveBuiltLoadingDocs = undefined;

    try {
      const response = await expectResolvesWithin(
        renderAppRequest({
          appDir,
          request: new Request("http://local.test/docs"),
          routes: [
            {
              file: pageFile,
              kind: "page",
              path: "/docs",
              segments: [{ kind: "static", value: "docs" }],
            },
          ],
          serverSourceFiles: new Map([
            [loadingFile, "export default function Loading() { return <p>Loading docs...</p>; }"],
            [
              pageFile,
              `export const stream = true;

export async function loader() {
  const state = globalThis;
  return await new Promise((resolve) => {
    state.__mreactResolveBuiltLoadingDocs = () => resolve({ title: "Loaded docs" });
  });
}

export default function Page(props) {
  return <main><h1>{props.data.title}</h1></main>;
}`,
            ],
          ]),
        }),
        1000,
        "built server loading boundary response",
      );
      const firstChunk = await expectResolvesWithin(
        readUntilChunkIncludes(response, "Loading docs"),
        1000,
        "built server loading boundary first chunk",
      );

      expect(firstChunk).toContain(
        '<div data-mreact-oob-placeholder="mreact-route"><p>Loading docs...</p></div>',
      );
      expect(firstChunk).not.toContain("Loaded docs");
      state.__mreactResolveBuiltLoadingDocs?.();
    } finally {
      delete state.__mreactResolveBuiltLoadingDocs;
    }
  });

  test("renders special not-found routes from built server source files without filesystem access", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-built-not-found-boundary-"));
    const notFoundFile = join(appDir, "not-found.mreact.tsx");

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/missing"),
      routes: [],
      serverSourceFiles: new Map([
        [
          notFoundFile,
          "export default function NotFound() { return <html><body><main>Built Not Found</main></body></html>; }",
        ],
      ]),
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("<main>Built Not Found</main>");
  });

  test("wraps stream routes with layouts and hydration markers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-layout-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      "export default function Layout() { return <html><body><header>Root</header><Slot /></body></html>; }",
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";
export const stream = true;

export default function Page() {
  const count = cell(0);
  const name = Promise.resolve("Ada");
  return <main><button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button><Await value={name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</Await></main>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    // The marker now sits inside the layout's <body> so the browser does
    // not strip the <html>/<head>/<body> wrappers around the marker.
    expect(html).toContain(
      '<!DOCTYPE html><html data-mreact-layout-boundary="root"><body><header>Root</header><div data-mreact-route-id="index"><main>',
    );
    expect(html).toContain('id="mreact-props-index"');
    expect(html).toContain('src="/_mreact/client/routes/index.js"');
    expect(html).toContain('data-mreact-oob-fragment="mreact-0"');
    expect(html).toContain("</main></div>");
    expect(html).toContain("</body></html>");
  });

  test("renders named slots for stream routes before the streamed page body", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-slots-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      'export default function Layout() { return <html><body><header><Slot name="header" /></header><main><Slot /></main></body></html>; }',
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const stream = true;
export function Header() { return <h1>Stream title</h1>; }
export const slots = { header: Header };
export default function Page() {
  const name = Promise.resolve("Ada");
  return <section><Await value={name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</Await></section>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<header><h1>Stream title</h1></header>");
    expect(html).toContain("<main><section>");
    expect(html).toContain("<strong>Ada</strong>");
  });

  test("renders named and default slots with extra attributes for stream routes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-slot-attrs-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      'export default function Layout() { return <html><body><header><Slot data-testid="stream-header" name="header" /></header><main><Slot class="stream-body" /></main></body></html>; }',
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const stream = true;
export function Header() { return <h1>Stream title</h1>; }
export const slots = { header: Header };
export default function Page() {
  const name = Promise.resolve("Ada");
  return <section><Await value={name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</Await></section>;
}`,
    );

    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/"),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<header><h1>Stream title</h1></header>");
    expect(html).toContain("<main><section>");
    expect(html).not.toContain("<slot");
  });
});

function createRecordingRouteCache(): AppRouterCache & { calls: string[] } {
  const entries = new Map<string, Awaited<ReturnType<AppRouterCache["get"]>>>();
  const calls: string[] = [];

  return {
    calls,
    async deleteByPath(path) {
      calls.push(`deleteByPath:${path}`);
      for (const [key, entry] of entries) {
        if (entry?.path === path) {
          entries.delete(key);
        }
      }
    },
    async get(key) {
      calls.push(`get:${key}`);
      return entries.get(key);
    },
    async set(key, entry) {
      calls.push(`set:${key}:${entry.path}`);
      entries.set(key, entry);
    },
  };
}

async function readUntilChunkIncludes(response: Response, text: string): Promise<string> {
  const reader = response.body?.getReader();

  if (reader === undefined) {
    return "";
  }

  let chunks = "";

  while (!chunks.includes(text)) {
    const result = await reader.read();

    if (result.done) {
      break;
    }

    chunks += new TextDecoder().decode(result.value);
  }

  reader.releaseLock();

  return chunks;
}

async function expectResolvesWithin<T>(
  promise: Promise<T>,
  timeoutMs: number,
  description: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`${description} did not resolve within ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

async function writePackageFixture(appDir: string): Promise<void> {
  const packageDir = join(appDir, "node_modules", "fixture-lib");

  await mkdir(packageDir, { recursive: true });
  await writeFile(
    join(packageDir, "package.json"),
    JSON.stringify({ type: "module", exports: "./index.js" }),
  );
  await writeFile(join(packageDir, "index.js"), 'export const version = "fixture-ok";');
}
