export type AppFrameworkName =
  | "mreact-app-router"
  | "mreact-app-router+mreact react-compat"
  | "mreact-app-router+log enabled"
  | "vue"
  | "nuxt"
  | "svelte"
  | "svelte-kit"
  | "angular"
  | "analog"
  | "next-app-router"
  | "solid-start"
  | "tanstack-start"
  | "tanstack-start-solid"
  | "marko-run"
  | "qwik-city"
  | "qwik-router-v2";

export type AppFrameworkCaseName =
  | "app render 1000 nodes"
  | "app streaming 1000 nodes"
  | "app streaming first byte 1000 nodes"
  | "app streaming first chunk 1000 nodes"
  | "app streaming full body 1000 nodes"
  | "app real streaming 1000 nodes (async 50ms)"
  | "app parallel async boundaries 2x50ms"
  | "app static cached route 1000 nodes"
  | "app dynamic-attr grid 200 cells"
  | "app dynamic route params data"
  | "app concurrent throughput 100 connections"
  | "app concurrent p99 latency 100 connections"
  | "app concurrent RSS delta 100 connections"
  | "app hydration 100 islands"
  | "app dev cold start"
  | "app dev first request latency"
  | "app dev HMR update latency"
  | "app SSR HTML gzip bytes 1000 nodes"
  | "app 1000 route match latency"
  | "app 1000 route cold start"
  | "app 1000 route build time"
  | "app 1000 route RSS delta"
  | "app server action form POST roundtrip"
  | "app nested layouts depth 5"
  | "app loader client navigation route-to-route"
  | "app client navigation back-forward restore"
  | "app Cloudflare Worker request latency"
  | "app client navigation route-to-route"
  | "app initial page load JS before interaction"
  | "app first interaction from DOMContentLoaded"
  | "app first interaction after networkidle"
  | "app second interaction latency"
  | "app server cold start"
  | "app client bundle gzip bytes (server-only page)"
  | "app client bundle gzip bytes (interactive page)"
  | "app client bundle gzip bytes (interactive page, minimal opt-out)"
  | "app build output gzip bytes";

export interface AppFrameworkAdapter {
  name: AppFrameworkName;
  version: string;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  renderToString?: (nodeCount: number) => Promise<string>;
  renderToStream?: (nodeCount: number) => Promise<string>;
  // Genuine streaming: page has an async boundary that resolves after 50ms.
  // Both server-side shell pre-flush and body delivery are required to
  // complete the response. The runner records this fixed-latency case as
  // duration so integer throughput rounding cannot fabricate gaps.
  renderToRealStream?: (nodeCount: number) => Promise<string>;
  // dynamic-attribute heavy fixture: cellCount elements, each with ~9
  // dynamic attributes (class / data-* / title / aria-label / style with
  // 2 CSS values) + text content. Some attribute values include `<` `>`
  // `&` `"` forcing HTML escape paths. Exercises framework's
  // attribute-escape hot path (mreact compiler の batch escape lowering
  // 等が効きやすい case).
  renderDynamicAttrGrid?: (cellCount: number) => Promise<string>;
  // Client JS bytes for a server-only page (no `"use client"` /
  // `cell` / `onClick`). For mreact this should be 0 (no client bundle is
  // emitted). For Next.js this is the framework chunks floor that is shipped
  // regardless of user code.
  measureServerOnlyClientBundleBytes?: () => Promise<number>;
  // Client JS bytes for a minimal interactive page (button + state). For
  // mreact this is the framework runtime + Client Component, bundled. For
  // Next.js this is currently not implementable without hitting a Next 16.2
  // internal prerender bug, so the adapter falls back to the framework floor
  // (≒ server-only number).
  measureInteractiveClientBundleBytes?: () => Promise<number>;
  // Hits the framework's "two independent async boundaries" fixture. Two
  // 50 ms async resolves rendered as siblings. A framework that resolves
  // them in parallel finishes in ~50 ms TTLB; one that resolves
  // sequentially (= unintended waterfall) takes ~100 ms. Returns the full
  // HTML so probe code can verify both branches finished.
  renderWaterfall?: () => Promise<string>;
  renderStaticCachedRoute?: (nodeCount: number) => Promise<string>;
  renderDynamicRoute?: () => Promise<string>;
  measureClientNavigationMs?: () => Promise<number>;
  measureInitialPageLoadBeforeInteractionMs?: () => Promise<number>;
  measureFirstInteractionFromDomContentLoadedMs?: () => Promise<number>;
  measureFirstInteractionAfterNetworkIdleMs?: () => Promise<number>;
  measureSecondInteractionLatencyMs?: () => Promise<number>;
  measureServerColdStartMs?: () => Promise<number>;
  measureBuildOutputGzipBytes?: () => Promise<number>;
  measureConcurrentRequestThroughputOps?: () => Promise<number>;
  measureConcurrentRequestP99Ms?: () => Promise<number>;
  measureConcurrentRequestRssDeltaBytes?: () => Promise<number>;
  measureHydration100IslandsMs?: () => Promise<number>;
  measureDevColdStartMs?: () => Promise<number>;
  measureDevFirstRequestLatencyMs?: () => Promise<number>;
  measureDevHmrUpdateLatencyMs?: () => Promise<number>;
  measureSsrHtmlGzipBytes?: () => Promise<number>;
  measureRouteScale1000MatchLatencyMs?: () => Promise<number>;
  measureRouteScale1000ColdStartMs?: () => Promise<number>;
  measureRouteScale1000BuildTimeMs?: () => Promise<number>;
  measureRouteScale1000RssDeltaBytes?: () => Promise<number>;
  measureServerActionPostRoundtripMs?: () => Promise<number>;
  measureNestedLayoutsDepth5Ms?: () => Promise<number>;
  measureLoaderClientNavigationMs?: () => Promise<number>;
  measureBackForwardRestoreMs?: () => Promise<number>;
  measureCloudflareWorkerLatencyMs?: () => Promise<number>;
  // Same interactive fixture but opting out of the SPA navigation runtime
  // (mreact: `export const clientNavigation = false`, Marko: native — has no
  // navigation runtime to begin with). For frameworks without such an
  // opt-out the value falls back to `measureInteractiveClientBundleBytes`
  // (i.e. the case is meaningless and we report the same number).
  measureInteractiveClientBundleMinimalBytes?: () => Promise<number>;
  // Returns the base URL of the currently-running fixture server (after
  // `renderToString` / `renderToStream` warm-up has started it). Used by
  // browser-based probes (TTI, navigation timing) that need to drive a real
  // browser against the running server. Returns null if no server has been
  // started yet.
  getServerUrl?: () => string | null;
}

export type AppFrameworkMetric = "throughput" | "size" | "duration" | "memory";
export type AppFrameworkUnit = "ops/sec" | "gzip bytes" | "ms" | "bytes";

export interface AppFrameworkRow {
  framework: AppFrameworkName;
  version: string;
  caseName: AppFrameworkCaseName;
  status: "completed" | "failed" | "unsupported";
  metric: AppFrameworkMetric;
  unit: AppFrameworkUnit;
  value: number;
  hz: number;
  meanMs: number;
  p75Ms: number;
  p99Ms: number;
  samplesMs?: number[];
  gzipBytes?: number;
  note?: string;
}

export type RouterBenchmarkName = AppFrameworkName;
export type RouterBenchmarkCaseName = AppFrameworkCaseName;
export type RouterBenchmarkAdapter = AppFrameworkAdapter;
export type RouterBenchmarkMetric = AppFrameworkMetric;
export type RouterBenchmarkUnit = AppFrameworkUnit;
export type RouterBenchmarkRow = AppFrameworkRow;
