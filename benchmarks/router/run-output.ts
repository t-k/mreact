import { join } from "node:path";
import { writeJsonFile, writeTextFile } from "../shared/results.js";
import type { BenchmarkEnvironment } from "../shared/types.js";
import { notifyMeasurementsComplete } from "./lifecycle-protocol.js";
import { formatRouterBenchmarkMarkdown } from "./report.js";
import { runRouterBenchmarks } from "./runner.js";
import type { RouterBenchmarkAdapter, RouterBenchmarkCleanupResult } from "./types.js";

export interface RouterRunOutcome {
  status: "completed" | "failed";
  measurementFailures: number;
  cleanupFailures: number;
  error?: string;
}

export async function saveRouterBenchmarkRun(
  adapters: readonly RouterBenchmarkAdapter[],
  directory: string,
  environment: BenchmarkEnvironment,
  options: { benchTimeMs?: number; warmupTimeMs?: number } = {},
): Promise<RouterRunOutcome> {
  let cleanup: RouterBenchmarkCleanupResult[] = [];
  let measurementFailures = 0;
  try {
    await runRouterBenchmarks(adapters, {
      ...options,
      async onMeasurementsComplete(rows) {
        measurementFailures = rows.filter((row) => row.status === "failed").length;
        // Arm shutdown supervision before filesystem work or adapter teardown can hang.
        await notifyMeasurementsComplete();
        const markdown = formatRouterBenchmarkMarkdown(environment, rows);
        await writeJsonFile(join(directory, "router.summary.json"), rows);
        await writeTextFile(join(directory, "router.md"), markdown);
        await writeJsonFile(join(directory, "router.lifecycle.json"), {
          status: "cleaning",
          cleanup,
        });
      },
      async onCleanupComplete(results) {
        cleanup = results;
      },
    });
    const cleanupFailures = cleanup.filter((result) => result.status === "failed").length;
    const result: RouterRunOutcome = {
      status: measurementFailures > 0 || cleanupFailures > 0 ? "failed" : "completed",
      measurementFailures,
      cleanupFailures,
    };
    await writeJsonFile(join(directory, "router.lifecycle.json"), { ...result, cleanup });
    return result;
  } catch (error) {
    const result: RouterRunOutcome = {
      status: "failed",
      measurementFailures,
      cleanupFailures: cleanup.filter((entry) => entry.status === "failed").length,
      error: error instanceof Error ? error.message : String(error),
    };
    await writeJsonFile(join(directory, "router.lifecycle.json"), { ...result, cleanup });
    return result;
  }
}
