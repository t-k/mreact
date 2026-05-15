import type { BenchmarkEnvironment, BenchmarkRow } from "./types.js";

export function formatBenchmarkMarkdown(
  title: string,
  env: BenchmarkEnvironment,
  rows: readonly BenchmarkRow[],
): string {
  const lines = [
    `# ${title}`,
    "",
    "## Environment",
    "",
    `- Date: ${env.date}`,
    `- Git commit: ${env.gitCommit}`,
    `- Node: ${env.nodeVersion}`,
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
    "| suite | framework | version | case | status | metric | unit | value | notes |",
    "| --- | --- | --- | --- | --- | --- | --- | ---: | --- |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.suite} | ${row.framework} | ${row.version} | ${row.caseName} | ${row.status} | ${row.metric} | ${row.unit} | ${row.value} | ${(row.notes ?? []).join("; ")} |`,
    );
  }

  return lines.join("\n");
}
