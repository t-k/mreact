import { join } from "node:path";
import { writeJsonFile, writeTextFile } from "../shared/results.js";
import type { BenchmarkEnvironment } from "../shared/types.js";
import { notifyMeasurementsComplete } from "./lifecycle-protocol.js";
import { formatRouterBenchmarkMarkdown } from "./report.js";
import { runRouterBenchmarks } from "./runner.js";
import type { RouterBenchmarkAdapter, RouterBenchmarkCleanupResult } from "./types.js";

export async function saveRouterBenchmarkRun(
  adapters: readonly RouterBenchmarkAdapter[],
  directory: string,
  environment: BenchmarkEnvironment,
  options: { benchTimeMs?: number; warmupTimeMs?: number } = {},
): Promise<{ status: "completed" | "failed" }> {
  let cleanup: RouterBenchmarkCleanupResult[] = [];
  let failedMeasurements = false;
  try {
    await runRouterBenchmarks(adapters, {
      ...options,
      async onMeasurementsComplete(rows) {
        failedMeasurements = rows.some((row) => row.status === "failed");
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
    const status =
      failedMeasurements || cleanup.some((result) => result.status === "failed")
        ? "failed"
        : "completed";
    await writeJsonFile(join(directory, "router.lifecycle.json"), { status, cleanup });
    return { status };
  } catch (error) {
    await writeJsonFile(join(directory, "router.lifecycle.json"), {
      status: "failed",
      cleanup,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "failed" };
  }
}
