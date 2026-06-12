import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { rechartsCoverageLedger } from "./coverage-ledger.js";
import type { DomSummary } from "./dom-summary.js";

export interface FixtureRunResult {
  fixtureId: string;
  ok: boolean;
  pixelDiffRatio: number;
  reactDomSummary: Pick<DomSummary, "svgCount" | "pathCount" | "text">;
  compatDomSummary: Pick<DomSummary, "svgCount" | "pathCount" | "text">;
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
      return `| ${result.fixtureId} | ${status} | ${result.pixelDiffRatio.toFixed(6)} | ${result.reactDomSummary.svgCount} | ${result.compatDomSummary.svgCount} |`;
    })
    .join("\n");

  return `# Recharts Compat Lab ${input.runId}

| Fixture | Status | Pixel diff ratio | React SVGs | Compat SVGs |
|---|---|---:|---:|---:|
${rows}
`;
}

function summaryStatus(result: FixtureRunResult): "failed" | "matched" | "captured_with_differences" {
  if (!result.ok) {
    return "failed";
  }
  return result.pixelDiffRatio === 0 ? "matched" : "captured_with_differences";
}

function renderCoverageLedger(): string {
  const rows = rechartsCoverageLedger
    .map(
      (row) =>
        `| ${row.obligationId} | ${row.feature} | ${row.risk} | ${row.fixtureId} | ${row.vrt ? "yes" : "no"} | ${row.interaction ? "yes" : "no"} | ${row.status} |`,
    )
    .join("\n");

  return `# Recharts Coverage Ledger

| Obligation | Recharts feature | Risk | Fixture | VRT | Interaction | Status |
|---|---|---|---|---|---|---|
${rows}
`;
}
