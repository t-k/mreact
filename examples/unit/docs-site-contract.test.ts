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
    expect(routing).toContain("[Route Handlers](/guides/route-handlers/)");
    expect(routing).toContain("[SSG and Static Export](/guides/ssg-and-static-export/)");
    expect(routing).toContain("[Link and Navigation](/guides/link-and-navigation/)");
  });

  test("documents layouts, named slots, templates, and slot rules", async () => {
    const layouts = await readDocsSite("src/content/guides/layouts-and-slots.mdx");

    expect(layouts).toContain("## Basic layout");
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

  test("documents Link prefetch controls and configures syntax highlighting", async () => {
    const linkGuide = await readDocsSite("src/content/guides/link-and-navigation.mdx");
    const contentRegistry = await readDocsSite("src/content-registry.ts");
    const copyScript = await readDocsSite("public/docs-copy.js");
    const viteConfig = await readDocsSite("vite.config.ts");
    const css = await readDocsSite("src/app/globals.css");

    expect(linkGuide).toContain("The API is named `prefetch`, not `preload`");
    expect(linkGuide).toContain('prefetch="intent"');
    expect(linkGuide).toContain('prefetch="viewport"');
    expect(linkGuide).toContain('prefetch="none"');
    expect(contentRegistry).toContain("enhanceCodeBlocks");
    expect(contentRegistry).toContain('class="code-copy"');
    expect(contentRegistry).toContain("code-block is-file-tree");
    expect(contentRegistry).toContain("tree-path is-dir");
    expect(contentRegistry).toContain("tree-path is-file");
    expect(contentRegistry).toContain("tree-path is-param");
    expect(copyScript).toContain("navigator.clipboard.writeText");
    expect(copyScript).toContain('document.execCommand("copy")');
    expect(viteConfig).toContain("rehype-highlight");
    expect(css).toContain(".hljs-keyword");
    expect(css).toContain(".code-block");
    expect(css).toContain(".code-copy");
    expect(css).toContain(".is-file-tree");
    expect(css).toContain(".tree-path.is-dir");
    expect(css).toContain(".tree-path.is-file");
    expect(css).toContain(".tree-path.is-param");
    expect(css).toContain("padding: 1rem");
    expect(css).not.toContain("padding-inline: 0.08rem");
    expect(css).not.toContain("padding: 2.7rem 1rem 1rem");
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
