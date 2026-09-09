import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatedResultsDir } from "../shared/results.js";
import { superviseRouterBenchmark } from "./process-supervisor.js";

const directory = await createDatedResultsDir();
const result = await superviseRouterBenchmark({
  entry: fileURLToPath(new URL("./run-worker.ts", import.meta.url)),
  directory,
});
try {
  console.log(await readFile(join(directory, "router.md"), "utf8"));
} catch {
  console.error(`Router benchmark did not save a report. See ${directory}/router.process.json`);
}
if (result.status === "failed") {
  console.error(
    `Router benchmark lifecycle failed. See ${directory}/router.lifecycle.json and router.process.json`,
  );
  process.exitCode = 1;
}
