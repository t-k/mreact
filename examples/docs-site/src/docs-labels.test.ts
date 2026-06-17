import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

import { flatNav, sidebar } from "./nav.config.js";

const utilityLabels = [
  {
    heading: "Virtualized Lists (@reckona/mreact-virtual)",
    path: "content/utilities/virtualized-lists.mdx",
    slug: "utilities/virtualized-lists",
  },
  {
    heading: "Store (@reckona/mreact-store)",
    path: "content/utilities/store.mdx",
    slug: "utilities/store",
  },
  {
    heading: "Server State (@reckona/mreact-query)",
    path: "content/utilities/server-state.mdx",
    slug: "utilities/server-state",
  },
] as const;

describe("docs-site utility package labels", () => {
  test("Utilities navigation shows the package name for each utility", () => {
    const utilitiesGroup = sidebar.find((group) => group.text === "Utilities");

    expect(utilitiesGroup?.items).toEqual(
      utilityLabels.map((utility) => ({
        slug: utility.slug,
        text: utility.heading,
      })),
    );
  });

  test("Utilities pages use the same package-aware heading as their nav label", () => {
    for (const utility of utilityLabels) {
      const source = readFileSync(join(import.meta.dirname, utility.path), "utf8");

      expect(source).toContain(`export const title = "${utility.heading}";`);
      expect(source).toContain(`# ${utility.heading}`);
    }
  });

  test("Server State avoids duplicating the explicit client boundary marker", () => {
    const source = readFileSync(
      join(import.meta.dirname, "content/utilities/server-state.mdx"),
      "utf8",
    );
    const summaryExample = source.slice(
      source.indexOf("// src/app/dashboard/summary.client.tsx"),
      source.indexOf("export function DashboardLiveSummary"),
    );

    expect(summaryExample).toContain("// src/app/dashboard/summary.client.tsx");
    expect(summaryExample).not.toContain('"use client";');
  });
});

describe("docs-site content integrity", () => {
  test("Navigation slugs and labels match the content registry", () => {
    expect(new Set(flatNav.map((item) => item.slug))).toEqual(new Set(readContentRegistrySlugs()));

    for (const navItem of flatNav) {
      const source = readContentForSlug(navItem.slug);
      const title = source.match(/export const title = "([^"]+)";/)?.[1];

      expect(title).toBe(navItem.text);
    }
  });

  test("MDX page H1 headings match exported titles", () => {
    for (const path of mdxContentPaths()) {
      if (path.endsWith("overview.mdx")) {
        continue;
      }

      const source = readFileSync(path, "utf8");
      const title = source.match(/export const title = "([^"]+)";/)?.[1];
      const heading = source.match(/^# (.+)$/m)?.[1];

      expect({ file: relative(join(import.meta.dirname, "content"), path), heading }).toEqual({
        file: relative(join(import.meta.dirname, "content"), path),
        heading: title,
      });
    }
  });

  test("API reference links point at generated TypeDoc pages", () => {
    const docsApiRoot = join(import.meta.dirname, "../../..", "docs/api");

    for (const path of mdxContentPaths()) {
      const source = readFileSync(path, "utf8");
      const apiLinks = source.matchAll(/\]\(\/api\/([^)]+\.html)\)/g);

      for (const match of apiLinks) {
        const target = match[1];

        expect({
          file: relative(join(import.meta.dirname, "content"), path),
          target,
        }).toEqual({
          file: relative(join(import.meta.dirname, "content"), path),
          target,
        });
        expect(existsSync(join(docsApiRoot, target ?? ""))).toBe(true);
      }
    }
  });

  test("Documented starter requirements and examples match the current runtime", () => {
    const gettingStarted = readContent("getting-started.mdx");
    const serverState = readContent("utilities/server-state.mdx");
    const cdnAssets = readContent("deployments/cdn-assets.mdx");
    const sourceMaps = readContent("deployments/source-maps.mdx");
    const serverAndClientModel = readContent("guides/server-and-client-model.mdx");

    expect(gettingStarted).toContain("Node.js 20.19 or newer");
    expect(serverState).toContain("createMutation<{ name: string }, Profile>(getQueryClient(), {");
    expect(cdnAssets).not.toContain("projectRoot: __dirname");
    expect(sourceMaps).not.toContain("projectRoot: __dirname");
    expect(serverAndClientModel).toContain('import { LikeButton } from "./LikeButton.client.js";');
  });

  test("CLI and Cloudflare reference pages describe the implemented command surface", () => {
    const cli = readContent("reference/cli.mdx");
    const environmentVariables = readContent("reference/environment-variables.mdx");
    const cloudflare = readContent("deployments/cloudflare.mdx");

    expect(cli).not.toContain("5173");
    expect(environmentVariables).not.toContain("5173");
    expect(cli).toContain("`mreact-router dev` reads `--host` and `--port`.");
    expect(cli).toContain("`mreact-router start` reads `--host`, `--host-policy`, and `--allowed-hosts`.");
    expect(cloudflare).toContain("`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, and `ALL`");
  });
});

describe("docs-site accessibility affordances", () => {
  test("Search markup and script expose combobox/listbox semantics and Escape dismissal", () => {
    const layout = readFileSync(join(import.meta.dirname, "app/layout.tsx"), "utf8");
    const searchScript = readPublicScript("docs-search.js");

    expect(layout).toContain('role="combobox"');
    expect(layout).toContain('aria-controls="site-search-results"');
    expect(layout).toContain('aria-activedescendant');
    expect(layout).toContain('role="listbox"');
    expect(searchScript).toContain('event.key === "Escape"');
    expect(searchScript).toContain('setAttribute("aria-expanded",');
  });

  test("Mobile navigation menu supports Escape and focus restoration", () => {
    const menuScript = readPublicScript("docs-menu.js");

    expect(menuScript).toContain('event.key === "Escape"');
    expect(menuScript).toContain("menuPanel.focus()");
    expect(menuScript).toContain("menuToggle.focus()");
  });

  test("Home page fallback does not nest main landmarks", () => {
    const source = readFileSync(join(import.meta.dirname, "app/page.tsx"), "utf8");

    expect(source).not.toContain("return <main>Missing overview.</main>;");
  });
});

function mdxContentPaths(): string[] {
  const contentRoot = join(import.meta.dirname, "content");
  const paths: string[] = [];

  function collect(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        collect(path);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".mdx")) {
        paths.push(path);
      }
    }
  }

  collect(contentRoot);
  return paths.sort();
}

function readContent(path: string): string {
  return readFileSync(join(import.meta.dirname, "content", path), "utf8");
}

function readContentForSlug(slug: string): string {
  return readContent(slug === "" ? "overview.mdx" : `${slug}.mdx`);
}

function readContentRegistrySlugs(): string[] {
  const source = readFileSync(join(import.meta.dirname, "content-registry.ts"), "utf8");

  return [...source.matchAll(/\bpage\(\s*"([^"]*)"/g)].map((match) => match[1] ?? "");
}

function readPublicScript(filename: string): string {
  return readFileSync(join(import.meta.dirname, "..", "public", filename), "utf8");
}
