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
});
