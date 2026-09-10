import { routerBenchmarkAdapters } from "./adapters/index.js";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { installLifecycleDiagnostics } from "./lifecycle-protocol.js";
import { saveRouterBenchmarkRun } from "./run-output.js";

installLifecycleDiagnostics();
const directory = process.env.MREACT_BENCHMARK_RESULTS_DIR;
if (!directory) throw new Error("The router benchmark worker requires a results directory");
const environment = await collectBenchmarkEnvironment([
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
const result = await saveRouterBenchmarkRun(routerBenchmarkAdapters, directory, environment);
if (result.status === "failed") {
  console.error(`Router benchmark failure details: ${JSON.stringify(result)}`);
  process.exitCode = 1;
}
