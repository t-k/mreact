import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString, type ReactElement } from "@reckona/mreact";

export interface DocsPage {
  description: string;
  html: string;
  slug: string;
  title: string;
}

export interface DocsPageEntry {
  readonly file: string;
  readonly load?: (() => Promise<DocsPageModule>) | undefined;
  readonly options?: {
    readonly replacements?: (() => Promise<readonly HtmlReplacement[]> | readonly HtmlReplacement[]) | undefined;
  } | undefined;
  readonly slug: string;
}

export interface DocsPageModule {
  readonly default: () => ReactElement | null;
  readonly description?: string | undefined;
  readonly title?: string | undefined;
}

export interface DocsPageRegistry {
  allSlugs(): readonly string[];
  metadataForSlug(slug: string): DocsPageMetadata | undefined;
  pageForSlug(slug: string): Promise<DocsPage | undefined>;
}

export interface DocsPageMetadata {
  readonly description: string;
  readonly title: string;
}

export type RenderDocsPageEntry = (entry: DocsPageEntry) => Promise<DocsPage> | DocsPage;

function page(
  slug: string,
  file: string,
  options?: DocsPageEntry["options"],
): DocsPageEntry {
  return { file, options, slug };
}

async function renderDocsPage(entry: DocsPageEntry): Promise<DocsPage> {
  const module = await loadPageModule(entry);
  const renderedHtml = applyHtmlReplacements(
    renderToString(module.default),
    await (entry.options?.replacements?.() ?? []),
  );

  return {
    description: module.description ?? "Mreact documentation.",
    html: enhanceCodeBlocks(renderedHtml),
    slug: entry.slug,
    title: module.title ?? entry.slug,
  };
}

const contentModules = import.meta.glob<DocsPageModule>("./content/**/*.mdx");

async function loadPageModule(entry: DocsPageEntry): Promise<DocsPageModule> {
  if (entry.load !== undefined) {
    return await entry.load();
  }

  const load = contentModules[`./content/${entry.file}`];
  if (load === undefined) {
    throw new Error(`Missing docs content module: ${entry.file}`);
  }

  return await load();
}

export function createPageRegistry(
  entries: readonly DocsPageEntry[],
  renderEntry: RenderDocsPageEntry = renderDocsPage,
): DocsPageRegistry {
  const metadata = new Map<string, DocsPageMetadata>();
  const renderedPages = new Map<string, Promise<DocsPage>>();

  return {
    allSlugs: () => entries.map((entry) => entry.slug).filter((slug) => slug !== ""),
    metadataForSlug: (slug) => {
      const cached = metadata.get(slug);
      if (cached !== undefined) {
        return cached;
      }

      const found = entries.find((entry) => entry.slug === slug);
      if (found === undefined) {
        return undefined;
      }

      const loaded = readPageMetadata(found);
      metadata.set(slug, loaded);
      return loaded;
    },
    pageForSlug: async (slug) => {
      const cached = renderedPages.get(slug);
      if (cached !== undefined) {
        return await cached;
      }

      const found = entries.find((entry) => entry.slug === slug);
      if (found === undefined) {
        return undefined;
      }

      const rendered = Promise.resolve(renderEntry(found));
      renderedPages.set(slug, rendered);
      return await rendered;
    },
  };
}

const contentRoot = resolve(dirname(fileURLToPath(import.meta.url)), "content");

function readPageMetadata(entry: DocsPageEntry): DocsPageMetadata {
  const source = readFileSync(resolve(contentRoot, entry.file), "utf8");

  return {
    description: readStringExport(source, "description") ?? "Mreact documentation.",
    title: readStringExport(source, "title") ?? entry.slug,
  };
}

function readStringExport(source: string, name: string): string | undefined {
  return source.match(new RegExp(`export const ${name} = "([^"]*)";`))?.[1];
}

interface HtmlReplacement {
  readonly html: string;
  readonly marker: string;
}

function applyHtmlReplacements(html: string, replacements: readonly HtmlReplacement[]): string {
  return replacements.reduce((currentHtml, replacement) => {
    return currentHtml.replace(replacement.marker, replacement.html);
  }, html);
}

function enhanceCodeBlocks(html: string): string {
  return html.replaceAll(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/g, (_match, preAttributes: string, preBody: string) => {
    const highlightedPreBody = highlightFileTreeCodeBlock(preBody);
    const fileTreeBlockClass = "code-block is-file-tree";
    const blockClass = highlightedPreBody === preBody ? "code-block" : fileTreeBlockClass;

    return `<div class="${blockClass}"><button class="code-copy" type="button" aria-label="Copy code">Copy</button><pre${preAttributes}>${highlightedPreBody}</pre></div>`;
  });
}

function highlightFileTreeCodeBlock(preBody: string): string {
  const codeMatch = preBody.match(/^<code([^>]*)>([\s\S]*?)<\/code>$/);
  if (codeMatch === null) {
    return preBody;
  }

  const attributes = codeMatch[1];
  const codeBody = codeMatch[2];
  if (attributes === undefined || codeBody === undefined) {
    return preBody;
  }

  if (!attributes.includes("language-text")) {
    return preBody;
  }

  const highlightedShikiCodeBody = highlightShikiFileTreeCodeBlock(codeBody);
  if (highlightedShikiCodeBody !== undefined) {
    return `<code${attributes}>${highlightedShikiCodeBody}</code>`;
  }

  if (!isFileTree(codeBody)) {
    return preBody;
  }

  return `<code${attributes}>${codeBody
    .split("\n")
    .map((line) => highlightFileTreeLine(line))
    .join("\n")}</code>`;
}

function highlightShikiFileTreeCodeBlock(codeBody: string): string | undefined {
  const lineMatches = [...codeBody.matchAll(/<span class="line"><span>(.*?)<\/span><\/span>/g)];
  if (lineMatches.length === 0) {
    return undefined;
  }

  const lines = lineMatches.map((match) => match[1] ?? "");
  if (!isFileTree(lines.join("\n"))) {
    return undefined;
  }

  return codeBody.replaceAll(/<span class="line"><span>(.*?)<\/span><\/span>/g, (_match, line: string) => {
    return `<span class="line">${highlightFileTreeLine(line)}</span>`;
  });
}

function isFileTree(codeBody: string): boolean {
  const lines = codeBody.split("\n").filter((line) => line.trim() !== "");
  if (lines.length < 3) {
    return false;
  }

  const [rootLine] = lines;
  if (rootLine === undefined) {
    return false;
  }

  return rootLine.endsWith("/") && lines.some((line) => /^ {2,}\S/.test(line));
}

function highlightFileTreeLine(line: string): string {
  const lineMatch = line.match(/^(\s*)(\S.*)$/);
  if (lineMatch === null) {
    return line;
  }

  const indent = lineMatch[1];
  const path = lineMatch[2];
  if (indent === undefined || path === undefined) {
    return line;
  }

  return `${indent}<span class="${fileTreePathClass(path)}">${path}</span>`;
}

function fileTreePathClass(path: string): string {
  if (path.startsWith("$")) {
    return "tree-path is-param";
  }

  if (path.endsWith("/")) {
    return "tree-path is-dir";
  }

  return "tree-path is-file";
}

const docsPageEntries = [
  page("", "overview.mdx"),
  page("benchmarks", "benchmarks.mdx", {
    replacements: async () => [
      {
        html: renderToString((await import("./ui/BenchmarkResults.js")).BenchmarkResults),
        marker: "<p>BENCHMARK_RESULTS_PLACEHOLDER</p>",
      },
    ],
  }),
  page("getting-started", "getting-started.mdx"),
  page("guides/basics", "guides/basics.mdx"),
  page("guides/app-router", "guides/app-router.mdx"),
  page("guides/project-structure", "guides/project-structure.mdx"),
  page("guides/environment-variables", "guides/environment-variables.mdx"),
  page("guides/routing", "guides/routing.mdx"),
  page("guides/layouts-and-slots", "guides/layouts-and-slots.mdx"),
  page("guides/server-and-client-model", "guides/server-and-client-model.mdx"),
  page("guides/react-compatibility", "guides/react-compatibility.mdx"),
  page("guides/ssr-and-streaming", "guides/ssr-and-streaming.mdx"),
  page("guides/ssg-and-static-export", "guides/ssg-and-static-export.mdx"),
  page("guides/link-and-navigation", "guides/link-and-navigation.mdx"),
  page("guides/data-loading", "guides/data-loading.mdx"),
  page("guides/http-apis", "guides/http-apis.mdx"),
  page("guides/middleware", "guides/middleware.mdx"),
  page("guides/server-actions", "guides/server-actions.mdx"),
  page("guides/cache-and-revalidation", "guides/cache-and-revalidation.mdx"),
  page("guides/cookies-and-sessions", "guides/cookies-and-sessions.mdx"),
  page("guides/authentication", "guides/authentication.mdx"),
  page("guides/forms-and-validation", "guides/forms-and-validation.mdx"),
  page("guides/testing", "guides/testing.mdx"),
  page("guides/metadata-and-head", "guides/metadata-and-head.mdx"),
  page("guides/css-and-assets", "guides/css-and-assets.mdx"),
  page("guides/csp", "guides/csp.mdx"),
  page("guides/external-scripts", "guides/external-scripts.mdx"),
  page("guides/file-uploads-and-csrf", "guides/file-uploads-and-csrf.mdx"),
  page("guides/advanced/mdx", "guides/advanced/mdx.mdx"),
  page("guides/advanced/i18n", "guides/advanced/i18n.mdx"),
  page("guides/advanced/vite-plugin-integration", "guides/advanced/vite-plugin-integration.mdx"),
  page("deployments/host-policy-and-proxies", "deployments/host-policy-and-proxies.mdx"),
  page("deployments/source-maps", "deployments/source-maps.mdx"),
  page("deployments/logging-and-diagnostics", "deployments/logging-and-diagnostics.mdx"),
  page("deployments/cdn-assets", "deployments/cdn-assets.mdx"),
  page("deployments/cache-policy", "deployments/cache-policy.mdx"),
  page("deployments/cloudflare", "deployments/cloudflare.mdx"),
  page("deployments/aws-lambda", "deployments/aws-lambda.mdx"),
  page("deployments/container-and-cloud-run", "deployments/container-and-cloud-run.mdx"),
  page("deployments/static-hosting", "deployments/static-hosting.mdx"),
  page("examples", "examples.mdx"),
  page("utilities/virtualized-lists", "utilities/virtualized-lists.mdx"),
  page("utilities/store", "utilities/store.mdx"),
  page("utilities/server-state", "utilities/server-state.mdx"),
  page("reference/cli", "reference/cli.mdx"),
  page("reference/config", "reference/config.mdx"),
  page("reference/environment-variables", "reference/environment-variables.mdx"),
  page("reference/route-module-exports", "reference/route-module-exports.mdx"),
  page("reference/route-handler-context", "reference/route-handler-context.mdx"),
  page("reference/response-helpers", "reference/response-helpers.mdx"),
  page("reference/adapters", "reference/adapters.mdx"),
  page("reference/metadata-api", "reference/metadata-api.mdx"),
  page("reference/auth-api", "reference/auth-api.mdx"),
  page("reference/cache-api", "reference/cache-api.mdx"),
  page("reference/api", "reference/api.mdx"),
] as const satisfies readonly DocsPageEntry[];

const docsPageRegistry = createPageRegistry(docsPageEntries);

export function pageForSlug(slug: string): Promise<DocsPage | undefined> {
  return docsPageRegistry.pageForSlug(slug);
}

export function metadataForSlug(slug: string): DocsPageMetadata | undefined {
  return docsPageRegistry.metadataForSlug(slug);
}

export function allSlugs(): readonly string[] {
  return docsPageRegistry.allSlugs();
}
