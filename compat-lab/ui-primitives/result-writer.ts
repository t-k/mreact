import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { uiPrimitiveCoverageLedger } from "./coverage-ledger.js";
import type { UiPrimitiveDomSummary } from "./types.js";

export interface FixtureRunResult {
  fixtureId: string;
  ok: boolean;
  pixelDiffRatio: number;
  reactDomSummary: UiPrimitiveDomSummary;
  compatDomSummary: UiPrimitiveDomSummary;
  artifacts: {
    reactScreenshot: string;
    compatScreenshot: string;
    diffScreenshot: string;
  };
  error?: string;
}

export interface WriteRunSummaryInput {
  outputDir: string;
  runId: string;
  results: FixtureRunResult[];
}

export async function writeRunSummary(input: WriteRunSummaryInput): Promise<void> {
  await mkdir(input.outputDir, { recursive: true });
  await writeFile(join(input.outputDir, "results.json"), `${JSON.stringify(input, null, 2)}\n`);
  await writeFile(join(input.outputDir, "summary.md"), renderSummary(input));
  await writeFile(join(input.outputDir, "coverage-ledger.md"), renderCoverageLedger());
}

function renderSummary(input: WriteRunSummaryInput): string {
  const rows = input.results
    .map((result) => {
      const status = summaryStatus(result);
      const focusMatch =
        result.reactDomSummary.activeElementText === result.compatDomSummary.activeElementText
          ? "yes"
          : "no";
      const consoleIssues =
        result.reactDomSummary.consoleMessages.length +
        result.compatDomSummary.consoleMessages.length;
      const reactOverlayCount =
        result.reactDomSummary.dialogCount +
        result.reactDomSummary.menuCount +
        result.reactDomSummary.listboxCount +
        result.reactDomSummary.tooltipCount;
      const compatOverlayCount =
        result.compatDomSummary.dialogCount +
        result.compatDomSummary.menuCount +
        result.compatDomSummary.listboxCount +
        result.compatDomSummary.tooltipCount;

      return `| ${result.fixtureId} | ${status} | ${result.pixelDiffRatio.toFixed(6)} | ${reactOverlayCount} | ${compatOverlayCount} | ${focusMatch} | ${consoleIssues} |  |`;
    })
    .join("\n");

  return `# UI Primitive Compat Lab ${input.runId}

| Fixture | Status | Pixel diff ratio | React overlays | Compat overlays | Focus match | Console issues | Note |
|---|---|---:|---:|---:|---|---:|---|
${rows}
`;
}

function summaryStatus(
  result: FixtureRunResult,
): "failed" | "matched" | "captured_with_differences" {
  if (!result.ok) {
    return "failed";
  }
  return result.pixelDiffRatio === 0 ? "matched" : "captured_with_differences";
}

function renderCoverageLedger(): string {
  const rows = uiPrimitiveCoverageLedger
    .map(
      (row) =>
        `| ${row.obligationId} | ${row.packageName} | ${row.feature} | ${row.risk} | ${row.fixtureId} | ${row.vrt ? "yes" : "no"} | ${row.domSummary ? "yes" : "no"} | ${row.interaction ? "yes" : "no"} | ${row.status} |`,
    )
    .join("\n");

  return `# UI Primitive Coverage Ledger

| Obligation | Package | Feature | Risk | Fixture | VRT | DOM summary | Interaction | Status |
|---|---|---|---|---|---|---|---|---|
${rows}
`;
}
