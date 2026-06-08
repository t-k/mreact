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
    expect(nav).toContain('{ text: "Overview", slug: "" }');
    expect(nav).not.toContain('text: "Getting Started",\n    items: [{ text: "Getting Started", slug: "getting-started" }]');
    expect(nav).not.toContain('slug: "overview"');
  });

  test("uses official product branding while keeping package names lowercase", async () => {
    const layout = await readDocsSite("src/app/layout.tsx");
    const overview = await readDocsSite("src/content/overview.mdx");

    expect(layout).toContain("Mreact Docs");
    expect(layout).toContain('<meta charset="utf-8" />');
    expect(layout).toContain('<meta name="viewport" content="width=device-width, initial-scale=1" />');
    expect(layout).toContain("https://github.com/t-k/mreact");
    expect(layout).toContain('src={sitePath("docs-copy.js")}');
    expect(overview).toContain("# Mreact");
    expect(overview).toContain("Mreact is a [React](https://react.dev/)-flavored framework");
    expect(overview).toContain("## Motivations");
    expect(overview).toContain("## Status");
    expect(overview).toContain("## Performance");
    expect(overview).toContain("[Benchmarks](/benchmarks/)");
    expect(await readDocsSite("package.json")).toContain("@reckona/example-docs-site");
  });

  test("serves Overview only at the root route and keeps Benchmarks as the next page", async () => {
    const contentRegistry = await readDocsSite("src/content-registry.ts");
    const homePage = await readDocsSite("src/app/page.tsx");
    const exportScript = await readDocsSite("scripts/export-static.ts");

    expect(contentRegistry).toContain('import benchmarks, * as benchmarksMeta from "./content/benchmarks.mdx";');
    expect(contentRegistry).toContain('page("", overview, overviewMeta)');
    expect(contentRegistry).toContain('page("benchmarks", benchmarks, benchmarksMeta)');
    expect(contentRegistry).toContain('filter((slug) => slug !== "")');
    expect(contentRegistry).not.toContain('page("overview", overview, overviewMeta)');
    expect(homePage).toContain('pageForSlug("")');
    expect(homePage).toContain("Why Mreact exists, what it optimizes for, and how experimental it is today.");
    expect(homePage).not.toContain('pageForSlug("overview")');
    expect(exportScript).toContain("rm(exportDir");
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
    expect(copyScript).toContain("navigator.clipboard.writeText");
    expect(copyScript).toContain('document.execCommand("copy")');
    expect(viteConfig).toContain("rehype-highlight");
    expect(css).toContain(".hljs-keyword");
    expect(css).toContain(".code-block");
    expect(css).toContain(".code-copy");
  });

  test("keeps prose typography readable and aligned with the earlier docs site", async () => {
    const css = await readDocsSite("src/app/globals.css");

    expect(css).toContain("--bg: #fafaf9");
    expect(css).toContain("--text: #1c1917");
    expect(css).toContain("--brand: #92400e");
    expect(css).toContain("--bg: #0b0f1a");
    expect(css).toContain("--brand: #a5b4fc");
    expect(css).toContain("--code-panel-bg: #020617");
    expect(css).toContain("color-scheme: only dark");
    expect(css).toContain('-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif');
    expect(css).toContain("max-width: 720px");
    expect(css).toContain("line-height: 1.75");
    expect(css).toContain("margin: 16px 0");
    expect(css).toContain("text-wrap: balance");
    expect(css).toContain("text-wrap: pretty");
    expect(css).toContain(".site-source-link");
  });

  test("has source content for the critical launch pages", async () => {
    await expect(access(join(docsSiteRoot, "src", "content", "overview.mdx"))).resolves.toBeUndefined();

    for (const slug of requiredSlugs) {
      await expect(access(join(docsSiteRoot, "src", "content", `${slug}.mdx`))).resolves
        .toBeUndefined();
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
