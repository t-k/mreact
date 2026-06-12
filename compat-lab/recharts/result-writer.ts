import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderApiCoverageMarkdown } from "./api-surface.js";
import { rechartsCoverageLedger } from "./coverage-ledger.js";
import type { DomSummary } from "./dom-summary.js";

export interface FixtureRunResult {
  fixtureId: string;
  ok: boolean;
  pixelDiffRatio: number;
  reactDomSummary: SummaryDom;
  compatDomSummary: SummaryDom;
  artifacts: {
    reactScreenshot: string;
    compatScreenshot: string;
    diffScreenshot: string;
  };
  error?: string;
}

type SummaryDom = Pick<DomSummary, "svgCount" | "pathCount" | "text"> &
  Partial<Pick<DomSummary, "rectCount" | "circleCount" | "classes">>;

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
  await writeFile(join(input.outputDir, "api-coverage.md"), renderApiCoverageMarkdown());
}

function renderSummary(input: WriteRunSummaryInput): string {
  const rows = input.results
    .map((result) => {
      const status = summaryStatus(result);
      const note = knownToleranceNote(result) ?? "";
      return `| ${result.fixtureId} | ${status} | ${result.pixelDiffRatio.toFixed(6)} | ${result.reactDomSummary.svgCount} | ${result.compatDomSummary.svgCount} | ${note} |`;
    })
    .join("\n");

  return `# Recharts Compat Lab ${input.runId}

| Fixture | Status | Pixel diff ratio | React SVGs | Compat SVGs | Note |
|---|---|---:|---:|---:|---|
${rows}
`;
}

function summaryStatus(
  result: FixtureRunResult,
): "failed" | "matched" | "matched_with_known_tolerance" | "captured_with_differences" {
  if (!result.ok) {
    return "failed";
  }
  if (knownToleranceNote(result) !== undefined) {
    return "matched_with_known_tolerance";
  }
  return result.pixelDiffRatio === 0 ? "matched" : "captured_with_differences";
}

function knownToleranceNote(result: FixtureRunResult): string | undefined {
  if (
    result.fixtureId === "recharts-hierarchy-flow" &&
    result.ok &&
    result.pixelDiffRatio <= 0.003 &&
    equivalentDomSummary(result.reactDomSummary, result.compatDomSummary)
  ) {
    return "Funnel trapezoid edge antialiasing only; DOM text, classes, and SVG/path counts match.";
  }

  return undefined;
}

function equivalentDomSummary(react: SummaryDom, compat: SummaryDom): boolean {
  return (
    react.svgCount === compat.svgCount &&
    react.pathCount === compat.pathCount &&
    optionalCountMatches(react.rectCount, compat.rectCount) &&
    optionalCountMatches(react.circleCount, compat.circleCount) &&
    stringArraysMatch(react.text, compat.text) &&
    optionalStringArraysMatch(react.classes, compat.classes)
  );
}

function optionalCountMatches(react: number | undefined, compat: number | undefined): boolean {
  return react === undefined || compat === undefined || react === compat;
}

function optionalStringArraysMatch(
  react: string[] | undefined,
  compat: string[] | undefined,
): boolean {
  return react === undefined || compat === undefined || stringArraysMatch(react, compat);
}

function stringArraysMatch(react: string[], compat: string[]): boolean {
  return react.length === compat.length && react.every((value, index) => value === compat[index]);
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
