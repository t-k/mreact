import { routerBenchmarkCases, rankCompletedRows } from "./runner.js";
import type { BenchmarkEnvironment } from "../shared/types.js";
import type { RouterBenchmarkRow } from "./types.js";

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

  for (const benchmarkCase of routerBenchmarkCases) {
    lines.push(`### ${benchmarkCase.name}`, "");
    lines.push(benchmarkCase.description, "");
    const rankedRows = rankCompletedRows(rows, benchmarkCase.name);

    if (isMreactVariantOnlyColdStart(benchmarkCase.name, rankedRows)) {
      lines.push(
        "This section currently compares mreact app-router variants only; it is not a cross-framework ranking.",
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
    "| suite | framework | version | case | status | metric | unit | value | diff vs 1st | gzip bytes | hz | mean ms | p75 ms | p99 ms | raw samples ms | note |",
  );
  lines.push(
    "| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
  );

  for (const row of rows) {
    const bestRow = rankCompletedRows(rows, row.caseName)[0];
    lines.push(
      `| router | ${escapeMarkdownCell(row.framework)} | ${escapeMarkdownCell(row.version)} | ${escapeMarkdownCell(row.caseName)} | ${row.status} | ${row.metric} | ${row.unit} | ${row.value} | ${formatDiffVsBest(row, bestRow)} | ${row.gzipBytes ?? 0} | ${row.hz ?? 0} | ${row.meanMs ?? 0} | ${row.p75Ms ?? 0} | ${row.p99Ms ?? 0} | ${formatSamples(row.samplesMs)} | ${escapeMarkdownCell(row.note ?? "")} |`,
    );
  }

  return lines.join("\n");
}

function isMreactVariantOnlyColdStart(
  caseName: string,
  rankedRows: readonly RouterBenchmarkRow[],
): boolean {
  return (
    (caseName === "app server cold start" ||
      caseName === "app concurrent throughput 100 connections" ||
      caseName === "app concurrent p99 latency 100 connections" ||
      caseName === "app concurrent RSS delta 100 connections" ||
      caseName === "app hydration 100 islands" ||
      caseName === "app dev cold start" ||
      caseName === "app dev first request latency" ||
      caseName === "app dev HMR update latency" ||
      caseName === "app 1000 route match latency" ||
      caseName === "app 1000 route cold start" ||
      caseName === "app 1000 route build time" ||
      caseName === "app 1000 route RSS delta" ||
      caseName === "app server action form POST roundtrip" ||
      caseName === "app nested layouts depth 5" ||
      caseName === "app loader client navigation route-to-route" ||
      caseName === "app client navigation back-forward restore" ||
      caseName === "app Cloudflare Worker request latency") &&
    rankedRows.length > 0 &&
    rankedRows.every((row) => row.framework.includes("mreact"))
  );
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
