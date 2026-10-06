import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const baseline = process.env.MREACT_REVIEW_BASELINE;
if (!baseline) throw new Error("MREACT_REVIEW_BASELINE must name a built baseline workspace");
const output = resolve(process.env.MREACT_REVIEW_OUTPUT ?? `benchmarks/results/review-client/${Date.now()}`);
const workspaces = { baseline: resolve(baseline), candidate: process.cwd() };
const bundles: Record<string, string> = {};
for (const [name, workspace] of Object.entries(workspaces)) {
  const { buildNavigationRuntimeBundle } = await import(pathToFileURL(join(workspace, "packages/router/dist/client.js")).href);
  bundles[name] = (await buildNavigationRuntimeBundle({ minify: true })).code;
}
const runs: any[] = [];
const startedAt = new Date().toISOString();
for (const variant of ["baseline", "candidate", "candidate", "baseline"]) {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const rowCount of [100, 5_000, 20_000]) {
      const page = await browser.newPage();
      try {
        await page.route("http://review.test/**", (route) => route.fulfill({ contentType: "text/html", body: '<div data-mreact-route-id="home"><main>Home</main></div>' }));
        await page.goto("http://review.test/");
        await page.evaluate(async (code) => {
          const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
          try { (window as any).__reviewRuntime = await import(url); } finally { URL.revokeObjectURL(url); }
        }, bundles[variant]!);
        await page.evaluate((count) => {
          const body = `<div data-mreact-route-id="list"><main><table><tbody>${Array.from({ length: count }, (_, index) => `<tr><td>${index}</td><td>row ${index}</td></tr>`).join("")}</tbody></table></main></div>`;
          (window as any).__reviewParses = 0;
          const setter = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML")!;
          Object.defineProperty(Element.prototype, "innerHTML", { ...setter, set(value) {
            if ((this as Element).tagName === "TEMPLATE") (window as any).__reviewParses++;
            setter.set!.call(this, value);
          } });
          window.fetch = async () => new Response(body, { headers: { "cache-control": "no-store" } });
          (window as any).__reviewTrial = async (index: number) => {
            const start = performance.now();
            const result = await (window as any).__reviewRuntime.__mreactNavigate(`/list/${index}`);
            if (result !== true || document.querySelectorAll("tr").length !== count) throw new Error("navigation semantics changed");
            return performance.now() - start;
          };
        }, rowCount);
        for (let index = 0; index < 5; index++) await page.evaluate((i) => (window as any).__reviewTrial(i), index);
        await page.evaluate(() => { (window as any).__reviewParses = 0; });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("HeapProfiler.collectGarbage");
        const before = await cdp.send("Runtime.getHeapUsage");
        await cdp.send("HeapProfiler.startSampling", { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
        const samples: number[] = [];
        for (let index = 5; index < 35; index++) samples.push(await page.evaluate((i) => (window as any).__reviewTrial(i), index));
        const allocation = await cdp.send("HeapProfiler.stopSampling");
        const allocatedBytes = (node: any): number => node.selfSize + node.children.reduce((sum: number, child: any) => sum + allocatedBytes(child), 0);
        await cdp.send("HeapProfiler.collectGarbage");
        const after = await cdp.send("Runtime.getHeapUsage");
        const parses = await page.evaluate(() => (window as any).__reviewParses);
        const sorted = samples.slice().sort((a, b) => a - b);
        runs.push({ variant, rowCount, browserVersion: browser.version(), samples, medianMs: (sorted[14]! + sorted[15]!) / 2, p95Ms: sorted[28], parses, sampledAllocationBytes: allocatedBytes(allocation.profile.head), retainedHeapDeltaBytes: after.usedSize - before.usedSize });
        await cdp.detach();
      } finally { await page.close(); }
    }
    const page = await browser.newPage();
    try {
      await page.route("http://review.test/**", (route) => route.fulfill({ contentType: "text/html", body: '<div data-mreact-route-id="home"><main>Home</main></div>' }));
      await page.goto("http://review.test/");
      await page.evaluate(async (code) => {
        const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
        try { (window as any).__reviewRuntime = await import(url); } finally { URL.revokeObjectURL(url); }
      }, bundles[variant]!);
      const streaming = await page.evaluate(async () => {
        const start = performance.now();
        const encoder = new TextEncoder();
        let firstChunkMs = 0;
        window.fetch = async () => new Response(new ReadableStream({ start(controller) {
          controller.enqueue(encoder.encode('<div data-mreact-route-id="stream"><main>Shell'));
          firstChunkMs = performance.now() - start;
          setTimeout(() => { controller.enqueue(encoder.encode('<strong>Tail</strong></main></div>')); controller.close(); }, 500);
        } }));
        let shellShownMs: number | undefined;
        const observer = new MutationObserver(() => {
          if (document.querySelector("strong") !== null && shellShownMs === undefined) shellShownMs = performance.now() - start;
        });
        observer.observe(document.body, { childList: true, subtree: true });
        try {
          await (window as any).__reviewRuntime.__mreactNavigate("/stream");
          await Promise.resolve();
          return { firstChunkMs, shellShownMs, completionMs: performance.now() - start, contents: document.querySelector("main")?.textContent };
        } finally { observer.disconnect(); }
      });
      runs.push({ variant, streaming, methodology: "Generated navigation runtime in Chromium; synthetic Response stream, no HTTP transport." });
    } finally { await page.close(); }
  } finally { await browser.close(); }
}
await mkdir(output, { recursive: true });
const report = { startedAt, finishedAt: new Date().toISOString(), node: process.version, workspaces, bundleGzipBytes: Object.fromEntries(Object.entries(bundles).map(([name, code]) => [name, gzipSync(code).length])), methodology: "Sequential ABBA, 5 warmups and 30 samples per size, fresh page, generated production navigation runtime, uncached no-store Responses. CDP allocation sampling and retained heap are estimates.", runs };
await writeFile(join(output, "client.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ output, bundles: report.bundleGzipBytes, runs: runs.map(({ samples: _samples, ...run }) => run) }, null, 2));
