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
});
