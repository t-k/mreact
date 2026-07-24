import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  analyzeAppBoundaries,
  createBoundaryReport,
  formatBoundaryReport,
  formatBoundaryReportJson,
} from "../src/boundaries.js";

describe("boundary reports", () => {
  test("normalizes routes and components into deterministic text and JSON", () => {
    const report = createBoundaryReport({
      projectRoot: "/workspace",
      routes: [
        {
          components: [
            {
              classification: "client-boundary",
              exportName: "Counter",
              file: "/workspace/src/components/Counter.tsx",
              origin: "inferred-client-runtime",
            },
            {
              classification: "client-boundary",
              exportName: "Counter",
              file: "/workspace/src/components/Counter.tsx",
              origin: "inferred-client-runtime",
            },
            {
              classification: "server-render",
              exportName: "default",
              file: "/workspace/src/app/dashboard/page.tsx",
              origin: "server-render",
            },
          ],
          diagnostics: [],
          entry: "/workspace/src/app/dashboard/page.tsx",
          path: "/dashboard",
        },
      ],
    });

    expect(report).toEqual({
      diagnostics: [],
      routes: [
        {
          classification: "server-render",
          components: [
            {
              classification: "server-render",
              exportName: "default",
              file: "src/app/dashboard/page.tsx",
              origin: "server-render",
            },
            {
              classification: "client-boundary",
              exportName: "Counter",
              file: "src/components/Counter.tsx",
              origin: "inferred-client-runtime",
            },
          ],
          entry: "src/app/dashboard/page.tsx",
          path: "/dashboard",
        },
      ],
      summary: {
        clientBoundaries: 1,
        clientRoutes: 0,
        serverOnlyComponents: 0,
        serverRenderComponents: 1,
        serverRenderRoutes: 1,
        sharedComponents: 0,
        unknownComponents: 0,
      },
      version: 1,
    });

    const text = formatBoundaryReport(report);
    expect(text).toContain("/dashboard [server-render]");
    expect(text).toContain("src/app/dashboard/page.tsx#default");
    expect(text).toContain("src/components/Counter.tsx#Counter");
    expect(text).toContain("Summary: 1 server-render route, 0 client routes, 1 client boundary");
    expect(text).not.toContain("/workspace");

    const json = formatBoundaryReportJson(report);
    expect(JSON.parse(json)).toEqual(report);
    expect(json).toBe(formatBoundaryReportJson(report));
    expect(json).not.toContain("/workspace");
    expect(json.endsWith("\n")).toBe(true);
  });

  test("analyzes routes, shells, explicit boundaries, barrels, and Vite transforms without building", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-boundary-report-"));
    const appDir = join(projectRoot, "src", "app");
    const componentsDir = join(projectRoot, "src", "components");
    await mkdir(join(appDir, "editor"), { recursive: true });
    await mkdir(componentsDir, { recursive: true });
    await writeFile(
      join(componentsDir, "Counter.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";
export function Counter() {
  const count = cell(0);
  return <button onClick={() => count.set(count.get() + 1)}>{count.get()}</button>;
}`,
    );
    await writeFile(
      join(componentsDir, "Toolbar.client.tsx"),
      `export function Toolbar() { return <button type="button">Tools</button>; }`,
    );
    await writeFile(
      join(componentsDir, "index.ts"),
      `export { Counter } from "./Counter";
export { Toolbar } from "./Toolbar.client";`,
    );
    await writeFile(
      join(appDir, "layout.tsx"),
      `export default function Layout() { return <div>Layout</div>; }`,
    );
    await writeFile(join(appDir, "Chart.widget"), "chart-widget");
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Counter, Toolbar } from "../components";
import { Chart } from "./Chart.widget";
export default function Page() { return <main><Counter /><Toolbar /><Chart /></main>; }`,
    );
    await writeFile(
      join(appDir, "editor", "page.tsx"),
      `"use client";
export default function EditorPage() { return <main>Editor</main>; }`,
    );
    const vitePlugins = [
      {
        name: "boundary-widget-fixture",
        transform(_code: string, id: string) {
          if (!id.endsWith(".widget")) return;
          return `export function Chart() { return <figure>Chart</figure>; }`;
        },
      },
    ];

    const report = await analyzeAppBoundaries({
      projectRoot,
      viteConfig: { plugins: vitePlugins },
    });

    expect(report.routes.map((route) => [route.path, route.classification])).toEqual([
      ["/", "server-render"],
      ["/editor", "client-route"],
    ]);
    expect(report.routes[0]?.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "src/app/layout.tsx", classification: "server-render" }),
        expect.objectContaining({
          file: "src/app/Chart.widget",
          exportName: "Chart",
          classification: "server-render",
        }),
        expect.objectContaining({
          file: "src/components/Counter.tsx",
          exportName: "Counter",
          classification: "client-boundary",
        }),
        expect.objectContaining({
          file: "src/components/Toolbar.client.tsx",
          exportName: "Toolbar",
          classification: "client-boundary",
          origin: "client-filename",
        }),
      ]),
    );
    expect(formatBoundaryReportJson(report)).toBe(
      formatBoundaryReportJson(
        await analyzeAppBoundaries({
          projectRoot,
          viteConfig: { plugins: vitePlugins },
        }),
      ),
    );
    await expect(stat(join(projectRoot, ".mreact"))).rejects.toThrow();
  });
});
