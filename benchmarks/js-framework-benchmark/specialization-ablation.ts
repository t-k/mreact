import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { build, type Rollup } from "vite";
import { transform } from "../../packages/compiler/dist/index.js";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { createDatedResultsDir, writeJsonFile } from "../shared/results.js";

const names = ["directCellText", "branchInsertion", "elementProperty", "selectBinding"] as const;
type SpecializationName = typeof names[number];
const rounds = readPositiveInteger("MREACT_SPECIALIZATION_ABLATION_ROUNDS", 5);
const filename = resolve("benchmarks/js-framework-benchmark/specialization-ablation-fixture.tsx");
const source = await readFile(filename, "utf8");
const rootDir = await mkdtemp(join(await realpath(tmpdir()), "mreact-specialization-ablation-"));
const entry = `import { App } from "./compiled.js";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
window.__specializationAblation = async () => {
  const root = document.querySelector("#root");
  const creationStart = performance.now();
  root.append(App());
  await flushEffects();
  if (root.querySelector("span")?.textContent !== "A" || root.querySelector("select")?.value !== "a") throw new Error("creation verification failed");
  const creationMs = performance.now() - creationStart;
  const controls = globalThis.__specializationAblationControls;
  const updates = {};
  for (const [name, update, verify] of [
    ["directCellText", () => controls.setText("B"), () => root.querySelector("span")?.textContent === "B"],
    ["branchInsertion", () => controls.setBranch(false), () => root.querySelector("i")?.textContent === "no" && root.querySelector("b") === null],
    ["elementProperty", () => controls.setTitle("B"), () => root.querySelector("div")?.title === "B"],
    ["selectBinding", () => controls.setSelection("b"), () => root.querySelector("select")?.value === "b"],
  ]) {
    const start = performance.now();
    update();
    await flushEffects();
    if (!verify()) throw new Error(name + " update verification failed");
    updates[name] = performance.now() - start;
  }
  return { creationMs, updates };
};`;

try {
  await writeFile(join(rootDir, "entry.js"), entry);
  const variants = new Map<string, Awaited<ReturnType<typeof buildVariant>>>();
  variants.set("on", await buildVariant("on"));
  for (const name of names) variants.set(name, await buildVariant(name));
  const results = [];
  for (const name of names) {
    for (let round = 0; round < rounds; round++) {
      const order = round % 2 === 0 ? ["on", name] : [name, "on"];
      for (const variant of order) {
        results.push({ name, variant, round, ...await runTrial(variants.get(variant)!.bundle) });
      }
    }
  }
  const outputDir = await createDatedResultsDir(new Date(), { resultsRoot: join("benchmarks", "results", "compiler-specialization-ablation") });
  await writeJsonFile(join(outputDir, "specialization-ablation.json"), {
    methodologyVersion: 1,
    track: "compiled-reactive-jsx-specialization-ablation",
    filename,
    rounds,
    environment: await collectBenchmarkEnvironment(["@reckona/mreact-compiler", "@reckona/mreact-reactive-dom"]),
    variants: Object.fromEntries([...variants.entries()].map(([name, { bundle, ...metadata }]) => [name, metadata])),
    results,
    limitations: [
      "This ordinary JSX fixture exercises four existing compiler flags; the canonical keyed benchmark has no candidates for these four flags.",
      "Each scored trial uses a fresh Chromium process and verifies DOM state after effects flush. Timings end at DOM verification, not paint or INP.",
      "The fixture is synthetic and small; bundle bytes and operation times are diagnostic, not a canonical framework score.",
    ],
  });
  console.log(JSON.stringify({ outputDir, variants: Object.fromEntries([...variants.entries()].map(([name, value]) => [name, { generatedGzipBytes: value.generatedGzipBytes, bundleGzipBytes: value.bundleGzipBytes, decisions: value.decisions }])), results }, null, 2));
} finally {
  await rm(rootDir, { force: true, recursive: true });
}

async function buildVariant(disabled: "on" | SpecializationName) {
  const output = transform({
    code: source,
    filename,
    target: "client",
    dev: false,
    reportClientSpecializations: true,
    ...(disabled === "on" ? {} : { clientSpecializations: { [disabled]: false } }),
  });
  const errors = output.diagnostics.filter((diagnostic) => diagnostic.level === "error");
  if (errors.length > 0) throw new Error(`Compiler diagnostics for ${disabled}: ${errors.map((diagnostic) => diagnostic.code).join(", ")}`);
  const decisions = output.metadata.clientSpecializations ?? [];
  for (const name of names) {
    const matches = decisions.filter((decision) => decision.name === name);
    if (matches.length !== 1 || matches[0]?.applied !== (name !== disabled)) {
      throw new Error(`Unexpected ${name} decision for ${disabled}: ${JSON.stringify(matches)}`);
    }
  }
  await writeFile(join(rootDir, "compiled.js"), output.code);
  const built = await build({
    configFile: false,
    root: rootDir,
    logLevel: "silent",
    build: { write: false, lib: { entry: join(rootDir, "entry.js"), formats: ["es"] } },
    resolve: { alias: [
      { find: "@reckona/mreact-reactive-core/testing", replacement: resolve("packages/reactive-core/dist/testing.js") },
      { find: "@reckona/mreact-reactive-core/internal", replacement: resolve("packages/reactive-core/dist/internal.js") },
      { find: "@reckona/mreact-reactive-core/runtime-state", replacement: resolve("packages/reactive-core/dist/runtime-state-public.js") },
      { find: "@reckona/mreact-reactive-dom/internal", replacement: resolve("packages/reactive-dom/dist/internal.js") },
      { find: "@reckona/mreact-reactive-dom", replacement: resolve("packages/reactive-dom/dist/index.js") },
      { find: "@reckona/mreact-reactive-core", replacement: resolve("packages/reactive-core/dist/index.js") },
    ] },
  });
  const chunks = (Array.isArray(built) ? built : [built])
    .flatMap((result) => ("output" in result ? result.output : []))
    .filter((item): item is Rollup.OutputChunk => item.type === "chunk");
  if (chunks.length !== 1) throw new Error(`Expected one inline bundle for ${disabled}, got ${chunks.length}`);
  const bundle = chunks[0]!.code;
  return {
    bundle,
    decisions,
    runtimeImports: output.metadata.imports,
    generatedRawBytes: Buffer.byteLength(output.code),
    generatedGzipBytes: gzipSync(output.code).length,
    bundleRawBytes: Buffer.byteLength(bundle),
    bundleGzipBytes: gzipSync(bundle).length,
  };
}

async function runTrial(bundle: string) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle, type: "module" });
    await page.waitForFunction(() => typeof (window as any).__specializationAblation === "function");
    const sample = await page.evaluate(() => (window as any).__specializationAblation());
    return { browserVersion: browser.version(), ...sample };
  } finally {
    await browser.close();
  }
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
