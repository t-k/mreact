// Fast local micro-benchmark for react-compat vs React.
// Usage: node measure.mjs [mreact|react|both] [--warmup N] [--runs N] [--trials N] [--json out] [--vs base] [--label NAME]
import { readFileSync, writeFileSync } from "node:fs";
import { build, serve, chromium } from "./build.mjs";

const OPS = ["create", "replace", "partialUpdate", "select", "swap", "remove", "append", "createMany", "clear"];

async function measure(framework, warmup, runs) {
  const { html, distDir, size } = await build(framework);
  const server = await serve(distDir);
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/${framework}.html`;
  const browser = await chromium.launch({ args: ["--js-flags=--expose-gc", "--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction("typeof window.__bench === 'function'", { timeout: 15000 }).catch(() => {});
    if (errors.length) throw new Error(`page errors:\n${errors.join("\n")}`);
    const result = await page.evaluate(([w, r]) => window.__bench(w, r), [warmup, runs]);
    return { framework, size, result };
  } finally {
    await browser.close();
    server.close();
  }
}

function parseArgs(argv) {
  const opts = { target: "mreact", warmup: 6, runs: 24, trials: 1, json: null, label: null, vs: null };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--warmup") opts.warmup = Number(argv[++i]);
    else if (a === "--runs") opts.runs = Number(argv[++i]);
    else if (a === "--trials") opts.trials = Number(argv[++i]);
    else if (a === "--json") opts.json = argv[++i];
    else if (a === "--label") opts.label = argv[++i];
    else if (a === "--vs") opts.vs = argv[++i];
    else positional.push(a);
  }
  if (positional[0]) opts.target = positional[0];
  return opts;
}

function medianOf(values) {
  const s = values.slice().sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
function round1(v) { return Math.round(v * 100) / 100; }

function aggregateTrials(results) {
  const out = {};
  for (const op of OPS) {
    const present = results.map((r) => r?.[op]).filter(Boolean);
    if (!present.length) continue;
    out[op] = {
      median: round1(medianOf(present.map((p) => p.median))),
      min: round1(Math.min(...present.map((p) => p.min))),
      mean: round1(medianOf(present.map((p) => p.mean))),
    };
  }
  return out;
}

function printTable(rows) {
  const header = ["op", ...rows.map((r) => r.label)];
  const lines = [header.join("\t")];
  for (const op of OPS) {
    const cells = [op];
    for (const r of rows) cells.push(r.result?.[op] ? `${r.result[op].median}` : "-");
    lines.push(cells.join("\t"));
  }
  console.log(lines.join("\n"));
  if (rows.length >= 2) {
    const base = rows[0];
    console.log(`\nratio vs ${base.label} (<1 means faster than ${base.label}):`);
    for (const op of OPS) {
      const a = base.result?.[op]?.median;
      if (!a) continue;
      const cells = rows.slice(1).map((r) => {
        const b = r.result?.[op]?.median;
        return b ? `${r.label} ${(b / a).toFixed(2)}` : `${r.label} -`;
      });
      console.log(`  ${op.padEnd(14)}\t${base.label} ${a}\t${cells.join("\t")}`);
    }
  }
}

function printVs(current, baseline, label) {
  console.log(`\nvs baseline (${label}): delta% = (current-base)/base, negative = faster`);
  for (const op of OPS) {
    const c = current?.[op]?.median;
    const b = baseline?.[op]?.median;
    if (c == null || b == null) continue;
    const delta = ((c - b) / b) * 100;
    const mark = delta < -3 ? "  FASTER" : delta > 3 ? "  slower" : "";
    console.log(`  ${op.padEnd(14)}\tbase ${b}\tcur ${c}\t${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%${mark}`);
  }
}

const opts = parseArgs(process.argv.slice(2));
const targets = opts.target === "both"
  ? ["react", "mreact"]
  : opts.target === "all"
    ? ["react", "mreact", "mreact-reactive"]
    : [opts.target];
const rows = [];
for (const t of targets) {
  const trialResults = [];
  let size = 0;
  for (let i = 0; i < opts.trials; i += 1) {
    const out = await measure(t, opts.warmup, opts.runs);
    trialResults.push(out.result);
    size = out.size;
  }
  const result = opts.trials > 1 ? aggregateTrials(trialResults) : trialResults[0];
  const label = opts.label && targets.length === 1 ? opts.label : t;
  rows.push({ framework: t, label, size, result });
  console.error(`[${label}] bundle ${size}kB${opts.trials > 1 ? ` (${opts.trials} trials)` : ""}`);
}
printTable(rows);
if (opts.vs) {
  const base = JSON.parse(readFileSync(opts.vs, "utf8"));
  const baseRow = base.find((r) => r.framework === "mreact") ?? base[0];
  const curRow = rows.find((r) => r.framework === "mreact") ?? rows[0];
  printVs(curRow.result, baseRow.result, opts.vs);
}
if (opts.json) {
  writeFileSync(opts.json, JSON.stringify(rows, null, 2));
  console.error(`wrote ${opts.json}`);
}
