import { describe, expect, it } from "vitest";
import { routerBenchmarkAdapters } from "./adapters/index.js";
import { routerBenchmarkCases, rankCompletedRows, runRouterBenchmarks } from "./runner.js";
import type { RouterBenchmarkRow } from "./types.js";

describe("router benchmark configuration", () => {
  it("includes every planned router/app framework adapter", () => {
    expect(routerBenchmarkAdapters.map((adapter) => adapter.name)).toEqual([
      "marko-run",
      "nuxt",
      "svelte-kit",
      "analog",
      "qwik-city",
      "qwik-router-v2",
      "solid-start",
      "tanstack-start",
      "tanstack-start-solid",
      "next-app-router",
      "mreact-app-router",
      "mreact-app-router+mreact react-compat",
      "mreact-app-router+log enabled",
    ]);
  });

  it("covers render, streaming, dynamic attributes, and client bundle cases", () => {
    expect(routerBenchmarkCases.map((benchmarkCase) => benchmarkCase.name)).toEqual([
      "app render 1000 nodes",
      "app streaming 1000 nodes",
      "app streaming first byte 1000 nodes",
      "app streaming first chunk 1000 nodes",
      "app streaming full body 1000 nodes",
      "app real streaming 1000 nodes (async 50ms)",
      "app parallel async boundaries 2x50ms",
      "app static cached route 1000 nodes",
      "app dynamic-attr grid 200 cells",
      "app dynamic route params data",
      "app concurrent throughput 100 connections",
      "app concurrent p99 latency 100 connections",
      "app concurrent RSS delta 100 connections",
      "app hydration 100 islands",
      "app dev cold start",
      "app dev first request latency",
      "app dev HMR update latency",
      "app 1000 route match latency",
      "app 1000 route cold start",
      "app 1000 route build time",
      "app 1000 route RSS delta",
      "app server action form POST roundtrip",
      "app nested layouts depth 5",
      "app loader client navigation route-to-route",
      "app client navigation back-forward restore",
      "app Cloudflare Worker request latency",
      "app client navigation route-to-route",
      "app initial page load JS before interaction",
      "app first interaction from DOMContentLoaded",
      "app first interaction after networkidle",
      "app second interaction latency",
      "app server cold start",
      "app SSR HTML gzip bytes 1000 nodes",
      "app client bundle gzip bytes (server-only page)",
      "app client bundle gzip bytes before interaction (interactive page)",
      "app client bundle gzip bytes after idle settle (interactive page)",
      "app client bundle gzip bytes (interactive page)",
      "app client bundle gzip bytes (interactive page, minimal opt-out)",
      "app client bundle gzip bytes (interactive page, 3 shared routes)",
      "app build output gzip bytes",
    ]);
  });

  it("exposes first interaction browser probes for every interactive router adapter", () => {
    const adaptersWithFirstInteractionProbes = routerBenchmarkAdapters
      .filter((adapter) => adapter.measureFirstInteractionAfterNetworkIdleMs !== undefined)
      .map((adapter) => adapter.name);

    expect(adaptersWithFirstInteractionProbes).toEqual([
      "marko-run",
      "nuxt",
      "svelte-kit",
      "analog",
      "qwik-city",
      "qwik-router-v2",
      "solid-start",
      "tanstack-start",
      "next-app-router",
      "mreact-app-router",
      "mreact-app-router+mreact react-compat",
      "mreact-app-router+log enabled",
    ]);
  });

  it("exposes split browser interaction probes for every interactive router adapter", () => {
    const adaptersWithSplitProbes = routerBenchmarkAdapters
      .filter(
        (adapter) =>
          adapter.measureInitialPageLoadBeforeInteractionMs !== undefined &&
          adapter.measureFirstInteractionFromDomContentLoadedMs !== undefined &&
          adapter.measureFirstInteractionAfterNetworkIdleMs !== undefined &&
          adapter.measureSecondInteractionLatencyMs !== undefined,
      )
      .map((adapter) => adapter.name);

    expect(adaptersWithSplitProbes).toEqual([
      "marko-run",
      "nuxt",
      "svelte-kit",
      "analog",
      "qwik-city",
      "qwik-router-v2",
      "solid-start",
      "tanstack-start",
      "next-app-router",
      "mreact-app-router",
      "mreact-app-router+mreact react-compat",
      "mreact-app-router+log enabled",
    ]);
  });

  it("exposes route-to-route client navigation probes for SPA-capable router adapters", () => {
    const adaptersWithNavigationProbes = routerBenchmarkAdapters
      .filter((adapter) => adapter.measureClientNavigationMs !== undefined)
      .map((adapter) => adapter.name);

    expect(adaptersWithNavigationProbes).toEqual([
      "nuxt",
      "svelte-kit",
      "analog",
      "qwik-city",
      "qwik-router-v2",
      "solid-start",
      "tanstack-start",
      "next-app-router",
      "mreact-app-router",
      "mreact-app-router+mreact react-compat",
      "mreact-app-router+log enabled",
    ]);
  });

  it("exposes server cold-start probes for mreact app-router variants", () => {
    const adaptersWithColdStartProbes = routerBenchmarkAdapters
      .filter((adapter) => adapter.measureServerColdStartMs !== undefined)
      .map((adapter) => adapter.name);

    expect(adaptersWithColdStartProbes).toEqual([
      "mreact-app-router",
      "mreact-app-router+mreact react-compat",
      "mreact-app-router+log enabled",
    ]);
  });

  it("exposes extended router probes for mreact app-router variants", () => {
    const requiredMethods = [
      "measureConcurrentRequestThroughputOps",
      "measureConcurrentRequestP99Ms",
      "measureConcurrentRequestRssDeltaBytes",
      "measureHydration100IslandsMs",
      "measureDevColdStartMs",
      "measureDevFirstRequestLatencyMs",
      "measureDevHmrUpdateLatencyMs",
      "measureSsrHtmlGzipBytes",
      "measureRouteScale1000MatchLatencyMs",
      "measureRouteScale1000ColdStartMs",
      "measureRouteScale1000BuildTimeMs",
      "measureRouteScale1000RssDeltaBytes",
      "measureServerActionPostRoundtripMs",
      "measureNestedLayoutsDepth5Ms",
      "measureLoaderClientNavigationMs",
      "measureBackForwardRestoreMs",
      "measureCloudflareWorkerLatencyMs",
    ] as const;
    const mreactAdapters = routerBenchmarkAdapters.filter((adapter) =>
      adapter.name.startsWith("mreact-app-router"),
    );

    for (const method of requiredMethods) {
      expect(
        mreactAdapters
          .filter((adapter) => adapter[method] !== undefined)
          .map((adapter) => adapter.name),
      ).toEqual([
        "mreact-app-router",
        "mreact-app-router+mreact react-compat",
        "mreact-app-router+log enabled",
      ]);
    }
  });

  it("exposes low-cost extended probes for production router adapters", () => {
    const expectedAdapters = [
      "marko-run",
      "nuxt",
      "svelte-kit",
      "analog",
      "qwik-city",
      "qwik-router-v2",
      "solid-start",
      "tanstack-start",
      "tanstack-start-solid",
      "next-app-router",
      "mreact-app-router",
      "mreact-app-router+mreact react-compat",
      "mreact-app-router+log enabled",
    ];
    const requiredMethods = [
      "measureConcurrentRequestThroughputOps",
      "measureConcurrentRequestP99Ms",
      "measureSsrHtmlGzipBytes",
    ] as const;

    for (const method of requiredMethods) {
      expect(
        routerBenchmarkAdapters
          .filter((adapter) => adapter[method] !== undefined)
          .map((adapter) => adapter.name),
      ).toEqual(expectedAdapters);
    }

    expect(
      routerBenchmarkAdapters
        .filter((adapter) => adapter.measureConcurrentRequestRssDeltaBytes !== undefined)
        .map((adapter) => adapter.name),
    ).toEqual([
      "marko-run",
      "nuxt",
      "analog",
      "qwik-city",
      "qwik-router-v2",
      "solid-start",
      "tanstack-start",
      "tanstack-start-solid",
      "mreact-app-router",
      "mreact-app-router+mreact react-compat",
      "mreact-app-router+log enabled",
    ]);
  });

  it("exposes browser navigation restoration probes for SPA-capable router adapters", () => {
    const expectedAdapters = [
      "nuxt",
      "svelte-kit",
      "analog",
      "qwik-city",
      "qwik-router-v2",
      "solid-start",
      "tanstack-start",
      "next-app-router",
      "mreact-app-router",
      "mreact-app-router+mreact react-compat",
      "mreact-app-router+log enabled",
    ];

    expect(
      routerBenchmarkAdapters
        .filter((adapter) => adapter.measureBackForwardRestoreMs !== undefined)
        .map((adapter) => adapter.name),
    ).toEqual(expectedAdapters);
  });

  it("exposes adapter-owned dynamic route probes for mreact app-router variants", () => {
    // Regression: the generic dynamic-route probe reads the module-level server shared
    // by all mreact variants, so without an adapter-owned probe the case measures
    // whichever variant fixture happened to be running last.
    const adaptersWithDynamicRouteProbes = routerBenchmarkAdapters
      .filter((adapter) => adapter.renderDynamicRoute !== undefined)
      .map((adapter) => adapter.name);

    expect(adaptersWithDynamicRouteProbes).toEqual(
      expect.arrayContaining([
        "mreact-app-router",
        "mreact-app-router+mreact react-compat",
        "mreact-app-router+log enabled",
      ]),
    );
  });

  it("exposes loader client navigation probes for adapters with loader/data routes", () => {
    const expectedAdapters = [
      "qwik-city",
      "qwik-router-v2",
      "solid-start",
      "tanstack-start",
      "next-app-router",
      "mreact-app-router",
      "mreact-app-router+mreact react-compat",
      "mreact-app-router+log enabled",
    ];

    expect(
      routerBenchmarkAdapters
        .filter((adapter) => adapter.measureLoaderClientNavigationMs !== undefined)
        .map((adapter) => adapter.name),
    ).toEqual(expectedAdapters);
  });

  it("exposes build output gzip probes for every router adapter", () => {
    const adaptersWithBuildOutputProbes = routerBenchmarkAdapters
      .filter((adapter) => adapter.measureBuildOutputGzipBytes !== undefined)
      .map((adapter) => adapter.name);

    expect(adaptersWithBuildOutputProbes).toEqual(
      routerBenchmarkAdapters.map((adapter) => adapter.name),
    );
  });

  it("exposes client bundle probes for production app framework adapters", () => {
    const productionAppAdapterNames = ["nuxt", "svelte-kit", "analog"];
    const requiredMethods = [
      "measureServerOnlyClientBundleBytes",
      "measureInteractiveClientBundleBeforeInteractionBytes",
      "measureInteractiveClientBundleAfterIdleBytes",
      "measureInteractiveClientBundleBytes",
      "measureInteractiveClientBundleMinimalBytes",
    ] as const;
    const productionAppAdapters = routerBenchmarkAdapters.filter((adapter) =>
      productionAppAdapterNames.includes(adapter.name),
    );

    for (const method of requiredMethods) {
      expect(
        productionAppAdapters
          .filter((adapter) => adapter[method] !== undefined)
          .map((adapter) => adapter.name),
      ).toEqual(productionAppAdapterNames);
    }
  });

  it("exposes split interactive bundle probes for adapters that use browser bundle probes", () => {
    const expectedAdapters = [
      "marko-run",
      "nuxt",
      "svelte-kit",
      "analog",
      "qwik-city",
      "qwik-router-v2",
      "solid-start",
      "tanstack-start",
      "tanstack-start-solid",
      "next-app-router",
      "mreact-app-router",
      "mreact-app-router+mreact react-compat",
      "mreact-app-router+log enabled",
    ];

    for (const method of [
      "measureInteractiveClientBundleBeforeInteractionBytes",
      "measureInteractiveClientBundleAfterIdleBytes",
    ] as const) {
      expect(
        routerBenchmarkAdapters
          .filter((adapter) => adapter[method] !== undefined)
          .map((adapter) => adapter.name),
      ).toEqual(expectedAdapters);
    }
  });

  it("uses production app fixtures for Nuxt, SvelteKit, and Analog adapters", () => {
    const fixtureKinds = Object.fromEntries(
      routerBenchmarkAdapters
        .filter((adapter) => ["nuxt", "svelte-kit", "analog"].includes(adapter.name))
        .map((adapter) => [adapter.name, (adapter as { fixtureKind?: string }).fixtureKind]),
    );

    expect(fixtureKinds).toEqual({
      nuxt: "production-app",
      "svelte-kit": "production-app",
      analog: "production-app",
    });
  });

  it("ranks throughput high-to-low and size low-to-high", () => {
    const rows: RouterBenchmarkRow[] = [
      completedRow("next-app-router", "app render 1000 nodes", "throughput", "ops/sec", 10),
      completedRow("mreact-app-router", "app render 1000 nodes", "throughput", "ops/sec", 20),
      completedRow(
        "qwik-city",
        "app client bundle gzip bytes (server-only page)",
        "size",
        "gzip bytes",
        100,
      ),
      completedRow(
        "marko-run",
        "app client bundle gzip bytes (server-only page)",
        "size",
        "gzip bytes",
        40,
      ),
    ];

    expect(rankCompletedRows(rows, "app render 1000 nodes").map((row) => row.framework)).toEqual([
      "mreact-app-router",
      "next-app-router",
    ]);
    expect(
      rankCompletedRows(rows, "app client bundle gzip bytes (server-only page)").map(
        (row) => row.framework,
      ),
    ).toEqual(["marko-run", "qwik-city"]);
  });

  it("ranks duration low-to-high", () => {
    const rows: RouterBenchmarkRow[] = [
      completedRow("next-app-router", "app streaming first byte 1000 nodes", "duration", "ms", 12),
      completedRow("mreact-app-router", "app streaming first byte 1000 nodes", "duration", "ms", 8),
    ];

    expect(
      rankCompletedRows(rows, "app streaming first byte 1000 nodes").map((row) => row.framework),
    ).toEqual(["mreact-app-router", "next-app-router"]);
  });

  it("excludes contaminated concurrent RSS delta rows from ranking", () => {
    const rows: RouterBenchmarkRow[] = [
      {
        ...completedRow(
          "analog",
          "app concurrent RSS delta 100 connections",
          "memory",
          "bytes",
          -163840,
        ),
        samplesMs: [-7122944, 14364672, -1318912, 5332992, -163840],
      },
      completedRow(
        "mreact-app-router",
        "app concurrent RSS delta 100 connections",
        "memory",
        "bytes",
        29249536,
      ),
    ];

    expect(
      rankCompletedRows(rows, "app concurrent RSS delta 100 connections").map(
        (row) => row.framework,
      ),
    ).toEqual(["mreact-app-router"]);
  });

  it("ranks fixed-latency streaming cases by duration without throughput rounding", () => {
    const rows: RouterBenchmarkRow[] = [
      {
        ...completedRow(
          "marko-run",
          "app real streaming 1000 nodes (async 50ms)",
          "duration",
          "ms",
          51.1,
        ),
        meanMs: 51.1,
      },
      {
        ...completedRow(
          "mreact-app-router",
          "app real streaming 1000 nodes (async 50ms)",
          "duration",
          "ms",
          51,
        ),
        meanMs: 51,
      },
    ];

    expect(
      rankCompletedRows(rows, "app real streaming 1000 nodes (async 50ms)").map(
        (row) => row.framework,
      ),
    ).toEqual(["mreact-app-router", "marko-run"]);
  });

  it("reports fixed-latency streaming benchmark rows as duration samples", async () => {
    const rows = await runRouterBenchmarks(
      [
        {
          name: "mreact-app-router",
          version: "test",
          async renderToString(nodeCount) {
            return `<span>${nodeCount - 1}</span>`;
          },
          async renderToRealStream(nodeCount) {
            await Promise.resolve();
            return `<span>${nodeCount - 1}</span>`;
          },
          async renderWaterfall() {
            await Promise.resolve();
            return "<span>left</span><span>right</span>";
          },
        },
      ],
      { benchTimeMs: 1, warmupTimeMs: 1 },
    );

    expect(
      rows.find((row) => row.caseName === "app real streaming 1000 nodes (async 50ms)"),
    ).toMatchObject({
      status: "completed",
      metric: "duration",
      unit: "ms",
      hz: 0,
    });
    expect(
      rows.find((row) => row.caseName === "app parallel async boundaries 2x50ms"),
    ).toMatchObject({
      status: "completed",
      metric: "duration",
      unit: "ms",
      hz: 0,
    });
  });

  it("reports unsupported timed cases without running them through tinybench", async () => {
    const rows = await runRouterBenchmarks(
      [
        {
          name: "mreact-app-router",
          version: "test",
          async renderToString(nodeCount) {
            return `<span>${nodeCount - 1}</span>`;
          },
        },
      ],
      { benchTimeMs: 1, warmupTimeMs: 1 },
    );

    expect(rows.find((row) => row.caseName === "app streaming 1000 nodes")).toMatchObject({
      status: "unsupported",
      value: 0,
    });
    expect(rows.find((row) => row.caseName === "app static cached route 1000 nodes")).toMatchObject(
      {
        status: "unsupported",
        value: 0,
      },
    );
  });

  it("reports streaming timing probes as unsupported without a real async stream route", async () => {
    const rows = await runRouterBenchmarks(
      [
        {
          name: "analog",
          version: "test",
          async renderToString(nodeCount) {
            return `<span>${nodeCount - 1}</span>`;
          },
          getServerUrl() {
            return "http://127.0.0.1:1";
          },
        },
      ],
      { benchTimeMs: 1, warmupTimeMs: 1 },
    );

    expect(
      rows.find((row) => row.caseName === "app streaming first byte 1000 nodes"),
    ).toMatchObject({
      status: "unsupported",
      value: 0,
    });
    expect(
      rows.find((row) => row.caseName === "app streaming first chunk 1000 nodes"),
    ).toMatchObject({
      status: "unsupported",
      value: 0,
    });
    expect(rows.find((row) => row.caseName === "app streaming full body 1000 nodes")).toMatchObject(
      {
        status: "unsupported",
        value: 0,
      },
    );
  });

  it("retains raw latency samples for timed benchmark rows", async () => {
    const rows = await runRouterBenchmarks(
      [
        {
          name: "mreact-app-router",
          version: "test",
          async renderToString(nodeCount) {
            return `<span>${nodeCount - 1}</span>`;
          },
        },
      ],
      { benchTimeMs: 1, warmupTimeMs: 1 },
    );

    const renderRow = rows.find((row) => row.caseName === "app render 1000 nodes");

    expect(renderRow?.status).toBe("completed");
    expect(renderRow?.samplesMs?.length).toBeGreaterThan(0);
  });

  it("collects duration probes round-robin across adapters", async () => {
    const calls: string[] = [];
    const createAdapter = (name: "mreact-app-router" | "next-app-router") => ({
      name,
      version: "test",
      async renderToString(nodeCount: number) {
        return `<span>${nodeCount - 1}</span>`;
      },
      async measureFirstInteractionAfterNetworkIdleMs() {
        calls.push(name);
        return name === "mreact-app-router" ? 10 : 20;
      },
    });

    const rows = await runRouterBenchmarks(
      [createAdapter("mreact-app-router"), createAdapter("next-app-router")],
      { benchTimeMs: 1, warmupTimeMs: 1 },
    );

    expect(calls.slice(0, 6)).toEqual([
      "mreact-app-router",
      "next-app-router",
      "mreact-app-router",
      "next-app-router",
      "mreact-app-router",
      "next-app-router",
    ]);
    expect(
      rows.find(
        (row) =>
          row.framework === "mreact-app-router" &&
          row.caseName === "app first interaction after networkidle",
      ),
    ).toMatchObject({
      status: "completed",
      value: 10,
      samplesMs: [10, 10, 10, 10, 10, 10, 10],
    });
  });

  it("warms up and samples value probes before reporting the median", async () => {
    const values = [999, 5, 1, 9, 3, 7];
    const rows = await runRouterBenchmarks(
      [
        {
          name: "mreact-app-router",
          version: "test",
          async renderToString(nodeCount: number) {
            return `<span>${nodeCount - 1}</span>`;
          },
          async measureNestedLayoutsDepth5Ms() {
            return values.shift() ?? 0;
          },
        },
      ],
      { benchTimeMs: 1, warmupTimeMs: 1 },
    );

    expect(rows.find((row) => row.caseName === "app nested layouts depth 5")).toMatchObject({
      status: "completed",
      value: 5,
      meanMs: 5,
      samplesMs: [5, 1, 9, 3, 7],
    });
  });

  it("reports route-scale value probes as honest single-sample rows", async () => {
    const values = [999, 5];
    const rows = await runRouterBenchmarks(
      [
        {
          name: "mreact-app-router",
          version: "test",
          async renderToString(nodeCount: number) {
            return `<span>${nodeCount - 1}</span>`;
          },
          async measureRouteScale1000BuildTimeMs() {
            return values.shift() ?? 0;
          },
        },
      ],
      { benchTimeMs: 1, warmupTimeMs: 1 },
    );

    expect(rows.find((row) => row.caseName === "app 1000 route build time")).toMatchObject({
      status: "completed",
      value: 5,
      meanMs: 5,
      samplesMs: [5],
    });
  });

  it("surfaces negative memory samples in value probe notes", async () => {
    const values = [0, -10, 20, -30, 40, -50];
    const rows = await runRouterBenchmarks(
      [
        {
          name: "mreact-app-router",
          version: "test",
          async renderToString(nodeCount: number) {
            return `<span>${nodeCount - 1}</span>`;
          },
          async measureConcurrentRequestRssDeltaBytes() {
            return values.shift() ?? 0;
          },
        },
      ],
      { benchTimeMs: 1, warmupTimeMs: 1 },
    );

    expect(
      rows.find((row) => row.caseName === "app concurrent RSS delta 100 connections"),
    ).toMatchObject({
      note: "3/5 samples negative",
      samplesMs: [-10, 20, -30, 40, -50],
    });
  });
});

function completedRow(
  framework: RouterBenchmarkRow["framework"],
  caseName: RouterBenchmarkRow["caseName"],
  metric: RouterBenchmarkRow["metric"],
  unit: RouterBenchmarkRow["unit"],
  value: number,
): RouterBenchmarkRow {
  return {
    caseName,
    framework,
    metric,
    status: "completed",
    unit,
    value,
    version: "test",
  };
}
