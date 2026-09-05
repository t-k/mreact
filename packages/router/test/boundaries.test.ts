import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  analyzeAppBoundaries,
  createBoundaryReport,
  formatBoundaryReport,
  formatBoundaryReportJson,
  validateBoundaryExecutionContracts,
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
              decision: {
                executionMode: "server",
                reasonChain: ["classification:server-render", "origin:server-render"],
              },
              exportName: "default",
              file: "src/app/dashboard/page.tsx",
              origin: "server-render",
            },
            {
              classification: "client-boundary",
              decision: {
                executionMode: "client",
                reasonChain: [
                  "classification:client-boundary",
                  "origin:inferred-client-runtime",
                  "client-runtime-inference",
                  "reachable-from:src/app/dashboard/page.tsx",
                ],
              },
              exportName: "Counter",
              file: "src/components/Counter.tsx",
              origin: "inferred-client-runtime",
            },
          ],
          cost: { reason: "No production artifact supplied.", status: "unavailable" },
          entry: "src/app/dashboard/page.tsx",
          executionModes: ["client", "server"],
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

  test("normalizes diagnostic filenames inside messages", () => {
    const filename = "/workspace/src/app/page.tsx";
    const report = createBoundaryReport({
      projectRoot: "/workspace",
      routes: [
        {
          components: [],
          diagnostics: [
            {
              code: "MR_CLIENT_BOUNDARY_INFERENCE_UNSUPPORTED_REFERENCE",
              filename,
              level: "warn",
              localNames: ["Panel"],
              message: `${filename}: unsupported reference`,
              routePath: "/",
              source: "./Panel",
            },
          ],
          entry: filename,
          path: "/",
        },
      ],
    });

    expect(report.diagnostics[0]).toEqual(
      expect.objectContaining({
        filename: "src/app/page.tsx",
        message: "src/app/page.tsx: unsupported reference",
      }),
    );
    expect(formatBoundaryReportJson(report)).not.toContain("/workspace");
  });

  test("summarizes components shared by server rendering and client execution", () => {
    const report = createBoundaryReport({
      projectRoot: "/workspace",
      routes: [
        {
          components: [
            {
              classification: "shared",
              exportName: "LayoutFrame",
              file: "/workspace/src/app/LayoutFrame.tsx",
              origin: "server-render",
            },
          ],
          diagnostics: [],
          entry: "/workspace/src/app/page.tsx",
          path: "/",
        },
      ],
    });

    expect(report.summary.sharedComponents).toBe(1);
    expect(formatBoundaryReport(report)).toContain("1 shared component");
  });

  test("reports source ranges, mixed execution modes, and supplied artifact costs", () => {
    const report = createBoundaryReport({
      projectRoot: "/workspace",
      routes: [
        {
          components: [
            {
              classification: "client-boundary",
              exportName: "Counter",
              file: "/workspace/src/app/page.tsx",
              origin: "use-client-directive",
            },
            {
              classification: "server-render",
              exportName: "default",
              file: "/workspace/src/app/page.tsx",
              origin: "server-render",
            },
          ],
          cost: {
            initial: { gzipEstimateBytes: 120, rawBytes: 300 },
            navigation: { gzipEstimateBytes: 40, rawBytes: 90 },
            status: "available",
          },
          diagnostics: [],
          entry: "/workspace/src/app/page.tsx",
          path: "/",
          source:
            '"use client";\nexport function Counter() { return null; }\nexport default function Page() { return null; }',
        },
      ],
    });

    expect(report.routes[0]).toMatchObject({
      cost: {
        initial: { gzipEstimateBytes: 120, rawBytes: 300 },
        status: "available",
      },
      executionModes: ["client", "server"],
    });
    expect(report.routes[0]?.components[0]).toMatchObject({
      decision: {
        executionMode: "client",
        sourceRange: { start: { line: 2 } },
      },
    });
    expect(formatBoundaryReport(report)).toContain("modes: client, server");
  });

  test("enforces opt-in server-only and no-compat contracts conservatively", () => {
    const report = createBoundaryReport({
      projectRoot: "/workspace",
      routes: [
        {
          components: [
            {
              classification: "shared",
              exportName: "CompatPanel",
              file: "/workspace/src/components/Panel.compat.tsx",
              origin: "compat-filename",
            },
            {
              classification: "unknown",
              exportName: "Missing",
              file: "/workspace/src/components/Missing.tsx",
              origin: "unresolved-reference",
            },
          ],
          diagnostics: [],
          entry: "/workspace/src/app/account/page.tsx",
          path: "/account",
        },
      ],
    });

    expect(() =>
      validateBoundaryExecutionContracts(report, {
        noCompatComponents: ["src/components/**"],
        serverOnlyRoutes: ["/account"],
      }),
    ).toThrow(/server-only route.*client execution|no-compat component.*compat fallback/s);
  });

  test("ignores unmatched execution contract patterns", () => {
    const report = createBoundaryReport({ projectRoot: "/workspace", routes: [] });

    expect(() =>
      validateBoundaryExecutionContracts(report, {
        noCompatComponents: ["src/components/**"],
        serverOnlyRoutes: ["/admin/**"],
      }),
    ).not.toThrow();
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

  test("preserves unresolved rendered modules and exports as unknown diagnostics", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-boundary-unknown-"));
    const appDir = join(projectRoot, "src", "app");
    const missingExportDir = join(appDir, "missing-export");
    await mkdir(missingExportDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { MissingPanel } from "./MissingPanel";
export default function Page() { return <main><MissingPanel /></main>; }`,
    );
    await writeFile(
      join(missingExportDir, "page.tsx"),
      `import { MissingPanel } from "../components";
export default function Page() { return <main><MissingPanel /></main>; }`,
    );
    await writeFile(
      join(appDir, "components.tsx"),
      `export function PresentPanel() { return <section>Present</section>; }`,
    );

    const report = await analyzeAppBoundaries({ projectRoot });

    expect(report.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({
              classification: "unknown",
              exportName: "MissingPanel",
              file: "src/app/MissingPanel",
            }),
          ]),
          path: "/",
        }),
        expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({
              classification: "unknown",
              exportName: "MissingPanel",
              file: "src/app/components.tsx",
            }),
          ]),
          path: "/missing-export",
        }),
      ]),
    );
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MR_CLIENT_BOUNDARY_INFERENCE_UNRESOLVED_REFERENCE",
          filename: "src/app/page.tsx",
          source: "./MissingPanel",
        }),
        expect.objectContaining({
          code: "MR_CLIENT_BOUNDARY_INFERENCE_UNRESOLVED_REFERENCE",
          filename: "src/app/missing-export/page.tsx",
          source: "../components",
        }),
      ]),
    );
    expect(formatBoundaryReport(report)).toContain("Warnings:");
    expect(formatBoundaryReport(report)).toContain(
      "MR_CLIENT_BOUNDARY_INFERENCE_UNRESOLVED_REFERENCE",
    );
    expect(formatBoundaryReportJson(report)).not.toContain(projectRoot);
  });
});
