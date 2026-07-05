import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const adapterPath = join(
  process.cwd(),
  "benchmarks/router/adapters/mreact-app-router.ts",
);

describe("mreact app-router benchmark fixtures", () => {
  it("keeps react-compat server-side fixtures on the native page path", async () => {
    const source = await readFile(adapterPath, "utf8");
    const primaryFixtureSource = source.slice(
      source.indexOf("async function ensureFixture("),
      source.indexOf("async function ensureBrowserFixture("),
    );

    expect(primaryFixtureSource).not.toContain("reactCompatSpanPageSource");
    expect(primaryFixtureSource).not.toContain("reactCompatDataGridPageSource");
    expect(primaryFixtureSource).not.toContain("renderToString");
  });

  it("measures the static cached route with an actual route cache", async () => {
    const source = await readFile(adapterPath, "utf8");

    expect(source).toContain("createMemoryRouteCache");
    expect(source).toContain('import { cacheControl } from "@reckona/mreact-router";');
    expect(source).not.toContain("@reckona/mreact-router/cache");
    expect(source).toContain("cacheControl({ maxAge: 60 })");
    expect(source).toContain("routeCache: createMemoryRouteCache()");
  });

  it("measures route-scale RSS in an isolated child process", async () => {
    const source = await readFile(adapterPath, "utf8");

    expect(source).toContain("measureRouteScaleRssInChild");
    expect(source).toContain("waitForRouteScaleRss");
    expect(source).toContain('spawn(process.execPath, ["--input-type=module", "-e", script]');
    expect(source).not.toContain("Math.max(0, process.memoryUsage().rss - beforeRss),");
  });

  it("keeps timed concurrent-load probes out of single-flight caches", async () => {
    const source = await readFile(adapterPath, "utf8");

    expect(source).not.toContain("concurrentLoadResults");
    expect(source).not.toContain("async function ensureConcurrentLoadResult");
    expect(source).toContain("await measureConcurrentLoad(logEnabled, reactCompat)");
  });

  it("keys route-scale fixtures by react-compat variant", async () => {
    const source = await readFile(adapterPath, "utf8");
    const routeScaleSource = source.slice(
      source.indexOf("async function ensureRouteScaleResult("),
      source.indexOf("async function measureRouteScale("),
    );

    expect(routeScaleSource).toContain("reactCompat");
    expect(routeScaleSource).toContain('reactCompat ? "compat" : "native"');
    expect(routeScaleSource).not.toContain("_reactCompat");
  });
});
