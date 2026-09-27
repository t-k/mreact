import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { build } from "vite";
import { createDatedResultsDir, writeJsonFile } from "../shared/results.js";

const base = process.cwd();
const baselineWorkspace = process.env.MREACT_ROTATION_BASELINE_WORKSPACE;
const variants = baselineWorkspace === undefined
  ? ["candidate", "candidate"]
  : ["baseline", "candidate", "candidate", "baseline"];
const source = `import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindCompilerKeyedSingleNodeList } from "@reckona/mreact-reactive-dom/internal";

async function setup() {
  const parent = document.querySelector("#root");
  const marker = document.createComment("rows");
  parent.append(marker);
  const rows = cell(Array.from({ length: 10000 }, (_, index) => ({ id: index + 1, label: String(index + 1) })));
  let keyEvaluations = 0;
  let created = 0;
  bindCompilerKeyedSingleNodeList(parent, marker, () => rows.get(), (context) => {
    created++;
    const row = document.createElement("div");
    row.textContent = context.item.label;
    return row;
  }, { key: (item) => { keyEvaluations++; return item.id; } });
  await flushEffects();
  let moves = 0;
  const insertBefore = parent.insertBefore;
  parent.insertBefore = function(node, anchor) { moves++; return insertBefore.call(this, node, anchor); };
  window.__rotationBenchmark = async () => {
    const samples = [];
    for (let index = 0; index < 25; index++) {
      const before = rows.get();
      const next = [before[before.length - 1], ...before.slice(0, -1)];
      moves = 0;
      keyEvaluations = 0;
      created = 0;
      const start = performance.now();
      rows.set(next);
      await flushEffects();
      if (parent.firstChild?.textContent !== next[0].label) throw new Error("wrong first row");
      if (index >= 5) samples.push({ durationMs: performance.now() - start, moves, keyEvaluations, created });
    }
    return samples;
  };
}
void setup();`;

const fixtures = new Map();
const previousCwd = process.cwd();
try {
  for (const variant of new Set(variants)) {
    const workspace = variant === "baseline" ? resolve(baselineWorkspace!) : base;
    process.chdir(workspace);
    const rootDir = await mkdtemp(join(await realpath(tmpdir()), "mreact-list-rotation-"));
    await mkdir(rootDir, { recursive: true });
    await writeFile(join(rootDir, "index.html"), '<main id="root"></main><script type="module" src="/bench.ts"></script>');
    await writeFile(join(rootDir, "bench.ts"), source);
    await build({
      configFile: false,
      root: rootDir,
      logLevel: "silent",
      build: { outDir: join(rootDir, "dist"), rollupOptions: { output: { entryFileNames: "assets/bench.js" } } },
      resolve: { alias: [
        { find: "@reckona/mreact-reactive-core/testing", replacement: join(workspace, "packages/reactive-core/dist/testing.js") },
        { find: "@reckona/mreact-reactive-core/internal", replacement: join(workspace, "packages/reactive-core/dist/internal.js") },
        { find: "@reckona/mreact-reactive-core/runtime-state", replacement: join(workspace, "packages/reactive-core/dist/runtime-state-public.js") },
        { find: "@reckona/mreact-reactive-dom/internal", replacement: join(workspace, "packages/reactive-dom/dist/internal.js") },
        { find: "@reckona/mreact-reactive-core", replacement: join(workspace, "packages/reactive-core/dist/index.js") },
      ] },
    });
    const js = await readFile(join(rootDir, "dist/assets/bench.js"), "utf8");
    const fixture = { rootDir, emittedJavaScriptGzipBytes: gzipSync(js).length };
    fixtures.set(variant, { fixture, js });
  }
  process.chdir(previousCwd);
  const results = [];
  for (const variant of variants) {
    const prepared = fixtures.get(variant);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<main id="root"></main>');
      await page.addScriptTag({ content: prepared.js, type: "module" });
      await page.waitForFunction(() => typeof (window as any).__rotationBenchmark === "function");
      const samples = await page.evaluate(() => (window as any).__rotationBenchmark());
      results.push({ variant, browserVersion: browser.version(), samples, emittedJavaScriptGzipBytes: prepared.fixture.emittedJavaScriptGzipBytes });
    } finally {
      await browser.close();
    }
  }
  const outputDir = await createDatedResultsDir(new Date(), { resultsRoot: join(base, "benchmarks/results/primitive-browser-list-rotation") });
  await writeJsonFile(join(outputDir, "list-rotation.json"), {
    methodologyVersion: 1,
    track: "handwritten-compiler-keyed-list-runtime",
    rows: 10_000,
    warmupRotations: 5,
    measuredRotations: 20,
    baselineWorkspace: baselineWorkspace === undefined ? undefined : resolve(baselineWorkspace),
    candidateWorkspace: base,
    results,
  });
  console.log(JSON.stringify({ outputDir, summary: results.map((run) => {
    const times = run.samples.map((sample: { durationMs: number }) => sample.durationMs).sort((a: number, b: number) => a - b);
    return { variant: run.variant, medianMs: (times[9] + times[10]) / 2, moves: [...new Set(run.samples.map((sample: { moves: number }) => sample.moves))], keyEvaluations: [...new Set(run.samples.map((sample: { keyEvaluations: number }) => sample.keyEvaluations))], created: [...new Set(run.samples.map((sample: { created: number }) => sample.created))], emittedJavaScriptGzipBytes: run.emittedJavaScriptGzipBytes };
  }) }, null, 2));
} finally {
  process.chdir(previousCwd);
  for (const prepared of fixtures.values()) await rm(prepared.fixture.rootDir, { force: true, recursive: true });
}
