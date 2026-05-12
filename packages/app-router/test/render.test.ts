import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { AppRouterCache } from "../src/cache.js";
import { renderAppRequest } from "../src/render.js";

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
    expect(await response.text()).toContain(
      "<main><h1>Hello app router</h1></main>",
    );
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

  test("supports redirect and notFound helpers from loaders", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-navigation-helpers-"));
    await mkdir(join(appDir, "missing"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { redirect } from "@modular-react/app-router";

export function loader() {
  redirect("/login");
}

export default function Page() {
  return <main>private</main>;
}`,
    );
    await writeFile(
      join(appDir, "missing", "page.tsx"),
      `import { notFound } from "@modular-react/app-router";

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

    expect(redirectResponse.status).toBe(307);
    expect(redirectResponse.headers.get("location")).toBe("/login");
    expect(notFoundResponse.status).toBe(404);
    expect(await notFoundResponse.text()).toContain("<main>Custom missing</main>");
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

  test("supports middleware matcher config and rewrite helper", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-middleware-rewrite-"));
    await mkdir(join(appDir, "admin"), { recursive: true });
    await mkdir(join(appDir, "login"), { recursive: true });
    await writeFile(
      join(appDir, "middleware.ts"),
      `import { next, rewrite } from "@modular-react/app-router";

export const config = { matcher: "/admin/:path*" };

export function middleware(request: Request) {
  const url = new URL(request.url);
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
    const outsideMatcher = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/login"),
    });

    expect(await rewritten.text()).toContain("<main>Login</main>");
    expect(await passed.text()).toContain("<main>Admin</main>");
    expect(await outsideMatcher.text()).toContain("<main>Login</main>");
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
    await writeFile(
      join(rootDir, "secret.ts"),
      "export const secret = 'leaked';",
    );
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
    await expect(response.text()).resolves.toContain(
      "Loader imports must stay inside the app directory",
    );
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
    await expect(blocked.text()).resolves.toContain(
      'Loader package imports are not allowed by default: "fixture-lib"',
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toContain("<main>fixture-ok</main>");
  });

  test("wraps pages with root and nested layouts", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-layout-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      'export default function Layout() { return <html><body><header>Root</header><slot /></body></html>; }',
    );
    await mkdir(join(appDir, "docs"), { recursive: true });
    await writeFile(
      join(appDir, "docs", "layout.mreact.tsx"),
      'export default function DocsLayout() { return <section><h1>Docs</h1><slot /></section>; }',
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

  test("renders standard tsx pages with standard tsx layouts and error boundaries", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-standard-tsx-"));
    await writeFile(
      join(appDir, "layout.tsx"),
      'export default function Layout() { return <html><body><slot /></body></html>; }',
    );
    await writeFile(
      join(appDir, "error.tsx"),
      'export default function ErrorPage(props) { return <main>error: {props.error.message}</main>; }',
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

  test("wraps pages with root and nested templates inside layouts", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-template-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      'export default function Layout() { return <html><body><slot /></body></html>; }',
    );
    await writeFile(
      join(appDir, "template.mreact.tsx"),
      'export default function Template() { return <div data-template="root"><slot /></div>; }',
    );
    await mkdir(join(appDir, "docs"), { recursive: true });
    await writeFile(
      join(appDir, "docs", "layout.mreact.tsx"),
      'export default function DocsLayout() { return <section><slot /></section>; }',
    );
    await writeFile(
      join(appDir, "docs", "template.mreact.tsx"),
      'export default function DocsTemplate() { return <article data-template="docs"><slot /></article>; }',
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
      'export default function Layout() { return <section><slot /></section>; }',
    );
    await writeFile(
      join(appDir, "template.mreact.tsx"),
      'export default function Template() { return <article><slot /></article>; }',
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
    expect(await response.text()).toContain(
      "<main><h1>Error</h1><p>loader failed</p></main>",
    );
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
  return <main><await value={name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</await></main>;
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
      '<main><template data-mreact-oob-placeholder="mreact-0"><em>loading</em></template></main>',
    );
    expect(html).toContain('data-mreact-oob-fragment="mreact-0"');
    expect(html).toContain("<strong>Ada</strong>");
  });

  test("streams nearest loading boundary while async loader is pending", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-loading-boundary-"));
    await mkdir(join(appDir, "docs"), { recursive: true });
    await writeFile(
      join(appDir, "docs", "loading.mreact.tsx"),
      "export default function Loading() { return <p>Loading docs...</p>; }",
    );
    await writeFile(
      join(appDir, "docs", "page.mreact.tsx"),
      `export const stream = true;

export async function loader() {
  return await new Promise((resolve) => setTimeout(() => resolve({ title: "Loaded docs" }), 80));
}

export default function Page(props) {
  return <main><h1>{props.data.title}</h1></main>;
}`,
    );

    const startedAt = Date.now();
    const response = await renderAppRequest({
      appDir,
      request: new Request("http://local.test/docs"),
    });
    const fullResponse = response.clone();
    const firstChunk = await readUntilChunkIncludes(response, "Loading docs");

    expect(Date.now() - startedAt).toBeLessThan(70);
    expect(response.headers.get("x-mreact-stream")).toBe("1");
    expect(firstChunk).toContain(
      '<span data-mreact-oob-placeholder="mreact-route"><p>Loading docs...</p></span>',
    );
    expect(firstChunk).not.toContain("Loaded docs");
    const html = await fullResponse.text();
    expect(html).toContain("<main><h1>Loaded docs</h1></main>");
  });

  test("wraps stream routes with layouts and hydration markers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-stream-layout-"));
    await writeFile(
      join(appDir, "layout.mreact.tsx"),
      'export default function Layout() { return <html><body><header>Root</header><slot /></body></html>; }',
    );
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@modular-react/reactive-core";
export const stream = true;

export default function Page() {
  const count = cell(0);
  const name = Promise.resolve("Ada");
  return <main><button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button><await value={name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</await></main>;
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
      '<!DOCTYPE html><div data-mreact-route-id="index"><html data-mreact-layout-boundary="root"><body><header>Root</header><main>',
    );
    expect(html).toContain('id="mreact-props-index"');
    expect(html).toContain('src="/_mreact/client/routes/index.js"');
    expect(html).toContain('data-mreact-oob-fragment="mreact-0"');
    expect(html).toContain("</main></body></html></div>");
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

async function writePackageFixture(appDir: string): Promise<void> {
  const packageDir = join(appDir, "node_modules", "fixture-lib");

  await mkdir(packageDir, { recursive: true });
  await writeFile(
    join(packageDir, "package.json"),
    JSON.stringify({ type: "module", exports: "./index.js" }),
  );
  await writeFile(
    join(packageDir, "index.js"),
    'export const version = "fixture-ok";',
  );
}
