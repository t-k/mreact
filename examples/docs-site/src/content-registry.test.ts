import { describe, expect, test } from "vitest";

import { createPageRegistry } from "./content-registry.js";
import type { DocsPageEntry, DocsPageModule } from "./content-pages.js";

function testEntry(slug: string, title: string): DocsPageEntry {
  const module: DocsPageModule = {
    default: () => null,
    description: `${title} description.`,
    title,
  };

  return {
    file: slug === "" ? "overview.mdx" : `${slug}.mdx`,
    load: async () => module,
    slug,
  };
}

describe("docs-site content registry", () => {
  test("renders only the requested page and caches rendered HTML", async () => {
    const renderedSlugs: string[] = [];
    const registry = createPageRegistry(
      [
        testEntry("", "Overview"),
        testEntry("getting-started", "Getting Started"),
        testEntry("guides/basics", "Basics"),
      ],
      async (entry) => {
        renderedSlugs.push(entry.slug);

        return {
          description: `${entry.slug} description.`,
          html: `<h1>${entry.slug}</h1>`,
          slug: entry.slug,
          title: entry.slug,
        };
      },
    );

    expect(registry.allSlugs()).toEqual(["getting-started", "guides/basics"]);
    expect(registry.metadataForSlug("getting-started")).toEqual({
      description: "Create a project, run the dev server, add a route, and build production output.",
      title: "Getting Started",
    });
    expect(renderedSlugs).toEqual([]);

    const firstPage = await registry.pageForSlug("getting-started");

    expect(firstPage?.title).toBe("getting-started");
    expect(renderedSlugs).toEqual(["getting-started"]);
    await expect(registry.pageForSlug("getting-started")).resolves.toBe(firstPage);
    expect(renderedSlugs).toEqual(["getting-started"]);
    await expect(registry.pageForSlug("missing")).resolves.toBeUndefined();
  });
});
