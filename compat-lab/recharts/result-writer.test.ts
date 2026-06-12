import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { writeRunSummary } from "./result-writer.js";

describe("recharts compat result writer", () => {
  test("writes summary, results json, and coverage ledger markdown", async () => {
    const dir = await mkdtemp(join(tmpdir(), "compat-lab-result-"));

    try {
      await writeRunSummary({
        outputDir: dir,
        runId: "2026-06-12-001-recharts",
        results: [
          {
            fixtureId: "recharts-bar-basic",
            ok: true,
            pixelDiffRatio: 0,
            reactDomSummary: { svgCount: 1, pathCount: 6, text: ["Jan"] },
            compatDomSummary: { svgCount: 1, pathCount: 6, text: ["Jan"] },
            artifacts: {
              reactScreenshot: "react/recharts-bar-basic.png",
              compatScreenshot: "compat/recharts-bar-basic.png",
              diffScreenshot: "diff/recharts-bar-basic.png",
            },
          },
        ],
      });

      await expect(readFile(join(dir, "summary.md"), "utf8")).resolves.toContain(
        "recharts-bar-basic",
      );
      await expect(readFile(join(dir, "results.json"), "utf8")).resolves.toContain(
        "\"pixelDiffRatio\": 0",
      );
      await expect(readFile(join(dir, "coverage-ledger.md"), "utf8")).resolves.toContain(
        "RC-BAR-001",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
