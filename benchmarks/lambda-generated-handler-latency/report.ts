import type { BenchmarkEnvironment } from "../shared/types.js";
import type { LambdaGeneratedHandlerLatencyRow } from "./types.js";

export function formatLambdaGeneratedHandlerLatencyMarkdown(
  env: BenchmarkEnvironment,
  rows: readonly LambdaGeneratedHandlerLatencyRow[],
  targetCommit = env.gitCommit,
): string {
  const lines = [
    "# AWS Lambda Generated Handler Latency Benchmark",
    "",
    "## Environment",
    "",
    `- Date: ${env.date}`,
    `- Git commit: ${env.gitCommit}`,
    `- Target commit: ${targetCommit}`,
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
    "## Results",
    "",
    "| scenario | entry | preload | iteration | path | status | handler import ms | first hit ms | warm hit ms | cold total ms |",
    "| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const row of rows) {
    lines.push(
      [
        row.scenario,
        row.entry,
        row.preload,
        row.iteration,
        row.path,
        row.status,
        row.importMs,
        row.firstMs,
        row.warmMs,
        row.coldTotalMs,
      ]
        .map((value) => escapeMarkdownCell(String(value)))
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }

  return lines.join("\n");
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}
