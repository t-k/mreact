import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Bench } from "tinybench";

async function measureStream() {
  const { mreactAppRouterAdapter: adapter } = await import(
    pathToFileURL(resolve("benchmarks/router/adapters/mreact-app-router.ts")).href
  );
  try {
    await adapter.setup();
    await adapter.renderToString(1_000);
    const bench = new Bench({ time: 1_500, warmupTime: 250, retainSamples: true });
    bench.add("stream", async () => { await adapter.renderToStream(1_000); });
    await bench.run();
    const result = bench.tasks[0]?.result;
    assert(result?.state === "completed", "SSR streaming bench must complete");
    return { throughput: result.throughput.mean, p75: result.latency.p75, samples: result.latency.samples };
  } finally {
    await adapter.teardown();
  }
}

async function measureBrowser() {
  const { createBrowserFixture } = await import("../primitive-browser/fixture.js");
  const { browserEntrySource, measurePrimitiveBrowserTrial, serveDirectory } =
    await import("../primitive-browser/run.js");
  const framework = "mreact react-compat";
  const fixture = await createBrowserFixture(browserEntrySource(framework));
  try {
    const server = await serveDirectory(fixture.outDir);
    try {
      const samples = [];
      for (let trial = 0; trial < 4; trial += 1) {
        const sample = await measurePrimitiveBrowserTrial({
          url: server.url,
          framework,
          caseName: "browser update every 10th in 10k rows",
          count: 10_000,
          warmupRuns: 5,
        });
        assert(sample.status === "completed", sample.error);
        samples.push(sample);
      }
      return samples;
    } finally {
      await server.close();
    }
  } finally {
    await rm(fixture.rootDir, { force: true, recursive: true });
  }
}

const mode = process.argv[2];
assert(mode === "stream" || mode === "browser", "Expected stream or browser");
console.log(JSON.stringify(await (mode === "stream" ? measureStream() : measureBrowser())));
