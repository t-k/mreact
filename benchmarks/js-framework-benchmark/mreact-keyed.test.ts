import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const fixtureRoot = join(
  process.cwd(),
  "benchmarks",
  "js-framework-benchmark",
  "frameworks",
  "keyed",
  "mreact",
);
const reactCompatFixtureRoot = join(
  process.cwd(),
  "benchmarks",
  "js-framework-benchmark",
  "frameworks",
  "keyed",
  "mreact-react-compat",
);

describe("js-framework-benchmark mreact keyed fixture", () => {
  test("declares the metadata and build command expected by js-framework-benchmark", async () => {
    const packageJson = JSON.parse(await readFile(join(fixtureRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
      "js-framework-benchmark"?: Record<string, string>;
    };

    expect(packageJson.scripts?.["build-prod"]).toBe("vite build --mode production");
    expect(packageJson["js-framework-benchmark"]?.frameworkVersionFromPackage).toBe(
      "@reckona/mreact-reactive-dom",
    );
    expect(packageJson.dependencies?.["@reckona/mreact-reactive-core"]).toBe("0.0.169");
    expect(packageJson.dependencies?.["@reckona/mreact-reactive-dom"]).toBe("0.0.169");
    expect(packageJson["js-framework-benchmark"]?.frameworkHomeURL).toBe(
      "https://github.com/t-k/mreact",
    );
  });

  test("keeps official action button ids and table target shape", async () => {
    const html = await readFile(join(fixtureRoot, "index.html"), "utf8");

    expect(html).toContain('id="main"');
    expect(html).toContain('id="run"');
    expect(html).toContain('id="runlots"');
    expect(html).toContain('id="add"');
    expect(html).toContain('id="update"');
    expect(html).toContain('id="clear"');
    expect(html).toContain('id="swaprows"');
    expect(html).toContain('class="table table-hover table-striped test-data"');
    expect(html).toContain('src="dist/main.js"');
    expect(html).not.toContain("/src/main.ts");
  });

  test("updates row labels through keyed row state instead of replacing the data array", async () => {
    const main = await readFile(join(fixtureRoot, "src", "main.ts"), "utf8");

    expect(main).toContain("batch(() =>");
    expect(main).toContain("row.label.set((label) => `${label} !!!`)");
    expect(main).toContain("bindList(");
    expect(main).toContain("key: (row) => row.id");
    expect(main).toContain('itemMode: "static"');
    expect(main).not.toContain("data.set(data.get().map");
  });
});

describe("js-framework-benchmark mreact react-compat keyed fixture", () => {
  test("declares react-compat metadata and build command expected by js-framework-benchmark", async () => {
    const packageJson = JSON.parse(
      await readFile(join(reactCompatFixtureRoot, "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
      "js-framework-benchmark"?: Record<string, string>;
    };

    expect(packageJson.scripts?.["build-prod"]).toBe("vite build --mode production");
    expect(packageJson["js-framework-benchmark"]?.frameworkVersionFromPackage).toBe(
      "@reckona/mreact-compat",
    );
    expect(packageJson.dependencies?.["@reckona/mreact-compat"]).toBe("0.0.169");
    expect(packageJson["js-framework-benchmark"]?.frameworkHomeURL).toBe(
      "https://github.com/t-k/mreact",
    );
  });

  test("keeps official action button ids and table target shape", async () => {
    const html = await readFile(join(reactCompatFixtureRoot, "index.html"), "utf8");

    expect(html).toContain('id="main"');
    expect(html).toContain('id="run"');
    expect(html).toContain('id="runlots"');
    expect(html).toContain('id="add"');
    expect(html).toContain('id="update"');
    expect(html).toContain('id="clear"');
    expect(html).toContain('id="swaprows"');
    expect(html).toContain('class="table table-hover table-striped test-data"');
    expect(html).toContain('src="dist/main.js"');
    expect(html).not.toContain("/src/main.ts");
  });

  test("uses react-compatible state and keyed row elements", async () => {
    const main = await readFile(join(reactCompatFixtureRoot, "src", "main.ts"), "utf8");

    expect(main).toContain("createElement");
    expect(main).toContain("createRoot");
    expect(main).toContain("flushSync");
    expect(main).toContain("memo");
    expect(main).toContain("useState");
    expect(main).toContain('from "@reckona/mreact-compat"');
    expect(main).toContain("setRows?.(updateEveryTenth");
    expect(main).toContain("key: row.id");
    expect(main).toContain("createElement(Row");
    expect(main).toContain("previous.selected === next.selected && previous.row === next.row");
    expect(main).not.toContain("function node");
    expect(main).not.toContain("@reckona/mreact-reactive-dom");
  });

  test("uses the same tenth-row update shape as the official React fixture", async () => {
    const main = await readFile(join(reactCompatFixtureRoot, "src", "main.ts"), "utf8");

    expect(main).toContain("const next = rows.slice(0);");
    expect(main).toContain("for (let index = 0; index < next.length; index += 10)");
    expect(main).toContain('next[index] = { id: row.id, label: `${row.label} !!!` };');
    expect(main).not.toContain("return rows.map((row, index)");
  });
});

describe("js-framework-benchmark official runner", () => {
  test("maps primitive benchmark peers to upstream keyed DOM fixtures when available", async () => {
    const runner = await readFile(
      join(
        process.cwd(),
        "benchmarks",
        "js-framework-benchmark",
        "run-official.mjs",
      ),
      "utf8",
    );

    expect(runner).toContain('official: "keyed/marko"');
    expect(runner).toContain('official: "keyed/vue"');
    expect(runner).toContain('official: "keyed/svelte"');
    expect(runner).toContain('official: "keyed/angular-cf"');
    expect(runner).toContain('official: "keyed/react-hooks"');
    expect(runner).toContain('official: "keyed/mreact-react-compat"');
    expect(runner).toContain('official: "keyed/solid"');
    expect(runner).toContain('official: "keyed/mreact"');
    expect(runner).toContain("qwik: krausest/js-framework-benchmark keyed/qwik currently fails");
    expect(runner).toContain("qwik-v2");
    expect(runner).toContain("solid-v2");
  });

  test("skips Playwright browser downloads during official dependency installation", async () => {
    const runner = await readFile(
      join(
        process.cwd(),
        "benchmarks",
        "js-framework-benchmark",
        "run-official.mjs",
      ),
      "utf8",
    );

    expect(runner).toContain('PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"');
  });

  test("compiles the official webdriver runner after installing dependencies", async () => {
    const runner = await readFile(
      join(
        process.cwd(),
        "benchmarks",
        "js-framework-benchmark",
        "run-official.mjs",
      ),
      "utf8",
    );

    expect(runner).toContain(
      'await run("npm", ["run", "compile"], join(checkoutRoot, "webdriver-ts"));',
    );
  });

  test("uses local mreact package builds by default for unreleased benchmark changes", async () => {
    const runner = await readFile(
      join(
        process.cwd(),
        "benchmarks",
        "js-framework-benchmark",
        "run-official.mjs",
      ),
      "utf8",
    );

    expect(runner).toContain("MREACT_JS_FRAMEWORK_LOCAL_PACKAGES");
    expect(runner).toContain("const useLocalPackages = parseBooleanEnv");
    expect(runner).toContain("await prepareLocalPackages();");
    expect(runner).toContain("await applyLocalFixtureDependencies(fixtureDir");
    expect(runner).toContain('return join(fixtureDir, "mreact-local-packages");');
    expect(runner).toContain('benchmarkData.frameworkVersion = `${versionPackageJson.version}-local`;');
    expect(runner).toContain("delete benchmarkData.frameworkVersionFromPackage;");
  });

  test("can opt out of local package builds for published npm comparisons", async () => {
    const runner = await readFile(
      join(
        process.cwd(),
        "benchmarks",
        "js-framework-benchmark",
        "run-official.mjs",
      ),
      "utf8",
    );

    expect(runner).toContain("MREACT_JS_FRAMEWORK_LOCAL_PACKAGES=0");
    expect(runner).toContain("return defaultValue;");
  });

  test("uses build-only official rebuild path for scoped benchmark iterations", async () => {
    const runner = await readFile(
      join(
        process.cwd(),
        "benchmarks",
        "js-framework-benchmark",
        "run-official.mjs",
      ),
      "utf8",
    );

    expect(runner).toContain("await rebuildSelectedFrameworks();");
    expect(runner).toContain("selectedBenchmarks.length === 0");
    expect(runner).toContain('import { rebuildFrameworks } from "./cli/rebuild-build-single.js";');
    expect(runner).toContain("build-only rebuild path");
  });

  test("reports selected benchmark results with rankings and diff from best", async () => {
    const runner = await readFile(
      join(
        process.cwd(),
        "benchmarks",
        "js-framework-benchmark",
        "run-official.mjs",
      ),
      "utf8",
    );

    expect(runner).toContain("## Rankings");
    expect(runner).toContain(
      "Lower values are better for all js-framework-benchmark metrics reported here.",
    );
    expect(runner).toContain("| rank | framework | case | value | diff vs 1st | unit |");
    expect(runner).toContain("formatJsFrameworkRankingSections(resultRows)");
    expect(runner).toContain("formatDiffVsBest(row, bestRow)");
    expect(runner).toContain("## Results");
    expect(runner).toContain(
      "| suite | framework | case | status | metric | unit | value | diff vs 1st |",
    );
  });
});
