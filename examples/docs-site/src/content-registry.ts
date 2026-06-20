import { renderToString } from "@reckona/mreact";
import { allSlugs, metadataForSlug, type DocsPageMetadata } from "./content-metadata.js";
import {
  docsPageEntries,
  type DocsPageEntry,
  type DocsPageModule,
  type HtmlReplacement,
} from "./content-pages.js";

export interface DocsPage {
  description: string;
  html: string;
  slug: string;
  title: string;
}

export interface DocsPageRegistry {
  allSlugs(): readonly string[];
  metadataForSlug(slug: string): DocsPageMetadata | undefined;
  pageForSlug(slug: string): Promise<DocsPage | undefined>;
}

export type RenderDocsPageEntry = (entry: DocsPageEntry) => Promise<DocsPage> | DocsPage;

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
  const renderedPages = new Map<string, Promise<DocsPage>>();

  return {
    allSlugs: () => entries.map((entry) => entry.slug).filter((slug) => slug !== ""),
    metadataForSlug,
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

const docsPageRegistry = createPageRegistry(docsPageEntries);

export function pageForSlug(slug: string): Promise<DocsPage | undefined> {
  return docsPageRegistry.pageForSlug(slug);
}

export { allSlugs, metadataForSlug };
