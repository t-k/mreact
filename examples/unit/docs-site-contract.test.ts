import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Window } from "happy-dom";
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
  "guides/testing",
  "guides/advanced/mdx",
  "deployments/host-policy-and-proxies",
  "deployments/source-maps",
  "deployments/logging-and-diagnostics",
  "deployments/cdn-assets",
  "deployments/cache-policy",
  "deployments/cloudflare",
  "deployments/aws-lambda",
  "deployments/container-and-cloud-run",
  "deployments/static-hosting",
  "examples",
  "utilities/virtualized-lists",
  "utilities/store",
  "utilities/server-state",
  "reference/api",
  "reference/adapters",
  "reference/auth-api",
  "reference/cache-api",
  "reference/cli",
  "reference/config",
  "reference/environment-variables",
  "reference/metadata-api",
  "reference/response-helpers",
  "reference/route-handler-context",
  "reference/route-module-exports",
] as const;

describe("docs-site example contract", () => {
  test("declares a private docs-site package with build, static export, and verification scripts", async () => {
    const packageJson = JSON.parse(await readDocsSite("package.json")) as {
      devDependencies?: Record<string, string>;
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
    expect(packageJson.scripts?.build).toContain("pagefind --site dist");
    expect(packageJson.scripts?.build).toContain("pnpm sync:benchmarks");
    expect(packageJson.scripts?.dev).toContain("pnpm sync:benchmarks");
    expect(packageJson.scripts?.["sync:benchmarks"]).toBe("tsx scripts/sync-benchmark-results.ts");
    expect(packageJson.scripts?.typecheck).toBe("pnpm sync:api && pnpm sync:benchmarks && tsc --noEmit");
    expect(packageJson.scripts?.test).toContain("vitest run");
    expect(packageJson.devDependencies?.pagefind).toBeDefined();
  });

  test("keeps the navigation aligned with the approved information architecture", async () => {
    const nav = await readDocsSite("src/nav.config.ts");

    for (const section of ["Overview", "Guides", "Utilities", "Deployments", "Examples", "Reference"]) {
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
    expect(nav.indexOf('slug: "guides/forms-and-validation"')).toBeLessThan(
      nav.indexOf('slug: "guides/testing"'),
    );
    expect(nav.indexOf('slug: "guides/testing"')).toBeLessThan(
      nav.indexOf('slug: "guides/metadata-and-head"'),
    );
    expect(nav).toContain('{ text: "Overview", slug: "" }');
    expect(nav).not.toContain(
      'text: "Getting Started",\n    items: [{ text: "Getting Started", slug: "getting-started" }]',
    );
    expect(nav).not.toContain('slug: "overview"');
    expect(nav).not.toContain('slug: "guides/client-boundaries"');
    expect(nav).not.toContain("Production Checklist");
    expect(nav).not.toContain('slug: "deployments/production-checklist"');
    expect(nav).toContain('{ text: "API Reference", slug: "reference/api" }');
    expect(nav).not.toContain('{ text: "Full API Reference", slug: "api" }');
    expect(nav).not.toContain("Generated API");
    expect(nav.indexOf('slug: "deployments/host-policy-and-proxies"')).toBeLessThan(
      nav.indexOf('slug: "deployments/source-maps"'),
    );
    expect(nav.indexOf('slug: "deployments/source-maps"')).toBeLessThan(
      nav.indexOf('slug: "deployments/logging-and-diagnostics"'),
    );
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
    expect(layout).toContain('src={sitePath("docs-sidebar.js")}');
    expect(layout).toContain('src={sitePath("docs-copy.js")}');
    expect(layout).toContain('src={sitePath("docs-search.js")}');
    expect(layout).toContain('src={sitePath("docs-theme.js")}');
    expect(layout).toContain('<meta name="color-scheme" content="light dark" />');
    expect(layout).toContain('localStorage.getItem("mreact:docs:theme")');
    expect(layout).toContain('aria-label="GitHub repository"');
    expect(layout).toContain('class="site-icon-control"');
    expect(layout).toContain('data-theme-toggle');
    expect(layout).toContain('data-theme-icon="dark"');
    expect(layout).toContain('data-theme-icon="light"');
    expect(layout).toContain("<search");
    expect(layout).toContain('type="search"');
    expect(layout).toContain('aria-label="Search documentation"');
    expect(layout).toContain('class="site-search-results"');
    expect(layout).toContain("data-pagefind-body");
    expect(overview).toContain("# Mreact");
    expect(overview).toContain("Mreact is a [React](https://react.dev/)-flavored framework");
    expect(overview).toContain("## Motivations");
    expect(overview).toContain("Automatic server/client boundary inference");
    expect(overview).toContain("## Status");
    expect(overview).toContain("## Performance");
    expect(overview).toContain("[Benchmarks](/benchmarks/)");
    expect(await readDocsSite("package.json")).toContain("@reckona/example-docs-site");
  });

  test("preserves sidebar position across full-page documentation navigation", async () => {
    const layout = await readDocsSite("src/app/layout.tsx");
    const sidebarScript = await readDocsSite("public/docs-sidebar.js");

    expect(layout).toContain('class="site-sidebar"');
    expect(layout).toContain('src={sitePath("docs-sidebar.js")}');
    expect(sidebarScript).toContain(".site-sidebar");
    expect(sidebarScript).toContain("mreact:docs:sidebar-scroll");
    expect(sidebarScript).toContain("sessionStorage");
    expect(sidebarScript).toContain("scrollTop");
    expect(sidebarScript).toContain("pagehide");
    expect(sidebarScript).toContain("requestAnimationFrame");
    expect(sidebarScript).toContain('setAttribute("aria-current", "page")');
    expect(sidebarScript).toContain("scrollIntoView");
    expect(sidebarScript).not.toContain("innerHTML");
  });

  test("supports a persisted light and dark theme toggle", async () => {
    const css = await readDocsSite("src/app/globals.css");
    const themeScript = await readDocsSite("public/docs-theme.js");

    expect(css).toContain("color-scheme: light dark");
    expect(css).toContain('html[data-theme="light"]');
    expect(css).toContain('html[data-theme="dark"]');
    expect(css).toContain(":root:not([data-theme=\"light\"])");
    expect(css).toContain(".site-icon-control");
    expect(css).toContain(".theme-toggle");
    expect(css).toContain("font-size: 1rem");
    expect(css).toContain("--bg: oklch(");
    expect(css).toContain("--brand: oklch(");
    expect(themeScript).toContain('const themeStorageKey = "mreact:docs:theme"');
    expect(themeScript).toContain('window.matchMedia("(prefers-color-scheme: dark)")');
    expect(themeScript).toContain('themeMediaQuery.addEventListener("change"');
    expect(themeScript).toContain("localStorage.setItem(themeStorageKey, theme)");
    expect(themeScript).toContain('colorSchemeMeta?.setAttribute("content", theme)');
    expect(themeScript).toContain("themeToggle.dataset.themeNext = nextTheme");
    expect(themeScript).not.toContain("textContent");
    expect(themeScript).not.toContain("innerHTML");
  });

  test("restores the sidebar position and marks the current page in the browser", async () => {
    const sidebarScript = await readDocsSite("public/docs-sidebar.js");
    const window = new Window({ url: "https://docs.example.com/reference/api/" });

    try {
      window.document.body.innerHTML = `
        <aside class="site-sidebar">
          <a class="nav-link" href="/">Overview</a>
          <a class="nav-link" href="/guides/app-router/">App Router</a>
          <a class="nav-link" href="/reference/api/">API Reference</a>
        </aside>
      `;
      window.sessionStorage.setItem("mreact:docs:sidebar-scroll", "240");

      window.eval(sidebarScript);
      await new Promise((resolve) => {
        window.requestAnimationFrame(resolve);
      });

      const sidebar = window.document.querySelector(".site-sidebar");
      const currentLink = window.document.querySelector('a[href="/reference/api/"]');

      expect(sidebar).toBeInstanceOf(window.HTMLElement);
      expect(sidebar?.scrollTop).toBe(240);
      expect(currentLink?.getAttribute("aria-current")).toBe("page");

      if (sidebar instanceof window.HTMLElement) {
        sidebar.scrollTop = 321;
      }
      window.dispatchEvent(new window.Event("pagehide"));

      expect(window.sessionStorage.getItem("mreact:docs:sidebar-scroll")).toBe("321");
    } finally {
      window.close();
    }
  });

  test("adds static Pagefind search as progressive enhancement", async () => {
    const searchScript = await readDocsSite("public/docs-search.js");
    const css = await readDocsSite("src/app/globals.css");

    expect(searchScript).toContain("pagefind/pagefind.js");
    expect(searchScript).toContain("import(pagefindModuleUrl.href)");
    expect(searchScript).toContain("pagefind.search");
    expect(searchScript).toContain("site-search-result");
    expect(searchScript).toContain("Search is available after the static docs build.");
    expect(searchScript).not.toContain("innerHTML");

    expect(css).toContain(".site-search");
    expect(css).toContain(".site-search-input");
    expect(css).toContain(".site-search-results");
    expect(css).toContain(".site-search-result");
    expect(css).not.toMatch(/font-size:\s*0\./);
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

  test("keeps runtime not-found links compatible with docs base paths", async () => {
    const runtimeNotFound = await readDocsSite("src/app/not-found.tsx");
    const staticNotFound = await readDocsSite("src/app/404/page.tsx");

    expect(runtimeNotFound).toContain('import { sitePath } from "../site-path.js";');
    expect(runtimeNotFound).toContain('href={sitePath()}');
    expect(runtimeNotFound).not.toContain('href="/"');
    expect(staticNotFound).toContain('import { sitePath } from "../../site-path.js";');
    expect(staticNotFound).toContain('href={sitePath()}');
    expect(staticNotFound).not.toContain('href="/"');
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
    expect(gettingStarted).toContain("http://127.0.0.1:3001");
    expect(gettingStarted).not.toContain("http://localhost:3000");
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

  test("keeps Examples useful as a purpose-driven map of runnable projects", async () => {
    const examplesGuide = await readDocsSite("src/content/examples.mdx");

    expect(examplesGuide).toContain("## Which example should I use?");
    expect(examplesGuide).toContain("examples/app-router");
    expect(examplesGuide).toContain("https://github.com/t-k/mreact/tree/main/examples/app-router");
    expect(examplesGuide).toContain("examples/hacker-news");
    expect(examplesGuide).toContain("https://github.com/t-k/mreact/tree/main/examples/hacker-news");
    expect(examplesGuide).toContain("https://mreact-hacker-news.t-kaniwa-e16.workers.dev");
    expect(examplesGuide).toContain("examples/react-libraries");
    expect(examplesGuide).toContain(
      "https://github.com/t-k/mreact/tree/main/examples/react-libraries",
    );
    expect(examplesGuide).toContain("examples/docs-site");
    expect(examplesGuide).toContain("https://github.com/t-k/mreact/tree/main/examples/docs-site");
    expect(examplesGuide).toContain("## Featured examples");
    expect(examplesGuide).toContain("What it demonstrates");
    expect(examplesGuide).toContain("How to run it");
    expect(examplesGuide).toContain("pnpm --filter @reckona/example-app-router dev");
    expect(examplesGuide).toContain("pnpm --filter @reckona/example-hacker-news dev");
    expect(examplesGuide).toContain("pnpm --filter @reckona/example-react-libraries test:e2e");
    expect(examplesGuide).toContain("## Lower-level examples");
    expect(examplesGuide).toContain("examples/reactive-primitives");
    expect(examplesGuide).toContain(
      "https://github.com/t-k/mreact/tree/main/examples/reactive-primitives",
    );
    expect(examplesGuide).toContain("examples/store");
    expect(examplesGuide).toContain("examples/virtual-grid");
    expect(examplesGuide).toContain("examples/ssr-streaming");
    expect(examplesGuide).toContain("examples/react-compat");
    expect(examplesGuide).toContain("examples/selective-hydration");
    expect(examplesGuide).toContain("## How to run examples");
    expect(examplesGuide).toContain("pnpm install");
    expect(examplesGuide).toContain("pnpm -r --filter \"./packages/*\" build");
    expect(examplesGuide).toContain("## Related pages");
    expect(examplesGuide).toContain("[Getting Started](/getting-started/)");
    expect(examplesGuide).toContain("[App Router](/guides/app-router/)");
    expect(examplesGuide).toContain("[Testing](/guides/testing/)");
    expect(examplesGuide).toContain("[Cloudflare](/deployments/cloudflare/)");
    expect(examplesGuide).toContain("[Static Hosting](/deployments/static-hosting/)");
  });

  test("documents companion packages without promoting the Next.js integration", async () => {
    const nav = await readDocsSite("src/nav.config.ts");
    const contentRegistry = await readDocsSite("src/content-registry.ts");
    const virtual = await readDocsSite("src/content/utilities/virtualized-lists.mdx");
    const store = await readDocsSite("src/content/utilities/store.mdx");
    const query = await readDocsSite("src/content/utilities/server-state.mdx");
    const compat = await readDocsSite("src/content/guides/react-compatibility.mdx");

    expect(nav).toContain('text: "Utilities"');
    expect(nav).toContain('{ text: "Virtualized Lists", slug: "utilities/virtualized-lists" }');
    expect(nav).toContain('{ text: "Store", slug: "utilities/store" }');
    expect(nav).toContain('{ text: "Server State", slug: "utilities/server-state" }');
    expect(nav).toContain('{ text: "React Compatibility", slug: "guides/react-compatibility" }');
    expect(nav).not.toContain("mreact-next");
    expect(nav).not.toContain("Mreact Next");

    expect(contentRegistry).toContain('page("utilities/virtualized-lists"');
    expect(contentRegistry).toContain('page("utilities/store"');
    expect(contentRegistry).toContain('page("utilities/server-state"');
    expect(contentRegistry).not.toContain('page("reference/packages/virtual"');
    expect(contentRegistry).not.toContain('page("reference/packages/query"');
    expect(contentRegistry).toContain('page("guides/react-compatibility"');

    expect(virtual).toContain('export const title = "Virtualized Lists"');
    expect(virtual).toContain("# Virtualized Lists");
    expect(virtual).toContain("@reckona/mreact-virtual");
    expect(virtual).toContain("API reference:");
    expect(virtual).toContain("/api/modules/_reckona_mreact-virtual.html");
    expect(virtual).toContain("/api/functions/_reckona_mreact-virtual.createVirtualList.html");
    expect(virtual).toContain("createVirtualList");
    expect(virtual).toContain("createVirtualGrid");
    expect(virtual).toContain("measureItem");
    expect(virtual).toContain("scrollToKey");
    expect(virtual).toContain("quilt-style grids");
    expect(virtual).toContain("examples/virtual-grid");
    expect(virtual).toContain("https://github.com/t-k/mreact/tree/main/packages/virtual");

    expect(store).toContain("@reckona/mreact-store");
    expect(store).toContain("API reference:");
    expect(store).toContain("/api/modules/_reckona_mreact-store.html");
    expect(store).toContain("/api/functions/_reckona_mreact-store.createStore.html");
    expect(store).toContain("createStore");
    expect(store).toContain("createRequestStoreFactory");
    expect(store).toContain("shallowEqual");
    expect(store).toContain("transaction");
    expect(store).toContain("persist");
    expect(store).toContain("request-isolated");
    expect(store).toContain("@reckona/mreact-query");

    expect(query).toContain('export const title = "Server State"');
    expect(query).toContain("# Server State");
    expect(query).toContain("@reckona/mreact-query");
    expect(query).toContain("API reference:");
    expect(query).toContain("/api/modules/_reckona_mreact-query.html");
    expect(query).toContain("/api/functions/_reckona_mreact-query.createQuery.html");
    expect(query).toContain("/api/interfaces/_reckona_mreact-query.QueryClient.html");
    expect(query).toContain("createQueryClient");
    expect(query).toContain("createQuery");
    expect(query).toContain("createInfiniteQuery");
    expect(query).toContain("createMutation");
    expect(query).toContain("loader");
    expect(query).toContain("staleTime");
    expect(query).toContain("## SSR first render with browser revalidation");
    expect(query).toContain("refetchOnWindowFocus: true");
    expect(query).toContain("refetchOnReconnect: true");
    expect(query).toContain("window.setInterval");
    expect(query).toContain("observer.refetch()");
    expect(query).toContain("SWR-style");
    expect(query).toContain("cancelQueries");
    expect(query).toContain("optimistic");

    expect(compat).toContain("@reckona/mreact-compat");
    expect(compat).toContain("React compatibility");
    expect(compat).toContain("Most applications should import from `@reckona/mreact`");
    expect(compat).toContain("## Vite configuration");
    expect(compat).toContain("optimizeDeps");
    expect(compat).toContain("mreactRouter");
    expect(compat).toContain("/api/modules/_reckona_mreact-compat.html");
    expect(compat).toContain("React 19.2.6");
    expect(compat).toContain("pnpm test:react-conformance");
    expect(compat).toContain("examples/react-libraries");
    expect(compat).not.toContain("@reckona/mreact-next");
  });

  test("renders the generated TypeDoc JSON API reference as docs-site routes", async () => {
    const nav = await readDocsSite("src/nav.config.ts");
    const contentRegistry = await readDocsSite("src/content-registry.ts");
    const apiReference = await readDocsSite("src/content/reference/api.mdx");
    const typedocConfig = await readFile(join(root, "typedoc.json"), "utf8");
    const generatedApiJson = await readFile(join(root, "docs", "api", "index.json"), "utf8");
    const apiData = await readDocsSite("src/api-reference-data.tsx");
    const apiIndexRoute = await readDocsSite("src/app/api/page.tsx");
    const apiDetailRoute = await readDocsSite("src/app/api/$...apiPath/page.tsx");
    const exportScript = await readDocsSite("scripts/export-static.ts");

    expect(nav).toContain('{ text: "API Reference", slug: "reference/api" }');
    expect(nav).not.toContain("Generated API");
    expect(contentRegistry).toContain("referenceApi");
    expect(contentRegistry).toContain('page("reference/api", referenceApi, referenceApiMeta)');
    expect(contentRegistry).not.toContain("generated-api.mdx");
    expect(apiReference).toContain('export const title = "API Reference"');
    expect(apiReference).toContain("[Open the full API Reference](/api/)");
    expect(apiReference).toContain("[@reckona/mreact-router](/api/modules/_reckona_mreact-router.html)");
    expect(apiReference).toContain("[@reckona/mreact-query](/api/modules/_reckona_mreact-query.html)");
    expect(apiReference).toContain("[@reckona/mreact-store](/api/modules/_reckona_mreact-store.html)");
    expect(apiReference).toContain("[@reckona/mreact-virtual](/api/modules/_reckona_mreact-virtual.html)");
    expect(apiReference).toContain("[LoaderContext](/api/interfaces/_reckona_mreact-router..LoaderContext.html)");
    expect(apiReference).not.toContain("pnpm docs:api");
    expect(apiReference).not.toContain("Generate or refresh");
    expect(typedocConfig).toContain('"json": "docs/api/index.json"');
    expect(typedocConfig).toContain('"emit": "both"');
    expect(generatedApiJson).toContain('"schemaVersion"');
    expect(generatedApiJson).toContain('"name": "@reckona/mreact-router"');
    const docsSitePackage = await readFile(join(docsSiteRoot, "package.json"), "utf8");
    const syncApiScript = await readDocsSite("scripts/sync-api-reference.ts");

    expect(apiData).toContain("./generated/api-reference.json");
    expect(apiData).toContain("apiPageForPath");
    expect(apiData).toContain("allApiPagePaths");
    expect(apiData).toContain("ApiReferencePage");
    expect(apiData).toContain("apiLinkForEntry");
    expect(apiData).toContain("commentTextFor");
    expect(apiData).toContain("TypeDocComment");
    expect(apiData).toContain('class="api-package-list"');
    expect(apiData).toContain('class="api-module-row"');
    expect(apiData).toContain('class="api-entry-list"');
    expect(apiData).toContain('class="api-entry-row"');
    expect(apiData).toContain('class="api-detail-header"');
    expect(apiData).toContain('class="api-description"');
    expect(apiData).toContain("comment === \"\" ? undefined");
    expect(apiData).toContain("escapeCodeText");
    expect(apiData).toContain("<code>{escapeCodeText(signaturePreview(entry.node))}</code>");
    expect(apiData).toContain("<code>{escapeCodeText(signatureBlock(entry.node))}</code>");
    expect(apiData).toContain("<code>{escapeCodeText(memberSignature(member))}</code>");
    expect(docsSitePackage).toContain('"sync:api": "tsx scripts/sync-api-reference.ts"');
    expect(docsSitePackage).toContain("pnpm sync:api && pnpm sync:benchmarks && mreact-router build");
    expect(docsSitePackage).toContain("pnpm sync:api && pnpm sync:benchmarks && tsc --noEmit");
    expect(syncApiScript).toContain('join(docsSiteRoot, "..", "..", "docs", "api", "index.json")');
    expect(syncApiScript).toContain('join(docsSiteRoot, "src", "generated", "api-reference.json")');
    expect(apiIndexRoute).toContain("apiReferenceIndexPage()");
    expect(apiIndexRoute).toContain("<ApiReferencePage page={page} />");
    expect(apiDetailRoute).toContain("allApiPagePaths()");
    expect(apiDetailRoute).toContain("apiPageForPath");
    expect(apiDetailRoute).toContain("notFound()");
    expect(exportScript).not.toContain("copyGeneratedApiReference");
    expect(exportScript).not.toContain("postprocessGeneratedApiReference");
    expect(exportScript).not.toContain("writeGeneratedApiIntegrationStyles");
    expect(exportScript).not.toContain("data-mreact-docs-api-shell");
    expect(exportScript).not.toContain("docs-api.css");
    const css = await readDocsSite("src/app/globals.css");
    expect(css).toContain(".api-package-list");
    expect(css).toContain(".api-module-row");
    expect(css).toContain(".api-entry-list");
    expect(css).toContain(".api-entry-row");
    expect(css).toContain(".api-detail-header");
    expect(css).toContain(".api-description");
    expect(css).toContain("content-visibility: auto");
  });

  test("keeps every Reference page practical and connected to generated API details", async () => {
    const referencePages = [
      ["src/content/reference/cli.mdx", ["## Commands", "mreact-router build --target=node", "mreact-router package aws-lambda", "MREACT_ROUTER_LOG", "/api/functions/_reckona_mreact-router..buildApp.html"]],
      ["src/content/reference/config.mdx", ["## Project shape", "mreactRouter({", "clientSourceMaps: \"hidden\"", "assetBaseUrl", "publicAssetBaseUrl", "/api/interfaces/_reckona_mreact-router.vite.AppRouterVitePluginOptions.html"]],
      ["src/content/reference/environment-variables.mdx", ["## Framework variables", "MREACT_ROUTER_ALLOWED_HOSTS", "MREACT_SERVER_ACTION_SECRET", "PUBLIC_SITE_URL", "process.env", "import.meta.env"]],
      ["src/content/reference/route-module-exports.mdx", ["## Page and layout modules", "definePage<typeof loader>", "generateStaticParams", "export const revalidate = 60", "export async function GET", "/api/functions/_reckona_mreact-router..definePage.html"]],
      ["src/content/reference/route-handler-context.mdx", ["## Dynamic params", "RouteHandlerContext<{ id: string }>", "context.params.id", "Response.json", "context.request", "/api/interfaces/_reckona_mreact-router..RouteHandlerContext.html"]],
      ["src/content/reference/response-helpers.mdx", ["## Redirects and 404s", "throwNotFound()", "redirectExternal", "parseForm", "createFormCsrfToken", "/api/functions/_reckona_mreact-router..throwNotFound.html"]],
      ["src/content/reference/adapters.mdx", ["## Adapter imports", "createNodeRequestHandler", "createCloudflareRequestHandler", "createAwsLambdaRequestHandler", "exportStaticApp", "/api/modules/_reckona_mreact-router.adapters_static.html"]],
      ["src/content/reference/metadata-api.mdx", ["## Static metadata", "generateMetadata", "csp: {", "security", "RouteHeadDescriptor", "/api/interfaces/_reckona_mreact-router..RouteMetadata.html"]],
      ["src/content/reference/auth-api.mdx", ["## Configure auth", "configureAuth", "runWithAuthRequest", "requirePermission", "tryRequireRole", "/api/modules/_reckona_mreact-auth.html"]],
      ["src/content/reference/cache-api.mdx", ["## Route HTML cache", "cacheControl({", "revalidatePath", "createMemoryRouteCache", "x-mreact-revalidate", "/api/interfaces/_reckona_mreact-router..CacheControlOptions.html"]],
      ["src/content/reference/api.mdx", ["## Framework and router", "## Deployment adapters", "## Utilities", "## Compatibility and rendering", "## Forms and authentication", "Generated TypeDoc"]],
    ] as const;

    for (const [path, expectedSnippets] of referencePages) {
      const page = await readDocsSite(path);
      expect(page).toContain("## When to use this page");
      expect(page).toContain("## Related pages");
      expect(page).toContain("API reference:");
      expect(page).not.toContain("TODO");
      expect(page).not.toContain("coming soon");

      for (const snippet of expectedSnippets) {
        expect(page).toContain(snippet);
      }
    }

    const metadataApi = await readDocsSite("src/content/reference/metadata-api.mdx");
    expect(metadataApi).not.toContain("@reckona/mreact-router/csp");
    expect(metadataApi).not.toContain("contentSecurityPolicy");
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
    expect(ssrStreaming).toContain("throwNotFound()");
    expect(ssrStreaming).toContain("definePage<typeof loader>");
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
    expect(linkGuide).toContain("## Typed route hrefs");
    expect(linkGuide).toContain("<Link href={`/users/${encodeURIComponent(props.user.id)}?tab=activity#profile`}>");
    expect(linkGuide).toContain("const encodedPath = props.path.map(encodeURIComponent).join(\"/\");");
    expect(linkGuide).toContain("<Link href={`/files/${encodedPath}`}>");
    expect(linkGuide).toContain(".mreact/routes.d.ts");
    expect(linkGuide).toContain('declare module "@reckona/mreact-router/link"');
    expect(linkGuide).toContain('include": ["src", ".mreact/routes.d.ts"]');
    expect(linkGuide).toContain("dynamic params are required at compile time");
    expect(linkGuide).toContain("without importing any generated runtime module");
    expect(linkGuide).toContain("## Use href() only for runtime construction");
    expect(linkGuide).toContain('import { href } from "@reckona/mreact-router";');
    expect(linkGuide).toContain('href("/users/:id", {');
    expect(linkGuide).toContain("params: { id: props.user.id },");
    expect(linkGuide).toContain("search");
    expect(linkGuide).toContain("hash");
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

  test("documents CSS imports, asset handling, image priority, CDN base URLs, and cache rules", async () => {
    const cssAssets = await readDocsSite("src/content/guides/css-and-assets.mdx");

    expect(cssAssets).toContain("## What Mreact builds");
    expect(cssAssets).toContain("route stylesheet assets");
    expect(cssAssets).toContain("copied public assets");
    expect(cssAssets).toContain("CSS `url()` references");
    expect(cssAssets).toContain("## Import CSS from route files");
    expect(cssAssets).toContain("// src/app/layout.tsx");
    expect(cssAssets).toContain('import "./globals.css";');
    expect(cssAssets).toContain("layout, page, template, error, or not-found");
    expect(cssAssets).toContain("## Tailwind");
    expect(cssAssets).toContain("@tailwindcss/vite");
    expect(cssAssets).toContain('@import "tailwindcss";');
    expect(cssAssets).toContain("## Public assets");
    expect(cssAssets).toContain("public/favicon.svg");
    expect(cssAssets).toContain('src="/logo.svg"');
    expect(cssAssets).toContain("public assets are not fingerprinted");
    expect(cssAssets).toContain("Cache-Control: public, max-age=3600");
    expect(cssAssets).toContain("## Assets referenced from CSS");
    expect(cssAssets).toContain('background-image: url("./assets/logo.svg");');
    expect(cssAssets).toContain("hashed client asset");
    expect(cssAssets).toContain("## Images and priority");
    expect(cssAssets).toContain('fetchpriority="high"');
    expect(cssAssets).toContain('loading="lazy"');
    expect(cssAssets).toContain("image-set(");
    expect(cssAssets).toContain("## CDN base URLs");
    expect(cssAssets).toContain("assetBaseUrl");
    expect(cssAssets).toContain("publicAssetBaseUrl");
    expect(cssAssets).toContain("route scripts, modulepreload links, dynamic import preload helpers, and route stylesheet assets");
    expect(cssAssets).toContain("## CSP and external styles");
    expect(cssAssets).toContain("style-src");
    expect(cssAssets).toContain("## Related pages");
    expect(cssAssets).toContain("[CSP](/guides/csp/)");
    expect(cssAssets).toContain("[Metadata and Head](/guides/metadata-and-head/)");
    expect(cssAssets).toContain("[CDN Assets](/deployments/cdn-assets/)");
    expect(cssAssets).toContain("[Cache Policy](/deployments/cache-policy/)");
  });

  test("documents CSP metadata, nonces, overrides, inline warnings, external hosts, and rollout checks", async () => {
    const csp = await readDocsSite("src/content/guides/csp.mdx");

    expect(csp).toContain("## What CSP controls");
    expect(csp).toContain("Content-Security-Policy");
    expect(csp).toContain("default-src");
    expect(csp).toContain("script-src");
    expect(csp).toContain("style-src");
    expect(csp).toContain("connect-src");
    expect(csp).toContain("img-src");
    expect(csp).toContain("frame-ancestors");
    expect(csp).toContain("## Start with a route baseline");
    expect(csp).toContain("export const metadata");
    expect(csp).toContain("directives: {");
    expect(csp).toContain('"base-uri": ["\'self\'"]');
    expect(csp).toContain('"object-src": ["\'none\'"]');
    expect(csp).toContain("satisfies RouteMetadata");
    expect(csp).toContain("Do not add `style-src: [\"'self'\"]`");
    expect(csp).toContain("nonce-backed or external");
    expect(csp).toContain("## Add nonces for route-owned inline code");
    expect(csp).toContain("randomBytes(16).toString(\"base64url\")");
    expect(csp).toContain("nonce: true");
    expect(csp).toContain("window.dataLayer=window.dataLayer||[];");
    expect(csp).toContain("'nonce-");
    expect(csp).toContain("script-src");
    expect(csp).toContain("style-src");
    expect(csp).toContain("## Compose and override CSP");
    expect(csp).toContain("replace: {");
    expect(csp).toContain('"connect-src": ["\'self\'", "https://pay.example.test"]');
    expect(csp).toContain("remove: [\"report-uri\"]");
    expect(csp).toContain("disable: true");
    expect(csp).toContain("## Inline scripts and styles");
    expect(csp).toContain("router:csp:inline-nonce-warning");
    expect(csp).toContain("inline <script> without a matching nonce");
    expect(csp).toContain("inline <style> without a matching nonce");
    expect(csp).toContain("Prefer external CSS");
    expect(csp).toContain("## External services");
    expect(csp).toContain("GTM");
    expect(csp).toContain("GA4");
    expect(csp).toContain("script-src");
    expect(csp).toContain("connect-src");
    expect(csp).toContain("img-src");
    expect(csp).toContain("## Validate and roll out");
    expect(csp).toContain("Report-Only");
    expect(csp).toContain("Do not build directives from user input");
    expect(csp).toContain("## Related pages");
    expect(csp).toContain("[Metadata and Head](/guides/metadata-and-head/)");
    expect(csp).toContain("[External Scripts](/guides/external-scripts/)");
    expect(csp).toContain("[CSS and Assets](/guides/css-and-assets/)");
    expect(csp).toContain("[Host Policy and Proxies](/deployments/host-policy-and-proxies/)");
    expect(csp).toContain("[Logging and Diagnostics](/deployments/logging-and-diagnostics/)");
  });

  test("documents external scripts with metadata head, CSP nonces, JSON-LD, noscript, SPA page views, and performance limits", async () => {
    const externalScripts = await readDocsSite("src/content/guides/external-scripts.mdx");

    expect(externalScripts).toContain("## Choose an integration path");
    expect(externalScripts).toContain("metadata.head");
    expect(externalScripts).toContain("body JSX");
    expect(externalScripts).toContain(".client.tsx");
    expect(externalScripts).toContain("## Add route-owned head scripts");
    expect(externalScripts).toContain("generateMetadata");
    expect(externalScripts).toContain("randomBytes(16).toString(\"base64url\")");
    expect(externalScripts).toContain("GTM_CONTAINER_ID");
    expect(externalScripts).toContain("GA4_MEASUREMENT_ID");
    expect(externalScripts).toContain("nonce: true");
    expect(externalScripts).toContain("window.dataLayer=window.dataLayer||[];");
    expect(externalScripts).toContain("https://www.googletagmanager.com");
    expect(externalScripts).toContain("fetchpriority: \"low\"");
    expect(externalScripts).toContain("## Add body-only fallbacks");
    expect(externalScripts).toContain("<noscript>");
    expect(externalScripts).toContain("metadata.head cannot emit");
    expect(externalScripts).toContain("## JSON-LD");
    expect(externalScripts).toContain('type="application/ld+json"');
    expect(externalScripts).toContain("JSON.stringify");
    expect(externalScripts).toContain("Do not interpolate request data");
    expect(externalScripts).toContain("## SPA page views");
    expect(externalScripts).toContain("@reckona/mreact-router/navigation-state");
    expect(externalScripts).toContain("subscribeNavigationState");
    expect(externalScripts).toContain('event: "page_view"');
    expect(externalScripts).toContain("page_path");
    expect(externalScripts).toContain("__mreactAnalyticsInstalled");
    expect(externalScripts).toContain("## Performance and failure budget");
    expect(externalScripts).toContain('fetchpriority="low"');
    expect(externalScripts).toContain("Long Animation Frames");
    expect(externalScripts).toContain("batch analytics events");
    expect(externalScripts).toContain("## Security checklist");
    expect(externalScripts).toContain("Do not put secrets or PII");
    expect(externalScripts).toContain("Add third-party hosts only to the directives they need");
    expect(externalScripts).toContain("[CSP](/guides/csp/)");
    expect(externalScripts).toContain("[Environment Variables](/guides/environment-variables/)");
    expect(externalScripts).toContain("[Metadata and Head](/guides/metadata-and-head/)");
  });

  test("documents file upload choices, server action CSRF, route handler CSRF, validation, storage names, and size limits", async () => {
    const uploads = await readDocsSite("src/content/guides/file-uploads-and-csrf.mdx");

    expect(uploads).toContain("## Choose an upload path");
    expect(uploads).toContain("Server Actions");
    expect(uploads).toContain("HTTP APIs");
    expect(uploads).toContain("route handlers");
    expect(uploads).toContain("presigned upload");
    expect(uploads).toContain("## Server action uploads");
    expect(uploads).toContain('encType="multipart/form-data"');
    expect(uploads).toContain("action={uploadAvatar}");
    expect(uploads).toContain("FormData");
    expect(uploads).toContain("File");
    expect(uploads).toContain("ServerActionContext");
    expect(uploads).toContain("context.cookies.get");
    expect(uploads).toContain("CSRF-bound action reference");
    expect(uploads).toContain("mreact.csrf");
    expect(uploads).toContain("__mreact_csrf");
    expect(uploads).toContain("maxBodyBytes");
    expect(uploads).toContain("maxFormFields");
    expect(uploads).toContain("## HTTP API uploads and CSRF");
    expect(uploads).toContain("src/app/api/uploads/route.ts");
    expect(uploads).toContain("request.formData()");
    expect(uploads).toContain("verifyCsrfToken");
    expect(uploads).toContain("SameSite=Lax");
    expect(uploads).toContain("double-submit");
    expect(uploads).toContain("## Validate files before storage");
    expect(uploads).toContain("file.size");
    expect(uploads).toContain("file.type");
    expect(uploads).toContain("magic bytes");
    expect(uploads).toContain("Do not trust");
    expect(uploads).toContain("## Storage-safe filenames");
    expect(uploads).toContain("crypto.randomUUID()");
    expect(uploads).toContain("path traversal");
    expect(uploads).toContain("original filename");
    expect(uploads).toContain("## Streaming and direct-to-storage uploads");
    expect(uploads).toContain("bounded multipart");
    expect(uploads).toContain("presigned");
    expect(uploads).toContain("Cloudflare R2");
    expect(uploads).toContain("S3");
    expect(uploads).toContain("## Security checklist");
    expect(uploads).toContain("authentication");
    expect(uploads).toContain("authorization");
    expect(uploads).toContain("virus scanning");
    expect(uploads).toContain("[Server Actions](/guides/server-actions/)");
    expect(uploads).toContain("[HTTP APIs](/guides/http-apis/)");
    expect(uploads).toContain("[Forms and Validation](/guides/forms-and-validation/)");
    expect(uploads).toContain("[Cookies and Sessions](/guides/cookies-and-sessions/)");
  });

  test("documents MDX setup, content registries, frontmatter metadata, SSG, and runtime boundaries", async () => {
    const mdxGuide = await readDocsSite("src/content/guides/advanced/mdx.mdx");

    expect(mdxGuide).toContain("## What Mreact expects");
    expect(mdxGuide).toContain("Vite plugin");
    expect(mdxGuide).toContain("@mdx-js/rollup");
    expect(mdxGuide).toContain("Native `page.mdx` route files");
    expect(mdxGuide).toContain("## Configure MDX in Vite");
    expect(mdxGuide).toContain("jsxImportSource: \"@reckona/mreact\"");
    expect(mdxGuide).toContain("jsxRuntime: \"automatic\"");
    expect(mdxGuide).toContain("remark-frontmatter");
    expect(mdxGuide).toContain("remark-mdx-frontmatter");
    expect(mdxGuide).toContain("rehypeSlug");
    expect(mdxGuide).toContain("rehypeShiki");
    expect(mdxGuide).toContain("mreactRouter");
    expect(mdxGuide).toContain("## Add MDX module types");
    expect(mdxGuide).toContain("declare module \"*.mdx\"");
    expect(mdxGuide).toContain("RouteMetadata");
    expect(mdxGuide).toContain("## Import content from a registry");
    expect(mdxGuide).toContain("import.meta.glob");
    expect(mdxGuide).toContain("{ eager: true }");
    expect(mdxGuide).toContain("frontmatter");
    expect(mdxGuide).toContain("## Render MDX through a route");
    expect(mdxGuide).toContain("src/app/docs/$...slug/page.tsx");
    expect(mdxGuide).toContain("LoaderContext<{ slug: readonly string[] }>");
    expect(mdxGuide).toContain("notFound()");
    expect(mdxGuide).toContain("<Content />");
    expect(mdxGuide).toContain("## Generate metadata from frontmatter");
    expect(mdxGuide).toContain("generateMetadata");
    expect(mdxGuide).toContain("title");
    expect(mdxGuide).toContain("description");
    expect(mdxGuide).toContain("## Prerender MDX pages");
    expect(mdxGuide).toContain("export const prerender = true");
    expect(mdxGuide).toContain("generateStaticParams");
    expect(mdxGuide).toContain("## Server and client boundaries");
    expect(mdxGuide).toContain(".client.tsx");
    expect(mdxGuide).toContain("server-rendered content");
    expect(mdxGuide).toContain("## Content authoring notes");
    expect(mdxGuide).toContain("Do not execute untrusted MDX");
    expect(mdxGuide).toContain("## Related pages");
    expect(mdxGuide).toContain("[Vite Plugin Integration](/guides/advanced/vite-plugin-integration/)");
    expect(mdxGuide).toContain("[SSG and Static Export](/guides/ssg-and-static-export/)");
    expect(mdxGuide).toContain("[Metadata and Head](/guides/metadata-and-head/)");
  });

  test("documents i18n messages, locale detection, params, metadata, cookies, caching, and client boundaries", async () => {
    const i18nGuide = await readDocsSite("src/content/guides/advanced/i18n.mdx");

    expect(i18nGuide).toContain("## What Mreact provides");
    expect(i18nGuide).toContain("defineMessages()");
    expect(i18nGuide).toContain("detectLocale()");
    expect(i18nGuide).toContain("URL path prefix");
    expect(i18nGuide).toContain("Accept-Language");
    expect(i18nGuide).toContain("defaultLocale");
    expect(i18nGuide).toContain("## Define locales and messages");
    expect(i18nGuide).toContain("SUPPORTED_LOCALES");
    expect(i18nGuide).toContain("DEFAULT_LOCALE");
    expect(i18nGuide).toContain("type Locale");
    expect(i18nGuide).toContain("messages[locale]");
    expect(i18nGuide).toContain("## Detect locale in a loader");
    expect(i18nGuide).toContain("LoaderContext");
    expect(i18nGuide).toContain("detectLocale<Locale>");
    expect(i18nGuide).toContain("source: \"path\"");
    expect(i18nGuide).toContain("source: \"accept-language\"");
    expect(i18nGuide).toContain("definePage<typeof loader>");
    expect(i18nGuide).toContain("Link");
    expect(i18nGuide).toContain("## Route params for nested locale routes");
    expect(i18nGuide).toContain("src/app/i18n/$locale/page.tsx");
    expect(i18nGuide).toContain("context.params.locale");
    expect(i18nGuide).toContain("notFound()");
    expect(i18nGuide).toContain("## Set html lang and alternate links");
    expect(i18nGuide).toContain("generateMetadata");
    expect(i18nGuide).toContain("lang: data.locale");
    expect(i18nGuide).toContain("hreflang");
    expect(i18nGuide).toContain("rel: \"alternate\"");
    expect(i18nGuide).toContain("## Persist a locale preference");
    expect(i18nGuide).toContain("setCookie");
    expect(i18nGuide).toContain("locale=");
    expect(i18nGuide).toContain("sameSite: \"Lax\"");
    expect(i18nGuide).toContain("## Caching and redirects");
    expect(i18nGuide).toContain("Vary: Accept-Language");
    expect(i18nGuide).toContain("Prefer locale prefixes");
    expect(i18nGuide).toContain("## Client boundaries");
    expect(i18nGuide).toContain(".client.tsx");
    expect(i18nGuide).toContain('import { cell } from "@reckona/mreact-reactive-core";');
    expect(i18nGuide).not.toContain('import { cell } from "@reckona/mreact";');
    expect(i18nGuide).toContain("serializable");
    expect(i18nGuide).toContain("## Related pages");
    expect(i18nGuide).toContain("[Routing](/guides/routing/)");
    expect(i18nGuide).toContain("[Data Loading](/guides/data-loading/)");
    expect(i18nGuide).toContain("[Metadata and Head](/guides/metadata-and-head/)");
    expect(i18nGuide).toContain("[Cookies and Sessions](/guides/cookies-and-sessions/)");
  });

  test("documents Vite plugin forwarding, config shape, build targets, define values, import policy, and limits", async () => {
    const vitePluginGuide = await readDocsSite(
      "src/content/guides/advanced/vite-plugin-integration.mdx",
    );

    expect(vitePluginGuide).toContain("## What gets forwarded");
    expect(vitePluginGuide).toContain("route-agnostic Vite plugins");
    expect(vitePluginGuide).toContain("after removing the `mreactRouter()` plugin");
    expect(vitePluginGuide).toContain("server, client, Cloudflare, and prerender builds");
    expect(vitePluginGuide).toContain("loaders");
    expect(vitePluginGuide).toContain("middleware");
    expect(vitePluginGuide).toContain("route handlers");
    expect(vitePluginGuide).toContain("generateStaticParams()");
    expect(vitePluginGuide).toContain("## Configure plugins in vite.config.ts");
    expect(vitePluginGuide).toContain('import mdx from "@mdx-js/rollup";');
    expect(vitePluginGuide).toContain('import tailwindcss from "@tailwindcss/vite";');
    expect(vitePluginGuide).toContain('import { mreactRouter } from "@reckona/mreact-router/vite";');
    expect(vitePluginGuide).toContain("plugins: [");
    expect(vitePluginGuide).toContain("mreactRouter({");
    expect(vitePluginGuide).toContain('routesDir: "src/app"');
    expect(vitePluginGuide).toContain('allowedSourceDirs: ["src"]');
    expect(vitePluginGuide).toContain("## Use custom content transforms");
    expect(vitePluginGuide).toContain('name: "content-fixture"');
    expect(vitePluginGuide).toContain("transform(code, id)");
    expect(vitePluginGuide).toContain('id.endsWith(".fixture")');
    expect(vitePluginGuide).toContain("## CSS plugins");
    expect(vitePluginGuide).toContain("@tailwindcss/vite");
    expect(vitePluginGuide).toContain("@source");
    expect(vitePluginGuide).toContain("## Define values");
    expect(vitePluginGuide).toContain("define:");
    expect(vitePluginGuide).toContain("import.meta.env");
    expect(vitePluginGuide).toContain("build-time values");
    expect(vitePluginGuide).toContain("Do not put secrets");
    expect(vitePluginGuide).toContain("## Import policy and source roots");
    expect(vitePluginGuide).toContain("allowedSourceDirs");
    expect(vitePluginGuide).toContain("projectRoot");
    expect(vitePluginGuide).toContain("relative imports");
    expect(vitePluginGuide).toContain("tsconfig path alias");
    expect(vitePluginGuide).toContain("## Plugin constraints");
    expect(vitePluginGuide).toContain("deterministic");
    expect(vitePluginGuide).toContain("SSR");
    expect(vitePluginGuide).toContain("dev-server-only");
    expect(vitePluginGuide).toContain("## Troubleshooting");
    expect(vitePluginGuide).toContain("Cannot resolve");
    expect(vitePluginGuide).toContain("missing module declaration");
    expect(vitePluginGuide).toContain("## Related pages");
    expect(vitePluginGuide).toContain("[MDX](/guides/advanced/mdx/)");
    expect(vitePluginGuide).toContain("[CSS and Assets](/guides/css-and-assets/)");
    expect(vitePluginGuide).toContain("[Environment Variables](/guides/environment-variables/)");
    expect(vitePluginGuide).toContain("[Config](/reference/config/)");
  });

  test("documents page data loading with loaders, params, request data, and metadata", async () => {
    const dataLoading = await readDocsSite("src/content/guides/data-loading.mdx");

    expect(dataLoading).toContain("## Load data before render");
    expect(dataLoading).toContain("src/app/users/$id/page.tsx");
    expect(dataLoading).toContain("The `$id` directory segment becomes `context.params.id`");
    expect(dataLoading).toContain("export async function loader");
    expect(dataLoading).toContain("type LoaderContext");
    expect(dataLoading).toContain("definePage<typeof loader>");
    expect(dataLoading).toContain("props.data");
    expect(dataLoading).toContain("## Read params and request");
    expect(dataLoading).toContain("context.params.id");
    expect(dataLoading).toContain("new URL(context.request.url)");
    expect(dataLoading).toContain("searchParams");
    expect(dataLoading).toContain("## Return typed data");
    expect(dataLoading).toContain("interface UserData");
    expect(dataLoading).toContain("Promise<UserData>");
    expect(dataLoading).toContain("## Infer page props from the loader");
    expect(dataLoading).toContain("props.params.id");
    expect(dataLoading).toContain("## Handle missing data and redirects");
    expect(dataLoading).toContain("throwNotFound()");
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

  test("documents middleware matchers, control flow, rewrites, and route-local skips", async () => {
    const middleware = await readDocsSite("src/content/guides/middleware.mdx");

    expect(middleware).toContain("## Add middleware");
    expect(middleware).toContain("src/app/middleware.ts");
    expect(middleware).toContain('export const config = { matcher: ["/admin/:path*", "/blocked"] };');
    expect(middleware).toContain("return next();");
    expect(middleware).toContain("return new Response");
    expect(middleware).toContain("redirect(\"/login\")");
    expect(middleware).toContain("## Use matchers to avoid unnecessary imports");
    expect(middleware).toContain("middleware module itself is not imported");
    expect(middleware).toContain("## Rewrite without changing the browser URL");
    expect(middleware).toContain("rewrite(\"/login\")");
    expect(middleware).toContain("## Read headers, cookies, and URL data");
    expect(middleware).toContain("cookies(request)");
    expect(middleware).toContain("headers(request)");
    expect(middleware).toContain("## Skip middleware for a route");
    expect(middleware).toContain("export const middleware = { skip: true };");
    expect(middleware).toContain('export const config = { id: "auth", matcher: "/admin/:path*" };');
    expect(middleware).toContain('export const middleware = { skip: ["auth"] };');
    expect(middleware).toContain("## When not to use middleware");
    expect(middleware).toContain("[Authentication](/guides/authentication/)");
    expect(middleware).toContain("[Cookies and Sessions](/guides/cookies-and-sessions/)");
    expect(middleware).toContain("[HTTP APIs](/guides/http-apis/)");
    expect(middleware).toContain("[Host Policy and Proxies](/deployments/host-policy-and-proxies/)");
  });

  test("documents server actions for form mutations, revalidation, production dispatch, and limits", async () => {
    const serverActions = await readDocsSite("src/content/guides/server-actions.mdx");

    expect(serverActions).toContain("## What server actions are for");
    expect(serverActions).toContain("form-first mutations");
    expect(serverActions).toContain("[HTTP APIs](/guides/http-apis/)");
    expect(serverActions).toContain("## Create a form action");
    expect(serverActions).toContain("src/app/notes/actions.ts");
    expect(serverActions).toContain('"use server";');
    expect(serverActions).toContain("FormData");
    expect(serverActions).toContain("## Refresh a list after creating a record");
    expect(serverActions).toContain("src/app/notes/page.tsx");
    expect(serverActions).toContain("listNotes");
    expect(serverActions).toContain('import { Link } from "@reckona/mreact-router/link";');
    expect(serverActions).toContain("<Link href={`/notes/${note.id}`}>{note.title}</Link>");
    expect(serverActions).toContain("<ul>");
    expect(serverActions).toContain("notes.map");
    expect(serverActions).toContain("definePage<typeof loader>");
    expect(serverActions).toContain("## Redirect to the created record");
    expect(serverActions).toContain('redirect(`/notes/${note.id}`)');
    expect(serverActions).toContain("revalidatePath(\"/notes\")");
    expect(serverActions).toContain("revalidatePath(`/notes/${note.id}`)");
    expect(serverActions).toContain("The browser follows the redirect");
    expect(serverActions).toContain('action={saveNote}');
    expect(serverActions).toContain("## Use request context");
    expect(serverActions).toContain("ServerActionContext");
    expect(serverActions).toContain("context.cookies.get");
    expect(serverActions).toContain("context.headers.get");
    expect(serverActions).toContain("## Revalidate cached routes");
    expect(serverActions).toContain("revalidatePath(\"/notes\")");
    expect(serverActions).toContain("export const revalidate = 60");
    expect(serverActions).toContain("single-flight mutation response");
    expect(serverActions).toContain("x-mreact-action-single-flight");
    expect(serverActions).toContain("current route");
    expect(serverActions).toContain("without a second GET");
    expect(serverActions).toContain("unsupported flows");
    expect(serverActions).toContain("x-mreact-revalidate");
    expect(serverActions).toContain("## Single-flight mutation responses");
    expect(serverActions).toContain("Server action nonce replay protection");
    expect(serverActions).toContain("## Application idempotency keys");
    expect(serverActions).toContain("mutationKey");
    expect(serverActions).toContain("const inFlight = new Map<string, Promise<void>>();");
    expect(serverActions).toContain("context.cookies.get(\"session\")");
    expect(serverActions).toContain("inFlight.delete(key)");
    expect(serverActions).toContain("durable store");
    expect(serverActions).toContain("database unique constraint");
    expect(serverActions).toContain("## How actions are inferred");
    expect(serverActions).toContain("actions.save");
    expect(serverActions).toContain("production client bundles");
    expect(serverActions).toContain("## Production dispatch and manifests");
    expect(serverActions).toContain("fail-closed");
    expect(serverActions).toContain('serverActions: { allowedActions: "any" }');
    expect(serverActions).toContain("## Limits and security");
    expect(serverActions).toContain("10 MiB");
    expect(serverActions).toContain("maxBodyBytes");
    expect(serverActions).toContain("maxFormFields");
    expect(serverActions).toContain("MREACT_SERVER_ACTION_SECRET");
    expect(serverActions).toContain("CSRF");
    expect(serverActions).toContain("## When not to use server actions");
    expect(serverActions).toContain("[Forms and Validation](/guides/forms-and-validation/)");
    expect(serverActions).toContain("[Cache and Revalidation](/guides/cache-and-revalidation/)");
    expect(serverActions).toContain("[Environment Variables](/guides/environment-variables/)");
    expect(serverActions).toContain("[Logging and Diagnostics](/deployments/logging-and-diagnostics/)");
    expect(serverActions).toContain("[Route Module Exports](/reference/route-module-exports/)");
  });

  test("documents route HTML cache, runtime cache control, invalidation, and shared cache adapters", async () => {
    const cacheGuide = await readDocsSite("src/content/guides/cache-and-revalidation.mdx");

    expect(cacheGuide).toContain("## What Mreact caches");
    expect(cacheGuide).toContain("route HTML");
    expect(cacheGuide).toContain("not a loader data cache");
    expect(cacheGuide).toContain("per-request QueryClient");
    expect(cacheGuide).toContain("Authorization");
    expect(cacheGuide).toContain("Set-Cookie");
    expect(cacheGuide).toContain("private, no-store");
    expect(cacheGuide).toContain("## Cache route HTML with revalidate");
    expect(cacheGuide).toContain("export const revalidate = 60");
    expect(cacheGuide).toContain("s-maxage=60, stale-while-revalidate");
    expect(cacheGuide).toContain("export const revalidate = 0");
    expect(cacheGuide).toContain("no-store");
    expect(cacheGuide).toContain("## Set cache policy at runtime");
    expect(cacheGuide).toContain("cacheControl({");
    expect(cacheGuide).toContain("maxAge");
    expect(cacheGuide).toContain("sMaxAge");
    expect(cacheGuide).toContain("staleWhileRevalidate");
    expect(cacheGuide).toContain("## Invalidate after mutations");
    expect(cacheGuide).toContain("revalidatePath(\"/notes\")");
    expect(cacheGuide).toContain("x-mreact-revalidate");
    expect(cacheGuide).toContain("## Client navigation cache");
    expect(cacheGuide).toContain("prefetched navigation HTML");
    expect(cacheGuide).toContain("single-flight mutation response");
    expect(cacheGuide).toContain("x-mreact-action-single-flight");
    expect(cacheGuide).toContain("without a second GET");
    expect(cacheGuide).toContain("Unsupported server action flows still fall back");
    expect(cacheGuide).not.toContain("does not yet attach refreshed route payloads");
    expect(cacheGuide).toContain("## Use a shared route cache");
    expect(cacheGuide).toContain("createMemoryRouteCache");
    expect(cacheGuide).toContain("AppRouterCache");
    expect(cacheGuide).toContain("deleteByPath(path)");
    expect(cacheGuide).toContain("routeCache");
    expect(cacheGuide).toContain("## Avoid accidental caching");
    expect(cacheGuide).toContain("Host is not part of the route cache key");
    expect(cacheGuide).toContain("[Data Loading](/guides/data-loading/)");
    expect(cacheGuide).toContain("[Server Actions](/guides/server-actions/)");
    expect(cacheGuide).toContain("[Cache API](/reference/cache-api/)");
    expect(cacheGuide).toContain("[Cache Policy](/deployments/cache-policy/)");
    expect(cacheGuide).toContain("[Logging and Diagnostics](/deployments/logging-and-diagnostics/)");
  });

  test("documents cookies, sessions, auth claims handoff, and production session constraints", async () => {
    const cookiesGuide = await readDocsSite("src/content/guides/cookies-and-sessions.mdx");

    expect(cookiesGuide).toContain("## Cookies vs sessions");
    expect(cookiesGuide).toContain("cookies(request)");
    expect(cookiesGuide).toContain("setCookie");
    expect(cookiesGuide).toContain("deleteCookie");
    expect(cookiesGuide).toContain("opaque session ID");
    expect(cookiesGuide).toContain("SessionStore");
    expect(cookiesGuide).toContain("## Read request cookies");
    expect(cookiesGuide).toContain('theme = cookieStore.get("theme")');
    expect(cookiesGuide).toContain("## Write and clear cookies");
    expect(cookiesGuide).toContain('setCookie(response, "theme", "dark"');
    expect(cookiesGuide).toContain("SameSite=None requires `Secure`");
    expect(cookiesGuide).toContain("## Create a session store");
    expect(cookiesGuide).toContain("createMemorySessionStore");
    expect(cookiesGuide).toContain("durable session store");
    expect(cookiesGuide).toContain("## Create and destroy sessions");
    expect(cookiesGuide).toContain("src/app/api/login/route.ts");
    expect(cookiesGuide).toContain("createSession(response, sessions");
    expect(cookiesGuide).toContain("redirect303");
    expect(cookiesGuide).toContain("destroySession(request, response, sessions");
    expect(cookiesGuide).toContain("__Host-mreact.session");
    expect(cookiesGuide).toContain("HttpOnly");
    expect(cookiesGuide).toContain("Secure");
    expect(cookiesGuide).toContain("SameSite=Lax");
    expect(cookiesGuide).toContain("## Read sessions in middleware and loaders");
    expect(cookiesGuide).toContain("getSession(request, sessions)");
    expect(cookiesGuide).toContain("getCurrentSession");
    expect(cookiesGuide).toContain("requireRole");
    expect(cookiesGuide).toContain("## Refresh, rotate, and revoke");
    expect(cookiesGuide).toContain("rotateSession");
    expect(cookiesGuide).toContain("refreshSession");
    expect(cookiesGuide).toContain("revokeCurrentSession");
    expect(cookiesGuide).toContain("## Client claims handoff");
    expect(cookiesGuide).toContain('export const auth = "include-claims"');
    expect(cookiesGuide).toContain("getSessionClaims");
    expect(cookiesGuide).toContain("serializeClaims");
    expect(cookiesGuide).toContain("## Production notes");
    expect(cookiesGuide).toContain("cookie-authenticated POST");
    expect(cookiesGuide).toContain("CSRF");
    expect(cookiesGuide).toContain("private, no-store");
    expect(cookiesGuide).toContain("[Authentication](/guides/authentication/)");
    expect(cookiesGuide).toContain("[Middleware](/guides/middleware/)");
    expect(cookiesGuide).toContain("[HTTP APIs](/guides/http-apis/)");
    expect(cookiesGuide).toContain("[Cache and Revalidation](/guides/cache-and-revalidation/)");
  });

  test("documents authentication guards, authorization policies, client claims, and API behavior", async () => {
    const authGuide = await readDocsSite("src/content/guides/authentication.mdx");

    expect(authGuide).toContain("## What authentication covers");
    expect(authGuide).toContain("@reckona/mreact-auth");
    expect(authGuide).toContain("does not provide a login provider");
    expect(authGuide).toContain("session store");
    expect(authGuide).toContain("## Configure auth defaults");
    expect(authGuide).toContain("configureAuth({");
    expect(authGuide).toContain('redirectTo: "/login"');
    expect(authGuide).toContain('forbiddenTo: "/forbidden"');
    expect(authGuide).toContain("serializeClaims");
    expect(authGuide).toContain("## Create sessions during login");
    expect(authGuide).toContain("createSession(response, sessions");
    expect(authGuide).toContain("roles");
    expect(authGuide).toContain("permissions");
    expect(authGuide).toContain("## Require a signed-in user");
    expect(authGuide).toContain("requireSession(context.request, sessions)");
    expect(authGuide).toContain("redirects to the configured login route");
    expect(authGuide).toContain("## Require roles and permissions");
    expect(authGuide).toContain("requireRole(context.request, sessions, \"admin\")");
    expect(authGuide).toContain("requirePermission(");
    expect(authGuide).toContain("\"billing:read\"");
    expect(authGuide).toContain("\"invoice:export\"");
    expect(authGuide).toContain('mode: "all"');
    expect(authGuide).toContain("## Render different UI without redirecting");
    expect(authGuide).toContain("tryRequireRole");
    expect(authGuide).toContain("tryRequirePermission");
    expect(authGuide).toContain("missing-session");
    expect(authGuide).toContain("## Expose safe claims to client code");
    expect(authGuide).toContain('export const auth = "include-claims"');
    expect(authGuide).toContain("getSessionClaims");
    expect(authGuide).toContain("Do not expose access tokens");
    expect(authGuide).toContain("## Use auth in HTTP APIs");
    expect(authGuide).toContain("authorizeSession");
    expect(authGuide).toContain("Response.json({ error: \"Unauthorized\" }, { status: 401 })");
    expect(authGuide).toContain("Response.json({ error: \"Forbidden\" }, { status: 403 })");
    expect(authGuide).toContain("## Production checklist");
    expect(authGuide).toContain("durable session store");
    expect(authGuide).toContain("CSRF");
    expect(authGuide).toContain("Never rely on client-only checks");
    expect(authGuide).toContain("[Cookies and Sessions](/guides/cookies-and-sessions/)");
    expect(authGuide).toContain("[Middleware](/guides/middleware/)");
    expect(authGuide).toContain("[HTTP APIs](/guides/http-apis/)");
    expect(authGuide).toContain("[Server Actions](/guides/server-actions/)");
    expect(authGuide).toContain("[Environment Variables](/guides/environment-variables/)");
    expect(authGuide).toContain("[Host Policy and Proxies](/deployments/host-policy-and-proxies/)");
    expect(authGuide).toContain("[Logging and Diagnostics](/deployments/logging-and-diagnostics/)");
  });

  test("documents reactive forms, validation modes, server errors, schema output, and mutation choices", async () => {
    const formsGuide = await readDocsSite("src/content/guides/forms-and-validation.mdx");

    expect(formsGuide).toContain("## What this page covers");
    expect(formsGuide).toContain("@reckona/mreact-forms");
    expect(formsGuide).toContain("does not choose the mutation transport");
    expect(formsGuide).toContain("## Create a reactive form");
    expect(formsGuide).toContain("createForm<ContactValues>");
    expect(formsGuide).toContain("initialValues");
    expect(formsGuide).toContain("form.state.get()");
    expect(formsGuide).toContain("dirty");
    expect(formsGuide).toContain("valid");
    expect(formsGuide).toContain("submitting");
    expect(formsGuide).toContain("submitCount");
    expect(formsGuide).toContain("## Bind fields");
    expect(formsGuide).toContain("form.field(\"email\")");
    expect(formsGuide).toContain("setValue");
    expect(formsGuide).toContain("blur()");
    expect(formsGuide).toContain("field.bind({ event: \"change\" })");
    expect(formsGuide).toContain("## Validate fields");
    expect(formsGuide).toContain("validateOn: [\"blur\", \"submit\"]");
    expect(formsGuide).toContain("async");
    expect(formsGuide).toContain("readonly string[] | string | undefined");
    expect(formsGuide).toContain("## Submit valid values");
    expect(formsGuide).toContain("form.submit");
    expect(formsGuide).toContain("status === \"success\"");
    expect(formsGuide).toContain("status === \"invalid\"");
    expect(formsGuide).toContain("status === \"error\"");
    expect(formsGuide).toContain("form.reset()");
    expect(formsGuide).toContain("## Map server errors");
    expect(formsGuide).toContain("setServerErrors");
    expect(formsGuide).toContain("fieldErrors");
    expect(formsGuide).toContain("formErrors");
    expect(formsGuide).toContain("server validation");
    expect(formsGuide).toContain("## Use Standard Schema");
    expect(formsGuide).toContain("Zod v4");
    expect(formsGuide).toContain("Valibot");
    expect(formsGuide).toContain("Standard Schema");
    expect(formsGuide).toContain("z.input");
    expect(formsGuide).toContain("z.output");
    expect(formsGuide).toContain("seats");
    expect(formsGuide).toContain("## Choose a mutation path");
    expect(formsGuide).toContain("[Server Actions](/guides/server-actions/)");
    expect(formsGuide).toContain("[HTTP APIs](/guides/http-apis/)");
    expect(formsGuide).toContain("## Accessibility and UX notes");
    expect(formsGuide).toContain("aria-invalid");
    expect(formsGuide).toContain("aria-describedby");
    expect(formsGuide).toContain("noValidate");
    expect(formsGuide).toContain("## Production checklist");
    expect(formsGuide).toContain("Do not trust client validation");
    expect(formsGuide).toContain("CSRF");
    expect(formsGuide).toContain("rate limit");
    expect(formsGuide).toContain("PII");
    expect(formsGuide).toContain("[File Uploads and CSRF](/guides/file-uploads-and-csrf/)");
    expect(formsGuide).toContain("[Authentication](/guides/authentication/)");
    expect(formsGuide).toContain("[Cache and Revalidation](/guides/cache-and-revalidation/)");
  });

  test("documents testing strategy with unit, route, build, E2E, forms, security, and CI guidance", async () => {
    const testing = await readDocsSite("src/content/guides/testing.mdx");
    const nav = await readDocsSite("src/nav.config.ts");
    const contentRegistry = await readDocsSite("src/content-registry.ts");

    expect(nav).toContain('{ text: "Testing", slug: "guides/testing" }');
    expect(contentRegistry).toContain(
      'import guidesTesting, * as guidesTestingMeta from "./content/guides/testing.mdx";',
    );
    expect(contentRegistry).toContain('page("guides/testing", guidesTesting, guidesTestingMeta)');
    expect(testing).toContain("## Testing layers");
    expect(testing).toContain("Vitest");
    expect(testing).toContain("Playwright");
    expect(testing).toContain("route contract");
    expect(testing).toContain("## Unit test pure logic");
    expect(testing).toContain("defineMessages");
    expect(testing).toContain("detectLocale");
    expect(testing).toContain("## Test route rendering");
    expect(testing).toContain("renderAppRequest");
    expect(testing).toContain("LoaderContext");
    expect(testing).toContain("## Test built output");
    expect(testing).toContain("buildApp");
    expect(testing).toContain("renderBuiltAppRequest");
    expect(testing).toContain("mreact-router build");
    expect(testing).toContain("## Test server actions and HTTP APIs");
    expect(testing).toContain("FormData");
    expect(testing).toContain("__mreact_csrf");
    expect(testing).toContain("Response.json");
    expect(testing).toContain("## Browser E2E with Playwright");
    expect(testing).toContain("startDevServer");
    expect(testing).toContain("test.afterAll");
    expect(testing).toContain("await server.close()");
    expect(testing).toContain("## What to assert for SSR");
    expect(testing).toContain("initial HTML");
    expect(testing).toContain("hydration");
    expect(testing).toContain("navigation runtime");
    expect(testing).toContain("## CI checklist");
    expect(testing).toContain("pnpm vitest run");
    expect(testing).toContain("pnpm --filter");
    expect(testing).toContain("pnpm test:e2e");
    expect(testing).toContain("[Data Loading](/guides/data-loading/)");
    expect(testing).toContain("[Server Actions](/guides/server-actions/)");
    expect(testing).toContain("[HTTP APIs](/guides/http-apis/)");
    expect(testing).toContain("[Forms and Validation](/guides/forms-and-validation/)");
    expect(testing).toContain("[SSR and Streaming](/guides/ssr-and-streaming/)");
  });

  test("documents metadata composition, generated metadata, head descriptors, CSP, and metadata routes", async () => {
    const metadataGuide = await readDocsSite("src/content/guides/metadata-and-head.mdx");

    expect(metadataGuide).toContain("## What metadata controls");
    expect(metadataGuide).toContain("title");
    expect(metadataGuide).toContain("description");
    expect(metadataGuide).toContain("canonical");
    expect(metadataGuide).toContain("Open Graph");
    expect(metadataGuide).toContain("themeColor");
    expect(metadataGuide).toContain("viewport");
    expect(metadataGuide).toContain("lang");
    expect(metadataGuide).toContain("## Static metadata");
    expect(metadataGuide).toContain("export const metadata");
    expect(metadataGuide).toContain("satisfies RouteMetadata");
    expect(metadataGuide).toContain("robots: { index: true, follow: true }");
    expect(metadataGuide).toContain("## Metadata composition");
    expect(metadataGuide).toContain("layout");
    expect(metadataGuide).toContain("page wins");
    expect(metadataGuide).toContain("metadata.head");
    expect(metadataGuide).toContain("## Generate request-aware metadata");
    expect(metadataGuide).toContain("generateMetadata(context)");
    expect(metadataGuide).toContain("context.params.id");
    expect(metadataGuide).toContain("context.request");
    expect(metadataGuide).toContain("## Use loader data in metadata");
    expect(metadataGuide).toContain("generateMetadata({ data }");
    expect(metadataGuide).toContain("RouteMetadata");
    expect(metadataGuide).toContain("## Open Graph, icons, robots, and viewport");
    expect(metadataGuide).toContain("openGraph");
    expect(metadataGuide).toContain("icons");
    expect(metadataGuide).toContain("viewport: { width: \"device-width\"");
    expect(metadataGuide).toContain("## Custom head descriptors");
    expect(metadataGuide).toContain('tag: "meta"');
    expect(metadataGuide).toContain('tag: "script"');
    expect(metadataGuide).toContain("event handler attributes are rejected");
    expect(metadataGuide).toContain("unsafe URL values");
    expect(metadataGuide).toContain("## CSP nonce and external scripts");
    expect(metadataGuide).toContain("csp: {");
    expect(metadataGuide).toContain("nonce: true");
    expect(metadataGuide).toContain("[External Scripts](/guides/external-scripts/)");
    expect(metadataGuide).toContain("## Security headers from metadata");
    expect(metadataGuide).toContain("referrerPolicy");
    expect(metadataGuide).toContain("frameOptions");
    expect(metadataGuide).toContain("permissionsPolicy");
    expect(metadataGuide).toContain("hsts");
    expect(metadataGuide).toContain("## Metadata routes and file conventions");
    expect(metadataGuide).toContain("icon");
    expect(metadataGuide).toContain("apple-icon");
    expect(metadataGuide).toContain("opengraph-image");
    expect(metadataGuide).toContain("robots");
    expect(metadataGuide).toContain("sitemap");
    expect(metadataGuide).toContain("## Head updates during client navigation");
    expect(metadataGuide).toContain("client navigation");
    expect(metadataGuide).toContain("managed head metadata");
    expect(metadataGuide).toContain("## Production checklist");
    expect(metadataGuide).toContain("canonical URL");
    expect(metadataGuide).toContain("Host Policy and Proxies");
    expect(metadataGuide).toContain("Do not put secrets or PII in metadata");
    expect(metadataGuide).toContain("[Data Loading](/guides/data-loading/)");
    expect(metadataGuide).toContain("[CSP](/guides/csp/)");
    expect(metadataGuide).toContain("[Cache and Revalidation](/guides/cache-and-revalidation/)");
    expect(metadataGuide).toContain("[Host Policy and Proxies](/deployments/host-policy-and-proxies/)");
    expect(metadataGuide).toContain("[SSG and Static Export](/guides/ssg-and-static-export/)");
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

  test("documents deployment operations without a standalone production checklist page", async () => {
    const nav = await readDocsSite("src/nav.config.ts");
    const contentRegistry = await readDocsSite("src/content-registry.ts");
    const hostPolicy = await readDocsSite("src/content/deployments/host-policy-and-proxies.mdx");
    const sourceMaps = await readDocsSite("src/content/deployments/source-maps.mdx");
    const logging = await readDocsSite("src/content/deployments/logging-and-diagnostics.mdx");
    const cdnAssets = await readDocsSite("src/content/deployments/cdn-assets.mdx");
    const cachePolicy = await readDocsSite("src/content/deployments/cache-policy.mdx");
    const cloudflare = await readDocsSite("src/content/deployments/cloudflare.mdx");
    const awsLambda = await readDocsSite("src/content/deployments/aws-lambda.mdx");
    const container = await readDocsSite("src/content/deployments/container-and-cloud-run.mdx");
    const staticHosting = await readDocsSite("src/content/deployments/static-hosting.mdx");

    expect(nav).not.toContain("Production Checklist");
    expect(contentRegistry).not.toContain("production-checklist.mdx");
    expect(contentRegistry).not.toContain('page("deployments/production-checklist"');
    await expect(
      access(join(docsSiteRoot, "src", "content", "deployments", "production-checklist.mdx")),
    ).rejects.toThrow();

    expect(hostPolicy).toContain("## What host policy protects");
    expect(hostPolicy).toContain("Host header");
    expect(hostPolicy).toContain("allowedHosts");
    expect(hostPolicy).toContain('hostPolicy: "strict"');
    expect(hostPolicy).toContain("port: Number(process.env.PORT ?? 3001)");
    expect(hostPolicy).toContain("MREACT_ROUTER_ALLOWED_HOSTS");
    expect(hostPolicy).toContain("trusted-proxy");
    expect(hostPolicy).toContain("X-Forwarded-Host");
    expect(hostPolicy).toContain("Cloud Run");
    expect(hostPolicy).toContain("AWS Lambda");
    expect(hostPolicy).toContain("[Environment Variables](/guides/environment-variables/)");
    expect(hostPolicy).toContain("[Authentication](/guides/authentication/)");

    expect(sourceMaps).toContain("Production client source maps are disabled by default");
    expect(sourceMaps).toContain('clientSourceMaps: "hidden"');
    expect(sourceMaps).toContain("mreact-router build --client-source-maps=hidden");
    expect(sourceMaps).toContain(".mreact/source-maps/client/");
    expect(sourceMaps).toContain("Sentry");
    expect(sourceMaps).toContain("release");
    expect(sourceMaps).toContain("Do not copy `.mreact/source-maps`");
    expect(sourceMaps).toContain("[Logging and Diagnostics](/deployments/logging-and-diagnostics/)");

    expect(logging).toContain("## Request logs");
    expect(logging).toContain("mreact-router start .mreact --log=requests");
    expect(logging).toContain("MREACT_ROUTER_LOG=requests");
    expect(logging).toContain("method, path, status, duration");
    expect(logging).toContain("Do not log cookies");
    expect(logging).toContain("traceparent");
    expect(logging).toContain("instrumentation");
    expect(logging).toContain("port: Number(process.env.PORT ?? 3001)");
    expect(logging).toContain("AWS Lambda");
    expect(logging).toContain("[Testing](/guides/testing/)");

    expect(cdnAssets).toContain("## What moves to the CDN");
    expect(cdnAssets).toContain("assetBaseUrl");
    expect(cdnAssets).toContain("publicAssetBaseUrl");
    expect(cdnAssets).toContain(".mreact/client/");
    expect(cdnAssets).toContain("same release transaction");
    expect(cdnAssets).toContain("Cache-Control: public, max-age=31536000, immutable");
    expect(cdnAssets).toContain("HTML routes still come from the app origin");
    expect(cdnAssets).toContain("[Cache Policy](/deployments/cache-policy/)");

    expect(cachePolicy).toContain("## Route HTML");
    expect(cachePolicy).toContain("cacheControl()");
    expect(cachePolicy).toContain("revalidatePath");
    expect(cachePolicy).toContain("Authorization");
    expect(cachePolicy).toContain("Set-Cookie");
    expect(cachePolicy).toContain("## Hashed client assets");
    expect(cachePolicy).toContain("immutable");
    expect(cachePolicy).toContain("## Public assets");
    expect(cachePolicy).toContain("## Release order");
    expect(cachePolicy).toContain("[CDN Assets](/deployments/cdn-assets/)");

    expect(cloudflare).toContain("mreact-router build --target=cloudflare");
    expect(cloudflare).toContain("mreact-router package cloudflare-pages --from .mreact --out .mreact/pages");
    expect(cloudflare).toContain("wrangler pages deploy .mreact/pages");
    expect(cloudflare).toContain("context.env");
    expect(cloudflare).toContain("ASSETS");
    expect(cloudflare).toContain("allowed manifest assets");
    expect(cloudflare).toContain("clientSourceMaps: \"hidden\"");
    expect(cloudflare).toContain("[Host Policy and Proxies](/deployments/host-policy-and-proxies/)");

    expect(awsLambda).toContain("mreact-router build --target=aws-lambda");
    expect(awsLambda).toContain("mreact-router package aws-lambda --from .mreact --out .lambda");
    expect(awsLambda).toContain("API Gateway HTTP API v2");
    expect(awsLambda).toContain("Lambda Function URL");
    expect(awsLambda).toContain("createPreloadedAwsLambdaRequestHandler");
    expect(awsLambda).toContain("/tmp");
    expect(awsLambda).toContain("250 MB");
    expect(awsLambda).toContain("--config.node-linker=hoisted");
    expect(awsLambda).toContain("find .lambda -type l");
    expect(awsLambda).toContain("MREACT_SERVER_ACTION_SECRET");
    expect(awsLambda).toContain("[Logging and Diagnostics](/deployments/logging-and-diagnostics/)");

    expect(container).toContain("mreact-router build --target=node");
    expect(container).toContain("mreact-router start .mreact");
    expect(container).toContain("HOST=0.0.0.0");
    expect(container).toContain("PORT");
    expect(container).toContain("MREACT_ROUTER_HOST_POLICY=strict");
    expect(container).toContain("Cloud Run injects `PORT`");
    expect(container).toContain("AWS App Runner");
    expect(container).toContain("Fly.io");
    expect(container).toContain("podman build");
    expect(container).toContain("health check");
    expect(container).toContain("Containerfile");
    expect(container).toContain("[CDN Assets](/deployments/cdn-assets/)");

    expect(staticHosting).toContain("exportStaticApp");
    expect(staticHosting).toContain("mreact-router build --target=node");
    expect(staticHosting).toContain(".nojekyll");
    expect(staticHosting).toContain("404.html");
    expect(staticHosting).toContain("base path");
    expect(staticHosting).toContain("GitHub Pages");
    expect(staticHosting).toContain("Only prerendered routes");
    expect(staticHosting).toContain("route handlers");
    expect(staticHosting).toContain("[SSG and Static Export](/guides/ssg-and-static-export/)");
  });

  test("renders readable document lists and the latest benchmark run", async () => {
    const css = await readDocsSite("src/app/globals.css");
    const benchmarks = await readDocsSite("src/content/benchmarks.mdx");
    const benchmarkData = await readDocsSite("src/benchmark-results.ts");
    const benchmarkResults = await readDocsSite("src/ui/BenchmarkResults.tsx");
    const benchmarkFilters = await readDocsSite("public/docs-benchmarks.js");
    const benchmarkSync = await readDocsSite("scripts/sync-benchmark-results.ts");
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
    expect(benchmarkData).toContain("Generated by scripts/sync-benchmark-results.ts");
    expect(benchmarkData).toMatch(/"path": "benchmarks\/results\/\d{4}-\d{2}-\d{2}\/\d{3}"/);
    expect(benchmarkData).toContain("primitive.md");
    expect(benchmarkData).toContain("router.md");
    expect(benchmarkData).toContain("primitive-browser.md");
    expect(benchmarkData).toContain('"cardCount": 15');
    expect(benchmarkData).toContain('"cardCount": 37');
    expect(benchmarkData).toContain('"cardCount": 4');
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
    expect(benchmarkResults).toContain("benchmarkRunLabel(latestBenchmarkRun.path)");
    expect(benchmarkResults).not.toContain("Run 2026-06-07/002");
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
    expect(benchmarkSync).toContain("findLatestCompleteBenchmarkRun");
    expect(benchmarkSync).toContain("primitive.md");
    expect(benchmarkSync).toContain("router.md");
    expect(benchmarkSync).toContain("primitive-browser.md");
    expect(benchmarkSync).toContain("env.json");
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
    expect(css).toContain(".site-icon-control");
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
    const benchmarkWorkflow = await readFile(
      join(root, ".github", "workflows", "benchmarks.yml"),
      "utf8",
    );

    expect(workflow).toContain("actions/configure-pages");
    expect(workflow).toContain("actions/upload-pages-artifact");
    expect(workflow).toContain("actions/deploy-pages");
    expect(workflow).toContain("steps.pages.outputs.base_path");
    expect(workflow).toContain("MREACT_DOCS_BASE_PATH");
    expect(workflow).toContain("examples/docs-site/dist");
    expect(workflow).toContain("pnpm --filter @reckona/example-docs-site build");
    expect(workflow).toContain("branches:\n      - main");
    expect(benchmarkWorkflow).toContain("workflow_dispatch");
    expect(benchmarkWorkflow).toContain("git add benchmarks/results");
    expect(benchmarkWorkflow).toContain('git push origin "HEAD:$GITHUB_REF_NAME"');

    const exportScript = await readDocsSite("scripts/export-static.ts");
    expect(exportScript).toContain("MREACT_DOCS_BASE_PATH");
    expect(exportScript).toContain("rewriteHtmlBasePaths");
    expect(exportScript).toContain("flattenHtmlRouteDirectories");
    expect(exportScript).toContain('entry.name.endsWith(".html")');
    expect(exportScript).toContain("await rename(tempFile, path)");
    expect(exportScript).not.toContain("copyGeneratedApiReference");
    expect(exportScript).not.toContain('join(process.cwd(), "..", "..", "docs", "api")');
    expect(exportScript).not.toContain('join(exportDir, "api")');
  });
});

async function readDocsSite(relativePath: string): Promise<string> {
  return await readFile(join(docsSiteRoot, relativePath), "utf8");
}
