import { register } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { primitiveCases } from "./cases.js";
import { createBenchmarkDom } from "./dom.js";
import { collectPrimitiveCaseSamples } from "./runner.js";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { formatBenchmarkMarkdown } from "../shared/report.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";
import { summarizeSamples } from "../shared/stats.js";
import type { BenchmarkRow } from "../shared/types.js";

const packageAliases = {
  "@reckona/mreact-reactive-core": pathToFileURL(
    join(process.cwd(), "packages", "reactive-core", "src", "index.ts"),
  ).href,
  "@reckona/mreact-reactive-core/testing": pathToFileURL(
    join(process.cwd(), "packages", "reactive-core", "src", "testing.ts"),
  ).href,
  "@reckona/mreact-reactive-dom": pathToFileURL(
    join(process.cwd(), "packages", "reactive-dom", "src", "index.ts"),
  ).href,
};

register(
  `data:text/javascript,${encodeURIComponent(`
    const aliases = new Map(${JSON.stringify(Object.entries(packageAliases))});

    export async function resolve(specifier, context, nextResolve) {
      const url = aliases.get(specifier);

      if (url !== undefined) {
        return { url, shortCircuit: true };
      }

      return nextResolve(specifier, context);
    }
  `)}`,
  pathToFileURL(join(process.cwd(), "benchmarks", "primitive", "run.ts")),
);

const { primitiveAdapters } = await import("./adapters/index.js");

const rows: BenchmarkRow[] = [];

for (const adapter of primitiveAdapters) {
  for (const benchmarkCase of primitiveCases) {
    const runCase = adapter.cases[benchmarkCase.name];

    if (runCase === undefined) {
      rows.push({
        suite: "primitive",
        framework: adapter.name,
        version: adapter.version,
        caseName: benchmarkCase.name,
        status: "unsupported",
        metric: benchmarkCase.metric,
        unit: benchmarkCase.unit,
        value: 0,
        notes: ["adapter does not implement this case"],
      });
      continue;
    }

    try {
      const result = await collectPrimitiveCaseSamples(
        () => ({ ...createBenchmarkDom(), count: benchmarkCase.count }),
        runCase,
      );
      const summary = summarizeSamples(result.samples);

      rows.push({
        suite: "primitive",
        framework: adapter.name,
        version: adapter.version,
        caseName: benchmarkCase.name,
        status: "completed",
        metric: benchmarkCase.metric,
        unit: benchmarkCase.unit,
        value: summary.median,
        summary,
        notes: result.notes,
      });
    } catch (error) {
      rows.push({
        suite: "primitive",
        framework: adapter.name,
        version: adapter.version,
        caseName: benchmarkCase.name,
        status: "failed",
        metric: benchmarkCase.metric,
        unit: benchmarkCase.unit,
        value: 0,
        notes: [error instanceof Error ? error.message : String(error)],
      });
    }
  }
}

const env = await collectBenchmarkEnvironment([
  "marko",
  "@builder.io/qwik",
  "@qwik.dev/core",
  "react",
  "react-dom",
  "solid-js",
  "solid-js-2",
]);
const dir = await createDatedResultsDir();
const markdown = formatBenchmarkMarkdown("Primitive Benchmark", env, rows, {
  caseDescriptions: Object.fromEntries(
    primitiveCases.map((benchmarkCase) => [benchmarkCase.name, benchmarkCase.description]),
  ),
});

await writeJsonFile(join(dir, "env.json"), env);
await writeJsonFile(join(dir, "primitive.summary.json"), rows);
await writeTextFile(join(dir, "primitive.md"), markdown);

console.log(markdown);

if (rows.some((row) => row.status === "failed")) {
  process.exitCode = 1;
}
