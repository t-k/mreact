// CPU-profile a single op on the PROD (fully minified) build and resolve
// self-time to original function names via the sourcemap. Matches the build the
// measure harness uses, so hot spots reflect real inlining.
// Usage: node profile.mjs <op> [framework=mreact] [--count N] [--top N]
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { build, serve, chromium, worktreeRoot } from "./build.mjs";

const require = createRequire(import.meta.url);
function loadTraceMapping() {
  const pnpmDir = join(worktreeRoot, "node_modules", ".pnpm");
  const dir = readdirSync(pnpmDir).filter((d) => d.startsWith("@jridgewell+trace-mapping@")).sort().pop();
  return require(join(pnpmDir, dir, "node_modules", "@jridgewell", "trace-mapping", "dist", "trace-mapping.umd.js"));
}
const { TraceMap, originalPositionFor } = loadTraceMapping();

function parse(argv) {
  const o = { op: "create", framework: "mreact", count: 0, top: 32 };
  const pos = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--count") o.count = Number(argv[++i]);
    else if (argv[i] === "--top") o.top = Number(argv[++i]);
    else pos.push(argv[i]);
  }
  if (pos[0]) o.op = pos[0];
  if (pos[1]) o.framework = pos[1];
  if (!o.count) o.count = o.op === "createMany" ? 30 : ["create", "replace", "append"].includes(o.op) ? 250 : 6000;
  return o;
}

const o = parse(process.argv.slice(2));
const { html, distDir, outfile } = await build(o.framework, { sourcemap: true });
const map = new TraceMap(readFileSync(`${outfile}.map`, "utf8"));
const server = await serve(distDir);
const port = server.address().port;
const browser = await chromium.launch({ args: ["--js-flags=--expose-gc", "--no-sandbox"] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/${o.framework}.html`, { waitUntil: "load" });
  await page.waitForFunction("typeof window.__runOp === 'function'", { timeout: 15000 });
  if (errors.length) throw new Error(errors.join("\n"));
  await page.evaluate(([op, c]) => window.__runOp(op, Math.max(20, Math.floor(c / 4))), [o.op, o.count]);

  const client = await page.context().newCDPSession(page);
  await client.send("Profiler.enable");
  await client.send("Profiler.setSamplingInterval", { interval: 40 });
  await client.send("Profiler.start");
  await page.evaluate(([op, c]) => window.__runOp(op, c), [o.op, o.count]);
  const { profile } = await client.send("Profiler.stop");

  const nodes = new Map();
  for (const n of profile.nodes) nodes.set(n.id, n);
  const selfSamples = new Map();
  for (const id of profile.samples) selfSamples.set(id, (selfSamples.get(id) || 0) + 1);
  const interval = (profile.endTime - profile.startTime) / Math.max(1, profile.samples.length);

  function nameFor(cf) {
    // Resolve minified position to an original name when possible.
    if (cf.url && cf.url.endsWith(`${o.framework}.js`) && cf.lineNumber >= 0) {
      const orig = originalPositionFor(map, { line: cf.lineNumber + 1, column: cf.columnNumber });
      if (orig && orig.name) return orig.name;
      if (orig && orig.source) return `${cf.functionName || "?"} @ ${orig.source.split("/").pop()}:${orig.line}`;
    }
    return cf.functionName || "(anonymous)";
  }

  const selfByFn = new Map();
  let total = 0;
  for (const [id, count] of selfSamples) {
    const n = nodes.get(id);
    if (!n) continue;
    total += count;
    const key = nameFor(n.callFrame);
    selfByFn.set(key, (selfByFn.get(key) || 0) + count);
  }
  const rows = [...selfByFn.entries()]
    .map(([fn, c]) => ({ fn, ms: round((c * interval) / 1000), pct: round((c / total) * 100) }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, o.top);
  console.log(`op=${o.op} framework=${o.framework} count=${o.count} totalSelfMs=${round((total * interval) / 1000)}`);
  console.log("self_ms\tself%\tfunction");
  for (const r of rows) console.log(`${r.ms}\t${r.pct}%\t${r.fn}`);
} finally {
  await browser.close();
  server.close();
}

function round(v) { return Math.round(v * 100) / 100; }
