import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface BenchmarkRunMeta {
  readonly arch: string;
  readonly cpuCount: number;
  readonly cpuModel: string;
  readonly date: string;
  readonly gitCommit: string;
  readonly nodeVersion: string;
  readonly path: string;
  readonly pnpmVersion: string;
}

interface BenchmarkRankingRow {
  readonly caseName: string;
  readonly diff: string;
  readonly framework: string;
  readonly isMreact: boolean;
  readonly paint?: string;
  readonly rank: number;
  readonly script?: string;
  readonly unit: string;
  readonly value: string;
}

interface BenchmarkRankingCard {
  readonly description: string;
  readonly id: string;
  readonly rows: readonly BenchmarkRankingRow[];
  readonly title: string;
}

interface BenchmarkRankingSuite {
  readonly cardCount: number;
  readonly cards: readonly BenchmarkRankingCard[];
  readonly id: string;
  readonly source: string;
  readonly title: string;
}

interface BenchmarkEnvironment {
  readonly arch: string;
  readonly cpuCount: number;
  readonly cpuModel: string;
  readonly date: string;
  readonly gitCommit: string;
  readonly nodeVersion: string;
  readonly platform: string;
  readonly pnpmVersion: string;
}

interface BenchmarkSource {
  readonly id: string;
  readonly cardFilter?: (card: BenchmarkRankingCard) => boolean;
  readonly optional?: boolean;
  readonly source: string;
  readonly title: string;
}

const primitiveReactivityCaseNames = new Set([
  "source write with subscriber 1k",
  "text binding update 1k",
  "computed fan-out 1k",
  "computed fan-in 1k",
  "source write 1k",
]);

const benchmarkSources: readonly BenchmarkSource[] = [
  {
    id: "js-framework",
    optional: true,
    source: "js-framework-benchmark.md",
    title: "js-framework-benchmark keyed DOM benchmarks",
  },
  {
    id: "router",
    source: "router.md",
    title: "Router benchmarks",
  },
  {
    id: "primitive-dom",
    cardFilter: (card) => !primitiveReactivityCaseNames.has(card.title),
    source: "primitive.md",
    title: "Primitive DOM benchmarks",
  },
  {
    id: "primitive-reactivity",
    cardFilter: (card) => primitiveReactivityCaseNames.has(card.title),
    source: "primitive.md",
    title: "Primitive reactivity microbenchmarks",
  },
  {
    id: "primitive-browser",
    source: "primitive-browser.md",
    title: "Primitive browser benchmarks",
  },
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const docsSiteRoot = resolve(scriptDir, "..");
const repoRoot = resolve(docsSiteRoot, "..", "..");
const resultsRoot = join(repoRoot, "benchmarks", "results");
const outputPath = join(docsSiteRoot, "src", "benchmark-results.ts");

const latestRun = await findLatestCompleteBenchmarkRun();
const env = await readJson<BenchmarkEnvironment>(join(latestRun.absolutePath, "env.json"));
const suites = (
  await Promise.all(
    benchmarkSources.map(async (source) => {
      const markdown = await readOptionalBenchmarkReport(latestRun.absolutePath, source);
      if (markdown === undefined) {
        return undefined;
      }

      const cards = parseRankingCards(source.id, markdown).filter(source.cardFilter ?? (() => true));

      if (cards.length === 0) {
        throw new Error(`No benchmark ranking cards remain for ${source.id}.`);
      }

      return {
        id: source.id,
        title: source.title,
        source: source.source,
        cardCount: cards.length,
        cards,
      } satisfies BenchmarkRankingSuite;
    }),
  )
).filter((suite): suite is BenchmarkRankingSuite => suite !== undefined);

const meta: BenchmarkRunMeta = {
  arch: `${env.platform} ${env.arch}`,
  cpuCount: env.cpuCount,
  cpuModel: env.cpuModel,
  date: env.date,
  gitCommit: env.gitCommit,
  nodeVersion: env.nodeVersion,
  path: latestRun.relativePath,
  pnpmVersion: env.pnpmVersion,
};

await writeFile(outputPath, renderBenchmarkResultsModule(meta, suites));

async function findLatestCompleteBenchmarkRun(): Promise<{
  readonly absolutePath: string;
  readonly relativePath: string;
}> {
  const dateEntries = await readdir(resultsRoot, { withFileTypes: true });
  const dates = dateEntries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const date of dates) {
    const dayPath = join(resultsRoot, date);
    const runEntries = await readdir(dayPath, { withFileTypes: true });
    const runs = runEntries
      .filter((entry) => entry.isDirectory() && /^\d{3}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();

    for (const run of runs) {
      const absolutePath = join(dayPath, run);
      if (await hasCompleteBenchmarkReports(absolutePath)) {
        return {
          absolutePath,
          relativePath: `benchmarks/results/${date}/${run}`,
        };
      }
    }
  }

  throw new Error("No complete benchmark run with env.json and docs-site ranking reports found.");
}

async function hasCompleteBenchmarkReports(runPath: string): Promise<boolean> {
  const requiredFiles = [
    "env.json",
    ...benchmarkSources.filter((source) => source.optional !== true).map((source) => source.source),
  ];

  for (const file of requiredFiles) {
    try {
      await readFile(join(runPath, file));
    } catch {
      return false;
    }
  }

  return true;
}

async function readOptionalBenchmarkReport(
  runPath: string,
  source: BenchmarkSource,
): Promise<string | undefined> {
  try {
    return await readFile(join(runPath, source.source), "utf8");
  } catch (error) {
    if (source.optional === true && isFileMissingError(error)) {
      return undefined;
    }

    throw error;
  }
}

function isFileMissingError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  );
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function parseRankingCards(suiteId: string, markdown: string): readonly BenchmarkRankingCard[] {
  const rankings = rankingSectionBody(markdown);
  if (rankings === "") {
    throw new Error(`Benchmark report does not include a Rankings section for ${suiteId}.`);
  }

  const cards: BenchmarkRankingCard[] = [];
  const sectionPattern = /(?:^|\n)### (?<title>[^\n]+)\n(?<body>[\s\S]*?)(?=\n### |\n## |$)/g;

  for (const match of rankings.matchAll(sectionPattern)) {
    const title = match.groups?.title?.trim();
    const body = match.groups?.body;
    if (title === undefined || body === undefined) {
      continue;
    }

    const rows = parseRankingRows(body);
    if (rows.length === 0) {
      continue;
    }

    cards.push({
      id: `${suiteId}-${slugify(title)}`,
      title,
      description: parseRankingDescription(body),
      rows,
    });
  }

  if (cards.length === 0) {
    throw new Error(`No benchmark ranking cards were parsed for ${suiteId}.`);
  }

  return cards;
}

function rankingSectionBody(markdown: string): string {
  const rankingsHeading = "\n## Rankings\n";
  const resultsHeading = "\n## Results\n";
  const rankingsStart = markdown.indexOf(rankingsHeading);
  if (rankingsStart === -1) {
    return "";
  }

  const bodyStart = rankingsStart + rankingsHeading.length;
  const resultsStart = markdown.indexOf(resultsHeading, bodyStart);

  return resultsStart === -1 ? markdown.slice(bodyStart) : markdown.slice(bodyStart, resultsStart);
}

function parseRankingDescription(body: string): string {
  const lines = body.split("\n");
  const tableStart = lines.findIndex((line) => line.trim().startsWith("| rank |"));
  const descriptionLines = (tableStart === -1 ? lines : lines.slice(0, tableStart))
    .map((line) => line.trim())
    .filter((line) => line !== "");

  return descriptionLines.join(" ");
}

function parseRankingRows(body: string): readonly BenchmarkRankingRow[] {
  const rows: BenchmarkRankingRow[] = [];

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      continue;
    }

    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

    if (cells.length < 6 || cells[0] === "rank" || cells[0].startsWith("---")) {
      continue;
    }

    const rank = Number.parseInt(cells[0], 10);
    if (!Number.isFinite(rank)) {
      continue;
    }

    const framework = cells[1].replaceAll("**", "");

    const hasTimingBreakdown = cells.length >= 8;
    const script = hasTimingBreakdown ? cells[4] : "";
    const paint = hasTimingBreakdown ? cells[5] : "";

    rows.push({
      rank,
      framework,
      caseName: cells[2],
      value: cells[3],
      ...(paint === "" ? {} : { paint }),
      diff: hasTimingBreakdown ? cells[6] : cells[4],
      ...(script === "" ? {} : { script }),
      unit: hasTimingBreakdown ? cells[7] : cells[5],
      isMreact: framework.toLowerCase().includes("mreact"),
    });
  }

  return rows;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderBenchmarkResultsModule(
  meta: BenchmarkRunMeta,
  suites: readonly BenchmarkRankingSuite[],
): string {
  return `// Generated by scripts/sync-benchmark-results.ts. Do not edit by hand.

export interface BenchmarkRunMeta {
  readonly arch: string;
  readonly cpuCount: number;
  readonly cpuModel: string;
  readonly date: string;
  readonly gitCommit: string;
  readonly nodeVersion: string;
  readonly path: string;
  readonly pnpmVersion: string;
}

export interface BenchmarkRankingRow {
  readonly caseName: string;
  readonly diff: string;
  readonly framework: string;
  readonly isMreact: boolean;
  readonly paint?: string;
  readonly rank: number;
  readonly script?: string;
  readonly unit: string;
  readonly value: string;
}

export interface BenchmarkRankingCard {
  readonly description: string;
  readonly id: string;
  readonly rows: readonly BenchmarkRankingRow[];
  readonly title: string;
}

export interface BenchmarkRankingSuite {
  readonly cardCount: number;
  readonly cards: readonly BenchmarkRankingCard[];
  readonly id: string;
  readonly source: string;
  readonly title: string;
}

export const latestBenchmarkRun: BenchmarkRunMeta = ${JSON.stringify(meta, null, 2)};

export const benchmarkRankingSuites: readonly BenchmarkRankingSuite[] = ${JSON.stringify(suites, null, 2)};
`;
}
