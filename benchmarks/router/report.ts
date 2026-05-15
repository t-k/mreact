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
    lines.push("| rank | framework | case | value | unit |");
    lines.push("| ---: | --- | --- | ---: | --- |");

    const rankedRows = rankCompletedRows(rows, benchmarkCase.name);

    if (rankedRows.length === 0) {
      lines.push("|  | no completed results |  |  |  |");
    } else {
      rankedRows.forEach((row, index) => {
        lines.push(
          `| ${index + 1} | ${escapeMarkdownCell(row.framework)} | ${escapeMarkdownCell(row.caseName)} | ${row.value} | ${row.unit} |`,
        );
      });
    }

    lines.push("");
  }

  lines.push("## Results", "");
  lines.push(
    "| suite | framework | version | case | status | metric | unit | value | gzip bytes | hz | mean ms | p75 ms | p99 ms | note |",
  );
  lines.push(
    "| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  );

  for (const row of rows) {
    lines.push(
      `| router | ${escapeMarkdownCell(row.framework)} | ${escapeMarkdownCell(row.version)} | ${escapeMarkdownCell(row.caseName)} | ${row.status} | ${row.metric} | ${row.unit} | ${row.value} | ${row.gzipBytes ?? 0} | ${row.hz} | ${row.meanMs} | ${row.p75Ms} | ${row.p99Ms} | ${escapeMarkdownCell(row.note ?? "")} |`,
    );
  }

  return lines.join("\n");
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}
