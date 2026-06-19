// @vitest-environment happy-dom

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { afterEach, describe, expect, test, vi } from "vitest";

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
const reactCompatVdomFixtureRoot = join(
  process.cwd(),
  "benchmarks",
  "js-framework-benchmark",
  "frameworks",
  "keyed",
  "mreact-react-compat-vdom",
);

describe("js-framework-benchmark mreact keyed fixture", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.resetModules();
  });

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
    expect(main).toContain('row.label.set(`${row.label.get()} !!!`)');
    expect(main).not.toContain("row.label.set((label)");
    expect(main).toContain("if (selected.get() !== null)");
    expect(main).toContain("rows.findIndex((row) => row.id === id)");
    expect(main).toContain("const next = new Array<Row>(rows.length - 1)");
    expect(main).toContain("return next");
    expect(main).toContain("createTemplateElement");
    expect(main).toContain("const createRowTemplate = createTemplateElement<HTMLTableRowElement>(");
    expect(main).toContain('class="col-md-1"> </td>');
    expect(main).not.toContain('data-action="select"');
    expect(main).not.toContain('data-action="remove"');
    expect(main).toContain("const idText = idCell.firstChild as Text;");
    expect(main).toContain("const labelText = selectLink.firstChild as Text;");
    expect(main).toContain("function getRowId(rowElement: HTMLTableRowElement): number | undefined");
    expect(main).toContain("Number.parseInt(idCell?.textContent ?? \"\", 10)");
    expect(main).toContain("bindStaticKeyedSingleNodeList(");
    expect(main).toContain("deferEventPromotion: false");
    expect(main).toContain("selectedClass: {");
    expect(main).toContain('className: "danger"');
    expect(main).toContain("preserveInitial: true");
    expect(main).toContain("source: selected");
    expect(main).toContain('bindEvent(tbody, "click", handleRowClick);');
    expect(main).toContain('target.closest<HTMLAnchorElement>("a")');
    expect(main).toContain('classList.contains("glyphicon-remove")');
    expect(main).toContain("key: (row) => row.id");
    expect(main).not.toContain("bindList(");
    expect(main).not.toContain('itemMode: "static"');
    expect(main).not.toContain("data.set(data.get().map");
    expect(main).not.toContain("selected.get() === row.id");
    expect(main).not.toContain("bindProp(tr, \"className\"");
    expect(main).not.toContain("bindSelectorClass(");
    expect(main).not.toContain("bindEvent(selectLink");
    expect(main).not.toContain("bindEvent(removeLink");
    expect(main).not.toContain("rowElements");
    expect(main).not.toContain("previousSelectedRow");
    expect(main).not.toContain(".className =");
    expect(main).not.toContain("new WeakMap<HTMLTableRowElement, number>()");
    expect(main).not.toContain("rowIdProperty");
    expect(main).not.toContain("document.createTextNode(String(row.id))");
  });

  test("runs official keyed table actions through delegated row events", async () => {
    document.body.innerHTML = [
      '<div id="main">',
      '<button id="run"></button>',
      '<button id="runlots"></button>',
      '<button id="add"></button>',
      '<button id="update"></button>',
      '<button id="clear"></button>',
      '<button id="swaprows"></button>',
      '<table><tbody id="tbody"></tbody></table>',
      "</div>",
    ].join("");
    vi.resetModules();

    await import("./frameworks/keyed/mreact/src/main.ts");

    const click = async (selector: string): Promise<void> => {
      const element = document.querySelector<HTMLElement>(selector);

      if (element === null) {
        throw new Error(`Missing ${selector}`);
      }

      element.click();
      await flushEffects();
    };
    const rows = (): HTMLTableRowElement[] =>
      Array.from(document.querySelectorAll<HTMLTableRowElement>("#tbody tr"));
    const rowId = (row: HTMLTableRowElement): string => row.cells[0]?.textContent ?? "";
    const rowLabel = (row: HTMLTableRowElement): string => row.cells[1]?.textContent ?? "";

    await click("#run");
    expect(rows()).toHaveLength(1_000);
    expect(rowId(rows()[0] as HTMLTableRowElement)).toBe("1");

    const firstLabel = rowLabel(rows()[0] as HTMLTableRowElement);
    await click("#update");
    expect(rowLabel(rows()[0] as HTMLTableRowElement)).toBe(`${firstLabel} !!!`);

    await click("#tbody tr:nth-child(2) td:nth-child(2) a");
    expect(rows()[1]?.className).toBe("danger");

    await click("#swaprows");
    expect(rowId(rows()[998] as HTMLTableRowElement)).toBe("2");
    expect(rows()[998]?.className).toBe("danger");

    await click("#tbody tr:nth-child(999) td:nth-child(3) a");
    expect(rows()).toHaveLength(999);
    expect(rows().some((row) => rowId(row) === "2")).toBe(false);

    await click("#clear");
    expect(rows()).toHaveLength(0);
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
    expect(packageJson.dependencies?.["@reckona/mreact-reactive-dom"]).toBe("0.0.169");
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
    expect(main).toContain("document.createElement(\"tr\")");
    expect(main).toContain("bindEvent");
    expect(main).toContain('const _disposeEvent = _bindEvent(_a, "click", (event) => {');
    expect(main).toContain("return (selectRow(props.row.id));");
    expect(main).toContain("return (removeRow(props.row.id));");
    expect(main).not.toContain("const _h = (() => selectRow(props.row.id));");
    expect(main).not.toContain(
      'const _disposeEvent = typeof _h === "function" ? _bindEvent',
    );
    expect(main.slice(main.indexOf("function Row"))).not.toContain("addEventListener");
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
    expect(main).toContain('next[index] = { id: row.id, label: `${row.label} !!!` };');
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
    expect(runner).toContain('official: "keyed/mreact-react-compat-vdom"');
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
    expect(runner).toContain(
      "| rank | framework | case | value | script | paint | diff vs 1st | unit |",
    );
    expect(runner).toContain("formatJsFrameworkRankingSections(resultRows)");
    expect(runner).toContain("formatDiffVsBest(row, bestRow)");
    expect(runner).toContain("readMetricParts(files, framework, descriptor.caseId");
    expect(runner).toContain("## Results");
    expect(runner).toContain(
      "| suite | framework | case | status | metric | unit | value | script | paint | diff vs 1st |",
    );
  });

  test("uses official js-framework-benchmark case labels in summaries", async () => {
    const runner = await readFile(
      join(
        process.cwd(),
        "benchmarks",
        "js-framework-benchmark",
        "run-official.mjs",
      ),
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
      join(
        process.cwd(),
        "benchmarks",
        "js-framework-benchmark",
        "run-official.mjs",
      ),
      "utf8",
    );

    expect(runner).toContain("const officialTraceDir = join(resultDir, \"js-framework-benchmark-traces\");");
    expect(runner).toContain("await copyTraces();");
    expect(runner).toContain("Chrome trace files are stored");
  });
});
