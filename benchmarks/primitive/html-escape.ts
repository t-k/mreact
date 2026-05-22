import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";
import { summarizeSamples } from "../shared/stats.js";
import type { BenchmarkRow } from "../shared/types.js";

type EscapeFunction = (value: unknown) => string;

interface EscapeCase {
  input: string;
  name: string;
}

interface EscapeCandidate {
  escapeAttribute: EscapeFunction;
  escapeQuotedAttribute: EscapeFunction;
  escapeText: EscapeFunction;
  name: string;
}

const repeatCount = readNumberEnv("MREACT_HTML_ESCAPE_BENCH_REPEATS", 100_000);
const measuredRuns = readNumberEnv("MREACT_HTML_ESCAPE_BENCH_RUNS", 15);
const warmupRuns = readNumberEnv("MREACT_HTML_ESCAPE_BENCH_WARMUPS", 5);

const cases: EscapeCase[] = [
  { name: "empty", input: "" },
  { name: "short clean ascii", input: "Hello Ada" },
  { name: "short one escape", input: "Tom & Ada" },
  { name: "short attribute quotes", input: 'Tom "Ada" & Grace' },
  { name: "long clean text", input: "The quick brown fox jumps over the lazy dog. ".repeat(256) },
  { name: "long many escapes", input: '<script attr="x">&</script>'.repeat(384) },
];

const candidates: EscapeCandidate[] = [
  {
    name: "replaceAll chain",
    escapeText: replaceAllText,
    escapeAttribute: replaceAllAttribute,
    escapeQuotedAttribute: replaceAllQuotedAttribute,
  },
  {
    name: "single regex",
    escapeText: regexText,
    escapeAttribute: regexAttribute,
    escapeQuotedAttribute: regexQuotedAttribute,
  },
  {
    name: "char loop fast-path",
    escapeText: charLoopFastText,
    escapeAttribute: charLoopFastAttribute,
    escapeQuotedAttribute: charLoopFastQuotedAttribute,
  },
  {
    name: "hybrid short-char-long-replaceAll",
    escapeText: hybridText,
    escapeAttribute: hybridAttribute,
    escapeQuotedAttribute: hybridQuotedAttribute,
  },
  {
    name: "char loop always-copy",
    escapeText: charLoopCopyText,
    escapeAttribute: charLoopCopyAttribute,
    escapeQuotedAttribute: charLoopCopyQuotedAttribute,
  },
];

function measureCandidate(
  candidateName: string,
  caseName: string,
  escape: EscapeFunction,
  input: string,
): BenchmarkRow {
  const samples: number[] = [];
  let checksum = 0;

  for (let index = 0; index < warmupRuns + measuredRuns; index += 1) {
    const startedAt = performance.now();

    for (let repeat = 0; repeat < repeatCount; repeat += 1) {
      checksum += escape(input).length;
    }

    if (index >= warmupRuns) {
      samples.push(performance.now() - startedAt);
    }
  }

  const summary = summarizeSamples(samples);
  return {
    suite: "html-escape",
    framework: candidateName,
    version: "local",
    caseName,
    status: "completed",
    metric: "duration",
    unit: "ms",
    value: summary.median,
    summary,
    samples,
    notes: [`repeatCount=${repeatCount}`, `checksum=${checksum}`],
  };
}

function formatRows(
  rows: readonly BenchmarkRow[],
  env: Awaited<ReturnType<typeof collectBenchmarkEnvironment>>,
): string {
  const lines = [
    "# HTML Escape Microbenchmark",
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
    "",
    "## Results",
    "",
    `- Repeat count per sample: ${repeatCount}`,
    `- Warmup runs: ${warmupRuns}`,
    `- Measured runs: ${measuredRuns}`,
    "",
    "| candidate | case | median ms | p75 ms | p95 ms | raw samples ms |",
    "| --- | --- | ---: | ---: | ---: | --- |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.framework} | ${row.caseName} | ${round(row.summary?.median ?? 0)} | ${round(row.summary?.p75 ?? 0)} | ${round(row.summary?.p95 ?? 0)} | ${(row.samples ?? []).map(round).join(", ")} |`,
    );
  }

  return lines.join("\n");
}

function replaceAllText(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function replaceAllAttribute(value: unknown): string {
  return replaceAllText(value).replaceAll('"', "&quot;");
}

function replaceAllQuotedAttribute(value: unknown): string {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

const textPattern = /[&<>]/g;
const attributePattern = /[&<>"]/g;
const quotedAttributePattern = /[&"]/g;

function regexText(value: unknown): string {
  return String(value).replace(textPattern, regexEscape);
}

function regexAttribute(value: unknown): string {
  return String(value).replace(attributePattern, regexEscape);
}

function regexQuotedAttribute(value: unknown): string {
  return String(value).replace(quotedAttributePattern, regexEscape);
}

function regexEscape(value: string): string {
  switch (value) {
    case "&":
      return "&amp;";
    case "<":
      return "&lt;";
    case ">":
      return "&gt;";
    case '"':
      return "&quot;";
    default:
      return value;
  }
}

function charLoopFastText(value: unknown): string {
  return escapeCharLoop(String(value), EscapeMode.Text, true);
}

function charLoopFastAttribute(value: unknown): string {
  return escapeCharLoop(String(value), EscapeMode.Attribute, true);
}

function charLoopFastQuotedAttribute(value: unknown): string {
  return escapeCharLoop(String(value), EscapeMode.QuotedAttribute, true);
}

function charLoopCopyText(value: unknown): string {
  return escapeCharLoop(String(value), EscapeMode.Text, false);
}

function charLoopCopyAttribute(value: unknown): string {
  return escapeCharLoop(String(value), EscapeMode.Attribute, false);
}

function charLoopCopyQuotedAttribute(value: unknown): string {
  return escapeCharLoop(String(value), EscapeMode.QuotedAttribute, false);
}

function hybridText(value: unknown): string {
  const string = String(value);
  return string.length < 128 ? charLoopFastText(string) : replaceAllText(string);
}

function hybridAttribute(value: unknown): string {
  const string = String(value);
  return string.length < 128 ? charLoopFastAttribute(string) : replaceAllAttribute(string);
}

function hybridQuotedAttribute(value: unknown): string {
  const string = String(value);
  return string.length < 128
    ? charLoopFastQuotedAttribute(string)
    : replaceAllQuotedAttribute(string);
}

const enum EscapeMode {
  Text,
  Attribute,
  QuotedAttribute,
}

function escapeCharLoop(value: string, mode: EscapeMode, fastPath: boolean): string {
  let result = "";
  let last = 0;

  for (let index = 0; index < value.length; index += 1) {
    const replacement = replacementForCode(value.charCodeAt(index), mode);
    if (replacement === undefined) {
      continue;
    }

    result += value.slice(last, index) + replacement;
    last = index + 1;
  }

  if (last === 0) {
    return fastPath ? value : result + value;
  }

  return result + value.slice(last);
}

function replacementForCode(code: number, mode: EscapeMode): string | undefined {
  if (code === 38) return "&amp;";
  if (mode !== EscapeMode.QuotedAttribute) {
    if (code === 60) return "&lt;";
    if (code === 62) return "&gt;";
  }
  if (mode !== EscapeMode.Text && code === 34) return "&quot;";
  return undefined;
}

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

const rows: BenchmarkRow[] = [];

for (const candidate of candidates) {
  for (const escapeCase of cases) {
    rows.push(
      measureCandidate(candidate.name, `${escapeCase.name} text`, candidate.escapeText, escapeCase.input),
    );
    rows.push(
      measureCandidate(
        candidate.name,
        `${escapeCase.name} attribute`,
        candidate.escapeAttribute,
        escapeCase.input,
      ),
    );
    rows.push(
      measureCandidate(
        candidate.name,
        `${escapeCase.name} quoted attribute`,
        candidate.escapeQuotedAttribute,
        escapeCase.input,
      ),
    );
  }
}

const env = await collectBenchmarkEnvironment(["@reckona/mreact-shared"]);
const dir = await createDatedResultsDir();
const markdown = formatRows(rows, env);

await writeJsonFile(join(dir, "html-escape.summary.json"), rows);
await writeTextFile(join(dir, "html-escape.md"), markdown);

console.log(markdown);
