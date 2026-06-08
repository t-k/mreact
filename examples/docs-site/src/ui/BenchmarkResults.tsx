import {
  benchmarkCharts,
  benchmarkHighlights,
  latestBenchmarkRun,
  type BenchmarkChartDefinition,
  type BenchmarkUnit,
} from "../benchmark-results.js";

export function BenchmarkResults() {
  return (
    <section class="benchmark-results" aria-labelledby="latest-benchmark-results">
      <div class="benchmark-meta">
        <div>
          <h3 id="latest-benchmark-results">Run 2026-06-07/002</h3>
          <p>
            Selected completed rows from the latest repository benchmark artifacts. Charts show representative rows from the latest run, while the repository artifacts contain the full JSON and Markdown reports.
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

      <div class="benchmark-highlights" aria-label="Mreact benchmark highlights">
        {benchmarkHighlights.map((highlight) => (
          <div class="benchmark-highlight" key={highlight.metric}>
            <span class="benchmark-highlight-value">{formatMetric(highlight.value, highlight.unit)}</span>
            <span class="benchmark-highlight-label">{highlight.metric}</span>
          </div>
        ))}
      </div>

      <div class="benchmark-grid">
        {benchmarkCharts.map((chart) => (
          <BenchmarkChart chart={chart} key={chart.id} />
        ))}
      </div>
    </section>
  );
}

function BenchmarkChart({ chart }: { readonly chart: BenchmarkChartDefinition }) {
  const maxValue = Math.max(...chart.rows.map((row) => row.value), 1);
  const sortedRows = [...chart.rows].sort((a, b) => {
    return chart.lowerIsBetter ? a.value - b.value : b.value - a.value;
  });

  return (
    <section class="benchmark-panel" aria-labelledby={`${chart.id}-title`}>
      <div class="benchmark-panel-heading">
        <h3 id={`${chart.id}-title`}>{chart.title}</h3>
        <p>{chart.lowerIsBetter ? "Lower is better." : "Higher is better."}</p>
      </div>
      <p>{chart.description}</p>
      <div class="benchmark-chart" aria-label={`${chart.caseName} chart`}>
        {sortedRows.map((row) => {
          const width = Math.max(2, (row.value / maxValue) * 100);

          return (
            <div class="benchmark-bar-row" key={`${chart.id}-${row.framework}`}>
              <span class="benchmark-label">{row.framework}</span>
              <span class="benchmark-bar-track" aria-hidden="true">
                <span class="benchmark-bar-fill" style={`--bar-width: ${formatPercent(width)}%;`} />
              </span>
              <span class="benchmark-value">{formatMetric(row.value, chart.unit)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatMetric(value: number, unit: BenchmarkUnit): string {
  if (unit === "gzip bytes") {
    return `${Math.round(value).toLocaleString("en-US")} B gzip`;
  }

  if (unit === "ops/sec") {
    return `${Math.round(value).toLocaleString("en-US")} ops/sec`;
  }

  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: value < 10 ? 2 : 1,
    minimumFractionDigits: value < 1 ? 2 : 0,
  })} ms`;
}

function formatPercent(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}
