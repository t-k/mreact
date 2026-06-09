import {
  benchmarkRankingSuites,
  latestBenchmarkRun,
  type BenchmarkRankingCard,
  type BenchmarkRankingRow,
} from "../benchmark-results.js";

type BenchmarkBadgeLabel =
  | "Build"
  | "Browser"
  | "Client"
  | "Concurrency"
  | "Dev"
  | "Development"
  | "Interactivity"
  | "Memory"
  | "Navigation"
  | "Production"
  | "Routing"
  | "SSR"
  | "Server"
  | "Size"
  | "Startup";

interface BenchmarkBadge {
  readonly label: BenchmarkBadgeLabel;
  readonly tone: "primary" | "secondary";
}

const benchmarkFilterOrder: readonly BenchmarkBadgeLabel[] = [
  "Size",
  "SSR",
  "Interactivity",
  "Navigation",
  "Startup",
  "Concurrency",
  "Memory",
  "Dev",
  "Build",
  "Routing",
  "Client",
  "Server",
  "Browser",
  "Production",
  "Development",
];

const benchmarkBadgeClassNames: Readonly<Record<BenchmarkBadgeLabel, string>> = {
  Browser: "is-browser",
  Build: "is-build",
  Client: "is-client",
  Concurrency: "is-concurrency",
  Dev: "is-dev",
  Development: "is-development",
  Interactivity: "is-interactivity",
  Memory: "is-memory",
  Navigation: "is-navigation",
  Production: "is-production",
  Routing: "is-routing",
  Server: "is-server",
  SSR: "is-ssr",
  Size: "is-size",
  Startup: "is-startup",
};

export function BenchmarkResults() {
  return (
    <section class="benchmark-results" aria-labelledby="latest-benchmark-results">
      <div class="benchmark-meta">
        <div>
          <h3 id="latest-benchmark-results">{benchmarkRunLabel(latestBenchmarkRun.path)}</h3>
          <p>
            Complete ranking cards from the latest benchmark Markdown reports. These cards mirror
            the ranking sections in the repository artifacts without trimming the result set.
          </p>
          <p class="benchmark-source-path">
            Source: <code>{latestBenchmarkRun.path}</code>
          </p>
          <p class="benchmark-source-path">
            <a href={githubUrlForRunPath(latestBenchmarkRun.path)}>View run on GitHub</a>
          </p>
        </div>
        <dl class="benchmark-run-list">
          <div>
            <dt>Date</dt>
            <dd>{latestBenchmarkRun.date}</dd>
          </div>
          <div>
            <dt>Commit</dt>
            <dd>{latestBenchmarkRun.gitCommit.slice(0, 7)}</dd>
          </div>
          <div>
            <dt>Node</dt>
            <dd>{latestBenchmarkRun.nodeVersion}</dd>
          </div>
          <div>
            <dt>CPU</dt>
            <dd>
              {latestBenchmarkRun.cpuModel}, {latestBenchmarkRun.cpuCount} cores
            </dd>
          </div>
        </dl>
      </div>

      <BenchmarkFilterBar />

      {benchmarkRankingSuites.map((suite) => (
        <section
          class="benchmark-ranking-suite"
          aria-labelledby={`${suite.id}-rankings`}
          key={suite.id}
        >
          <div class="benchmark-ranking-suite-heading">
            <div>
              <h3 id={`${suite.id}-rankings`}>{suite.title}</h3>
              <p>
                <code>{suite.source}</code> / {suite.cardCount} ranking cards /{" "}
                <a href={githubUrlForFilePath(`${latestBenchmarkRun.path}/${suite.source}`)}>
                  View source on GitHub
                </a>
              </p>
            </div>
          </div>
          <div class="benchmark-ranking-grid">
            {suite.cards.map((card) => (
              <BenchmarkRankingPanel card={card} key={card.id} />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function BenchmarkFilterBar() {
  return (
    <div class="benchmark-filter-list" role="toolbar" aria-label="Benchmark filters">
      <button
        class="benchmark-filter is-active"
        type="button"
        data-benchmark-filter="all"
        aria-pressed="true"
      >
        All
      </button>
      {benchmarkFilterLabels().map((label) => (
        <button
          class={`benchmark-filter benchmark-badge ${badgeColorClass(label)}`}
          type="button"
          data-benchmark-filter={badgeSlug(label)}
          aria-pressed="false"
          key={label}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function benchmarkFilterLabels(): readonly BenchmarkBadgeLabel[] {
  const usedLabels = new Set<BenchmarkBadgeLabel>();

  for (const suite of benchmarkRankingSuites) {
    for (const card of suite.cards) {
      for (const badge of classifyBenchmarkCard(card)) {
        usedLabels.add(badge.label);
      }
    }
  }

  return benchmarkFilterOrder.filter((label) => usedLabels.has(label));
}

function githubUrlForRunPath(path: string): string {
  return `https://github.com/t-k/mreact/tree/${latestBenchmarkRun.gitCommit}/${path}`;
}

function benchmarkRunLabel(path: string): string {
  return `Run ${path.replace(/^benchmarks\/results\//, "")}`;
}

function githubUrlForFilePath(path: string): string {
  return `https://github.com/t-k/mreact/blob/${latestBenchmarkRun.gitCommit}/${path}`;
}

function BenchmarkRankingPanel({ card }: { readonly card: BenchmarkRankingCard }) {
  const maxValue = Math.max(...card.rows.map((row) => valueAsNumber(row)), 1);
  const badges = classifyBenchmarkCard(card);
  const badgeSlugs = badges.map((badge) => badgeSlug(badge.label)).join(" ");

  return (
    <section
      class="benchmark-panel"
      aria-labelledby={`${card.id}-title`}
      data-benchmark-badges={badgeSlugs}
    >
      <div class="benchmark-panel-heading">
        <h4 id={`${card.id}-title`}>{card.title}</h4>
        <p>{card.rows.length} entries</p>
      </div>
      <div class="benchmark-badge-list" aria-label="Benchmark categories">
        {badges.map((badge) => (
          <span
            class={
              badge.tone === "primary"
                ? `benchmark-badge is-primary ${badgeColorClass(badge.label)}`
                : `benchmark-badge ${badgeColorClass(badge.label)}`
            }
            key={`${card.id}-${badge.label}`}
          >
            {badge.label}
          </span>
        ))}
      </div>
      <p>{card.description}</p>
      <div class="benchmark-chart" aria-label={`${card.title} ranking chart`}>
        {rankingRowsWithDisplayRank(card.rows).map((row) => {
          const width = Math.max(2, (valueAsNumber(row) / maxValue) * 100);

          return (
            <div
              class={`benchmark-bar-row${isMreactFramework(row) ? " is-mreact" : ""}`}
              key={`${card.id}-${row.rank}-${row.framework}`}
            >
              <span class="benchmark-label">
                #{row.displayRank} {row.framework}
              </span>
              <span class="benchmark-bar-track" aria-hidden="true">
                <span
                  class="benchmark-bar-fill"
                  style={`--bar-width: ${formatPercent(width)}%;`}
                />
              </span>
              <span class="benchmark-value">
                <span>
                  {row.value} {row.unit}
                </span>
                <span class="benchmark-diff">{row.diff}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function badgeSlug(label: BenchmarkBadgeLabel): string {
  return label.toLowerCase();
}

function badgeColorClass(label: BenchmarkBadgeLabel): string {
  return benchmarkBadgeClassNames[label];
}

function classifyBenchmarkCard(card: BenchmarkRankingCard): readonly BenchmarkBadge[] {
  const title = card.title.toLowerCase();
  const id = card.id.toLowerCase();
  const badges: BenchmarkBadge[] = [{ label: primaryBenchmarkCategory(title), tone: "primary" }];

  for (const label of secondaryBenchmarkCategories(title, id)) {
    if (!badges.some((badge) => badge.label === label)) {
      badges.push({ label, tone: "secondary" });
    }
  }

  return badges.slice(0, 4);
}

function primaryBenchmarkCategory(title: string): BenchmarkBadgeLabel {
  if (title.includes("dev ") || title.includes("hmr")) {
    return "Dev";
  }

  if (title.includes("gzip bytes") || title.includes("build output")) {
    return "Size";
  }

  if (title.includes("build time")) {
    return "Build";
  }

  if (title.includes("cold start")) {
    return "Startup";
  }

  if (title.includes("navigation") || title.includes("back-forward")) {
    return "Navigation";
  }

  if (title.includes("concurrent") || title.includes("100 connections")) {
    return "Concurrency";
  }

  if (title.includes("rss") || title.includes("memory")) {
    return "Memory";
  }

  if (
    title.includes("interaction") ||
    title.includes("hydration") ||
    title.includes("browser ") ||
    title.includes("event targets") ||
    title.includes("source write") ||
    title.includes("text binding") ||
    title.includes("computed") ||
    title.includes(" row") ||
    title.includes(" rows") ||
    title.includes("clear ") ||
    title.includes("update ") ||
    title.includes("select ") ||
    title.includes("append ") ||
    title.includes("remove ") ||
    title.includes("replace ") ||
    title.includes("reverse ")
  ) {
    return "Interactivity";
  }

  if (
    title.includes("route match") ||
    title.includes("1000 route") ||
    title.includes("dynamic route") ||
    title.includes("nested layouts")
  ) {
    return "Routing";
  }

  return "SSR";
}

function secondaryBenchmarkCategories(
  title: string,
  id: string,
): readonly BenchmarkBadgeLabel[] {
  const labels: BenchmarkBadgeLabel[] = [];

  if (
    title.includes("client") ||
    title.includes("interaction") ||
    title.includes("hydration") ||
    title.includes("navigation")
  ) {
    labels.push("Client");
  }

  if (
    title.includes("browser ") ||
    id.includes("primitive-browser") ||
    title.includes("interaction") ||
    title.includes("hydration")
  ) {
    labels.push("Browser");
  }

  if (
    title.startsWith("app ") &&
    !title.includes("client bundle") &&
    !title.includes("client navigation") &&
    !title.includes("interaction") &&
    !title.includes("hydration")
  ) {
    labels.push("Server");
  }

  if (title.includes("dev ") || title.includes("hmr")) {
    labels.push("Development");
  } else if (title.startsWith("app ")) {
    labels.push("Production");
  }

  return labels;
}

function rankingRowsWithDisplayRank(rows: readonly BenchmarkRankingRow[]) {
  let previousValue: string | undefined;
  let previousDisplayRank = 0;

  return rows.map((row, index) => {
    const displayRank = row.value === previousValue ? previousDisplayRank : index + 1;
    previousValue = row.value;
    previousDisplayRank = displayRank;

    return {
      ...row,
      displayRank,
    };
  });
}

function isMreactFramework(row: BenchmarkRankingRow): boolean {
  return row.isMreact;
}

function valueAsNumber(row: BenchmarkRankingRow): number {
  return globalThis.parseFloat(row.value.replace(",", ""));
}

function formatPercent(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}
