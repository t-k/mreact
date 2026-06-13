import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { writeRunSummary } from "./result-writer.js";

describe("Radix result writer", () => {
  test("writes visual, DOM, ARIA, focus, and console status columns", async () => {
    const dir = await mkdtemp(join(tmpdir(), "radix-compat-result-"));

    await writeRunSummary({
      outputDir: dir,
      runId: "radix-test-run",
      results: [
        {
          fixtureId: "radix-dialog-opens-from-trigger",
          ok: true,
          pixelDiffRatio: 0,
          reactDomSummary: {
            dialogCount: 1,
            portalContentCount: 1,
            smokeContentCount: 1,
            popoverContentCount: 0,
            dropdownMenuCount: 0,
            tooltipCount: 0,
            triggerExpanded: "true",
            popoverExpanded: null,
            dropdownExpanded: null,
            activeElementText: "Close dialog",
            bodyText: ["Open dialog", "Radix dialog", "Close dialog"],
            consoleMessages: [],
          },
          compatDomSummary: {
            dialogCount: 1,
            portalContentCount: 1,
            smokeContentCount: 1,
            popoverContentCount: 0,
            dropdownMenuCount: 0,
            tooltipCount: 0,
            triggerExpanded: "true",
            popoverExpanded: null,
            dropdownExpanded: null,
            activeElementText: "Close dialog",
            bodyText: ["Open dialog", "Radix dialog", "Close dialog"],
            consoleMessages: [],
          },
          artifacts: {
            reactScreenshot: "react/radix-dialog-opens-from-trigger.png",
            compatScreenshot: "compat/radix-dialog-opens-from-trigger.png",
            diffScreenshot: "diff/radix-dialog-opens-from-trigger.png",
          },
        },
      ],
    });

    const summary = await readFile(join(dir, "summary.md"), "utf8");
    const results = JSON.parse(await readFile(join(dir, "results.json"), "utf8"));

    expect(summary).toContain("# Radix Compat Lab radix-test-run");
    expect(summary).toContain("React overlays");
    expect(summary).toContain("Compat overlays");
    expect(summary).toContain("Focus match");
    expect(summary).toContain("Console issues");
    expect(results.results[0].reactDomSummary.activeElementText).toBe("Close dialog");
  });
});
