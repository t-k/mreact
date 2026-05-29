import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { primitiveCases } from "./cases.js";
import { filterPrimitiveAdapters, filterPrimitiveCases } from "./filter.js";
import { runPrimitiveBenchmarkWorker } from "./process-runner.js";
import { registerPrimitiveBenchmarkAliases } from "./register-aliases.js";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { formatBenchmarkMarkdown } from "../shared/report.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";
import type { BenchmarkRow } from "../shared/types.js";

registerPrimitiveBenchmarkAliases(
  pathToFileURL(join(process.cwd(), "benchmarks", "primitive", "run.ts")),
);

const { primitiveAdapters } = await import("./adapters/index.js");
const selectedPrimitiveAdapters = filterPrimitiveAdapters(
  primitiveAdapters,
  process.env.BENCH_FRAMEWORKS,
);
const selectedPrimitiveCases = filterPrimitiveCases(primitiveCases, process.env.BENCH_CASES);

const rows: BenchmarkRow[] = [];

for (const benchmarkCase of selectedPrimitiveCases) {
  for (const adapter of selectedPrimitiveAdapters) {
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
      rows.push(await runPrimitiveBenchmarkWorker({ adapter, benchmarkCase }));
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
