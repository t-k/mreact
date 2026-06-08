import {
  benchmarkRankingSuites,
  latestBenchmarkRun,
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
              <article class="benchmark-ranking-card" key={card.id}>
                <div class="benchmark-ranking-card-heading">
                  <h4>{card.title}</h4>
                  <span>{card.rows.length} entries</span>
                </div>
                <p>{card.description}</p>
                <ol class="benchmark-rank-list">
                  {card.rows.map((row) => (
                    <li
                      class={`benchmark-rank-row${isMreactFramework(row) ? " is-mreact" : ""}`}
                      key={`${card.id}-${row.rank}-${row.framework}`}
                    >
                      <span class="benchmark-rank-index">#{row.rank}</span>
                      <span class="benchmark-rank-framework">{row.framework}</span>
                      <span class="benchmark-rank-value">
                        {row.value} {row.unit}
                      </span>
                      <span class="benchmark-rank-diff">{row.diff}</span>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function isMreactFramework(row: BenchmarkRankingRow): boolean {
  return row.isMreact;
}
