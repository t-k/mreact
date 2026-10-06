import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const baseline = process.env.MREACT_REVIEW_BASELINE;
if (!baseline) throw new Error("MREACT_REVIEW_BASELINE must name a built baseline workspace");
const output = resolve(process.env.MREACT_REVIEW_OUTPUT ?? `benchmarks/results/review-delivery/${Date.now()}`);
const temporary = await mkdtemp(join(tmpdir(), "mreact-review-delivery-"));
const prepared = new Map<string, any>();
const workspaces = { baseline: resolve(baseline), candidate: process.cwd() };
process.env.NODE_ENV = "production";
try {
  for (const [variant, workspace] of Object.entries(workspaces)) {
    const { buildApp } = await import(pathToFileURL(join(workspace, "packages/router/dist/build.js")).href);
    const { startServer } = await import(pathToFileURL(join(workspace, "packages/router/dist/serve.js")).href);
    const { clientDeliveryFixtures, materializeClientDeliveryFixture } = await import(pathToFileURL(join(workspace, "size/fixtures.ts")).href);
    for (const fixtureName of ["native-counter", "native-counter-no-navigation", "react-compat"]) {
      const fixture = clientDeliveryFixtures.find((entry: any) => entry.name === fixtureName);
      const project = await materializeClientDeliveryFixture(fixture, join(temporary, variant));
      await buildApp({ appDir: project.appDir, outDir: project.outDir, projectRoot: project.projectRoot });
      prepared.set(`${variant}/${fixtureName}`, { project, startServer, fixture });
    }
  }
  const runs: any[] = [];
  const startedAt = new Date().toISOString();
  for (const variant of ["baseline", "candidate", "candidate", "baseline"]) {
    for (const fixtureName of ["native-counter", "native-counter-no-navigation", "react-compat"]) {
      const { project, startServer, fixture } = prepared.get(`${variant}/${fixtureName}`);
      const server = await startServer({ outDir: project.outDir, port: 0 });
      let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
      try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.addInitScript({ content: `
          const callbacks = [];
          window.requestIdleCallback = callback => { callbacks.push(callback); return callbacks.length; };
          window.__reviewReleaseIdle = () => {
            for (const callback of callbacks.splice(0)) callback({ didTimeout: false, timeRemaining: () => 50 });
          };
        ` });
        const requested = new Set<string>();
        page.on("request", (request) => {
          const pathname = new URL(request.url()).pathname;
          if (pathname.startsWith("/_mreact/client/") && pathname.endsWith(".js")) requested.add(pathname.slice("/_mreact/client/".length));
        });
        const phases: any[] = [];
        const checkpoint = async (phase: string) => {
          const paths = [...requested].sort();
          const files = await Promise.all(paths.map(async (path) => {
            const code = await readFile(join(project.outDir, "client", path));
            return { path, rawBytes: code.length, gzipBytes: gzipSync(code).length };
          }));
          const timing = await page.evaluate(() => performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/_mreact/client/")).map((entry) => {
            const value = entry as PerformanceResourceTiming;
            return { name: value.name, encodedBodySize: value.encodedBodySize, transferSize: value.transferSize };
          }));
          phases.push({ phase, files, cumulativeGzipBytes: files.reduce((sum, file) => sum + file.gzipBytes, 0), timing });
        };
        await page.goto(server.url + fixture.initialPath);
        await page.waitForFunction(() => document.documentElement.hasAttribute("data-mreact-hydrated"));
        await checkpoint("hydrated-before-idle");
        const button = page.getByRole("button").first();
        const before = await button.textContent();
        const interactionStart = performance.now();
        await button.click();
        await page.waitForFunction((previous) => document.querySelector("button")?.textContent !== previous, before);
        const firstInteractionMs = performance.now() - interactionStart;
        await checkpoint("first-interaction-before-idle");
        await page.evaluate(() => (window as any).__reviewReleaseIdle());
        await page.waitForLoadState("networkidle");
        await checkpoint("after-idle");
        let firstNavigationMs: number | undefined;
        if (fixture.sessionVisits.length > 0) {
          const destination = fixture.sessionVisits[0];
          const navigationStart = performance.now();
          await page.locator(`a[href="${destination}"]`).first().click();
          await page.waitForURL((url) => url.pathname === destination);
          await page.locator("main").waitFor({ state: "visible" });
          firstNavigationMs = performance.now() - navigationStart;
          await page.waitForLoadState("networkidle");
          await checkpoint("first-navigation");
        }
        runs.push({ variant, fixtureName, browserVersion: browser.version(), firstInteractionMs, firstNavigationMs, phases });
      } finally { await browser?.close(); await server.close(); }
    }
  }
  await mkdir(output, { recursive: true });
  await writeFile(join(output, "delivery.json"), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), workspaces, node: process.version, methodology: "Sequential ABBA, unchanged production fixtures and options; scheduled idle callbacks held until a checkpoint to distinguish hydration, first interaction, idle and first navigation. Response sizes are recorded separately from gzip estimates. Interaction timings include Playwright actionability overhead and are diagnostic, not statistical latency guarantees.", runs }, null, 2) + "\n");
  console.log(JSON.stringify({ output, runs: runs.map(({ phases, ...run }) => ({ ...run, phases: phases.map(({ phase, cumulativeGzipBytes }: any) => ({ phase, cumulativeGzipBytes })) })) }, null, 2));
} finally { await rm(temporary, { force: true, recursive: true }); }
