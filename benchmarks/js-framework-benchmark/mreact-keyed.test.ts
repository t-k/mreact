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
    expect(runner).toContain('official: "keyed/qwik"');
    expect(runner).toContain('official: "keyed/react-hooks"');
    expect(runner).toContain('official: "keyed/mreact-react-compat"');
    expect(runner).toContain('official: "keyed/solid"');
    expect(runner).toContain('official: "keyed/mreact"');
    expect(runner).toContain("qwik-v2");
    expect(runner).toContain("solid-v2");
  });
});
