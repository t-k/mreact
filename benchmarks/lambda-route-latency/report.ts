import type { BenchmarkEnvironment } from "../shared/types.js";
import type { LambdaRouteLatencyRow } from "./types.js";

export function formatLambdaRouteLatencyMarkdown(
  env: BenchmarkEnvironment,
  rows: readonly LambdaRouteLatencyRow[],
): string {
  const lines = [
    "# AWS Lambda Route Latency Benchmark",
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
    "## Results",
    "",
    "| scenario | iteration | path | status | request duration ms | render ms | runtime dir ms | loader wait ms | loader module load ms | loader execution ms | middleware module load ms | middleware execution ms | source analysis ms | source analysis artifact ms | stream drain ms | stream read ms | stream concat ms | stream wait ms | stream write ms | body encode ms | response serialization ms | response streaming ms | body bytes |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const row of rows) {
    lines.push(
      [
        row.scenario,
        row.iteration,
        row.path,
        row.status,
        row.requestDurationMs,
        phase(row.requestPhases, "renderMs"),
        phase(row.requestPhases, "runtimeDirMs"),
        phase(row.renderPhases, "loaderWaitMs"),
        phase(row.renderPhases, "loaderModuleLoadMs"),
        phase(row.renderPhases, "loaderExecutionMs"),
        phase(row.renderPhases, "middlewareModuleLoadMs"),
        phase(row.renderPhases, "middlewareExecutionMs"),
        phase(row.renderPhases, "sourceAnalysisMs"),
        phase(row.renderPhases, "sourceAnalysisArtifactMs"),
        phase(row.requestPhases, "streamDrainMs"),
        phase(row.requestPhases, "streamReadMs"),
        phase(row.requestPhases, "streamConcatMs"),
        phase(row.requestPhases, "streamWaitMs"),
        phase(row.requestPhases, "streamWriteMs"),
        phase(row.requestPhases, "bodyEncodeMs"),
        phase(row.requestPhases, "responseSerializationMs"),
        phase(row.requestPhases, "responseStreamingMs"),
        row.bodyBytes,
      ]
        .map((value) => escapeMarkdownCell(String(value)))
        .join(" | ")
        .replace(/^/, "| ")
        .replace(/$/, " |"),
    );
  }

  return lines.join("\n");
}

function phase(phases: Record<string, number>, name: string): number {
  return phases[name] ?? 0;
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}
