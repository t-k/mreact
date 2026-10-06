import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { buildNativeReviewFixture } from "./review-native-fixture.js";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { createDatedResultsDir, writeJsonFile } from "../shared/results.js";

const availableOperations = ["same-array", "one-row", "all-identical", "prepend", "append", "swap", "reorder", "clear"];
const operations = process.env.MREACT_NATIVE_REVIEW_OPERATIONS?.split(",") ?? availableOperations;
if (operations.some((operation) => !availableOperations.includes(operation))) throw new Error("Unknown native review operation");
const rows = [1_000, 10_000];
const warmup = Number(process.env.MREACT_NATIVE_REVIEW_WARMUP ?? 8);
const iterations = Number(process.env.MREACT_NATIVE_REVIEW_ITERATIONS ?? 40);
const rounds = Number(process.env.MREACT_NATIVE_REVIEW_ROUNDS ?? 1);
const profileAllocations = process.env.MREACT_NATIVE_REVIEW_ALLOCATIONS !== "0";
const source = `import { cell } from "@reckona/mreact-reactive-core";
const rows = cell([]);
const selected = cell(null);
const lastClicked = cell("");
globalThis.__nativeReviewControls = { rows, selected, lastClicked };
export function App() {
  return <table><tbody>{rows.get().map((row) => <tr key={row.id} className={selected.get() === row.id ? "selected" : ""} onClick={() => lastClicked.set(row.label)}><td>{row.id}</td><td>{row.label}</td></tr>)}</tbody></table>;
}`;
const entry = `import { App } from "./compiled.js";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
document.querySelector("#root").append(App());
const controls = globalThis.__nativeReviewControls;
const parent = document.querySelector("tbody");
let base, original, expected;
window.__nativeReviewSetup = async (size) => {
  controls.rows.set([]);
  await flushEffects();
  base = Array.from({length: size}, (_, index) => ({id: index + 1, label: "row:" + (index + 1)}));
  controls.rows.set(base);
  controls.selected.set(Math.floor(size / 2) + 1);
  await flushEffects();
  original = new Map(Array.from(parent.children, (row, index) => [base[index].id, row]));
  expected = base;
};
function verify() {
  const actual = parent.children;
  if (actual.length !== expected.length) throw new Error("wrong row count");
  for (let index = 0; index < expected.length; index++) {
    const item = expected[index];
    const node = actual[index];
    if (node.cells[0].textContent !== String(item.id) || node.cells[1].textContent !== item.label) throw new Error("wrong row text at " + index);
    if (original.has(item.id) && node !== original.get(item.id)) throw new Error("lost row identity at " + index);
    if (node.className !== (item.id === controls.selected.get() ? "selected" : "")) throw new Error("wrong selected class at " + index);
  }
  if (expected.length) {
    actual[0].dispatchEvent(new MouseEvent("click", {bubbles: true}));
    if (controls.lastClicked.get() !== expected[0].label) throw new Error("stale event item");
  }
}
window.__nativeReviewVerify = verify;
window.__nativeReviewRun = async (operation, warmup, iterations, verifyEach = true) => {
  const samples = [];
  for (let cycle = 0; cycle < warmup + iterations; cycle++) {
    const destructive = operation === "prepend" || operation === "append" || operation === "clear";
    if (destructive) {
      controls.rows.set(base);
      await flushEffects();
      original = new Map(Array.from(parent.children, (row, index) => [base[index].id, row]));
    }
    const before = controls.rows.get();
    let next;
    switch (operation) {
      case "same-array": next = before.slice(); break;
      case "one-row": {
        next = before.slice();
        const index = Math.floor(next.length / 2);
        next[index] = {id: next[index].id, label: "changed:" + cycle};
        break;
      }
      case "all-identical": next = before.map((item) => ({id: item.id, label: item.label})); break;
      case "prepend": next = [{id: -1, label: "prepended"}, ...before]; break;
      case "append": next = [...before, {id: -1, label: "appended"}]; break;
      case "swap": {
        next = before.slice();
        [next[1], next[next.length - 2]] = [next[next.length - 2], next[1]];
        break;
      }
      case "reorder": next = [...before.slice(3), ...before.slice(0, 3)]; break;
      case "clear": next = []; break;
      default: throw new Error("unknown operation");
    }
    const start = performance.now();
    controls.rows.set(next);
    await flushEffects();
    const durationMs = performance.now() - start;
    expected = next;
    if (verifyEach) verify();
    if (cycle >= warmup) samples.push(durationMs);
  }
  return samples;
};`;

const fixtureFile = process.env.MREACT_NATIVE_REVIEW_FIXTURE;
if (fixtureFile !== undefined) {
  const workspace = resolve(process.env.MREACT_NATIVE_REVIEW_WORKSPACE ?? process.cwd());
  const fixture = await buildNativeReviewFixture(source, entry, workspace);
  await mkdir(resolve(fixtureFile, ".."), { recursive: true });
  await writeJsonFile(fixtureFile, {
    methodologyVersion: 1, workspace, source, entry, ...fixture,
    environment: await collectBenchmarkEnvironment(["@reckona/mreact-compiler", "@reckona/mreact-reactive-dom"]),
  });
  console.log(`Saved compiled native fixture to ${fixtureFile}`);
} else {
  const baselineFile = process.env.MREACT_NATIVE_REVIEW_BASELINE;
  const candidateFile = process.env.MREACT_NATIVE_REVIEW_CANDIDATE;
  if (baselineFile === undefined || candidateFile === undefined) throw new Error("Set MREACT_NATIVE_REVIEW_BASELINE and MREACT_NATIVE_REVIEW_CANDIDATE to saved fixture JSON paths");
  const fixtures = {
    baseline: JSON.parse(await readFile(baselineFile, "utf8")),
    candidate: JSON.parse(await readFile(candidateFile, "utf8")),
  };
  if (fixtures.baseline.source !== fixtures.candidate.source || fixtures.baseline.entry !== fixtures.candidate.entry) throw new Error("Compared fixtures must have identical source and entry");
  const outputDir = await createDatedResultsDir(new Date(), { resultsRoot: join("benchmarks/results/native-review") });
  const results = [];
  for (let round = 0; round < rounds; round++) {
    const variants = round % 2 === 0 ? ["baseline", "candidate", "candidate", "baseline"] as const : ["candidate", "baseline", "baseline", "candidate"] as const;
    for (const variant of variants) {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.route("http://localhost/native-review", (route) => route.fulfill({
          contentType: "text/html",
          body: '<div id="root"></div>',
          headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" },
        }));
        await page.goto("http://localhost/native-review");
        const timer = await page.evaluate(() => {
          let minimumResolutionMs = Infinity;
          for (let index = 0; index < 10_000; index++) {
            const before = performance.now();
            const after = performance.now();
            if (after > before) minimumResolutionMs = Math.min(minimumResolutionMs, after - before);
          }
          return { crossOriginIsolated, minimumResolutionMs };
        });
        if (!timer.crossOriginIsolated) throw new Error("High resolution measurements require cross-origin isolation");
        await page.addScriptTag({ content: fixtures[variant].bundle, type: "module" });
        await page.waitForFunction(() => typeof (window as any).__nativeReviewSetup === "function");
        const client = await page.context().newCDPSession(page);
        await client.send("HeapProfiler.enable");
        await client.send("Performance.enable");
        const cases: NativeReviewCase[] = [];
        for (const size of rows) {
          for (const operation of operations) {
            await page.evaluate((size) => (window as any).__nativeReviewSetup(size), size);
            const samples = await page.evaluate(({ operation, warmup, iterations }) => (window as any).__nativeReviewRun(operation, warmup, iterations), { operation, warmup, iterations });
            if (!profileAllocations) {
              cases.push({ size, operation, samples });
              continue;
            }
            await client.send("HeapProfiler.collectGarbage");
            const before = await client.send("Performance.getMetrics");
            await client.send("HeapProfiler.startSampling", { samplingInterval: 1024, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
            await page.evaluate(({ operation, iterations }) => (window as any).__nativeReviewRun(operation, 0, iterations, false), { operation, iterations });
            const allocation = await client.send("HeapProfiler.stopSampling");
            const after = await client.send("Performance.getMetrics");
            await client.send("HeapProfiler.collectGarbage");
            const collected = await client.send("Performance.getMetrics");
            await page.evaluate(() => (window as any).__nativeReviewVerify());
            const heap = (metrics: typeof before) => metrics.metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value;
            const allocationProfileFile = `${round}-${results.length}-${variant}-${size}-${operation}-allocation.json.gz`;
            await writeFile(join(outputDir, allocationProfileFile), gzipSync(JSON.stringify(allocation)));
            cases.push({ size, operation, samples, allocationProfileFile, sampledAllocationBytes: allocationBytes(allocation.profile.head), heapBefore: heap(before), heapAfter: heap(after), heapCollected: heap(collected) });
          }
        }
        results.push({ round, variant, browserVersion: browser.version(), timer, bundleGzipBytes: fixtures[variant].bundleGzipBytes, cases });
      } finally {
        await browser.close();
      }
    }
  }
  await writeJsonFile(join(outputDir, "native-review.json"), {
    methodologyVersion: 2,
    track: "ordinary-public-compiler-keyed-jsx",
    source, rows, operations, warmup, iterations, rounds, profileAllocations, baselineFile, candidateFile,
    baselineEnvironment: fixtures.baseline.environment,
    candidateEnvironment: fixtures.candidate.environment,
    results,
    limitations: [
      "Timing measures state update through effects flush; it excludes input array preparation, DOM assertions, and paint.",
      "Both variants use the same cross-origin isolated virtual localhost document to permit high resolution timing; Playwright intercepts the request without a TCP server.",
      "CDP allocation sampling includes collected objects and samples update loops without per-cycle DOM assertions; destructive operations include restoration work.",
      "Heap values use CDP Performance metrics before, after, and after explicit garbage collection. They include application and harness state.",
      "Two plain property texts have identical correct semantics on the reviewed baseline; the three-or-more property correctness bug is covered separately.",
    ],
  });
  const summary = rows.flatMap((size) => operations.map((operation) => {
    const variants = ["baseline", "candidate"].map((variant) => {
      const cases = results.filter((run) => run.variant === variant).flatMap((run) => run.cases.filter((entry) => entry.size === size && entry.operation === operation));
      const samples = cases.flatMap((entry) => entry.samples as number[]).sort((a, b) => a - b);
      const allocated = cases.map((entry) => entry.sampledAllocationBytes!);
      return {
        variant,
        medianMs: quantile(samples, 0.5),
        p95Ms: quantile(samples, 0.95),
        ...(profileAllocations ? {
          sampledAllocationBytesPerUpdate: allocated.reduce((a, b) => a + b, 0) / allocated.length / iterations,
          medianHeapBeforeBytes: quantile(cases.map((entry) => entry.heapBefore!).sort((a, b) => a - b), 0.5),
          medianHeapAfterBytes: quantile(cases.map((entry) => entry.heapAfter!).sort((a, b) => a - b), 0.5),
          medianHeapCollectedBytes: quantile(cases.map((entry) => entry.heapCollected!).sort((a, b) => a - b), 0.5),
        } : {}),
      };
    });
    return { size, operation, variants };
  }));
  await writeJsonFile(join(outputDir, "native-review-summary.json"), summary);
  console.log(JSON.stringify({ outputDir, summary }, null, 2));
}

function quantile(samples: number[], fraction: number): number {
  const position = (samples.length - 1) * fraction;
  const lower = Math.floor(position);
  return samples[lower]! + (samples[Math.ceil(position)]! - samples[lower]!) * (position - lower);
}

interface SamplingNode {
  selfSize: number;
  children: SamplingNode[];
}

interface NativeReviewCase {
  size: number;
  operation: string;
  samples: number[];
  allocationProfileFile?: string;
  sampledAllocationBytes?: number;
  heapBefore?: number;
  heapAfter?: number;
  heapCollected?: number;
}

function allocationBytes(node: SamplingNode): number {
  return node.selfSize + node.children.reduce((sum, child) => sum + allocationBytes(child), 0);
}
