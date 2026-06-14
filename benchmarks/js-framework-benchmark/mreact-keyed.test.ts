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
