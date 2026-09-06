import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { primitiveBrowserCases, primitiveBrowserFrameworks } from "./cases.js";

describe("primitive browser benchmark configuration", () => {
  it("covers mreact browser primitive frameworks", () => {
    expect(primitiveBrowserFrameworks).toEqual([
      "mreact",
      "mreact react-compat",
      "react",
      "solid",
      "vue",
      "svelte",
      "angular",
      "marko",
      "qwik",
    ]);
  });

  it("defines browser cases for the krausest-style primitive operations", () => {
    expect(primitiveBrowserCases.map((benchmarkCase) => benchmarkCase.name)).toEqual([
      "browser create 1k rows",
      "browser update every 10th in 10k rows",
      "browser select row in 10k rows",
      "browser clear 10k rows",
    ]);
    expect(primitiveBrowserCases.every((benchmarkCase) => benchmarkCase.description.length > 40)).toBe(
      true,
    );
  });

  it("uses stable browser sampling defaults and isolation headers", async () => {
    const source = await readFile(new URL("./run.ts", import.meta.url), "utf8");

    expect(source).toContain('process.env.MREACT_PRIMITIVE_BROWSER_WARMUP_RUNS ?? "5"');
    expect(source).toContain('process.env.MREACT_PRIMITIVE_BROWSER_MEASURED_RUNS ?? "15"');
    expect(source).toContain('"--js-flags=--expose-gc"');
    expect(source).toContain('"cross-origin-opener-policy", "same-origin"');
    expect(source).toContain('"cross-origin-embedder-policy", "require-corp"');
    expect(source).toContain("requestIdleCallback");
    expect(source).toContain("await settle();");
  });

  it("resolves mreact reactive-dom subpath entrypoints before the root alias", async () => {
    const source = await readFile(new URL("./fixture.ts", import.meta.url), "utf8");

    const internalAlias = source.indexOf(
      'find: "@reckona/mreact-reactive-dom/internal"',
    );
    const compatNormalizeAlias = source.indexOf(
      'find: "@reckona/mreact-reactive-dom/compat-normalize"',
    );
    const rootAlias = source.indexOf(
      "find: /^@reckona\\/mreact-reactive-dom$/",
    );

    expect(internalAlias).toBeGreaterThanOrEqual(0);
    expect(compatNormalizeAlias).toBeGreaterThanOrEqual(0);
    expect(rootAlias).toBeGreaterThanOrEqual(0);
    expect(internalAlias).toBeLessThan(compatNormalizeAlias);
    expect(compatNormalizeAlias).toBeLessThan(rootAlias);
    expect(source).not.toContain('find: "@reckona/mreact-reactive-dom"');
  });

  it("keeps the fixture builder import-safe and exposes a build-only smoke", async () => {
    const [runSource, buildSource, fixtureSource] = await Promise.all([
      readFile(new URL("./run.ts", import.meta.url), "utf8"),
      readFile(new URL("./build.ts", import.meta.url), "utf8"),
      readFile(new URL("./fixture.ts", import.meta.url), "utf8"),
    ]);

    expect(runSource).toContain("if (process.argv[1] !== undefined");
    expect(runSource).toContain("createBrowserFixture(browserEntrySource())");
    expect(buildSource).toContain("createBrowserFixture(browserEntrySource())");
    expect(buildSource).not.toContain("chromium");
    expect(fixtureSource).toContain("await rm(rootDir, { force: true, recursive: true });");
  });

  it("evaluates primitive browser measurements without serializing transformed node functions", async () => {
    const source = await readFile(new URL("./run.ts", import.meta.url), "utf8");

    expect(source).toContain("primitiveBrowserMeasurementExpression(");
    expect(source).not.toContain("const samples = await page.evaluate(\n          async (options)");
  });
});
