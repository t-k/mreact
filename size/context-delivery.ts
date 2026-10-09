import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { buildApp } from "../packages/router/dist/build.js";
import { startServer } from "../packages/router/dist/serve.js";
import { contextDeliveryFixtures } from "./context-fixtures.js";
import { measureBrowserDelivery, type BrowserDeliveryManifest } from "./delivery.js";
import { materializeClientDeliveryFixture } from "./fixtures.js";

process.env.NODE_ENV = "production";
const samples = Number(process.env.MREACT_CONTEXT_SAMPLES ?? 9);
if (!Number.isSafeInteger(samples) || samples < 1) throw new Error("Invalid sample count");
const runId = new Date().toISOString().replaceAll(/[:.]/g, "-");
const output = resolve(
  process.env.MREACT_BENCHMARK_RESULTS_DIR ?? "test-results/context-delivery",
  runId,
);
await mkdir(output, { recursive: true });
const workDir = await mkdtemp(join(tmpdir(), "mreact-context-delivery-"));
let browser: Browser | undefined;
const settings = {
  cpuRate: 4,
  latency: 40,
  downloadThroughput: 200_000,
  uploadThroughput: 100_000,
};
const fixtures = [];
try {
  browser = await chromium.launch();
  for (const fixture of contextDeliveryFixtures) {
    const project = await materializeClientDeliveryFixture(fixture, workDir);
    await buildApp(project);
    const clientDir = join(project.outDir, "client");
    const manifest = JSON.parse(
      await readFile(join(clientDir, "manifest.json"), "utf8"),
    ) as BrowserDeliveryManifest;
    // The OS chooses an unused port; every server is closed before the next fixture.
    const server = await startServer({ outDir: project.outDir, port: 0 });
    try {
      const response = await fetch(server.url);
      const html = await response.text();
      if (!response.ok) throw new Error(`SSR failed: ${html}`);
      await writeFile(join(output, `${fixture.name}.html`), html);
      const timings = [];
      let interactionPaths: string[] = [];
      for (let index = 0; index < samples; index++) {
        const context = await browser.newContext();
        try {
          const page = await context.newPage();
          const errors: string[] = [];
          page.on("pageerror", (error) => errors.push(error.message));
          const session = await context.newCDPSession(page);
          await session.send("Emulation.setCPUThrottlingRate", { rate: settings.cpuRate });
          await session.send("Network.enable");
          await session.send("Network.emulateNetworkConditions", {
            offline: false,
            latency: settings.latency,
            downloadThroughput: settings.downloadThroughput,
            uploadThroughput: settings.uploadThroughput,
          });
          const fetched = new Set<string>();
          page.on("request", (request) => {
            const path = new URL(request.url()).pathname;
            if (path.startsWith("/_mreact/client/"))
              fetched.add(path.slice("/_mreact/client/".length));
          });
          // Raw source avoids transpiler helpers inside a callback serialized into the browser.
          await page.addInitScript({
            content: `
            const state = { controlMs: null, hydratedMs: null, clickMs: null, updatedMs: null };
            window.__contextTiming = state;
            new MutationObserver(() => {
              if (state.controlMs === null && document.querySelector("[data-action]")) state.controlMs = performance.now();
              if (state.hydratedMs === null && document.documentElement?.dataset.mreactHydrated === "true") state.hydratedMs = performance.now();
              if (state.clickMs !== null && state.updatedMs === null && document.querySelector("[data-value]")?.textContent === "dark") state.updatedMs = performance.now();
            }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
          `,
          });
          await page.goto(server.url, { waitUntil: "load" });
          await page.waitForFunction(
            () => document.documentElement.dataset.mreactHydrated === "true",
          );
          await page.locator("[data-action]").waitFor();
          const before = new Set(fetched);
          await page.evaluate(() => {
            (window as any).__contextTiming.clickMs = performance.now();
            (document.querySelector("[data-action]") as HTMLButtonElement).click();
          });
          await page.waitForFunction(
            () => document.querySelector("[data-value]")?.textContent === "dark",
          );
          if ((await page.locator("[data-nested]").textContent()) !== "nested")
            throw new Error("Nested value changed");
          const timing = await page.evaluate(() => (window as any).__contextTiming);
          if (
            errors.length > 0 ||
            Object.values(timing).some(
              (value) => typeof value !== "number" || !Number.isFinite(value),
            )
          )
            throw new Error(`Invalid timing sample: ${JSON.stringify({ timing, errors })}`);
          timing.clickLatencyMs = timing.updatedMs - timing.clickMs;
          timings.push(timing);
          interactionPaths = [
            ...new Set([...interactionPaths, ...[...fetched].filter((path) => !before.has(path))]),
          ];
        } finally {
          await context.close();
        }
      }
      const delivery = await measureBrowserDelivery({
        clientDir,
        manifest,
        initialPath: "/",
        initialIncludesNavigationRuntime: true,
        html: { source: html },
        firstInteraction: { fetchedDynamicImports: interactionPaths },
      });
      const percentile = (key: string, quantile: number) => {
        const values = timings.map((timing) => timing[key] as number).sort((a, b) => a - b);
        return values[Math.max(0, Math.ceil(values.length * quantile) - 1)];
      };
      fixtures.push({
        name: fixture.name,
        ssrControl: html.includes("data-action"),
        delivery,
        timings,
        summary: Object.fromEntries(
          ["controlMs", "hydratedMs", "updatedMs", "clickLatencyMs"].map((key) => [
            key,
            { median: percentile(key, 0.5), p95: percentile(key, 0.95) },
          ]),
        ),
      });
    } finally {
      await server.close();
    }
  }
  const report = {
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    createdAt: new Date().toISOString(),
    browser: browser.version(),
    node: process.version,
    settings,
    samples,
    fixtures,
  };
  await writeFile(join(output, "context-delivery.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        output,
        fixtures: fixtures.map(({ name, ssrControl, summary, delivery }) => ({
          name,
          ssrControl,
          summary,
          initial: delivery.initial,
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
