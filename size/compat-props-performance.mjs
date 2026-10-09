import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { esbuild, chromium, worktreeRoot } from "../benchmarks/compat-micro/build.mjs";
import { transform } from "../packages/compiler/dist/index.js";

const output = resolve(
  process.env.MREACT_BENCHMARK_RESULTS_DIR ?? "test-results/compat-props",
  new Date().toISOString().replaceAll(/[:.]/g, "-"),
);
await mkdir(output, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), "mreact-compat-props-"));
const source = await readFile(
  new URL("./compat-props-fixture.compat.tsx", import.meta.url),
  "utf8",
);
const compiled = transform({
  code: source,
  filename: "Rows.compat.tsx",
  target: "client",
  mode: "compat",
  dev: false,
});
if (compiled.diagnostics.length || !compiled.code.includes("createReactiveDomBlock"))
  throw new Error("Expected ordinary compiler prop blocks");
await writeFile(join(output, "compiled-rows.js"), compiled.code);
await writeFile(join(temporary, "Rows.js"), compiled.code);
await writeFile(
  join(temporary, "entry.ts"),
  `
import { createElement, createRoot, flushSync, useState } from "@reckona/mreact-compat";
import { SingleProp, MultipleProps, ObjectProps } from "./Rows.js";
window.run = (kind, count) => {
  const root = createRoot(document.getElementById("app"));
  let setVersion;
  const Row = { single: SingleProp, multiple: MultipleProps, object: ObjectProps }[kind];
  function App() {
    const [version, set] = useState(0); setVersion = set;
    return Array.from({ length: count }, (_, id) => createElement(Row, kind === "single" ? { key: id, label: "value-" + version } : kind === "multiple" ? { key: id, label: "value-" + version, selected: version % 2 === 1 } : { key: id, row: { label: "value-" + version }, selected: version % 2 === 1 }));
  }
  const start = performance.now(); flushSync(() => root.render(createElement(App, null)));
  const mountMs = performance.now() - start;
  const first = document.querySelector("span");
  let version = 0;
  return {
    mountMs,
    update() { const start = performance.now(); flushSync(() => setVersion(++version)); return performance.now() - start; },
    verify() {
      const rows = document.querySelectorAll("span");
      if (rows.length !== count || rows[0] !== first || [...rows].some(row => row.textContent !== "value-" + version || (kind !== "single" && row.className !== (version % 2 ? "selected" : "")))) throw new Error("DOM identity or values changed");
    },
    dispose() { root.unmount(); }
  };
};
`,
);
const packages = {
  "mreact-compat": "react-compat",
  "mreact-reactive-core": "reactive-core",
  "mreact-reactive-dom": "reactive-dom",
  "mreact-shared": "shared",
};
const bundled = await esbuild.build({
  entryPoints: [join(temporary, "entry.ts")],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
  define: { "process.env.NODE_ENV": '"production"', __DEV__: "false" },
  legalComments: "none",
  plugins: [
    {
      name: "workspace-source",
      setup(build) {
        build.onResolve({ filter: /^@reckona\// }, (args) => {
          const [name, ...rest] = args.path.slice("@reckona/".length).split("/");
          if (!packages[name]) return null;
          let sub = rest.join("/") || "index";
          if (packages[name] === "reactive-core" && sub === "runtime-state")
            sub = "runtime-state-public";
          return { path: join(worktreeRoot, "packages", packages[name], "src", `${sub}.ts`) };
        });
      },
    },
  ],
});
const code = bundled.outputFiles[0].contents;
const server = createServer((request, response) => {
  response.setHeader("content-type", request.url === "/entry.js" ? "text/javascript" : "text/html");
  response.end(
    request.url === "/entry.js"
      ? code
      : '<!doctype html><div id="app"></div><script type="module" src="/entry.js"></script>',
  );
});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(process.env.PORT ?? 0), "127.0.0.1", resolve);
  });
  browser = await chromium.launch();
  const results = [];
  for (let trial = 0; trial < 3; trial++)
    for (const kind of ["single", "multiple", "object"]) {
      const page = await browser.newPage();
      try {
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Performance.enable");
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => typeof window.run === "function");
        await cdp.send("HeapProfiler.collectGarbage");
        const heap = async () =>
          (await cdp.send("Performance.getMetrics")).metrics.find(
            (metric) => metric.name === "JSHeapUsedSize",
          ).value;
        const beforeHeap = await heap();
        const mountMs = await page.evaluate((kind) => {
          window.measurement = window.run(kind, 1000);
          return window.measurement.mountMs;
        }, kind);
        await cdp.send("HeapProfiler.collectGarbage");
        const mountedHeapBytes = (await heap()) - beforeHeap;
        const samples = await page.evaluate(() => {
          for (let i = 0; i < 6; i++) window.measurement.update();
          const samples = Array.from({ length: 24 }, () => {
            const start = performance.now();
            for (let i = 0; i < 20; i++) window.measurement.update();
            return (performance.now() - start) / 20;
          });
          window.measurement.verify();
          window.measurement.dispose();
          return samples;
        });
        if (errors.length) throw new Error(errors.join("\n"));
        results.push({ kind, trial, mountMs, mountedHeapBytes, samples });
      } finally {
        await page.close();
      }
    }
  const median = (values) => {
    values.sort((a, b) => a - b);
    return (values[(values.length - 1) >> 1] + values[values.length >> 1]) / 2;
  };
  const summary = ["single", "multiple", "object"].map((kind) => {
    const trials = results.filter((result) => result.kind === kind);
    return {
      kind,
      medianUpdateMs: median(trials.flatMap((trial) => trial.samples)),
      medianMountMs: median(trials.map((trial) => trial.mountMs)),
      medianMountedHeapBytes: median(trials.map((trial) => trial.mountedHeapBytes)),
    };
  });
  const report = {
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceStatus: execFileSync("git", ["status", "--short", "--", "packages"], {
      encoding: "utf8",
    }),
    node: process.version,
    createdAt: new Date().toISOString(),
    browser: browser.version(),
    settings: { rows: 1000, trials: 3, warmup: 6, samples: 24, updatesPerSample: 20 },
    bytes: {
      raw: code.length,
      gzip: gzipSync(code).length,
      brotli: brotliCompressSync(code).length,
    },
    results,
    summary,
  };
  await writeFile(join(output, "props-performance.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ output, bytes: report.bytes, summary }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
