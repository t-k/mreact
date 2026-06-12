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

  test("distinguishes successful captures with visual differences", async () => {
    const dir = await mkdtemp(join(tmpdir(), "compat-lab-result-"));

    try {
      await writeRunSummary({
        outputDir: dir,
        runId: "2026-06-12-002-recharts",
        results: [
          {
            fixtureId: "recharts-line-tooltip-hover",
            ok: true,
            pixelDiffRatio: 0.008245,
            reactDomSummary: { svgCount: 1, pathCount: 2, text: ["06-01"] },
            compatDomSummary: { svgCount: 1, pathCount: 1, text: ["06-01"] },
            artifacts: {
              reactScreenshot: "react/recharts-line-tooltip-hover.png",
              compatScreenshot: "compat/recharts-line-tooltip-hover.png",
              diffScreenshot: "diff/recharts-line-tooltip-hover.png",
            },
          },
        ],
      });

      await expect(readFile(join(dir, "summary.md"), "utf8")).resolves.toContain(
        "captured_with_differences",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("classifies the hierarchy flow antialiasing delta as a known tolerance", async () => {
    const dir = await mkdtemp(join(tmpdir(), "compat-lab-result-"));

    try {
      await writeRunSummary({
        outputDir: dir,
        runId: "2026-06-12-003-recharts",
        results: [
          {
            fixtureId: "recharts-hierarchy-flow",
            ok: true,
            pixelDiffRatio: 0.002072,
            reactDomSummary: {
              svgCount: 4,
              pathCount: 20,
              rectCount: 1,
              circleCount: 0,
              text: ["React", "Compat", "Router", "Forms"],
              classes: ["recharts-funnel-trapezoid", "recharts-trapezoid"],
            },
            compatDomSummary: {
              svgCount: 4,
              pathCount: 20,
              rectCount: 1,
              circleCount: 0,
              text: ["React", "Compat", "Router", "Forms"],
              classes: ["recharts-funnel-trapezoid", "recharts-trapezoid"],
            },
            artifacts: {
              reactScreenshot: "react/recharts-hierarchy-flow.png",
              compatScreenshot: "compat/recharts-hierarchy-flow.png",
              diffScreenshot: "diff/recharts-hierarchy-flow.png",
            },
          },
        ],
      });

      const summary = await readFile(join(dir, "summary.md"), "utf8");

      expect(summary).toContain("matched_with_known_tolerance");
      expect(summary).toContain("Funnel trapezoid edge antialiasing only");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
