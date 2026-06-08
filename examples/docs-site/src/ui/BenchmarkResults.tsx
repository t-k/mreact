import {
  benchmarkRankingSuites,
  latestBenchmarkRun,
  type BenchmarkRankingCard,
  type BenchmarkRankingRow,
} from "../benchmark-results.js";

export function BenchmarkResults() {
  return (
    <section class="benchmark-results" aria-labelledby="latest-benchmark-results">
      <div class="benchmark-meta">
        <div>
          <h3 id="latest-benchmark-results">Run 2026-06-07/002</h3>
          <p>
            Complete ranking cards from the latest benchmark Markdown reports. These cards mirror
            the ranking sections in the repository artifacts without trimming the result set.
          </p>
          <p class="benchmark-source-path">
            Source: <code>{latestBenchmarkRun.path}</code>
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
                <code>{suite.source}</code> / {suite.cardCount} ranking cards
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

function BenchmarkRankingPanel({ card }: { readonly card: BenchmarkRankingCard }) {
  const maxValue = Math.max(...card.rows.map((row) => valueAsNumber(row)), 1);

  return (
    <section class="benchmark-panel" aria-labelledby={`${card.id}-title`}>
      <div class="benchmark-panel-heading">
        <h4 id={`${card.id}-title`}>{card.title}</h4>
        <p>{card.rows.length} entries</p>
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
