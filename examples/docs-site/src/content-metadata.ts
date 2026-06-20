import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { docsPageEntries, type DocsPageEntry } from "./content-pages.js";

export interface DocsPageMetadata {
  readonly description: string;
  readonly title: string;
}

const contentRoot = resolve(dirname(fileURLToPath(import.meta.url)), "content");
const metadataCache = new Map<string, DocsPageMetadata>();

export function allSlugs(): readonly string[] {
  return docsPageEntries.map((entry) => entry.slug).filter((slug) => slug !== "");
}

export function metadataForSlug(slug: string): DocsPageMetadata | undefined {
  const cached = metadataCache.get(slug);
  if (cached !== undefined) {
    return cached;
  }

  const found = docsPageEntries.find((entry) => entry.slug === slug);
  if (found === undefined) {
    return undefined;
  }

  const loaded = readPageMetadata(found);
  metadataCache.set(slug, loaded);
  return loaded;
}

export function readPageMetadata(entry: DocsPageEntry): DocsPageMetadata {
  const source = readFileSync(resolve(contentRoot, entry.file), "utf8");

  return {
    description: readStringExport(source, "description") ?? "Mreact documentation.",
    title: readStringExport(source, "title") ?? entry.slug,
  };
}

function readStringExport(source: string, name: string): string | undefined {
  return source.match(new RegExp(`export const ${name} = "([^"]*)";`))?.[1];
}
