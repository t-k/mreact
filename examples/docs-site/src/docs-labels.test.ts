import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { sidebar } from "./nav.config.js";

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
