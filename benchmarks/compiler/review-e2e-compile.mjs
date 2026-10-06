import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";

const [beforeRoot, afterRoot, output] = process.argv.slice(2);
if (!output)
  throw new Error("Usage: performance.mjs <before checkout> <after checkout> <new output.json>");
const variants = {};
for (const [label, root] of [
  ["before", beforeRoot],
  ["after", afterRoot],
]) {
  variants[label] = await import(pathToFileURL(`${root}/packages/compiler/dist/index.js`));
}
const files = [
  ["examples/app-router/app/forms/page.tsx", "reactive", "client", "string"],
  ["examples/app-router/app/forms/valibot/page.tsx", "reactive", "client", "string"],
  ["examples/app-router/app/forms/zod/page.tsx", "reactive", "client", "string"],
  ["examples/selective-hydration/src/App.compat.tsx", "compat", "client", "string"],
  ["examples/selective-hydration/src/App.compat.tsx", "compat", "server", "string"],
  ["examples/selective-hydration/src/App.compat.tsx", "compat", "server", "stream"],
  ["examples/ssr-streaming/src/StreamPage.tsx", "reactive", "server", "stream"],
  ["examples/ssr-streaming/src/AwaitPage.tsx", "reactive", "server", "stream"],
];
const inputs = files.map(([filename, mode, target, serverOutput]) => ({
  code: readFileSync(`${afterRoot}/${filename}`, "utf8"),
  filename,
  mode,
  target,
  serverOutput,
  serverHydration: target === "server" && mode === "compat",
  dev: false,
}));
const timings = {};
const sizes = {};
for (let index = 0; index < inputs.length; index++) {
  const input = inputs[index];
  const key = `${input.filename}:${input.target}:${input.serverOutput}`;
  timings[key] = { before: [], after: [] };
  sizes[key] = {};
  for (const label of ["before", "after"]) {
    for (let warmup = 0; warmup < 25; warmup++) variants[label].transform(input);
    const emitted = variants[label].transform(input).code;
    sizes[key][label] = { bytes: Buffer.byteLength(emitted), gzipBytes: gzipSync(emitted).length };
  }
  for (let repeat = 0; repeat < 5; repeat++) {
    for (const label of ["before", "after", "after", "before"]) {
      for (let sample = 0; sample < 30; sample++) {
        const start = performance.now();
        variants[label].transform(input);
        timings[key][label].push(performance.now() - start);
      }
    }
  }
}
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    samples: values.length,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
  };
}
const results = Object.entries(timings).map(([fixture, samples]) => ({
  fixture,
  before: stats(samples.before),
  after: stats(samples.after),
  emittedSize: sizes[fixture],
}));
const data = {
  node: process.version,
  order: "ABBA repeated 5 times, 25 warmups, 300 samples per variant per fixture",
  results,
};
writeFileSync(output, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
console.log(
  JSON.stringify(
    results.map(({ fixture, before, after }) => ({
      fixture,
      before: before.medianMs,
      after: after.medianMs,
    })),
    null,
    2,
  ),
);
