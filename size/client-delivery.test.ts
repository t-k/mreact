import { describe, expect, test } from "vitest";
import {
  evaluateClientDeliveryBudgets,
  formatClientDeliveryMarkdown,
  maxBudgetBytes,
  type ClientDeliveryBudgets,
  type ClientDeliveryFixtureReport,
  type ClientDeliveryReport,
} from "./client-delivery-report.js";
import { deliveryCompressionSettings } from "./compression.js";
import { clientDeliveryFixtures } from "./fixtures.js";

function createFixtureReport(
  overrides: Partial<ClientDeliveryFixtureReport> = {},
): ClientDeliveryFixtureReport {
  return {
    description: "Interactive counter.",
    html: [],
    initial: {
      brotliEstimateBytes: 900,
      gzipEstimateBytes: 1000,
      paths: ["entry.js"],
      rawBytes: 3000,
    },
    name: "native-counter",
    navigationRuntimeDelivered: true,
    routeVisitCount: 1,
    unavailablePaths: [],
    visits: [],
    ...overrides,
  };
}

function createReport(fixtures: readonly ClientDeliveryFixtureReport[]): ClientDeliveryReport {
  return {
    buildOptions: { minify: true, nodeEnv: "production", target: "node" },
    commit: "0000000000000000000000000000000000000000",
    compression: deliveryCompressionSettings,
    createdAt: "2026-09-07T00:00:00.000Z",
    environment: { arch: "arm64", nodeVersion: "v24.14.0", platform: "darwin" },
    fixtures,
    version: 1,
  };
}

function createBudgets(
  fixtures: ClientDeliveryBudgets["fixtures"] = {
    "native-counter": {
      initialBrotliBytes: 1000,
      initialGzipBytes: 1100,
      measuredBaseline: { initialBrotliBytes: 900, initialGzipBytes: 1000 },
    },
  },
): ClientDeliveryBudgets {
  return {
    baselineCommit: "0000000000000000000000000000000000000000",
    fixtures,
    headroomRatio: 0.05,
    version: 1,
  };
}

describe("client delivery budget gate", () => {
  test("passes when every measured fixture stays inside its recorded ceiling", () => {
    expect(evaluateClientDeliveryBudgets(createReport([createFixtureReport()]), createBudgets()))
      .toEqual([]);
  });

  test("fails when a fixture exceeds its gzip ceiling by a single byte", () => {
    const report = createReport([
      createFixtureReport({
        initial: {
          brotliEstimateBytes: 900,
          gzipEstimateBytes: 1101,
          paths: ["entry.js"],
          rawBytes: 3000,
        },
      }),
    ]);

    expect(evaluateClientDeliveryBudgets(report, createBudgets())).toEqual([
      "native-counter initial gzip 1101 B exceeds 1100 B",
    ]);
  });

  test("fails when a fixture exceeds its Brotli ceiling", () => {
    const report = createReport([
      createFixtureReport({
        initial: {
          brotliEstimateBytes: 1001,
          gzipEstimateBytes: 1000,
          paths: ["entry.js"],
          rawBytes: 3000,
        },
      }),
    ]);

    expect(evaluateClientDeliveryBudgets(report, createBudgets())).toEqual([
      "native-counter initial Brotli 1001 B exceeds 1000 B",
    ]);
  });

  test("fails explicitly when the build did not emit an asset the manifest references", () => {
    const report = createReport([
      createFixtureReport({ unavailablePaths: ["assets/routes/index.hash.js"] }),
    ]);

    expect(evaluateClientDeliveryBudgets(report, createBudgets())).toEqual([
      "native-counter references assets the build did not emit: assets/routes/index.hash.js",
    ]);
  });

  test("fails when a measured fixture has no budget entry", () => {
    const report = createReport([createFixtureReport(), createFixtureReport({ name: "forms" })]);

    expect(evaluateClientDeliveryBudgets(report, createBudgets())).toEqual([
      "forms has no budget entry in the client delivery budgets file",
    ]);
  });

  test("fails when a budget entry has no matching fixture in the report", () => {
    const budgets = createBudgets({
      "native-counter": {
        initialBrotliBytes: 1000,
        initialGzipBytes: 1100,
        measuredBaseline: { initialBrotliBytes: 900, initialGzipBytes: 1000 },
      },
      removed: {
        initialBrotliBytes: 1000,
        initialGzipBytes: 1100,
        measuredBaseline: { initialBrotliBytes: 900, initialGzipBytes: 1000 },
      },
    });

    expect(evaluateClientDeliveryBudgets(createReport([createFixtureReport()]), budgets)).toEqual([
      "removed has a budget entry but the report contains no such fixture",
    ]);
  });

  test("fails when a ceiling is raised beyond the headroom its recorded baseline allows", () => {
    const budgets = createBudgets({
      "native-counter": {
        initialBrotliBytes: 1000,
        initialGzipBytes: 1200,
        measuredBaseline: { initialBrotliBytes: 900, initialGzipBytes: 1000 },
      },
    });

    expect(evaluateClientDeliveryBudgets(createReport([createFixtureReport()]), budgets)).toEqual([
      "native-counter initial gzip budget 1200 B exceeds 1100 B, the most the recorded baseline 1000 B allows at 0.05 headroom",
    ]);
  });

  test("fails when a ceiling sits below the baseline it claims to cover", () => {
    const budgets = createBudgets({
      "native-counter": {
        initialBrotliBytes: 1000,
        initialGzipBytes: 900,
        measuredBaseline: { initialBrotliBytes: 900, initialGzipBytes: 1000 },
      },
    });

    expect(evaluateClientDeliveryBudgets(createReport([createFixtureReport()]), budgets)).toEqual([
      "native-counter initial gzip budget 900 B is below its own recorded baseline 1000 B",
      "native-counter initial gzip 1000 B exceeds 900 B",
    ]);
  });

  test("fails when a measured navigation session has no cumulative ceiling", () => {
    const report = createReport([
      createFixtureReport({
        routeVisitCount: 3,
        sessionCumulative: {
          brotliEstimateBytes: 1500,
          gzipEstimateBytes: 1700,
          paths: ["entry.js", "about.js"],
          rawBytes: 5000,
        },
      }),
    ]);

    expect(evaluateClientDeliveryBudgets(report, createBudgets())).toEqual([
      "native-counter measured a navigation session but the budgets file has no sessionCumulativeGzipBytes ceiling",
    ]);
  });

  test("fails when a cumulative session ceiling exists but nothing was navigated", () => {
    const budgets = createBudgets({
      "native-counter": {
        initialBrotliBytes: 1000,
        initialGzipBytes: 1100,
        measuredBaseline: {
          initialBrotliBytes: 900,
          initialGzipBytes: 1000,
          sessionCumulativeGzipBytes: 1700,
        },
        sessionCumulativeGzipBytes: 1800,
      },
    });

    expect(evaluateClientDeliveryBudgets(createReport([createFixtureReport()]), budgets)).toEqual([
      "native-counter has a sessionCumulativeGzipBytes ceiling but measured no navigation session",
    ]);
  });

  test("fails when cumulative session bytes over the visited routes exceed the ceiling", () => {
    const budgets = createBudgets({
      "native-counter": {
        initialBrotliBytes: 1000,
        initialGzipBytes: 1100,
        measuredBaseline: {
          initialBrotliBytes: 900,
          initialGzipBytes: 1000,
          sessionCumulativeGzipBytes: 1700,
        },
        sessionCumulativeGzipBytes: 1800,
      },
    });
    const report = createReport([
      createFixtureReport({
        routeVisitCount: 4,
        sessionCumulative: {
          brotliEstimateBytes: 1600,
          gzipEstimateBytes: 1801,
          paths: ["entry.js", "about.js"],
          rawBytes: 5000,
        },
      }),
    ]);

    expect(evaluateClientDeliveryBudgets(report, budgets)).toEqual([
      "native-counter cumulative session gzip 1801 B over 4 route visits exceeds 1800 B",
    ]);
  });

  test("rounds each ceiling up to a whole hundred bytes above its baseline", () => {
    expect(maxBudgetBytes(1000, 0.05)).toBe(1100);
    expect(maxBudgetBytes(16_409, 0.05)).toBe(17_300);
    expect(maxBudgetBytes(0, 0.05)).toBe(0);
  });
});

describe("client delivery fixtures", () => {
  test("measures fixed production fixtures for every declared client capability", () => {
    expect(clientDeliveryFixtures.map((fixture) => fixture.name)).toEqual([
      "native-counter",
      "native-counter-no-navigation",
      "keyed-list",
      "forms",
      "query",
      "react-compat",
      "multi-route-session",
    ]);
  });

  test("keeps native fixtures free of comparison frameworks and compat packages", () => {
    for (const fixture of clientDeliveryFixtures) {
      if (fixture.name === "react-compat") {
        continue;
      }

      const source = Object.values(fixture.files).join("\n");
      expect(source, fixture.name).not.toMatch(/from "react(-dom)?"/u);
      expect(source, fixture.name).not.toContain("@reckona/mreact-compat");
      expect(Object.keys(fixture.files), fixture.name).not.toEqual(
        expect.arrayContaining([expect.stringContaining(".compat.")]),
      );
      expect(fixture.workspacePackages, fixture.name).not.toContain("react-compat");
    }
  });

  test("declares a navigation session long enough to expose repeat-visit caching", () => {
    const session = clientDeliveryFixtures.find(
      (fixture) => fixture.name === "multi-route-session",
    );

    expect(session?.sessionVisits.length).toBeGreaterThanOrEqual(3);
    expect(session?.sessionVisits.length).toBeLessThanOrEqual(9);
    // A repeat visit is what proves cached chunks are not counted twice. The initial page counts
    // as already visited, so returning to it is a repeat even when every entry is distinct.
    expect(session?.sessionVisits).toContain(session?.initialPath);
  });

  test("covers client navigation both enabled and disabled through normal route options", () => {
    const withNavigation = clientDeliveryFixtures.find(
      (fixture) => fixture.name === "native-counter",
    );
    const withoutNavigation = clientDeliveryFixtures.find(
      (fixture) => fixture.name === "native-counter-no-navigation",
    );

    expect(Object.values(withNavigation?.files ?? {}).join("\n")).not.toContain("clientNavigation");
    expect(Object.values(withoutNavigation?.files ?? {}).join("\n")).toContain(
      "export const clientNavigation = false;",
    );
  });
});

describe("client delivery markdown report", () => {
  test("separates initial closure, cumulative session and HTML payload categories", () => {
    const markdown = formatClientDeliveryMarkdown(
      createReport([
        createFixtureReport({
          html: [
            {
              brotliEstimateBytes: 341,
              gzipEstimateBytes: 445,
              inlineScriptRawBytes: 0,
              path: "/query",
              queryDataRawBytes: 130,
              rawBytes: 917,
              restorationRawBytes: 126,
              routerMetadataRawBytes: 78,
            },
          ],
          routeVisitCount: 2,
          sessionCumulative: {
            brotliEstimateBytes: 1500,
            gzipEstimateBytes: 1700,
            paths: ["entry.js", "about.js"],
            rawBytes: 5000,
          },
          visits: [
            {
              brotliEstimateBytes: 600,
              fetchedPaths: ["about.js"],
              gzipEstimateBytes: 700,
              path: "/about",
              paths: ["about.js"],
              rawBytes: 2000,
            },
          ],
        }),
      ]),
    );

    expect(markdown).toContain("| native-counter | 2 | 3000 | 1000 | 900 | 5000 | 1700 | 1500 |");
    expect(markdown).toContain("| native-counter | /query | 917 | 445 | 341 | 126 | 130 | 78 | 0 |");
    expect(markdown).toContain("| native-counter | 1 | /about | 2000 | 700 | 600 | about.js |");
    expect(markdown).toContain("gzip level -1, Brotli quality 11 lgwin 22");
  });

  test("marks a revisit that fetched nothing instead of leaving the row blank", () => {
    const markdown = formatClientDeliveryMarkdown(
      createReport([
        createFixtureReport({
          routeVisitCount: 2,
          visits: [
            {
              brotliEstimateBytes: 0,
              fetchedPaths: [],
              gzipEstimateBytes: 0,
              path: "/about",
              paths: [],
              rawBytes: 0,
            },
          ],
        }),
      ]),
    );

    expect(markdown).toContain("| native-counter | 1 | /about | 0 | 0 | 0 | none (cached) |");
  });
});
