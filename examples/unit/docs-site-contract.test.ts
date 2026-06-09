import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const docsSiteRoot = join(root, "examples", "docs-site");

const requiredSlugs = [
  "benchmarks",
  "getting-started",
  "guides/app-router",
  "guides/project-structure",
  "guides/environment-variables",
  "guides/http-apis",
  "guides/advanced/mdx",
  "deployments/production-checklist",
  "deployments/source-maps",
  "deployments/logging-and-diagnostics",
  "examples",
  "reference/cli",
  "reference/environment-variables",
] as const;

describe("docs-site example contract", () => {
  test("declares a private docs-site package with build, static export, and verification scripts", async () => {
    const packageJson = JSON.parse(await readDocsSite("package.json")) as {
      name?: string;
      private?: boolean;
      scripts?: Record<string, string>;
    };

    expect(packageJson).toMatchObject({
      name: "@reckona/example-docs-site",
      private: true,
    });
    expect(packageJson.scripts?.build).toContain("mreact-router build");
    expect(packageJson.scripts?.build).toContain("export-static");
    expect(packageJson.scripts?.typecheck).toBe("tsc --noEmit");
    expect(packageJson.scripts?.test).toContain("vitest run");
  });

  test("keeps the navigation aligned with the approved information architecture", async () => {
    const nav = await readDocsSite("src/nav.config.ts");

    for (const section of ["Overview", "Guides", "Deployments", "Examples", "Reference"]) {
      expect(nav).toContain(`text: "${section}"`);
    }

    for (const slug of requiredSlugs) {
      expect(nav).toContain(`slug: "${slug}"`);
    }
    expect(nav).toContain(`items: [
      { text: "Overview", slug: "" },
      { text: "Benchmarks", slug: "benchmarks" },
      { text: "Getting Started", slug: "getting-started" },
    ],`);
    expect(nav.indexOf('slug: "guides/project-structure"')).toBeLessThan(
      nav.indexOf('slug: "guides/app-router"'),
    );
    expect(nav.indexOf('slug: "guides/app-router"')).toBeLessThan(
      nav.indexOf('slug: "guides/routing"'),
    );
    expect(nav.indexOf('slug: "guides/ssr-and-streaming"')).toBeLessThan(
      nav.indexOf('slug: "guides/link-and-navigation"'),
    );
    expect(nav.indexOf('slug: "guides/link-and-navigation"')).toBeLessThan(
      nav.indexOf('slug: "guides/data-loading"'),
    );
    expect(nav.indexOf('slug: "guides/data-loading"')).toBeLessThan(
      nav.indexOf('slug: "guides/ssg-and-static-export"'),
    );
    expect(nav.indexOf('slug: "guides/ssg-and-static-export"')).toBeLessThan(
      nav.indexOf('slug: "guides/environment-variables"'),
    );
    expect(nav.indexOf('slug: "guides/environment-variables"')).toBeGreaterThan(
      nav.indexOf('slug: "guides/data-loading"'),
    );
    expect(nav.indexOf('slug: "guides/environment-variables"')).toBeLessThan(
      nav.indexOf('slug: "guides/http-apis"'),
    );
    expect(nav).toContain('{ text: "Overview", slug: "" }');
    expect(nav).not.toContain(
      'text: "Getting Started",\n    items: [{ text: "Getting Started", slug: "getting-started" }]',
    );
    expect(nav).not.toContain('slug: "overview"');
    expect(nav).not.toContain('slug: "guides/client-boundaries"');
  });

  test("removes the standalone Route Handlers guide from the public docs", async () => {
    const nav = await readDocsSite("src/nav.config.ts");
    const contentRegistry = await readDocsSite("src/content-registry.ts");
    const routing = await readDocsSite("src/content/guides/routing.mdx");
    const dataLoading = await readDocsSite("src/content/guides/data-loading.mdx");
    const httpApis = await readDocsSite("src/content/guides/http-apis.mdx");

    expect(nav).not.toContain("Route Handlers");
    expect(nav).not.toContain('slug: "guides/route-handlers"');
    expect(contentRegistry).not.toContain("route-handlers.mdx");
    expect(contentRegistry).not.toContain('page("guides/route-handlers"');
    expect(routing).not.toContain("[Route Handlers](/guides/route-handlers/)");
    expect(dataLoading).not.toContain("[Route Handlers](/guides/route-handlers/)");
    expect(httpApis).not.toContain("[Route Handlers](/guides/route-handlers/)");
    await expect(
      access(join(docsSiteRoot, "src", "content", "guides", "route-handlers.mdx")),
    ).rejects.toThrow();
  });

  test("uses official product branding while keeping package names lowercase", async () => {
    const layout = await readDocsSite("src/app/layout.tsx");
    const overview = await readDocsSite("src/content/overview.mdx");

    expect(layout).toContain("Mreact Docs");
    expect(layout).toContain('<meta charset="utf-8" />');
    expect(layout).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    );
    expect(layout).toContain("https://github.com/t-k/mreact");
    expect(layout).toContain('src={sitePath("docs-copy.js")}');
    expect(overview).toContain("# Mreact");
    expect(overview).toContain("Mreact is a [React](https://react.dev/)-flavored framework");
    expect(overview).toContain("## Motivations");
    expect(overview).toContain("Automatic server/client boundary inference");
    expect(overview).toContain("## Status");
    expect(overview).toContain("## Performance");
    expect(overview).toContain("[Benchmarks](/benchmarks/)");
    expect(await readDocsSite("package.json")).toContain("@reckona/example-docs-site");
  });

  test("serves Overview only at the root route and keeps Benchmarks as the next page", async () => {
    const contentRegistry = await readDocsSite("src/content-registry.ts");
    const homePage = await readDocsSite("src/app/page.tsx");
    const exportScript = await readDocsSite("scripts/export-static.ts");

    expect(contentRegistry).toContain(
      'import benchmarks, * as benchmarksMeta from "./content/benchmarks.mdx";',
    );
    expect(contentRegistry).toContain('page("", overview, overviewMeta)');
    expect(contentRegistry).toContain('page("benchmarks", benchmarks, benchmarksMeta, {');
    expect(contentRegistry).toContain('filter((slug) => slug !== "")');
    expect(contentRegistry).not.toContain('page("overview", overview, overviewMeta)');
    expect(homePage).toContain('pageForSlug("")');
    expect(homePage).toContain(
      "Why Mreact exists, what it optimizes for, and how experimental it is today.",
    );
    expect(homePage).not.toContain('pageForSlug("overview")');
    expect(exportScript).toContain("rm(exportDir");
  });

  test("keeps Getting Started actionable for a first app", async () => {
    const gettingStarted = await readDocsSite("src/content/getting-started.mdx");

    expect(gettingStarted).toContain("Node.js 20 or newer");
    expect(gettingStarted).toContain("A package manager: pnpm or npm");
    expect(gettingStarted).toContain("The examples below use pnpm");
    expect(gettingStarted).toContain(
      "npx @reckona/create-mreact-app my-app --template basic --src-dir",
    );
    expect(gettingStarted).not.toContain("bun");
    expect(gettingStarted).not.toContain("A terminal that can run `npx`");
    expect(gettingStarted).toContain("Open the local URL printed by the dev server");
    expect(gettingStarted).toContain("src/app/page.tsx");
    expect(gettingStarted).toContain("src/lib/app-info.ts");
    expect(gettingStarted).toContain("counter starter");
    expect(gettingStarted).toContain('import { cell } from "@reckona/mreact-reactive-core";');
    expect(gettingStarted).toContain("const count = cell<number>(0);");
    expect(gettingStarted).toContain("count.get()");
    expect(gettingStarted).toContain("count.set((value) => value + 1)");
    expect(gettingStarted).toContain("Reset");
    expect(gettingStarted).toContain("src/app/docs/page.tsx");
    expect(gettingStarted).toContain("pnpm typecheck");
    expect(gettingStarted).toContain("pnpm lint");
    expect(gettingStarted).toContain("pnpm test");
    expect(gettingStarted).toContain("pnpm build");
    expect(gettingStarted).toContain("pnpm start");
    expect(gettingStarted).toContain("[Project Structure](/guides/project-structure/)");
    expect(gettingStarted).toContain("[App Router](/guides/app-router/)");
  });

  test("documents project structure conventions for routes, params, 404s, and output", async () => {
    const projectStructure = await readDocsSite("src/content/guides/project-structure.mdx");

    expect(projectStructure).toContain("src/app");
    expect(projectStructure).toContain("src/lib");
    expect(projectStructure).toContain("public/");
    expect(projectStructure).toContain(".mreact");
    expect(projectStructure).toContain("not-found.tsx");
    expect(projectStructure).toContain("users/");
    expect(projectStructure).toContain("$id/");
    expect(projectStructure).toContain("params.id");
    expect(projectStructure).toContain("$...path/");
    expect(projectStructure).toContain("params.path");
    expect(projectStructure).toContain("api/");
    expect(projectStructure).toContain("route.ts");
    expect(projectStructure).toContain("notFound()");
    expect(projectStructure).not.toContain("app-info.ts");
    expect(projectStructure).toContain("[App Router](/guides/app-router/)");
    expect(projectStructure).toContain("[HTTP APIs](/guides/http-apis/)");
  });

  test("documents the App Router as the routing model hub", async () => {
    const appRouter = await readDocsSite("src/content/guides/app-router.mdx");

    expect(appRouter).toContain("file-system router");
    expect(appRouter).toContain("## Core conventions");
    expect(appRouter).toContain("layout.tsx");
    expect(appRouter).toContain("page.tsx");
    expect(appRouter).toContain("template.tsx");
    expect(appRouter).toContain("loading.tsx");
    expect(appRouter).toContain("error.tsx");
    expect(appRouter).toContain("not-found.tsx");
    expect(appRouter).toContain("route.ts");
    expect(appRouter).toContain("middleware.ts");
    expect(appRouter).toContain("## Request flow");
    expect(appRouter).toContain("middleware runs first");
    expect(appRouter).toContain("Route handlers use the same file-system matcher");
    expect(appRouter).toContain("## Server by default");
    expect(appRouter).toContain("stay JavaScript-free in the browser");
    expect(appRouter).toContain("[Routing](/guides/routing/)");
    expect(appRouter).toContain("[Layouts and Slots](/guides/layouts-and-slots/)");
    expect(appRouter).toContain("[Data Loading](/guides/data-loading/)");
    expect(appRouter).toContain("[HTTP APIs](/guides/http-apis/)");
    expect(appRouter).toContain("[Middleware](/guides/middleware/)");
    expect(appRouter).toContain("[Metadata and Head](/guides/metadata-and-head/)");
    expect(appRouter).toContain("[Server and Client Model](/guides/server-and-client-model/)");
  });

  test("documents routing shapes and route params with component examples", async () => {
    const routing = await readDocsSite("src/content/guides/routing.mdx");

    expect(routing).toContain("## Route shapes");
    expect(routing).toContain("src/app/");
    expect(routing).toContain("docs/");
    expect(routing).toContain("$id/");
    expect(routing).toContain("$...path/");
    expect(routing).toContain("(marketing)/");
    expect(routing).toContain("/users/:id/");
    expect(routing).toContain("/files/*");
    expect(routing).toContain("/contact/");
    expect(routing).toContain("## Dynamic segments");
    expect(routing).toContain("params.id");
    expect(routing).toContain("type UserPageProps = {");
    expect(routing).toContain("readonly params: { readonly id: string };");
    expect(routing).toContain("export default function UserPage(props: UserPageProps)");
    expect(routing).toContain("## Catch-all segments");
    expect(routing).toContain("readonly params: { readonly path: readonly string[] };");
    expect(routing).toContain("props.params.path.join");
    expect(routing).toContain("encodeURIComponent");
    expect(routing).toContain("## Route groups");
    expect(routing).toContain("## Static params");
    expect(routing).toContain("prerender = true");
    expect(routing).toContain("generateStaticParams()");
    expect(routing).toContain("## Not found behavior");
    expect(routing).toContain("notFound()");
    expect(routing).toContain("[Project Structure](/guides/project-structure/)");
    expect(routing).toContain("[Data Loading](/guides/data-loading/)");
    expect(routing).toContain("[HTTP APIs](/guides/http-apis/)");
    expect(routing).toContain("[SSG and Static Export](/guides/ssg-and-static-export/)");
    expect(routing).toContain("[Link and Navigation](/guides/link-and-navigation/)");
  });

  test("documents layouts, named slots, templates, and slot rules", async () => {
    const layouts = await readDocsSite("src/content/guides/layouts-and-slots.mdx");

    expect(layouts).toContain("## Basic layout");
    expect(layouts).toContain('<Link href="/">Mreact Docs</Link>');
    expect(layouts).not.toContain('<a href="/">Mreact Docs</a>');
    expect(layouts).toContain("export default function RootLayout()");
    expect(layouts).toContain("<Slot />");
    expect(layouts).toContain("## Nested layouts");
    expect(layouts).toContain("src/app/docs/layout.tsx");
    expect(layouts).toContain('import { Link } from "@reckona/mreact-router/link";');
    expect(layouts).toContain('<Link href="/docs/">Overview</Link>');
    expect(layouts).toContain('<Link href="/docs/routing/">Routing</Link>');
    expect(layouts).not.toContain('<a href="/docs/">Overview</a>');
    expect(layouts).not.toContain('<a href="/docs/routing/">Routing</a>');
    expect(layouts).toContain("wrapped by both layouts");
    expect(layouts).toContain("## Named slots");
    expect(layouts).toContain('<Slot name="aside" />');
    expect(layouts).toContain("function DocsAside()");
    expect(layouts).toContain("export const slots = {");
    expect(layouts).toContain("aside: DocsAside");
    expect(layouts).toContain("## Templates");
    expect(layouts).toContain("template.tsx");
    expect(layouts).toContain("remounts on navigation");
    expect(layouts).toContain("## Slot rules");
    expect(layouts).toContain("default slot");
    expect(layouts).toContain("named slot");
    expect(layouts).toContain("@reckona/mreact-router/app-router-globals");
    expect(layouts).toContain("[Routing](/guides/routing/)");
    expect(layouts).toContain("[App Router](/guides/app-router/)");
    expect(layouts).toContain("[Metadata and Head](/guides/metadata-and-head/)");
    expect(layouts).toContain("[Server and Client Model](/guides/server-and-client-model/)");
  });

  test("consolidates client boundaries into the server and client model guide", async () => {
    const serverClientModel = await readDocsSite("src/content/guides/server-and-client-model.mdx");
    const contentRegistry = await readDocsSite("src/content-registry.ts");

    expect(serverClientModel).toContain("## Server by default");
    expect(serverClientModel).toContain("JavaScript-free");
    expect(serverClientModel).toContain("navigation runtime");
    expect(serverClientModel).toContain("## When a route becomes client-side");
    expect(serverClientModel).toContain('import { cell } from "@reckona/mreact-reactive-core";');
    expect(serverClientModel).toContain("onClick");
    expect(serverClientModel).toContain('## Client boundaries');
    expect(serverClientModel).toContain("LikeButton.client.tsx");
    expect(serverClientModel).toContain('import { LikeButton } from "./LikeButton.client";');
    expect(serverClientModel).toContain("## Route-level \"use client\"");
    expect(serverClientModel).toContain('"use client";');
    expect(serverClientModel).toContain("## SSR fallback behavior");
    expect(serverClientModel).toContain("server-renderable children");
    expect(serverClientModel).toContain("placeholder-only boundary");
    expect(serverClientModel).toContain("## Choosing the right boundary");
    expect(serverClientModel).toContain("- **Static page**: server route.");
    expect(serverClientModel).toContain("- **Small interactive widget**: `.client.tsx` boundary.");
    expect(serverClientModel).toContain("[App Router](/guides/app-router/)");
    expect(serverClientModel).toContain("[Link and Navigation](/guides/link-and-navigation/)");
    expect(serverClientModel).toContain("[SSR and Streaming](/guides/ssr-and-streaming/)");
    expect(serverClientModel).toContain("[Route Module Exports](/reference/route-module-exports/)");
    expect(contentRegistry).not.toContain("guidesClientBoundaries");
    expect(contentRegistry).not.toContain('page("guides/client-boundaries"');
  });

  test("documents SSR, streaming boundaries, deferred data, and runtime behavior", async () => {
    const ssrStreaming = await readDocsSite("src/content/guides/ssr-and-streaming.mdx");

    expect(ssrStreaming).toContain("## SSR by default");
    expect(ssrStreaming).toContain("loader");
    expect(ssrStreaming).toContain("metadata");
    expect(ssrStreaming).toContain("layout");
    expect(ssrStreaming).toContain("## Streaming routes");
    expect(ssrStreaming).toContain("shell");
    expect(ssrStreaming).toContain("placeholder");
    expect(ssrStreaming).toContain("export const stream = true");
    expect(ssrStreaming).toContain("## Await boundaries");
    expect(ssrStreaming).toContain("<Await");
    expect(ssrStreaming).toContain('placeholderAs="div"');
    expect(ssrStreaming).toContain("catch={(error)");
    expect(ssrStreaming).toContain("## Deferred loader data");
    expect(ssrStreaming).toContain("defer({");
    expect(ssrStreaming).toContain("notFound()");
    expect(ssrStreaming).toContain("## loading.tsx");
    expect(ssrStreaming).toContain("// src/app/streaming/loading.tsx");
    expect(ssrStreaming).toContain("## Streaming lists");
    expect(ssrStreaming).toContain('import { streamList } from "@reckona/mreact-router/stream-list";');
    expect(ssrStreaming).toContain("keep `<Await>` directly in the route JSX");
    expect(ssrStreaming).toContain("## Runtime behavior");
    expect(ssrStreaming).toContain("Cloudflare");
    expect(ssrStreaming).toContain("no-transform");
    expect(ssrStreaming).toContain("Lambda");
    expect(ssrStreaming).toContain("buffered");
    expect(ssrStreaming).toContain("[Data Loading](/guides/data-loading/)");
    expect(ssrStreaming).toContain("[Server and Client Model](/guides/server-and-client-model/)");
    expect(ssrStreaming).toContain("[Cloudflare](/deployments/cloudflare/)");
    expect(ssrStreaming).toContain("[AWS Lambda](/deployments/aws-lambda/)");
    expect(ssrStreaming).toContain("[Route Module Exports](/reference/route-module-exports/)");
  });

  test("documents Link prefetch controls and configures syntax highlighting", async () => {
    const linkGuide = await readDocsSite("src/content/guides/link-and-navigation.mdx");
    const contentRegistry = await readDocsSite("src/content-registry.ts");
    const copyScript = await readDocsSite("public/docs-copy.js");
    const viteConfig = await readDocsSite("vite.config.ts");
    const css = await readDocsSite("src/app/globals.css");

    expect(linkGuide).toContain("## Use Link for app navigation");
    expect(linkGuide).toContain('import { Link } from "@reckona/mreact-router/link";');
    expect(linkGuide).toContain('<Link href="/docs">Docs</Link>');
    expect(linkGuide).toContain("## Prefetch, not preload");
    expect(linkGuide).toContain("The API is named `prefetch`, not `preload`");
    expect(linkGuide).toContain('prefetch="intent"');
    expect(linkGuide).toContain('prefetch="viewport"');
    expect(linkGuide).toContain('prefetch="none"');
    expect(linkGuide).toContain("## Scroll and document reloads");
    expect(linkGuide).toContain('scroll="preserve"');
    expect(linkGuide).toContain("reload");
    expect(linkGuide).toContain("## Navigation runtime");
    expect(linkGuide).toContain("navigationRuntime");
    expect(linkGuide).toContain("Server-only routes");
    expect(linkGuide).toContain("## Same-origin navigation");
    expect(linkGuide).toContain("same-origin");
    expect(linkGuide).toContain("External URLs");
    expect(linkGuide).toContain("[Server and Client Model](/guides/server-and-client-model/)");
    expect(linkGuide).toContain("[Routing](/guides/routing/)");
    expect(linkGuide).toContain("[SSR and Streaming](/guides/ssr-and-streaming/)");
    expect(linkGuide).toContain("[SSG and Static Export](/guides/ssg-and-static-export/)");
    expect(contentRegistry).toContain("enhanceCodeBlocks");
    expect(contentRegistry).toContain('class="code-copy"');
    expect(contentRegistry).toContain("<pre${preAttributes}>");
    expect(contentRegistry).toContain("highlightShikiFileTreeCodeBlock");
    expect(contentRegistry).toContain('<span class="line">');
    expect(contentRegistry).toContain("code-block is-file-tree");
    expect(contentRegistry).toContain("tree-path is-dir");
    expect(contentRegistry).toContain("tree-path is-file");
    expect(contentRegistry).toContain("tree-path is-param");
    expect(copyScript).toContain("navigator.clipboard.writeText");
    expect(copyScript).toContain('document.execCommand("copy")');
    expect(viteConfig).toContain("@shikijs/rehype");
    expect(viteConfig).toContain("rehypeShiki");
    expect(viteConfig).toContain("github-dark");
    expect(viteConfig).not.toContain("rehype-highlight");
    expect(await readDocsSite("package.json")).toContain("@shikijs/rehype");
    expect(await readDocsSite("package.json")).not.toContain("rehype-highlight");
    expect(css).toContain(".doc-article .shiki");
    expect(css).toContain(".code-block");
    expect(css).toContain(".code-copy");
    expect(css).toContain(".is-file-tree");
    expect(css).toContain(".tree-path.is-dir");
    expect(css).toContain(".tree-path.is-file");
    expect(css).toContain(".tree-path.is-param");
    expect(css).not.toContain(".hljs-keyword");
    expect(css).not.toContain("--syntax-");
    expect(css).toContain("padding: 1rem");
    expect(css).not.toContain("padding-inline: 0.08rem");
    expect(css).not.toContain("padding: 2.7rem 1rem 1rem");
  });

  test("documents page data loading with loaders, params, request data, and metadata", async () => {
    const dataLoading = await readDocsSite("src/content/guides/data-loading.mdx");

    expect(dataLoading).toContain("## Load data before render");
    expect(dataLoading).toContain("src/app/users/$id/page.tsx");
    expect(dataLoading).toContain("The `$id` directory segment becomes `context.params.id`");
    expect(dataLoading).toContain("export async function loader");
    expect(dataLoading).toContain("type LoaderContext");
    expect(dataLoading).toContain("props.data");
    expect(dataLoading).toContain("## Read params and request");
    expect(dataLoading).toContain("context.params.id");
    expect(dataLoading).toContain("new URL(context.request.url)");
    expect(dataLoading).toContain("searchParams");
    expect(dataLoading).toContain("## Return typed data");
    expect(dataLoading).toContain("interface UserData");
    expect(dataLoading).toContain("Promise<UserData>");
    expect(dataLoading).toContain("## Handle missing data and redirects");
    expect(dataLoading).toContain("notFound()");
    expect(dataLoading).toContain("Response.redirect");
    expect(dataLoading).toContain("## Use the per-request query client");
    expect(dataLoading).toContain("context.queryClient.fetchQuery");
    expect(dataLoading).toContain("lives only for the current request");
    expect(dataLoading).toContain("This is not a cross-request server cache");
    expect(dataLoading).toContain("Each incoming request gets its own QueryClient");
    expect(dataLoading).toContain("## Use loader data in metadata");
    expect(dataLoading).toContain("generateMetadata");
    expect(dataLoading).toContain("{ data }: { data: UserData }");
    expect(dataLoading).toContain("RouteMetadata");
    expect(dataLoading).toContain("## Deferred data");
    expect(dataLoading).toContain("defer()");
    expect(dataLoading).toContain("[SSR and Streaming](/guides/ssr-and-streaming/)");
    expect(dataLoading).toContain("[Routing](/guides/routing/)");
    expect(dataLoading).toContain("[HTTP APIs](/guides/http-apis/)");
    expect(dataLoading).toContain("[Route Module Exports](/reference/route-module-exports/)");
  });

  test("documents SSG prerendering and static export constraints", async () => {
    const ssg = await readDocsSite("src/content/guides/ssg-and-static-export.mdx");

    expect(ssg).toContain("## Prerender a route");
    expect(ssg).toContain("export const prerender = true");
    expect(ssg).toContain("build-time HTML artifact");
    expect(ssg).toContain("## Dynamic routes with generateStaticParams");
    expect(ssg).toContain("src/app/users/$id/page.tsx");
    expect(ssg).toContain("generateStaticParams()");
    expect(ssg).toContain('/users/ada');
    expect(ssg).toContain("## What runs at build time");
    expect(ssg).toContain("loader");
    expect(ssg).toContain("generateMetadata");
    expect(ssg).toContain("build-time snapshot");
    expect(ssg).toContain("## Static export");
    expect(ssg).toContain("mreact-router build --target=node");
    expect(ssg).toContain("exportStaticApp");
    expect(ssg).toContain('outDir: ".mreact"');
    expect(ssg).toContain('exportDir: "dist"');
    expect(ssg).toContain("Cannot export non-prerendered route");
    expect(ssg).toContain("## Static host details");
    expect(ssg).toContain("dist/_mreact/client/");
    expect(ssg).toContain(".nojekyll");
    expect(ssg).toContain("404.html");
    expect(ssg).toContain("base path");
    expect(ssg).toContain("## When not to use static export");
    expect(ssg).toContain("request-time auth");
    expect(ssg).toContain("cookies");
    expect(ssg).toContain("middleware");
    expect(ssg).toContain("[Data Loading](/guides/data-loading/)");
    expect(ssg).toContain("[Routing](/guides/routing/)");
    expect(ssg).toContain("[Metadata and Head](/guides/metadata-and-head/)");
    expect(ssg).toContain("[Static Hosting](/deployments/static-hosting/)");
    expect(ssg).toContain("[Cloudflare](/deployments/cloudflare/)");
    expect(ssg).toContain("[Container and Cloud Run](/deployments/container-and-cloud-run/)");
  });

  test("documents server-only and client-exposed environment variables", async () => {
    const envGuide = await readDocsSite("src/content/guides/environment-variables.mdx");

    expect(envGuide).toContain("## Server-only values");
    expect(envGuide).toContain("readRequiredEnv");
    expect(envGuide).toContain("process.env.DATABASE_URL");
    expect(envGuide).toContain("server-only module");
    expect(envGuide).toContain(".client.tsx");
    expect(envGuide).toContain("## Platform runtime values");
    expect(envGuide).toContain("Cloudflare");
    expect(envGuide).toContain("context.env");
    expect(envGuide).toContain("type Env");
    expect(envGuide).toContain("## Expose safe values to the client");
    expect(envGuide).toContain("PUBLIC_");
    expect(envGuide).toContain("not a security boundary");
    expect(envGuide).toContain("GTM container ID");
    expect(envGuide).toContain("props.data.publicConfig");
    expect(envGuide).toContain("## Build-time values");
    expect(envGuide).toContain("define");
    expect(envGuide).toContain("import.meta.env");
    expect(envGuide).toContain("build-time snapshot");
    expect(envGuide).toContain("## Deployment variables");
    expect(envGuide).toContain("PORT");
    expect(envGuide).toContain("HOST");
    expect(envGuide).toContain("MREACT_ROUTER_HOST_POLICY");
    expect(envGuide).toContain("MREACT_ROUTER_ALLOWED_HOSTS");
    expect(envGuide).toContain("MREACT_SERVER_ACTION_SECRET");
    expect(envGuide).toContain("[Data Loading](/guides/data-loading/)");
    expect(envGuide).toContain("[HTTP APIs](/guides/http-apis/)");
    expect(envGuide).toContain("[Middleware](/guides/middleware/)");
    expect(envGuide).toContain("[External Scripts](/guides/external-scripts/)");
    expect(envGuide).toContain("[Container and Cloud Run](/deployments/container-and-cloud-run/)");
    expect(envGuide).toContain("[Cloudflare](/deployments/cloudflare/)");
    expect(envGuide).toContain("[Environment Variables Reference](/reference/environment-variables/)");
  });

  test("documents HTTP API route recipes for JSON, validation, auth, and CORS", async () => {
    const httpApis = await readDocsSite("src/content/guides/http-apis.mdx");

    expect(httpApis).toContain("## Create an API route");
    expect(httpApis).toContain("src/app/api/users/route.ts");
    expect(httpApis).toContain("/api/users/");
    expect(httpApis).toContain("src/app/api/users/$id/route.ts");
    expect(httpApis).toContain("/api/users/:id");
    expect(httpApis).toContain("export async function GET");
    expect(httpApis).toContain("## Read params and query");
    expect(httpApis).toContain("RouteHandlerContext");
    expect(httpApis).toContain("context.params.id");
    expect(httpApis).toContain("searchParams");
    expect(httpApis).toContain("## Return JSON");
    expect(httpApis).toContain("Response.json({ user })");
    expect(httpApis).toContain("{ status: 404 }");
    expect(httpApis).toContain("## Validate request bodies");
    expect(httpApis).toContain("await request.json()");
    expect(httpApis).toContain("parseCreateUser");
    expect(httpApis).toContain("{ status: 422 }");
    expect(httpApis).toContain("## Form and redirect-after-post");
    expect(httpApis).toContain("parseForm");
    expect(httpApis).toContain("redirect303");
    expect(httpApis).toContain("## Auth and server-only data");
    expect(httpApis).toContain("readRequiredEnv");
    expect(httpApis).toContain("CSRF");
    expect(httpApis).toContain("## CORS and OPTIONS");
    expect(httpApis).toContain("export function OPTIONS");
    expect(httpApis).toContain("access-control-allow-origin");
    expect(httpApis).toContain("## Method behavior");
    expect(httpApis).toContain("ALL");
    expect(httpApis).toContain("## When to use HTTP APIs");
    expect(httpApis).toContain("client component");
    expect(httpApis).toContain("webhook");
    expect(httpApis).toContain("loader");
    expect(httpApis).toContain("[Data Loading](/guides/data-loading/)");
    expect(httpApis).toContain("[Environment Variables](/guides/environment-variables/)");
    expect(httpApis).toContain("[Authentication](/guides/authentication/)");
    expect(httpApis).toContain("[Cookies and Sessions](/guides/cookies-and-sessions/)");
    expect(httpApis).toContain("[File Uploads and CSRF](/guides/file-uploads-and-csrf/)");
    expect(httpApis).toContain("[Response Helpers](/reference/response-helpers/)");
    expect(httpApis).toContain("[Route Handler Context](/reference/route-handler-context/)");
  });

  test("renders readable document lists and the latest benchmark run", async () => {
    const css = await readDocsSite("src/app/globals.css");
    const benchmarks = await readDocsSite("src/content/benchmarks.mdx");
    const benchmarkData = await readDocsSite("src/benchmark-results.ts");
    const benchmarkResults = await readDocsSite("src/ui/BenchmarkResults.tsx");
    const benchmarkFilters = await readDocsSite("public/docs-benchmarks.js");
    const layout = await readDocsSite("src/app/layout.tsx");

    expect(css).toContain("list-style: disc");
    expect(css).toContain("list-style: decimal");
    expect(css).toContain(".benchmark-results");
    expect(css).toContain(".benchmark-ranking-grid");
    expect(css).toContain(".benchmark-panel");
    expect(css).toContain("align-content: start");
    expect(css).toContain("align-self: start");
    expect(css).toContain("font-size: 1.18rem");
    expect(css).toContain(".benchmark-bar-row.is-mreact");
    expect(css).toContain(".benchmark-bar-track");
    expect(css).toContain(".benchmark-bar-fill");
    expect(benchmarks).toContain("BENCHMARK_RESULTS_PLACEHOLDER");
    expect(await readDocsSite("src/content-registry.ts")).toContain(
      "renderToString(BenchmarkResults)",
    );
    expect(benchmarkData).toContain("benchmarks/results/2026-06-07/002");
    expect(benchmarkData).toContain("primitive.md");
    expect(benchmarkData).toContain("router.md");
    expect(benchmarkData).toContain("primitive-browser.md");
    expect(benchmarkData).toContain("cardCount: 15");
    expect(benchmarkData).toContain("cardCount: 37");
    expect(benchmarkData).toContain("cardCount: 4");
    expect(benchmarkData).toContain("benchmarkRankingSuites");
    expect(benchmarkData).toContain("browser create 1k rows");
    expect(benchmarkData).toContain("mreact-app-router");
    expect(benchmarks).toContain("Primitive DOM and reactivity work");
    expect(benchmarks).toContain("Browser runtime behavior");
    expect(benchmarks).toContain("App router and deployment paths");
    expect(benchmarks).toContain("Resumability-oriented frameworks");
    expect(benchmarks).toContain("Primitive DOM-update cases mostly measure already-active update paths");
    expect(benchmarks.indexOf("## How to read results")).toBeLessThan(
      benchmarks.indexOf("## Latest results"),
    );
    expect(benchmarkResults).toContain("benchmark-ranking-grid");
    expect(benchmarkResults).toContain("githubUrlForRunPath");
    expect(benchmarkResults).toContain("View run on GitHub");
    expect(benchmarkResults).toContain("View source on GitHub");
    expect(benchmarkResults).toContain("BenchmarkRankingPanel");
    expect(benchmarkResults).toContain("benchmark-chart");
    expect(benchmarkResults).toContain("benchmark-bar-row");
    expect(benchmarkResults).toContain("benchmark-diff");
    expect(benchmarkResults).toContain("displayRank");
    expect(benchmarkResults).toContain("isMreactFramework");
    expect(benchmarkResults).toContain("classifyBenchmarkCard");
    expect(benchmarkResults).toContain("BenchmarkFilterBar");
    expect(benchmarkResults).toContain("data-benchmark-badges");
    expect(benchmarkResults).toContain("data-benchmark-filter");
    expect(benchmarkResults).toContain("aria-pressed");
    expect(benchmarkResults).toContain("benchmark-badge-list");
    expect(benchmarkResults).toContain("benchmark-badge is-primary");
    expect(benchmarkResults).toContain("is-size");
    expect(benchmarkResults).toContain("is-ssr");
    expect(benchmarkResults).toContain("is-interactivity");
    expect(benchmarkResults).toContain('"Size"');
    expect(benchmarkResults).toContain('"SSR"');
    expect(benchmarkResults).toContain('"Interactivity"');
    expect(benchmarkResults).toContain('"Navigation"');
    expect(benchmarkResults).toContain('"Startup"');
    expect(benchmarkResults).toContain('"Concurrency"');
    expect(benchmarkResults).toContain('"Memory"');
    expect(benchmarkResults).toContain('"Dev"');
    expect(benchmarkResults).toContain('"Client"');
    expect(benchmarkResults).toContain('"Server"');
    expect(benchmarkResults).toContain('"Production"');
    expect(css).toContain(".benchmark-badge-list");
    expect(css).toContain(".benchmark-badge");
    expect(css).toContain(".benchmark-filter-list");
    expect(css).toContain('.benchmark-filter[aria-pressed="true"]');
    expect(css).toContain("border-width: 0.125rem");
    expect(css).toContain("background: var(--benchmark-badge-text, var(--text))");
    expect(css).toContain(".benchmark-badge.is-size");
    expect(css).toContain(".benchmark-badge.is-ssr");
    expect(css).toContain(".benchmark-badge.is-interactivity");
    expect(layout).toContain('docs-benchmarks.js');
    expect(benchmarkFilters).toContain("data-benchmark-filter");
    expect(benchmarkFilters).toContain("data-benchmark-badges");
    expect(benchmarkFilters).toContain("aria-pressed");
    expect(benchmarkFilters).toContain("hidden");
    expect(benchmarkResults).not.toContain("Full summary rows");
  });

  test("keeps prose typography readable and aligned with the earlier docs site", async () => {
    const css = await readDocsSite("src/app/globals.css");

    expect(css).toContain("--bg: oklch(");
    expect(css).toContain("--text: oklch(");
    expect(css).toContain("--brand: oklch(");
    expect(css).toContain("--code-panel-bg: oklch(");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/);
    expect(css).toContain("color-scheme: only dark");
    expect(css).toContain(
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    );
    expect(css).toContain("width: 100%");
    expect(css).toContain("max-width: none");
    expect(css).toContain("line-height: 1.75");
    expect(css).toContain("font-size: 1rem");
    expect(css).toContain("margin: 1rem 0");
    expect(css).not.toContain("font-size: 16px");
    expect(css).not.toMatch(/font-size:\s*0\./);
    expect(css).not.toContain("max-width: 720px");
    expect(css).not.toContain("margin: 16px 0");
    expect(css).toContain("text-wrap: balance");
    expect(css).toContain("text-wrap: pretty");
    expect(css).toContain(".site-source-link");
  });

  test("has source content for the critical launch pages", async () => {
    await expect(
      access(join(docsSiteRoot, "src", "content", "overview.mdx")),
    ).resolves.toBeUndefined();

    for (const slug of requiredSlugs) {
      await expect(
        access(join(docsSiteRoot, "src", "content", `${slug}.mdx`)),
      ).resolves.toBeUndefined();
    }
  });

  test("has a GitHub Pages workflow that deploys the static docs output", async () => {
    const workflow = await readFile(join(root, ".github", "workflows", "docs-pages.yml"), "utf8");

    expect(workflow).toContain("actions/configure-pages");
    expect(workflow).toContain("actions/upload-pages-artifact");
    expect(workflow).toContain("actions/deploy-pages");
    expect(workflow).toContain("steps.pages.outputs.base_path");
    expect(workflow).toContain("MREACT_DOCS_BASE_PATH");
    expect(workflow).toContain("examples/docs-site/dist");
    expect(workflow).toContain("pnpm --filter @reckona/example-docs-site build");

    const exportScript = await readDocsSite("scripts/export-static.ts");
    expect(exportScript).toContain("MREACT_DOCS_BASE_PATH");
    expect(exportScript).toContain("rewriteHtmlBasePaths");
  });
});

async function readDocsSite(relativePath: string): Promise<string> {
  return await readFile(join(docsSiteRoot, relativePath), "utf8");
}
