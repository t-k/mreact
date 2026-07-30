// @vitest-environment happy-dom

import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../../packages/compiler/src/index.js";
import { afterEach, describe, expect, test, vi } from "vitest";

const fixtureRoot = join(
  process.cwd(),
  "benchmarks",
  "js-framework-benchmark",
  "frameworks",
  "keyed",
  "mreact",
);
const compiledFixtureRoot = join(
  process.cwd(),
  "benchmarks",
  "js-framework-benchmark",
  "frameworks",
  "keyed",
  "mreact-compiled",
);
const reactCompatFixtureRoot = join(
  process.cwd(),
  "benchmarks",
  "js-framework-benchmark",
  "frameworks",
  "keyed",
  "mreact-react-compat",
);
const reactCompatVdomFixtureRoot = join(
  process.cwd(),
  "benchmarks",
  "js-framework-benchmark",
  "frameworks",
  "keyed",
  "mreact-react-compat-vdom",
);
const octaneFixtureRoot = join(
  process.cwd(),
  "benchmarks",
  "js-framework-benchmark",
  "frameworks",
  "keyed",
  "octane",
);
const runnerPath = join(process.cwd(), "benchmarks", "js-framework-benchmark", "run-official.mjs");
const comparePath = join(process.cwd(), "benchmarks", "js-framework-benchmark", "compare.mjs");
const readmePath = join(process.cwd(), "benchmarks", "js-framework-benchmark", "README.md");
const execFileAsync = promisify(execFile);

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
    expect(packageJson.dependencies?.["@reckona/mreact-reactive-core"]).toBe("0.0.198");
    expect(packageJson.dependencies?.["@reckona/mreact-reactive-dom"]).toBe("0.0.198");
    expect(packageJson.dependencies?.["@reckona/mreact-compiler"]).toBe("0.0.198");
    expect(packageJson["js-framework-benchmark"]?.frameworkHomeURL).toBe(
      "https://github.com/t-k/mreact",
    );
  });

  test("is the sole compiler-generated native keyed fixture", async () => {
    const config = await readFile(join(fixtureRoot, "vite.config.ts"), "utf8");
    const main = await readFile(join(fixtureRoot, "src", "main.tsx"), "utf8");
    const entry = await readFile(join(fixtureRoot, "src", "index.ts"), "utf8");

    expect(config).toContain('target: "client"');
    expect(config).toContain('mode: "reactive"');
    expect(config).toContain("transform({");
    expect(main).toContain("rows.get().map((row) => (");
    expect(main).toContain("<tr key={row.id}");
    expect(entry).toContain('import { App } from "./main";');
    await expect(readFile(join(fixtureRoot, "src", "main.ts"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(join(compiledFixtureRoot, "package.json"), "utf8")).rejects.toMatchObject(
      { code: "ENOENT" },
    );
  });

  test("keeps the official keyed benchmark DOM contract in ordinary JSX", async () => {
    const html = await readFile(join(fixtureRoot, "index.html"), "utf8");
    const main = await readFile(join(fixtureRoot, "src", "main.tsx"), "utf8");

    expect(html).toContain('id="main"');
    expect(html).toContain('src="dist/main.js"');
    expect(html).not.toContain("/src/main.ts");
    expect(main).toContain("export function App()");
    for (const id of ["run", "runlots", "add", "update", "clear", "swaprows"]) {
      expect(main).toContain(`id="${id}"`);
    }
    expect(main).toContain('class="table table-hover table-striped test-data"');
    expect(main).toContain('class="preloadicon glyphicon glyphicon-remove"');
    expect(main).toContain('aria-hidden="true"');
    expect(main).toContain("next[index] = { id: row.id, label: `${row.label} !!!` };");
    expect(main).not.toContain("bindStaticKeyedSingleNodeList");
    expect(main).not.toContain("bindList");
  });
});

describe("js-framework-benchmark official runner stability", () => {
  test("replaces local fixture directories between repeated ABBA runs", async () => {
    const source = await readFile(runnerPath, "utf8");

    expect(source).toMatch(
      /async function copyLocalFixtures\(\)[\s\S]*?const target = join\(checkoutRoot,[\s\S]*?await rm\(target, \{ force: true, recursive: true \}\);[\s\S]*?await cp\([^;]*?target,/u,
    );
  });

  test("rotates and records framework order to reduce run-order drift", async () => {
    const source = await readFile(runnerPath, "utf8");

    expect(source).toContain("MREACT_JS_FRAMEWORK_ORDER_OFFSET");
    expect(source).toContain("new Date().getUTCDate() - 1");
    expect(source).toContain("function rotateFrameworks(");
    expect(source).toContain("Requested framework order");
  });

  test("reports fixed-anchor deltas alongside diff vs first", async () => {
    const source = await readFile(runnerPath, "utf8");

    expect(source).toContain("MREACT_JS_FRAMEWORK_DIFF_ANCHOR");
    expect(source).toContain('?? "react-hooks"');
    expect(source).toContain("diff vs ${escapeMarkdownTableCell(summaryDiffAnchor)}");
    expect(source).toContain("function findAnchorRow(");
    expect(source).toContain("framework.startsWith(`${anchor}-v`)");
    expect(source).toContain("MREACT_JS_FRAMEWORK_SUMMARY_ONLY");
  });

  test("regenerates a summary from persisted run metadata without the original environment", async () => {
    const resultDir = await mkdtemp(join(tmpdir(), "mreact-js-framework-summary-"));
    const rawResultDir = join(resultDir, "js-framework-benchmark-results");
    const env = { ...process.env };
    delete env.MREACT_JS_FRAMEWORKS;
    delete env.MREACT_JS_FRAMEWORK_ORDER_OFFSET;
    delete env.MREACT_JS_FRAMEWORK_DIFF_ANCHOR;
    delete env.MREACT_JS_FRAMEWORK_LOCAL_PACKAGES;

    try {
      await mkdir(rawResultDir);
      await writeFile(
        join(resultDir, "js-framework-benchmark-run.json"),
        `${JSON.stringify({
          selectedFrameworks: ["keyed/octane", "keyed/react-hooks"],
          frameworkOrderOffset: 0,
          diffAnchorFramework: "react-hooks",
          useLocalPackages: false,
        })}\n`,
      );

      for (const framework of ["octane-v0.1.19-keyed", "react-hooks-v19.2.8-keyed"]) {
        await writeFile(
          join(rawResultDir, `${framework}_01_run1k.json`),
          `${JSON.stringify({ values: { total: { median: 10 } } })}\n`,
        );
      }

      await execFileAsync(process.execPath, [runnerPath], {
        env: {
          ...env,
          MREACT_BENCHMARK_RESULTS_DIR: resultDir,
          MREACT_JS_FRAMEWORK_SUMMARY_ONLY: "1",
        },
      });

      const summary = await readFile(join(resultDir, "js-framework-benchmark.md"), "utf8");
      expect(summary).toContain("Requested framework order: keyed/octane, keyed/react-hooks");
      expect(summary).toContain("Fixed diff anchor: react-hooks");
      expect(summary).toContain("published npm package versions");
      expect(summary).not.toContain("keyed/marko, keyed/vue");
    } finally {
      await rm(resultDir, { force: true, recursive: true });
    }
  });
});

describe("js-framework-benchmark Octane keyed fixture", () => {
  test("declares exact Octane metadata and the official production build", async () => {
    const packageJson = JSON.parse(
      await readFile(join(octaneFixtureRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
      "js-framework-benchmark"?: Record<string, string>;
    };

    expect(packageJson.scripts?.["build-prod"]).toBe("vite build --mode production");
    expect(packageJson.dependencies?.octane).toBe("0.1.19");
    expect(packageJson.devDependencies?.["@octanejs/vite-plugin"]).toBe("0.1.19");
    expect(packageJson.devDependencies?.terser).toBe("5.46.0");
    expect(packageJson["js-framework-benchmark"]?.frameworkVersionFromPackage).toBe("octane");
    expect(packageJson["js-framework-benchmark"]?.frameworkHomeURL).toBe(
      "https://github.com/octanejs/octane",
    );
  });

  test("renders the official keyed table shape from Octane state", async () => {
    const html = await readFile(join(octaneFixtureRoot, "index.html"), "utf8");
    const main = await readFile(join(octaneFixtureRoot, "src", "main.tsrx"), "utf8");

    expect(html).toContain('id="main"');
    expect(html).toContain('src="dist/main.js"');
    expect(html).not.toContain("/src/main.tsrx");
    expect(main).toContain('id="run"');
    expect(main).toContain('id="runlots"');
    expect(main).toContain('id="add"');
    expect(main).toContain('id="update"');
    expect(main).toContain('id="clear"');
    expect(main).toContain('id="swaprows"');
    expect(main).toContain('class="table table-hover table-striped test-data"');
    expect(main).toContain('class="preloadicon glyphicon glyphicon-remove"');
    expect(main).toContain('aria-hidden="true"');
    expect(main).toContain("@for (const row of rows; key row.id)");
    expect(main).toContain("const [selected, setSelected] = useState<number | null>(null)");
    expect(main).toContain("let nextId = 1");
    expect(main).toContain("setRows((current) => [...current, ...buildData(1_000)])");
    expect(main).not.toContain("requestAnimationFrame");
    expect(main).not.toContain("classList");
  });

  test("replaces Node environment checks in the production browser bundle", async () => {
    const config = await readFile(join(octaneFixtureRoot, "vite.config.ts"), "utf8");

    expect(config).toContain('"process.env.NODE_ENV"');
    expect(config).toContain('"production"');
  });
});

describe("js-framework-benchmark mreact react-compat keyed fixture", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.resetModules();
  });

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
    expect(packageJson.dependencies?.["@reckona/mreact-compat"]).toBe("0.0.198");
    expect(packageJson.dependencies?.["@reckona/mreact-reactive-dom"]).toBe("0.0.198");
    expect(packageJson.dependencies?.["@reckona/mreact-compiler"]).toBe("0.0.198");
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

  test("compiles the TSX source with the installed compat compiler", async () => {
    const config = await readFile(join(reactCompatFixtureRoot, "vite.config.ts"), "utf8");
    const source = await readFile(join(reactCompatFixtureRoot, "src", "main.tsx"), "utf8");

    expect(config).toContain('entry: "src/main.tsx"');
    expect(config).toContain('mode: "compat"');
    expect(config).toContain("transform({");
    expect(source).toContain("export function App(");
  });

  test("uses compiler-lowered reactive DOM blocks for the hot row fixture", async () => {
    const main = await readFile(join(reactCompatFixtureRoot, "src", "main.ts"), "utf8");

    expect(main).toContain("createReactiveDomBlock");
    expect(main).toContain("@reckona/mreact-reactive-dom");
    expect(main).toContain("function reduceAppState");
    expect(main).toContain('case "update":');
    expect(main).toContain("dispatchBenchAction");
    expect(main).toContain("previous.selected === next.selected && previous.row === next.row");
    expect(main).toContain('RowMemo.__mreactMemoCompareProps = ["selected", "row"];');
    expect(main).toContain("return _createReactiveDomBlock((props) =>");
    expect(main).toContain('document.createElement("tr")');
    expect(main).toContain("bindEvent");
    expect(main).toContain('const _disposeEvent = _bindEvent(_a, "click", (event) => {');
    expect(main).toContain("return (selectRow(props.row.id));");
    expect(main).toContain("return (removeRow(props.row.id));");
    expect(main).not.toContain("const _h = (() => selectRow(props.row.id));");
    expect(main).not.toContain('const _disposeEvent = typeof _h === "function" ? _bindEvent');
    expect(main.slice(main.indexOf("function Row"))).not.toContain("addEventListener");
  });

  test("keeps checked output identical to the current public compat compiler", async () => {
    const source = await readFile(join(reactCompatFixtureRoot, "src", "main.tsx"), "utf8");
    const generated = await readFile(join(reactCompatFixtureRoot, "src", "main.ts"), "utf8");
    const output = transform({
      code: source,
      filename: "main.tsx",
      target: "client",
      dev: false,
      mode: "compat",
    });
    const generatedBody = generated.slice(generated.indexOf("import ")).trim();

    expect(output.diagnostics.filter((diagnostic) => diagnostic.level === "error")).toEqual([]);
    expect(generatedBody).toBe(output.code.trim());
    expect(generatedBody).toContain("bindCompilerKeyedSingleNodeList");
    expect(generatedBody).toContain("selectedClass");
    expect(generatedBody).not.toContain("project:");
    expect(generatedBody).toContain("REACTIVE_STATE_BINDING_META");
  });

  test("runs the official keyed table actions with stable keyed row identity", async () => {
    document.body.innerHTML = [
      '<button id="run"></button>',
      '<button id="runlots"></button>',
      '<button id="add"></button>',
      '<button id="update"></button>',
      '<button id="clear"></button>',
      '<button id="swaprows"></button>',
      '<table><tbody id="tbody"></tbody></table>',
    ].join("");
    vi.resetModules();

    await import("./frameworks/keyed/mreact-react-compat/src/main.ts");

    const click = async (target: string | HTMLElement): Promise<void> => {
      const element =
        typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;

      if (element === null) {
        throw new Error(`Missing ${target}`);
      }

      element.click();
      await flushEffects();
    };
    const rows = (): HTMLTableRowElement[] =>
      Array.from(document.querySelectorAll<HTMLTableRowElement>("#tbody tr"));
    const rowLabel = (row: HTMLTableRowElement): string => row.cells[1]?.textContent ?? "";

    await click("#run");
    expect(rows()).toHaveLength(1_000);
    const firstRow = rows()[0] as HTMLTableRowElement;
    const secondRow = rows()[1] as HTMLTableRowElement;
    const nineHundredNinetyNinthRow = rows()[998] as HTMLTableRowElement;
    const firstLabel = rowLabel(firstRow);
    const secondLabel = rowLabel(secondRow);

    await click("#update");
    expect(rows()[0]).toBe(firstRow);
    expect(rowLabel(firstRow)).toBe(`${firstLabel} !!!`);
    expect(rowLabel(secondRow)).toBe(secondLabel);

    await click(secondRow.cells[1]?.querySelector("a") as HTMLAnchorElement);
    expect(secondRow.className).toBe("danger");

    await click("#swaprows");
    expect(rows()[1]).toBe(nineHundredNinetyNinthRow);
    expect(rows()[998]).toBe(secondRow);
    expect(secondRow.className).toBe("danger");

    await click(secondRow.cells[2]?.querySelector("a") as HTMLAnchorElement);
    expect(rows()).toHaveLength(999);
    expect(secondRow.isConnected).toBe(false);

    await click("#add");
    expect(rows()).toHaveLength(1_999);
    const retainedRow = rows()[0] as HTMLTableRowElement;
    await click("#clear");
    expect(rows()).toHaveLength(0);
    expect(retainedRow.isConnected).toBe(false);

    await click("#runlots");
    expect(rows()).toHaveLength(10_000);
    await click("#clear");
    expect(rows()).toHaveLength(0);
  });

  test("keeps a plain VDOM react-compatible fixture beside the lowered fixture", async () => {
    const main = await readFile(join(reactCompatVdomFixtureRoot, "src", "main.ts"), "utf8");

    expect(main).toContain("createElement");
    expect(main).toContain("createRoot");
    expect(main).toContain("flushSync");
    expect(main).toContain("memo");
    expect(main).toContain("useReducer");
    expect(main).toContain('from "@reckona/mreact-compat"');
    expect(main).toContain("type AppAction");
    expect(main).toContain("function reduceAppState");
    expect(main).toContain('case "update":');
    expect(main).toContain("dispatchBenchAction");
    expect(main).toContain("key: row.id");
    expect(main).toContain("createElement(Row");
    expect(main).toContain("previous.selected === next.selected && previous.row === next.row");
    expect(main).not.toContain("useState");
    expect(main).not.toContain("setRows?.(");
    expect(main).not.toContain("function node");
    expect(main).not.toContain("@reckona/mreact-reactive-dom");
  });

  test("builds with production defines used by the benchmark hot paths", async () => {
    const config = await readFile(join(reactCompatFixtureRoot, "vite.config.ts"), "utf8");

    expect(config).toContain("__MREACT_CLIENT_DEVTOOLS__");
    expect(config).toContain('"false"');
    expect(config).toContain('"process.env.NODE_ENV"');
    expect(config).toContain('"production"');
  });

  test("uses the same tenth-row update shape as the official React fixture", async () => {
    const main = await readFile(join(reactCompatVdomFixtureRoot, "src", "main.ts"), "utf8");

    expect(main).toContain("const next = rows.slice(0);");
    expect(main).toContain("for (let index = 0; index < next.length; index += 10)");
    expect(main).toContain("next[index] = { id: row.id, label: `${row.label} !!!` };");
    expect(main).not.toContain("return rows.map((row, index)");
  });
});

describe("js-framework-benchmark mreact keyed production build", () => {
  test("builds with production defines used by reactive-core hot paths", async () => {
    const config = await readFile(join(fixtureRoot, "vite.config.ts"), "utf8");

    expect(config).toContain("__MREACT_CLIENT_DEVTOOLS__");
    expect(config).toContain('"false"');
  });
});

describe("js-framework-benchmark official runner", () => {
  test("maps primitive benchmark peers to upstream keyed DOM fixtures when available", async () => {
    const runner = await readFile(
      join(process.cwd(), "benchmarks", "js-framework-benchmark", "run-official.mjs"),
      "utf8",
    );

    expect(runner).toContain('official: "keyed/marko"');
    expect(runner).toContain('official: "keyed/vue"');
    expect(runner).toContain('official: "keyed/svelte"');
    expect(runner).toContain('official: "keyed/angular-cf"');
    expect(runner).toContain('official: "keyed/react-hooks"');
    expect(runner).toContain('official: "keyed/mreact-react-compat"');
    expect(runner).toContain('official: "keyed/mreact-react-compat-vdom"');
    expect(runner).toContain('official: "keyed/solid"');
    expect(runner).toContain('official: "keyed/mreact"');
    expect(runner).toContain('official: "keyed/octane"');
    expect(runner).toContain(
      '["mreact", "mreact-react-compat", "mreact-react-compat-vdom", "octane"]',
    );
    expect(runner).toContain("qwik: krausest/js-framework-benchmark keyed/qwik currently fails");
    expect(runner).toContain("qwik-v2");
    expect(runner).toContain("solid-v2");
  });

  test("uses mreact as the sole native fixture and supports generic ABBA framework selection", async () => {
    const runner = await readFile(runnerPath, "utf8");
    const compare = await readFile(comparePath, "utf8");

    expect(runner).not.toContain("mreact-compiled");
    expect(compare).toContain('argumentsByName.get("framework") ?? "keyed/mreact"');
    expect(compare).toContain("selectedFramework: selectedFramework");
    expect(compare).toContain("MREACT_JS_FRAMEWORKS: selectedFramework");
    expect(compare).not.toContain("mreact-compiled");
  });

  test("documents the repository-local Octane comparison fixture", async () => {
    const readme = await readFile(readmePath, "utf8");

    expect(readme).toContain("Octane 0.1.19 keyed fixture");
    expect(readme).toContain("MREACT_JS_FRAMEWORKS=keyed/octane");
  });

  test("skips Playwright browser downloads during official dependency installation", async () => {
    const runner = await readFile(
      join(process.cwd(), "benchmarks", "js-framework-benchmark", "run-official.mjs"),
      "utf8",
    );

    expect(runner).toContain('PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"');
  });

  test("accepts the official root lockfile peer graph without weakening nested installs", async () => {
    const runner = await readFile(
      join(process.cwd(), "benchmarks", "js-framework-benchmark", "run-official.mjs"),
      "utf8",
    );

    expect(runner).toContain(
      'await run("npm", ["ci", "--ignore-scripts", "--legacy-peer-deps"], checkoutRoot);',
    );
    expect(runner).toContain('await run("npm", ["ci"], join(checkoutRoot, "server"));');
    expect(runner).toContain('await run("npm", ["ci"], join(checkoutRoot, "webdriver-ts"));');
  });

  test("compiles the official webdriver runner after installing dependencies", async () => {
    const runner = await readFile(
      join(process.cwd(), "benchmarks", "js-framework-benchmark", "run-official.mjs"),
      "utf8",
    );

    expect(runner).toContain(
      'await run("npm", ["run", "compile"], join(checkoutRoot, "webdriver-ts"));',
    );
  });

  test("uses local mreact package builds by default for unreleased benchmark changes", async () => {
    const runner = await readFile(
      join(process.cwd(), "benchmarks", "js-framework-benchmark", "run-official.mjs"),
      "utf8",
    );

    expect(runner).toContain("MREACT_JS_FRAMEWORK_LOCAL_PACKAGES");
    expect(runner).toContain("const useLocalPackages = parseBooleanEnv");
    expect(runner).toContain("await prepareLocalPackages();");
    expect(runner).toContain("await applyLocalFixtureDependencies(fixtureDir");
    expect(runner).toContain('return join(fixtureDir, "mreact-local-packages");');
    expect(runner).toContain(
      "benchmarkData.frameworkVersion = `${versionPackageJson.version}-local`;",
    );
    expect(runner).toContain("delete benchmarkData.frameworkVersionFromPackage;");
  });

  test("can opt out of local package builds for published npm comparisons", async () => {
    const runner = await readFile(
      join(process.cwd(), "benchmarks", "js-framework-benchmark", "run-official.mjs"),
      "utf8",
    );

    expect(runner).toContain("MREACT_JS_FRAMEWORK_LOCAL_PACKAGES=0");
    expect(runner).toContain("return defaultValue;");
  });

  test("uses build-only official rebuild path for scoped benchmark iterations", async () => {
    const runner = await readFile(
      join(process.cwd(), "benchmarks", "js-framework-benchmark", "run-official.mjs"),
      "utf8",
    );

    expect(runner).toContain("await rebuildSelectedFrameworks();");
    expect(runner).toContain("selectedBenchmarks.length === 0");
    expect(runner).toContain('import { rebuildFrameworks } from "./cli/rebuild-build-single.js";');
    expect(runner).toContain("build-only rebuild path");
  });

  test("propagates an explicit Chrome binary through every official browser check", async () => {
    const runner = await readFile(
      join(process.cwd(), "benchmarks", "js-framework-benchmark", "run-official.mjs"),
      "utf8",
    );

    expect(runner).toContain("MREACT_JS_FRAMEWORK_CHROME_BINARY");
    expect(runner).toContain("function parseChromeBinaryPath(");
    expect(runner).toContain("Chrome binary path must be absolute");
    expect(runner).toContain("Chrome binary does not exist");
    expect(runner).toContain("function chromeBinaryArgs(");
    expect(runner).toContain('"--smoketest"');
    expect(runner).toContain('"isKeyed"');
    expect(runner).toContain('"checkCSP"');
    expect(runner).toContain("await runOfficialChecks();");
    expect(runner.match(/\.\.\.chromeBinaryArgs\(\)/gu)).toHaveLength(4);
  });

  test("reports selected benchmark results with rankings and diff from best", async () => {
    const runner = await readFile(
      join(process.cwd(), "benchmarks", "js-framework-benchmark", "run-official.mjs"),
      "utf8",
    );

    expect(runner).toContain("## Rankings");
    expect(runner).toContain(
      "Lower values are better for all js-framework-benchmark metrics reported here.",
    );
    expect(runner).toContain("diff vs ${escapeMarkdownTableCell(anchorFramework)} | unit |");
    expect(runner).toContain("formatJsFrameworkRankingSections(resultRows, summaryDiffAnchor)");
    expect(runner).toContain("formatDiffVsBest(row, bestRow)");
    expect(runner).toContain("formatDiffVsBest(row, anchorRow)");
    expect(runner).toContain("readMetricParts(files, framework, descriptor.caseId");
    expect(runner).toContain("## Results");
    expect(runner).toContain("diff vs ${escapeMarkdownTableCell(summaryDiffAnchor)} |");
  });

  test("uses official js-framework-benchmark case labels in summaries", async () => {
    const runner = await readFile(
      join(process.cwd(), "benchmarks", "js-framework-benchmark", "run-official.mjs"),
      "utf8",
    );

    expect(runner).toContain('caseName: "create rows"');
    expect(runner).toContain('caseName: "replace all rows"');
    expect(runner).toContain('caseName: "partial update"');
    expect(runner).toContain('caseName: "select row"');
    expect(runner).toContain('caseName: "swap rows"');
    expect(runner).toContain('caseName: "remove row"');
    expect(runner).toContain('caseName: "create many rows"');
    expect(runner).toContain('caseName: "append rows to large table"');
    expect(runner).toContain('caseName: "clear rows"');
    expect(runner).toContain('caseName: "ready memory"');
    expect(runner).toContain('caseName: "run memory"');
    expect(runner).toContain('caseName: "repeated clear memory"');
    expect(runner).toContain('caseName: "startup time"');
    expect(runner).toContain('caseName: "consistently interactive"');
    expect(runner).toContain('caseName: "script bootup time"');
    expect(runner).toContain('caseName: "main thread work cost"');
    expect(runner).toContain('caseName: "total byte weight"');
  });

  test("copies official Chrome traces next to the js-framework results", async () => {
    const runner = await readFile(
      join(process.cwd(), "benchmarks", "js-framework-benchmark", "run-official.mjs"),
      "utf8",
    );

    expect(runner).toContain(
      'const officialTraceDir = join(resultDir, "js-framework-benchmark-traces");',
    );
    expect(runner).toContain("await copyTraces();");
    expect(runner).toContain("Chrome trace files are stored");
  });
});
