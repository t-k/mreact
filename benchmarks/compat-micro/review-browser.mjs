import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { esbuild, chromium, worktreeRoot } from "./build.mjs";

const output = process.argv[2];
if (!output) throw new Error("Pass a unique run-specific JSON output path");
const baseline = process.env.MREACT_COMPAT_BASELINE_SHA ?? "ebdd53ff1";
const variants = ["baseline", "candidate", "candidate", "baseline"];
const sizes = (process.env.MREACT_COMPAT_REVIEW_SIZES ?? "1000,10000,50000").split(",").map(Number);
const runs = Number(process.env.MREACT_COMPAT_REVIEW_RUNS ?? 10);
const warmup = Number(process.env.MREACT_COMPAT_REVIEW_WARMUP ?? 3);
const packages = { "mreact-compat": "react-compat", "mreact-reactive-core": "reactive-core", "mreact-reactive-dom": "reactive-dom", "mreact-shared": "shared" };
const localSource = {
  name: "review-source",
  setup(build) {
    build.onResolve({ filter: /^@reckona\// }, ({ path }) => {
      const [name, ...rest] = path.slice("@reckona/".length).split("/");
      if (!packages[name]) return null;
      let sub = rest.join("/") || "index";
      if (packages[name] === "reactive-core" && sub === "runtime-state") sub = "runtime-state-public";
      return { path: resolve(worktreeRoot, "packages", packages[name], "src", `${sub}.ts`) };
    });
  },
};

async function bundle(variant) {
  const override = {
    name: "review-baseline",
    setup(build) {
      if (variant !== "baseline") return;
      build.onLoad({ filter: /packages\/react-compat\/src\/fiber-(child|commit)\.ts$/ }, ({ path }) => {
        const file = path.slice(worktreeRoot.length + 1);
        return { contents: execFileSync("git", ["show", `${baseline}:${file}`], { cwd: worktreeRoot, encoding: "utf8" }), loader: "ts", resolveDir: dirname(path) };
      });
    },
  };
  const result = await esbuild.build({ entryPoints: [resolve(dirname(fileURLToPath(import.meta.url)), "review-entry.ts")], bundle: true, write: false, minify: true, format: "iife", platform: "browser", target: "es2022", define: { "process.env.NODE_ENV": '"production"', __DEV__: "false" }, plugins: [override, localSource], legalComments: "none", logLevel: "warning" });
  return result.outputFiles[0].text;
}

function summarize(samples) {
  const metrics = Object.keys(samples[0]);
  return Object.fromEntries(metrics.map(metric => {
    const values = samples.map(sample => sample[metric]).toSorted((a, b) => a - b);
    return [metric, { median: values[Math.floor(values.length / 2)], p95: values[Math.ceil(values.length * .95) - 1] }];
  }));
}

const bundles = { baseline: await bundle("baseline"), candidate: await bundle("candidate") };
const browser = await chromium.launch({ args: ["--js-flags=--expose-gc"] });
const report = { at: new Date().toISOString(), node: process.version, chromium: browser.version(), baseline, runs, warmup, order: variants, blocks: [] };
try {
  for (const variant of variants) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ content: bundles[variant] });
    const cdp = await page.context().newCDPSession(page);
    const cases = [];
    for (const size of sizes) {
      for (const [kind, modes] of [["reconcile", ["delete", "replace", "single"]], ["host", ["none", "sparse", "all"]], ["full", ["create", "replace", "delete"]]]) {
        for (const mode of modes) {
          for (let i = 0; i < warmup; i++) await page.evaluate(([kind, size, mode]) => { globalThis.__review[kind](size, mode); globalThis.gc?.(); }, [kind, size, mode]);
          await cdp.send("HeapProfiler.collectGarbage");
          const beforeHeap = await cdp.send("Runtime.getHeapUsage");
          const samples = [];
          for (let i = 0; i < runs; i++) samples.push(await page.evaluate(([kind, size, mode]) => { const result = globalThis.__review[kind](size, mode); globalThis.gc?.(); return result; }, [kind, size, mode]));
          await cdp.send("HeapProfiler.collectGarbage");
          const afterHeap = await cdp.send("Runtime.getHeapUsage");
          cases.push({ kind, size, mode, samples, summary: summarize(samples), retainedHeapDelta: afterHeap.usedSize - beforeHeap.usedSize });
          if (errors.length) throw new Error(errors.join("\n"));
        }
      }
    }
    report.blocks.push({ variant, cases });
    await page.close();
    writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(`${variant}: ${cases.length} validated cases`);
  }
} finally {
  await browser.close();
}
console.log(`Saved ${output}`);
