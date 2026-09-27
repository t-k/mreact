import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { transform } from "../../packages/compiler/dist/index.js";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { createDatedResultsDir, writeJsonFile } from "../shared/results.js";

const filename = resolve(process.argv[2] ?? "benchmarks/js-framework-benchmark/frameworks/keyed/mreact/src/main.tsx");
const code = await readFile(filename, "utf8");
const output = transform({ code, filename, target: "client", dev: false, reportClientSpecializations: true });
const errors = output.diagnostics.filter((diagnostic) => diagnostic.level === "error");
if (errors.length > 0) {
  throw new Error(`Compiler reported ${errors.length} error(s): ${errors.map((diagnostic) => diagnostic.code).join(", ")}`);
}

const decisions = output.metadata.clientSpecializations ?? [];
const summary: Record<string, number> = {};
for (const decision of decisions) {
  const key = `${decision.name}:${decision.applied ? "applied" : decision.reason ?? "not-applied"}`;
  summary[key] = (summary[key] ?? 0) + 1;
}

const outputDir = await createDatedResultsDir(new Date(), { resultsRoot: join("benchmarks", "results", "compiler-specializations") });
await writeJsonFile(join(outputDir, "compiler-specializations.json"), {
  methodologyVersion: 1,
  filename,
  environment: await collectBenchmarkEnvironment(["@reckona/mreact-compiler"]),
  summary,
  decisions,
  runtimeImports: output.metadata.imports,
  diagnostics: output.diagnostics,
  limitations: [
    "A decision is recorded only when the reactive client emitter reaches a supported binding site.",
    "Runtime imports are module-level metadata and are not attributed to individual decisions.",
    "The report counts emitted helper sites, not runtime subscriptions, effects, or allocations.",
  ],
});
console.log(JSON.stringify({ outputDir, summary, runtimeImports: output.metadata.imports }, null, 2));
