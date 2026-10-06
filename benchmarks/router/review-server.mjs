import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

// Run against a built checkout; output includes every sample for comparison.
const root = resolve(process.argv[2] ?? ".");
const output = resolve(process.argv[3]);
const originalRead = fs.promises.readFile;
let reads = 0;
fs.promises.readFile = (...args) => {
  reads += 1;
  return originalRead(...args);
};
syncBuiltinESMExports();
const { createMemoryRouteCache } = await import(
  pathToFileURL(join(root, "packages/router/dist/cache.js"))
);
const assets = await import(pathToFileURL(join(root, "packages/router/dist/built-assets.js")));
const { buildApp } = await import(pathToFileURL(join(root, "packages/router/dist/build.js")));
const { createBuiltRequestRuntime } = await import(
  pathToFileURL(join(root, "packages/router/dist/serve.js"))
);
const dir = await mkdtemp(join(tmpdir(), "mreact-review-server-"));
const originalNow = Date.now;
const result = { node: process.version, root, timestamp: new Date().toISOString(), samples: [] };
function stats(name, samples, extra = {}) {
  const ordered = [...samples].sort((a, b) => a - b);
  result.samples.push({
    name,
    median: ordered[Math.floor(ordered.length / 2)],
    p95: ordered[Math.ceil(ordered.length * 0.95) - 1],
    samples,
    ...extra,
  });
}
function entry(key) {
  return {
    body: key,
    cacheControl: "s-maxage=60",
    expiresAt: 2000000,
    path: `/${key}`,
    status: 200,
  };
}
try {
  Date.now = () => 1000000;
  for (const capacity of [100, 1000, 10000]) {
    for (const mode of ["churn", "get", "replace"]) {
      const samples = [];
      for (let run = -30; run < 21; run++) {
        const cache = createMemoryRouteCache({ maxEntries: capacity });
        for (let i = 0; i < capacity; i++) cache.set(String(i), entry(String(i)));
        const start = performance.now();
        const operations = mode === "churn" ? 1000 : 10000;
        for (let i = 0; i < operations; i++) {
          if (mode === "get") cache.get(String(i % capacity));
          else {
            const key = mode === "churn" ? `new-${i}` : String(i % capacity);
            cache.set(key, entry(key));
          }
        }
        if (run >= 0) samples.push(performance.now() - start);
      }
      stats(`cache-${mode}-${capacity}`, samples, { operations: mode === "churn" ? 1000 : 10000 });
    }
  }
  Date.now = originalNow;
  const appDir = join(dir, "app"),
    outDir = join(dir, "out");
  await mkdir(join(appDir, "products", "$id"), { recursive: true });
  await mkdir(join(dir, "public"), { recursive: true });
  await writeFile(
    join(appDir, "products", "$id", "route.ts"),
    'export function GET() { return new Response("dynamic"); }',
  );
  for (let i = 0; i < 32; i++)
    await writeFile(join(dir, "public", `asset-${i}.txt`), "x".repeat(4096));
  await buildApp({ projectRoot: dir, routesDir: "app", outDir, targets: ["node"] });
  const runtimeStart = performance.now();
  const runtimeReads = reads;
  const runtime = await createBuiltRequestRuntime({ outDir });
  result.coldRuntime = {
    elapsed: performance.now() - runtimeStart,
    readFileCalls: reads - runtimeReads,
  };
  const firstDynamicStart = performance.now();
  const firstDynamicReads = reads;
  const firstDynamic = await runtime.render(new Request("http://local.test/products/42"));
  if (firstDynamic.status !== 200)
    throw new Error(`Unexpected first response ${firstDynamic.status}`);
  await firstDynamic.text();
  result.firstDynamic = {
    elapsed: performance.now() - firstDynamicStart,
    readFileCalls: reads - firstDynamicReads,
  };
  for (const mode of ["dynamic-repeat", "dynamic-many", "public-hit"]) {
    const samples = [];
    let readCount = 0;
    for (let run = -3; run < 15; run++) {
      const before = reads,
        start = performance.now();
      for (let i = 0; i < 100; i++) {
        const path =
          mode === "public-hit"
            ? `/asset-${i % 32}.txt`
            : `/products/${mode === "dynamic-repeat" ? 42 : i}`;
        const response = await runtime.render(new Request(`http://local.test${path}`));
        if (response.status !== 200)
          throw new Error(`Unexpected response ${response.status} for ${path}`);
        await response.text();
      }
      if (run >= 0) {
        samples.push(performance.now() - start);
        readCount += reads - before;
      }
    }
    stats(mode, samples, { requests: 1500, readFileCalls: readCount });
  }
  assets.clearBuiltPublicAssetCacheForTest();
  const allowed = new Set(Array.from({ length: 32 }, (_, i) => `asset-${i}.txt`));
  for (const path of ["/products/42", "/asset-0.txt"]) {
    const before = reads,
      start = performance.now();
    for (let i = 0; i < 100; i++)
      await (await assets.readBuiltPublicAsset(outDir, path, allowed))?.arrayBuffer();
    result.samples.push({
      name: `public-helper-${path}`,
      elapsed: performance.now() - start,
      readFileCalls: reads - before,
    });
  }
  result.publicCacheEntries = assets.getBuiltPublicAssetCacheSizeForTest();
  result.publicCacheBytes = assets.getBuiltPublicAssetCacheBytesForTest?.();
  await writeFile(output, JSON.stringify(result, null, 2));
} finally {
  Date.now = originalNow;
  fs.promises.readFile = originalRead;
  syncBuiltinESMExports();
  await rm(dir, { recursive: true, force: true });
}
