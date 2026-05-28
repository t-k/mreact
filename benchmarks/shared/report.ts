import type { BenchmarkEnvironment, BenchmarkRow } from "./types.js";

export function formatBenchmarkMarkdown(
  title: string,
  env: BenchmarkEnvironment,
  rows: readonly BenchmarkRow[],
  options: {
    caseDescriptions?: Partial<Record<string, string>>;
  } = {},
): string {
  const lines = [
    `# ${title}`,
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
    ...Object.entries(env.packageVersions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, version]) => `  - ${name}: ${version}`),
    "",
    "## Rankings",
    "",
    ...formatRankingSections(rows, options.caseDescriptions ?? {}),
    "## Results",
    "",
    "| suite | framework | version | case | status | metric | unit | value | diff vs 1st | sample count | min | max | mean | median | p75 | p95 | p99 | standard deviation | raw samples | notes |",
    "| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
  ];

  for (const row of rows) {
    const summary = row.summary;
    const bestRow = rankCompletedRows(rows, row.caseName)[0];
    const cells = [
      row.suite,
      row.framework,
      row.version,
      row.caseName,
      row.status,
      row.metric,
      row.unit,
      String(row.value),
      formatDiffVsBest(row, bestRow),
      String(summary?.count ?? 0),
      String(summary?.min ?? 0),
      String(summary?.max ?? 0),
      String(summary?.mean ?? 0),
      String(summary?.median ?? 0),
      String(summary?.p75 ?? 0),
      String(summary?.p95 ?? 0),
      String(summary?.p99 ?? 0),
      String(summary?.standardDeviation ?? 0),
      formatSamples(row.samples),
      (row.notes ?? []).join("; "),
    ];

    lines.push(`| ${cells.map(escapeMarkdownTableCell).join(" | ")} |`);
  }

  return lines.join("\n");
}

function formatSamples(samples: readonly number[] | undefined): string {
  return samples?.join(", ") ?? "";
}

function formatRankingSections(
  rows: readonly BenchmarkRow[],
  caseDescriptions: Partial<Record<string, string>>,
): string[] {
  const lines: string[] = [];
  const caseNames = Array.from(new Set(rows.map((row) => row.caseName)));

  for (const caseName of caseNames) {
    lines.push(`### ${caseName}`, "");
    const description = caseDescriptions[caseName];

    if (description !== undefined) {
      lines.push(description, "");
    }

    lines.push("| rank | framework | case | value | diff vs 1st | unit |");
    lines.push("| ---: | --- | --- | ---: | ---: | --- |");

    const rankedRows = rankCompletedRows(rows, caseName);
    const bestRow = rankedRows[0];

    if (rankedRows.length === 0) {
      lines.push("|  | no completed results |  |  |  |  |");
    } else {
      rankedRows.forEach((row, index) => {
        lines.push(
          `| ${index + 1} | ${formatFrameworkCell(row.framework)} | ${escapeMarkdownTableCell(row.caseName)} | ${row.value} | ${formatDiffVsBest(row, bestRow)} | ${row.unit} |`,
        );
      });
    }

    lines.push("");
  }

  return lines;
}

function rankCompletedRows(
  rows: readonly BenchmarkRow[],
  caseName: string,
): BenchmarkRow[] {
  const completedRows = rows.filter(
    (row) => row.caseName === caseName && row.status === "completed",
  );

  return [...completedRows].sort((left, right) => {
    const valueOrder = lowerIsBetter(left.metric)
      ? left.value - right.value
      : right.value - left.value;

    if (valueOrder !== 0) {
      return valueOrder;
    }

    return left.framework.localeCompare(right.framework);
  });
}

function lowerIsBetter(metric: BenchmarkRow["metric"]): boolean {
  return metric === "duration" || metric === "memory" || metric === "size";
}

function formatDiffVsBest(
  row: BenchmarkRow,
  bestRow: BenchmarkRow | undefined,
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

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/[\n\r]+/g, " ");
}

function formatFrameworkCell(value: string): string {
  const escaped = escapeMarkdownTableCell(value);
  return value.includes("mreact") ? `**${escaped}**` : escaped;
}
