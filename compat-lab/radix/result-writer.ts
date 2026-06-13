import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { radixCoverageLedger } from "./coverage-ledger.js";
import type { RadixDomSummary } from "./types.js";

export interface FixtureRunResult {
  fixtureId: string;
  ok: boolean;
  pixelDiffRatio: number;
  reactDomSummary: RadixDomSummary;
  compatDomSummary: RadixDomSummary;
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

      return `| ${result.fixtureId} | ${status} | ${result.pixelDiffRatio.toFixed(6)} | ${result.reactDomSummary.dialogCount} | ${result.compatDomSummary.dialogCount} | ${focusMatch} | ${consoleIssues} |  |`;
    })
    .join("\n");

  return `# Radix Compat Lab ${input.runId}

| Fixture | Status | Pixel diff ratio | React dialogs | Compat dialogs | Focus match | Console issues | Note |
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
  const rows = radixCoverageLedger
    .map(
      (row) =>
        `| ${row.obligationId} | ${row.feature} | ${row.risk} | ${row.fixtureId} | ${row.vrt ? "yes" : "no"} | ${row.domSummary ? "yes" : "no"} | ${row.interaction ? "yes" : "no"} | ${row.status} |`,
    )
    .join("\n");

  return `# Radix Coverage Ledger

| Obligation | Radix feature | Risk | Fixture | VRT | DOM summary | Interaction | Status |
|---|---|---|---|---|---|---|---|
${rows}
`;
}
