import type { DeliveryCompressionSettings } from "./compression.js";

export interface ClientDeliveryClosureReport {
  brotliEstimateBytes: number;
  gzipEstimateBytes: number;
  paths: readonly string[];
  rawBytes: number;
}

export interface ClientDeliveryVisitReport extends ClientDeliveryClosureReport {
  fetchedPaths: readonly string[];
  path: string;
}

export interface ClientDeliveryHtmlReport {
  brotliEstimateBytes: number;
  gzipEstimateBytes: number;
  inlineScriptRawBytes: number;
  path: string;
  queryDataRawBytes: number;
  rawBytes: number;
  restorationRawBytes: number;
  routerMetadataRawBytes: number;
}

export interface ClientDeliveryFixtureReport {
  description: string;
  html: readonly ClientDeliveryHtmlReport[];
  initial: ClientDeliveryClosureReport;
  name: string;
  navigationRuntimeDelivered: boolean;
  routeVisitCount: number;
  sessionCumulative?: ClientDeliveryClosureReport | undefined;
  unavailablePaths: readonly string[];
  visits: readonly ClientDeliveryVisitReport[];
}

export interface ClientDeliveryReport {
  buildOptions: { minify: boolean; nodeEnv: string; target: string };
  commit: string;
  compression: DeliveryCompressionSettings;
  createdAt: string;
  environment: { arch: string; nodeVersion: string; platform: string };
  fixtures: readonly ClientDeliveryFixtureReport[];
  version: 1;
}

export interface ClientDeliveryMeasuredBaseline {
  initialBrotliBytes: number;
  initialGzipBytes: number;
  sessionCumulativeGzipBytes?: number | undefined;
}

export interface ClientDeliveryFixtureBudget extends ClientDeliveryMeasuredBaseline {
  /** The measurement the ceilings were derived from, so later inflation is visible in review. */
  measuredBaseline: ClientDeliveryMeasuredBaseline;
}

export interface ClientDeliveryBudgets {
  /** Commit whose measured report produced these ceilings. */
  baselineCommit: string;
  fixtures: Readonly<Record<string, ClientDeliveryFixtureBudget>>;
  /** How much headroom over the measured baseline each ceiling carries, as a ratio. */
  headroomRatio: number;
  version: 1;
}

/** The largest ceiling a measured baseline may carry, rounded up to a whole hundred bytes. */
export function maxBudgetBytes(baselineBytes: number, headroomRatio: number): number {
  return Math.ceil((baselineBytes * (1 + headroomRatio)) / 100) * 100;
}

/**
 * Compares a measured report with the checked-in ceilings.
 *
 * A missing asset, a missing budget entry and a budget entry without a fixture are all failures:
 * a size gate that silently skips what it cannot find is not a gate. Ceilings are also checked
 * against the baseline they record, so a regression cannot be absorbed by quietly raising them.
 */
export function evaluateClientDeliveryBudgets(
  report: ClientDeliveryReport,
  budgets: ClientDeliveryBudgets,
): readonly string[] {
  const failures: string[] = [];
  const measured = new Set<string>();

  for (const fixture of report.fixtures) {
    measured.add(fixture.name);

    if (fixture.unavailablePaths.length > 0) {
      failures.push(
        `${fixture.name} references assets the build did not emit: ${fixture.unavailablePaths.join(", ")}`,
      );
    }

    const budget = budgets.fixtures[fixture.name];
    if (budget === undefined) {
      failures.push(`${fixture.name} has no budget entry in the client delivery budgets file`);
      continue;
    }

    failures.push(...describeBudgetHeadroomFailures(fixture.name, budget, budgets.headroomRatio));

    if (fixture.initial.gzipEstimateBytes > budget.initialGzipBytes) {
      failures.push(
        `${fixture.name} initial gzip ${fixture.initial.gzipEstimateBytes} B exceeds ${budget.initialGzipBytes} B`,
      );
    }

    if (fixture.initial.brotliEstimateBytes > budget.initialBrotliBytes) {
      failures.push(
        `${fixture.name} initial Brotli ${fixture.initial.brotliEstimateBytes} B exceeds ${budget.initialBrotliBytes} B`,
      );
    }

    if (budget.sessionCumulativeGzipBytes === undefined) {
      if (fixture.sessionCumulative !== undefined) {
        failures.push(
          `${fixture.name} measured a navigation session but the budgets file has no sessionCumulativeGzipBytes ceiling`,
        );
      }
      continue;
    }

    if (fixture.sessionCumulative === undefined) {
      failures.push(
        `${fixture.name} has a sessionCumulativeGzipBytes ceiling but measured no navigation session`,
      );
      continue;
    }

    if (fixture.sessionCumulative.gzipEstimateBytes > budget.sessionCumulativeGzipBytes) {
      failures.push(
        `${fixture.name} cumulative session gzip ${fixture.sessionCumulative.gzipEstimateBytes} B over ${fixture.routeVisitCount} route visits exceeds ${budget.sessionCumulativeGzipBytes} B`,
      );
    }
  }

  for (const name of Object.keys(budgets.fixtures)) {
    if (!measured.has(name)) {
      failures.push(`${name} has a budget entry but the report contains no such fixture`);
    }
  }

  return failures;
}

function describeBudgetHeadroomFailures(
  name: string,
  budget: ClientDeliveryFixtureBudget,
  headroomRatio: number,
): readonly string[] {
  const metrics = [
    ["initial gzip", budget.initialGzipBytes, budget.measuredBaseline.initialGzipBytes],
    ["initial Brotli", budget.initialBrotliBytes, budget.measuredBaseline.initialBrotliBytes],
    [
      "cumulative session gzip",
      budget.sessionCumulativeGzipBytes,
      budget.measuredBaseline.sessionCumulativeGzipBytes,
    ],
  ] as const;
  const failures: string[] = [];

  for (const [label, ceiling, baseline] of metrics) {
    if (ceiling === undefined || baseline === undefined) {
      if (ceiling !== baseline) {
        failures.push(
          `${name} ${label} budget and recorded baseline must both be present or both be absent`,
        );
      }
      continue;
    }

    if (ceiling < baseline) {
      failures.push(
        `${name} ${label} budget ${ceiling} B is below its own recorded baseline ${baseline} B`,
      );
      continue;
    }

    const maximum = maxBudgetBytes(baseline, headroomRatio);
    if (ceiling > maximum) {
      failures.push(
        `${name} ${label} budget ${ceiling} B exceeds ${maximum} B, the most the recorded baseline ${baseline} B allows at ${headroomRatio} headroom`,
      );
    }
  }

  return failures;
}

/** Renders the human-readable companion to the JSON report. */
export function formatClientDeliveryMarkdown(report: ClientDeliveryReport): string {
  const lines = [
    "# Client delivery size",
    "",
    `Commit: \`${report.commit}\``,
    `Created: ${report.createdAt}`,
    `Environment: Node ${report.environment.nodeVersion} on ${report.environment.platform}/${report.environment.arch}`,
    `Build: NODE_ENV=${report.buildOptions.nodeEnv}, target ${report.buildOptions.target}, minify ${report.buildOptions.minify}`,
    `Compression: gzip level ${report.compression.gzip.level}, Brotli quality ${report.compression.brotli.quality} lgwin ${report.compression.brotli.lgwin}`,
    "",
    "Initial columns are the JavaScript closure the browser fetches for the first page. Cumulative columns are the unique JavaScript fetched across the whole navigation session, counting each chunk once.",
    "",
    "| fixture | route visits | initial raw | initial gzip | initial brotli | cumulative raw | cumulative gzip | cumulative brotli |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const fixture of report.fixtures) {
    const cumulative = fixture.sessionCumulative;
    lines.push(
      `| ${fixture.name} | ${fixture.routeVisitCount} | ${fixture.initial.rawBytes} | ${fixture.initial.gzipEstimateBytes} | ${fixture.initial.brotliEstimateBytes} | ${cumulative === undefined ? "-" : cumulative.rawBytes} | ${cumulative === undefined ? "-" : cumulative.gzipEstimateBytes} | ${cumulative === undefined ? "-" : cumulative.brotliEstimateBytes} |`,
    );
  }

  lines.push(
    "",
    "## HTML payload categories",
    "",
    "Raw byte counts of the inline JSON the server writes into the document. These are not part of the external JavaScript totals above.",
    "",
    "| fixture | path | html raw | html gzip | html brotli | restoration | query state | router metadata | other inline |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );

  for (const fixture of report.fixtures) {
    for (const html of fixture.html) {
      lines.push(
        `| ${fixture.name} | ${html.path} | ${html.rawBytes} | ${html.gzipEstimateBytes} | ${html.brotliEstimateBytes} | ${html.restorationRawBytes} | ${html.queryDataRawBytes} | ${html.routerMetadataRawBytes} | ${html.inlineScriptRawBytes} |`,
      );
    }
  }

  lines.push("", "## Navigation session", "");

  const sessionFixtures = report.fixtures.filter((fixture) => fixture.visits.length > 0);
  if (sessionFixtures.length === 0) {
    lines.push("No fixture declared navigation visits.");
  } else {
    lines.push(
      "| fixture | visit | path | fetched raw | fetched gzip | fetched brotli | newly fetched files |",
      "| --- | ---: | --- | ---: | ---: | ---: | --- |",
    );
    for (const fixture of sessionFixtures) {
      fixture.visits.forEach((visit, index) => {
        lines.push(
          `| ${fixture.name} | ${index + 1} | ${visit.path} | ${visit.rawBytes} | ${visit.gzipEstimateBytes} | ${visit.brotliEstimateBytes} | ${visit.fetchedPaths.length === 0 ? "none (cached)" : visit.fetchedPaths.join(", ")} |`,
        );
      });
    }
  }

  return `${lines.join("\n")}\n`;
}
