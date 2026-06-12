import { join } from "node:path";
import { routerBenchmarkAdapters } from "./adapters/index.js";
import { formatRouterBenchmarkMarkdown } from "./report.js";
import { runRouterBenchmarks } from "./runner.js";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";

const env = await collectBenchmarkEnvironment([
  "@builder.io/qwik",
  "@analogjs/platform",
  "@qwik.dev/core",
  "@qwik.dev/router",
  "@sveltejs/kit",
  "@vue/server-renderer",
  "marko",
  "next",
  "nuxt",
  "react",
  "react-dom",
  "solid-js",
  "solid-js-2",
  "svelte",
  "vue",
]);
const rows = await runRouterBenchmarks(routerBenchmarkAdapters);
const dir = await createDatedResultsDir();
const markdown = formatRouterBenchmarkMarkdown(env, rows);

await writeJsonFile(join(dir, "router.summary.json"), rows);
await writeTextFile(join(dir, "router.md"), markdown);

console.log(markdown);

if (rows.some((row) => row.status === "failed")) {
  process.exitCode = 1;
}
