import { routerBenchmarkCases, rankCompletedRows } from "./runner.js";
import type { BenchmarkEnvironment } from "../shared/types.js";
import type { RouterBenchmarkCase } from "./runner.js";
import type { RouterBenchmarkCaseName, RouterBenchmarkRow } from "./types.js";

export function formatRouterBenchmarkMarkdown(
  env: BenchmarkEnvironment,
  rows: readonly RouterBenchmarkRow[],
): string {
  const lines: string[] = [
    "# Router Benchmark",
    "",
    "## Environment",
    "",
    `- Date: ${env.date}`,
    `- Git commit: ${env.gitCommit}`,
    `- Node: ${env.nodeVersion}`,
    `- NODE_ENV: ${env.nodeEnv}`,
    `- pnpm: ${env.pnpmVersion}`,
    `- Platform: ${env.platform} ${env.arch}`,
    `- CI: ${env.ci === true ? "true" : "false"}`,
    `- Runner label: ${env.runnerLabel ?? "unknown"}`,
    `- CPU: ${env.cpuModel} (${env.cpuCount})`,
    `- Memory: ${env.totalMemoryBytes} bytes`,
    "- Package versions:",
    ...Object.entries(env.packageVersions).map(
      ([name, version]) => `  - ${name}: ${version}`,
    ),
    "",
    "## Rankings",
    "",
  ];

  for (const { benchmarkCase, rankedRows } of reportRankingSections(rows)) {
    lines.push(`### ${benchmarkCase.name}`, "");
    lines.push(benchmarkCase.description, "");

    if (isMreactVariantOnlyRanking(benchmarkCase.name, rankedRows)) {
      lines.push(
        "This section currently compares mreact app-router variants only; it is not a cross-framework ranking.",
        "",
      );
    }

    const caveat = rankingCaveat(benchmarkCase.name);
    if (caveat !== undefined) {
      lines.push(caveat, "");
    }

    const noiseFloor = sameCoreNoiseFloor(rankedRows);
    if (noiseFloor !== undefined) {
      lines.push(
        `Same-core mreact variant noise floor: ${noiseFloor} spread. Treat smaller cross-framework gaps in this case as inconclusive.`,
        "",
      );
    }

    lines.push("| rank | framework | case | value | diff vs 1st | unit |");
    lines.push("| ---: | --- | --- | ---: | ---: | --- |");

    const bestRow = rankedRows[0];

    if (rankedRows.length === 0) {
      lines.push("|  | no completed results |  |  |  |  |");
    } else {
      rankedRows.forEach((row, index) => {
        lines.push(
          `| ${index + 1} | ${formatFrameworkCell(row.framework)} | ${escapeMarkdownCell(row.caseName)} | ${row.value} | ${formatDiffVsBest(row, bestRow)} | ${row.unit} |`,
        );
      });
    }

    lines.push("");
  }

  lines.push("## Results", "");
  lines.push(
    "| suite | framework | version | case | status | metric | unit | value | diff vs 1st | gzip bytes | hz | mean ms | p75 ms | p99 ms | sample count | raw samples | note |",
  );
  lines.push(
    "| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
  );

  for (const row of rows) {
    const bestRow = rankCompletedRows(rows, row.caseName)[0];
    lines.push(
      `| router | ${escapeMarkdownCell(row.framework)} | ${escapeMarkdownCell(row.version)} | ${escapeMarkdownCell(row.caseName)} | ${row.status} | ${row.metric} | ${row.unit} | ${row.value} | ${formatDiffVsBest(row, bestRow)} | ${row.gzipBytes ?? 0} | ${row.hz ?? 0} | ${row.meanMs ?? 0} | ${row.p75Ms ?? 0} | ${row.p99Ms ?? 0} | ${row.samplesMs?.length ?? 0} | ${formatSamples(row.samplesMs)} | ${escapeMarkdownCell(row.note ?? "")} |`,
    );
  }

  return lines.join("\n");
}

interface ReportRankingSection {
  benchmarkCase: RouterBenchmarkCase;
  rankedRows: RouterBenchmarkRow[];
}

function reportRankingSections(rows: readonly RouterBenchmarkRow[]): ReportRankingSection[] {
  const promotedSections: ReportRankingSection[] = [];
  const crossFrameworkSections: ReportRankingSection[] = [];
  const mreactOnlySections: ReportRankingSection[] = [];

  for (const benchmarkCase of routerBenchmarkCases) {
    const rankedRows = rankCompletedRows(rows, benchmarkCase.name);
    const section = { benchmarkCase, rankedRows };

    if (promotedRouterRankingCaseNames.has(benchmarkCase.name)) {
      promotedSections.push(section);
    } else if (isMreactVariantOnlyRanking(benchmarkCase.name, rankedRows)) {
      mreactOnlySections.push(section);
    } else {
      crossFrameworkSections.push(section);
    }
  }

  return [...promotedSections, ...crossFrameworkSections, ...mreactOnlySections];
}

const promotedRouterRankingCaseNames = new Set<RouterBenchmarkCaseName>([
  "app client bundle gzip bytes (server-only page)",
  "app client bundle gzip bytes (interactive page)",
  "app client bundle gzip bytes (interactive page, minimal opt-out)",
]);

const mreactVariantOnlyRankingCaseNames = new Set<RouterBenchmarkCaseName>([
  "app server cold start",
  "app concurrent throughput 100 connections",
  "app concurrent p99 latency 100 connections",
  "app concurrent RSS delta 100 connections",
  "app hydration 100 islands",
  "app dev cold start",
  "app dev first request latency",
  "app dev HMR update latency",
  "app 1000 route match latency",
  "app 1000 route cold start",
  "app 1000 route build time",
  "app 1000 route RSS delta",
  "app server action form POST roundtrip",
  "app nested layouts depth 5",
  "app loader client navigation route-to-route",
  "app client navigation back-forward restore",
  "app Cloudflare Worker request latency",
]);

function isMreactVariantOnlyRanking(
  caseName: string,
  rankedRows: readonly RouterBenchmarkRow[],
): boolean {
  return (
    mreactVariantOnlyRankingCaseNames.has(caseName as RouterBenchmarkCaseName) &&
    rankedRows.length > 0 &&
    rankedRows.every((row) => row.framework.includes("mreact"))
  );
}

function rankingCaveat(caseName: RouterBenchmarkCaseName): string | undefined {
  if (caseName === "app concurrent RSS delta 100 connections") {
    return "RSS delta rows only rank adapters that expose server child process RSS; adapters without measurable server child RSS are reported as unsupported, and rows with negative RSS samples are treated as contaminated and excluded from this ranking.";
  }

  return undefined;
}

function sameCoreNoiseFloor(rows: readonly RouterBenchmarkRow[]): string | undefined {
  const variantRows = rows.filter(
    (row) => row.status === "completed" && row.framework.startsWith("mreact-app-router"),
  );
  if (variantRows.length < 2) {
    return undefined;
  }

  const values = variantRows.map((row) => row.value);
  const min = Math.min(...values);
  if (min <= 0) {
    return undefined;
  }

  const max = Math.max(...values);
  return formatPercent((max / min - 1) * 100);
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}

function formatFrameworkCell(value: string): string {
  const escaped = escapeMarkdownCell(value);
  return value.includes("mreact") ? `**${escaped}**` : escaped;
}

function formatSamples(samples: readonly number[] | undefined): string {
  return samples?.join(", ") ?? "";
}

function formatDiffVsBest(
  row: RouterBenchmarkRow,
  bestRow: RouterBenchmarkRow | undefined,
): string {
  if (
    row.status !== "completed" ||
    bestRow === undefined ||
    bestRow.status !== "completed" ||
    row.metric !== bestRow.metric ||
    row.caseName !== bestRow.caseName ||
    bestRow.value === 0
  ) {
    return "";
  }

  if (row.framework === bestRow.framework && row.value === bestRow.value) {
    return "best";
  }

  const ratio = row.value / bestRow.value - 1;
  return formatPercent(ratio * 100);
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${String(rounded).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}%`;
}
