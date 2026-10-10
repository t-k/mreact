import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { esbuild, chromium, worktreeRoot } from "../benchmarks/compat-micro/build.mjs";
import { createPropsBenchmarkEntry } from "./compat-props-entry.mjs";
import { transform } from "../packages/compiler/dist/index.js";
import { createCompilerModuleContext } from "../packages/compiler/dist/internal.js";

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
const packages = {
  "mreact-compat": "react-compat",
  "mreact-reactive-core": "reactive-core",
  "mreact-reactive-dom": "reactive-dom",
  "mreact-shared": "shared",
};
const bundles = {};
const componentNames = { single: "SingleProp", multiple: "MultipleProps", object: "ObjectProps" };
const sourceProgram = createCompilerModuleContext({
  code: source,
  filename: "Rows.compat.tsx",
}).program;
for (const kind of ["single", "multiple", "object", "mixed"]) {
  // A standalone app imports a standalone component module. Compile the same
  // declaration through the ordinary compiler instead of measuring sibling exports.
  const kindSource =
    kind === "mixed"
      ? source
      : sourceProgram.body
          .filter((statement) => statement.declaration?.id?.name === componentNames[kind])
          .map((statement) => source.slice(statement.start, statement.end))
          .join("\n");
  const kindCompiled = transform({
    code: kindSource,
    filename: "Rows.compat.tsx",
    target: "client",
    mode: "compat",
    dev: false,
  });
  if (kindCompiled.diagnostics.length) throw new Error("Props fixture compilation failed");
  await writeFile(join(temporary, "Rows.js"), kindCompiled.code);
  await writeFile(join(output, `compiled-${kind}.js`), kindCompiled.code);
  const entry = join(temporary, `${kind}.ts`);
  await writeFile(entry, createPropsBenchmarkEntry(kind));
  const bundled = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    define: {
      "process.env.NODE_ENV": '"production"',
      __DEV__: "false",
      __MREACT_CLIENT_DEVTOOLS__: "false",
    },
    metafile: true,
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
  bundles[kind] = {
    code,
    bytes: {
      raw: code.length,
      gzip: gzipSync(code).length,
      brotli: brotliCompressSync(code).length,
    },
  };
  await writeFile(join(output, `${kind}.js`), code);
  await writeFile(
    join(output, `${kind}-metafile.json`),
    JSON.stringify(bundled.metafile, null, 2) + "\n",
  );
}
const code = bundles.mixed.code;
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
          window.measurement.verify();
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
          window.measurement.validate();
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
    settings: {
      rows: 1000,
      trials: 3,
      warmup: 6,
      samples: 24,
      updatesPerSample: 20,
      measuredBundle: "mixed",
      clientDevtools: false,
      validation: "all rows, current and next odd/even states outside timing",
    },
    bytes: bundles.mixed.bytes,
    bundleBytes: Object.fromEntries(
      Object.entries(bundles).map(([kind, bundle]) => [kind, bundle.bytes]),
    ),
    results,
    summary,
  };
  await writeFile(join(output, "props-performance.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      { output, bytes: report.bytes, bundleBytes: report.bundleBytes, summary },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
