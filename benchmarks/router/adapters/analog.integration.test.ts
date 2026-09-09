import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { superviseRouterBenchmark } from "../process-supervisor.js";

// Opt in because this builds a complete production app and installs its pinned dependencies.
it.skipIf(process.env.MREACT_ANALOG_INTEGRATION !== "1").each([1, 2, 3])(
  "renders every row on post-readiness SSR requests after cold build %i",
  async () => {
    const directory = await mkdtemp(
      join(process.env.MREACT_BENCHMARK_RESULTS_DIR ?? tmpdir(), "analog-ssr-integration-"),
    );
    let passed = false;
    try {
      const result = await superviseRouterBenchmark({
        entry: fileURLToPath(new URL("../test-fixtures/analog-ssr-worker.ts", import.meta.url)),
        directory,
        // Analog selects its JIT testing mode whenever VITEST is truthy.
        env: { NODE_ENV: "production", VITEST: "" },
        runTimeoutMs: 300_000,
      });
      expect(result.status).toBe("completed");
      expect(result.forced).toBe(false);
      expect(result.remainingGroups).toEqual([]);
      expect(result.unverifiedGroups).toEqual([]);
      passed = true;
    } finally {
      if (passed) await rm(directory, { recursive: true, force: true });
      else console.error(`Analog SSR diagnostic artifacts: ${directory}`);
    }
  },
  360_000,
);
