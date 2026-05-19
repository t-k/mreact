import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { createQueryClient } from "@reckona/mreact-query";
import { createAppFixture, readQueryState, responseText } from "@reckona/mreact-test-utils";
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

    expect(redirectResponse.status).toBe(307);
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
  });

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
      '<main><template data-mreact-oob-placeholder="mreact-0"><em>loading</em></template></main>',
    );
    expect(html).toContain('data-mreact-oob-fragment="mreact-0"');
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
      '<main><section><template data-mreact-oob-placeholder="mreact-0"><em>loading</em></template></section></main>',
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

  test("finds loading boundaries from built server source files without filesystem access", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-built-loading-boundary-"));
    const pageFile = join(appDir, "docs", "page.mreact.tsx");
    const loadingFile = join(appDir, "docs", "loading.mreact.tsx");
    const startedAt = Date.now();
    const response = await renderAppRequest({
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
        [
          loadingFile,
          "export default function Loading() { return <p>Loading docs...</p>; }",
        ],
        [
          pageFile,
          `export const stream = true;

export async function loader() {
  return await new Promise((resolve) => setTimeout(() => resolve({ title: "Loaded docs" }), 80));
}

export default function Page(props) {
  return <main><h1>{props.data.title}</h1></main>;
}`,
        ],
      ]),
    });
    const firstChunk = await readUntilChunkIncludes(response, "Loading docs");

    expect(Date.now() - startedAt).toBeLessThan(70);
    expect(firstChunk).toContain(
      '<span data-mreact-oob-placeholder="mreact-route"><p>Loading docs...</p></span>',
    );
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

async function writePackageFixture(appDir: string): Promise<void> {
  const packageDir = join(appDir, "node_modules", "fixture-lib");

  await mkdir(packageDir, { recursive: true });
  await writeFile(
    join(packageDir, "package.json"),
    JSON.stringify({ type: "module", exports: "./index.js" }),
  );
  await writeFile(join(packageDir, "index.js"), 'export const version = "fixture-ok";');
}
