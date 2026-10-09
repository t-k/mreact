import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { buildApp } from "../packages/router/dist/build.js";
import { startServer } from "../packages/router/dist/serve.js";
import { measureBrowserDelivery, type BrowserDeliveryManifest } from "./delivery.js";
import { materializeClientDeliveryFixture } from "./fixtures.js";

process.env.NODE_ENV = "production";
const variants = [
  ["public-default", 'import React from "@reckona/mreact";', "React.useState"],
  ["compat-default", 'import React from "@reckona/mreact-compat";', "React.useState"],
  ["compat-namespace", 'import * as React from "@reckona/mreact-compat";', "React.useState"],
  ["public-named", 'import { useState } from "@reckona/mreact";', "useState"],
  ["compat-named", 'import { useState } from "@reckona/mreact-compat";', "useState"],
  ["hooks-entry", 'import { useState } from "@reckona/mreact-compat/hooks";', "useState"],
] as const;
const output = resolve(
  process.env.MREACT_BENCHMARK_RESULTS_DIR ?? "test-results/compat-imports",
  new Date().toISOString().replaceAll(/[:.]/g, "-"),
);
await mkdir(output, { recursive: true });
const workDir = await mkdtemp(join(tmpdir(), "mreact-compat-imports-"));
const reports = [];
let browser;
try {
  browser = await chromium.launch();
  for (const [name, importCode, hook] of variants) {
    // Bundler module lengths are estimates; delivery closures report the final asset sizes.
    const modules: Record<string, number> = {};
    const project = await materializeClientDeliveryFixture(
      {
        name,
        description: "Equivalent counter through each supported import form.",
        initialPath: "/",
        measuredHtmlPaths: [],
        sessionVisits: ["/other", "/"],
        workspacePackages: [
          "react",
          "react-compat",
          "reactive-core",
          "reactive-dom",
          "router",
          "shared",
        ],
        files: {
          "src/app/layout.tsx":
            'export default function Layout() { return <html lang="en"><body><Slot /></body></html>; }',
          "src/app/page.tsx":
            'import { Counter } from "./Counter.compat"; import { Link } from "@reckona/mreact-router/link"; export default function Page() { return <main><Counter /><Link href="/other">Other</Link></main>; }',
          "src/app/other/page.tsx":
            'import { Link } from "@reckona/mreact-router/link"; export default function Page() { return <main><h1>Other</h1><Link href="/">Home</Link></main>; }',
          "src/app/Counter.compat.tsx": `${importCode}\nexport function Counter() { const [count, setCount] = ${hook}(0); return <section><input data-edit defaultValue="edit" /><button data-action onClick={() => setCount(count + 1)}>{count}</button></section>; }`,
        },
      },
      workDir,
    );
    await buildApp({
      ...project,
      viteConfig: {
        plugins: [
          {
            name: "measure-retained-modules",
            generateBundle(_options, bundle) {
              for (const chunk of Object.values(bundle)) {
                if (chunk.type === "chunk")
                  for (const [id, module] of Object.entries(chunk.modules)) {
                    modules[id.replace(project.projectRoot, "<fixture>")] = module.renderedLength;
                  }
              }
            },
          },
        ],
      },
    });
    const clientDir = join(project.outDir, "client");
    const manifest = JSON.parse(
      await readFile(join(clientDir, "manifest.json"), "utf8"),
    ) as BrowserDeliveryManifest;
    const server = await startServer({
      outDir: project.outDir,
      port: Number(process.env.PORT ?? 0),
    });
    try {
      const response = await fetch(server.url);
      const html = await response.text();
      if (!response.ok) throw new Error(`SSR failed: ${html}`);
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const fetched = new Set<string>();
        page.on("request", (request) => {
          const path = new URL(request.url()).pathname;
          if (path.startsWith("/_mreact/client/"))
            fetched.add(path.slice("/_mreact/client/".length));
        });
        await page.goto(server.url);
        await page.waitForFunction(
          () => document.documentElement.dataset.mreactHydrated === "true",
        );
        await page.locator("[data-edit]").fill("preserved");
        const before = new Set(fetched);
        await page.locator("[data-action]").click();
        await page.waitForFunction(
          () => document.querySelector("[data-action]")?.textContent === "1",
        );
        if ((await page.locator("[data-edit]").inputValue()) !== "preserved")
          throw new Error("Input reset");
        const firstInteraction = [...fetched].filter((path) => !before.has(path));
        await page.getByRole("link", { name: "Other", exact: true }).click();
        await page.getByRole("heading", { name: "Other", exact: true }).waitFor();
        await page.getByRole("link", { name: "Home", exact: true }).click();
        await page.locator("[data-action]").waitFor();
        if (errors.length) throw new Error(errors.join("\n"));
        const delivery = await measureBrowserDelivery({
          clientDir,
          manifest,
          initialPath: "/",
          initialIncludesNavigationRuntime: true,
          html: { source: html },
          firstInteraction: { fetchedDynamicImports: firstInteraction },
          session: { visits: [{ path: "/other" }, { path: "/" }] },
        });
        reports.push({
          name,
          ssrControl: html.includes("data-action"),
          delivery,
          modules,
          observedFetchedPaths: [...fetched],
        });
      } finally {
        await context.close();
      }
    } finally {
      await server.close();
    }
  }
  await writeFile(
    join(output, "compat-imports.json"),
    JSON.stringify(
      {
        commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        sourceStatus: execFileSync("git", ["status", "--short", "--", "packages"], {
          encoding: "utf8",
        }),
        node: process.version,
        browser: browser.version(),
        createdAt: new Date().toISOString(),
        reports,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        output,
        reports: reports.map(({ name, ssrControl, delivery }) => ({
          name,
          ssrControl,
          initial: delivery.initial.rawBytes,
          firstInteraction: delivery.firstInteraction?.rawBytes,
          cumulative: delivery.session?.cumulative.rawBytes,
        })),
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await rm(workDir, { recursive: true, force: true });
}
