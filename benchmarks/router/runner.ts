import { Bench } from "tinybench";
import type {
  RouterBenchmarkAdapter,
  RouterBenchmarkCaseName,
  RouterBenchmarkMetric,
  RouterBenchmarkRow,
  RouterBenchmarkUnit,
} from "./types.js";

const nodeCount = 1_000;
const dynamicAttrCellCount = 200;
const valueBenchmarkSampleCount = 5;

export interface RouterBenchmarkCase {
  description: string;
  metric: RouterBenchmarkMetric;
  name: RouterBenchmarkCaseName;
  unit: RouterBenchmarkUnit;
}

interface TimedRouterBenchmarkCase extends RouterBenchmarkCase {
  metric: "throughput";
  unit: "ops/sec";
  isSupported(adapter: RouterBenchmarkAdapter): boolean;
  invoke(adapter: RouterBenchmarkAdapter): Promise<unknown>;
}

interface SizeRouterBenchmarkCase extends RouterBenchmarkCase {
  metric: "size";
  unit: "gzip bytes";
  invoke(adapter: RouterBenchmarkAdapter): Promise<number> | undefined;
}

interface ValueRouterBenchmarkCase extends RouterBenchmarkCase {
  metric: "duration" | "memory" | "throughput";
  measuredSamples?: number;
  unit: "bytes" | "ms" | "ops/sec";
  invoke(adapter: RouterBenchmarkAdapter): Promise<number> | undefined;
}

interface DurationRouterBenchmarkCase extends RouterBenchmarkCase {
  metric: "duration";
  unit: "ms";
  invoke(adapter: RouterBenchmarkAdapter): Promise<number> | undefined;
}

const timedRouterBenchmarkCases: TimedRouterBenchmarkCase[] = [
  {
    name: "app render 1000 nodes",
    description: "Renders a production app route that emits 1,000 simple text spans.",
    metric: "throughput",
    unit: "ops/sec",
    isSupported: (adapter) => adapter.renderToString !== undefined,
    invoke: (adapter) =>
      adapter.renderToString?.(nodeCount) ?? unsupported(adapter, "renderToString"),
  },
  {
    name: "app streaming 1000 nodes",
    description:
      "Streams a production app route with 1,000 simple text spans and validates the complete response body.",
    metric: "throughput",
    unit: "ops/sec",
    isSupported: (adapter) => adapter.renderToStream !== undefined,
    invoke: (adapter) =>
      adapter.renderToStream?.(nodeCount) ?? unsupported(adapter, "renderToStream"),
  },
  {
    name: "app dynamic route params data",
    description:
      "Renders a dynamic route that combines route parameters with server data before producing HTML.",
    metric: "throughput",
    unit: "ops/sec",
    isSupported: (adapter) =>
      adapter.renderDynamicRoute !== undefined || adapter.getServerUrl !== undefined,
    invoke: (adapter) => adapter.renderDynamicRoute?.() ?? renderGenericDynamicRoute(adapter),
  },
  {
    name: "app static cached route 1000 nodes",
    description:
      "Renders a static-cacheable app route with 1,000 simple text spans after the production server has warmed it.",
    metric: "throughput",
    unit: "ops/sec",
    isSupported: (adapter) => adapter.renderStaticCachedRoute !== undefined,
    invoke: (adapter) =>
      adapter.renderStaticCachedRoute?.(nodeCount) ??
      unsupported(adapter, "renderStaticCachedRoute"),
  },
  {
    name: "app dynamic-attr grid 200 cells",
    description:
      "Renders 200 cells with many dynamic escaped attributes, inline style values, and text content.",
    metric: "throughput",
    unit: "ops/sec",
    isSupported: (adapter) => adapter.renderDynamicAttrGrid !== undefined,
    invoke: (adapter) =>
      adapter.renderDynamicAttrGrid?.(dynamicAttrCellCount) ??
      unsupported(adapter, "renderDynamicAttrGrid"),
  },
];

const valueRouterBenchmarkCases: ValueRouterBenchmarkCase[] = [
  {
    name: "app concurrent throughput 100 connections",
    description:
      "Runs a fixed burst against the production fixture with up to 100 concurrent requests and reports sustained request throughput.",
    metric: "throughput",
    unit: "ops/sec",
    invoke: (adapter) => adapter.measureConcurrentRequestThroughputOps?.(),
  },
  {
    name: "app concurrent p99 latency 100 connections",
    description:
      "Runs the same concurrent request burst and reports per-request p99 latency, exposing event-loop stalls hidden by sequential tinybench runs.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureConcurrentRequestP99Ms?.(),
  },
  {
    name: "app concurrent RSS delta 100 connections",
    description:
      "Reports RSS growth across the concurrent request burst so sustained-load memory trends are visible in router benchmark output.",
    metric: "memory",
    unit: "bytes",
    invoke: (adapter) => adapter.measureConcurrentRequestRssDeltaBytes?.(),
  },
  {
    name: "app hydration 100 islands",
    description:
      "Loads an app route with 100 independently interactive islands and reports time until all islands can update in real Chromium.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureHydration100IslandsMs?.(),
  },
  {
    name: "app dev cold start",
    description:
      "Starts the framework dev server for a minimal app and reports server readiness latency.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureDevColdStartMs?.(),
  },
  {
    name: "app dev first request latency",
    description:
      "Requests a minimal app route from a warm dev server and reports first request latency.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureDevFirstRequestLatencyMs?.(),
  },
  {
    name: "app dev HMR update latency",
    description:
      "Edits a route module while the dev server is running and reports time until the changed response is observable.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureDevHmrUpdateLatencyMs?.(),
  },
  {
    name: "app 1000 route match latency",
    description:
      "Builds a 1,000-route app and reports request latency for a route near the end of the route table.",
    metric: "duration",
    measuredSamples: 1,
    unit: "ms",
    invoke: (adapter) => adapter.measureRouteScale1000MatchLatencyMs?.(),
  },
  {
    name: "app 1000 route cold start",
    description:
      "Builds a 1,000-route app and reports production server cold-start latency for that route scale.",
    metric: "duration",
    measuredSamples: 1,
    unit: "ms",
    invoke: (adapter) => adapter.measureRouteScale1000ColdStartMs?.(),
  },
  {
    name: "app 1000 route build time",
    description:
      "Reports production build time for a 1,000-route app to catch route-count scaling regressions.",
    metric: "duration",
    measuredSamples: 1,
    unit: "ms",
    invoke: (adapter) => adapter.measureRouteScale1000BuildTimeMs?.(),
  },
  {
    name: "app 1000 route RSS delta",
    description:
      "Reports process RSS growth while building and serving a 1,000-route app.",
    metric: "memory",
    measuredSamples: 1,
    unit: "bytes",
    invoke: (adapter) => adapter.measureRouteScale1000RssDeltaBytes?.(),
  },
  {
    name: "app server action form POST roundtrip",
    description:
      "Renders a form with an inferred server action, submits the encoded form POST, and reports action roundtrip latency.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureServerActionPostRoundtripMs?.(),
  },
  {
    name: "app nested layouts depth 5",
    description:
      "Renders a route under five nested layouts, guarding against sequential layout shell regressions.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureNestedLayoutsDepth5Ms?.(),
  },
  {
    name: "app loader client navigation route-to-route",
    description:
      "Measures browser client navigation to a route with loader data, covering data-bearing SPA transitions.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureLoaderClientNavigationMs?.(),
  },
  {
    name: "app client navigation back-forward restore",
    description:
      "Measures browser back-forward restoration after SPA navigation so history snapshot regressions are visible.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureBackForwardRestoreMs?.(),
  },
  {
    name: "app Cloudflare Worker request latency",
    description:
      "Builds the Cloudflare Pages worker bundle and reports request latency through its exported fetch handler. A workerd/Miniflare harness should replace this fallback once the local workerd path-resolution failure is fixed.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureCloudflareWorkerLatencyMs?.(),
  },
];

const durationRouterBenchmarkCases: DurationRouterBenchmarkCase[] = [
  {
    name: "app streaming first byte 1000 nodes",
    description:
      "Measures elapsed time until fetch resolves response headers for the real streaming route.",
    metric: "duration",
    unit: "ms",
    invoke: async (adapter) =>
      adapter.renderToRealStream === undefined
        ? undefined
        : (await measureStreamingTimings(adapter)).firstByteMs,
  },
  {
    name: "app streaming first chunk 1000 nodes",
    description:
      "Measures elapsed time until the first response body chunk arrives for the real streaming route.",
    metric: "duration",
    unit: "ms",
    invoke: async (adapter) =>
      adapter.renderToRealStream === undefined
        ? undefined
        : (await measureStreamingTimings(adapter)).firstChunkMs,
  },
  {
    name: "app streaming full body 1000 nodes",
    description:
      "Measures elapsed time until the complete real streaming response body is consumed and validated.",
    metric: "duration",
    unit: "ms",
    invoke: async (adapter) =>
      adapter.renderToRealStream === undefined
        ? undefined
        : (await measureStreamingTimings(adapter)).fullBodyMs,
  },
  {
    name: "app real streaming 1000 nodes (async 50ms)",
    description:
      "Measures complete response latency for a route whose body waits on a 50 ms async boundary.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) =>
      adapter.renderToRealStream === undefined
        ? undefined
        : measureInvocationDurationMs(() => adapter.renderToRealStream!(nodeCount)),
  },
  {
    name: "app parallel async boundaries 2x50ms",
    description:
      "Measures complete response latency for two sibling 50 ms async boundaries; parallel renderers stay near one boundary.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) =>
      adapter.renderWaterfall === undefined
        ? undefined
        : measureInvocationDurationMs(() => adapter.renderWaterfall!()),
  },
  {
    name: "app client navigation route-to-route",
    description:
      "Measures route-to-route client navigation latency in a real browser when the adapter provides a browser probe.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureClientNavigationMs?.(),
  },
  {
    name: "app initial page load JS before interaction",
    description:
      "Measures page load time until the interactive route is visible and idle before any user interaction.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureInitialPageLoadBeforeInteractionMs?.(),
  },
  {
    name: "app first interaction from DOMContentLoaded",
    description:
      "Measures the first click-to-visible-update latency immediately after DOMContentLoaded without waiting for network idle.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureFirstInteractionFromDomContentLoadedMs?.(),
  },
  {
    name: "app first interaction after networkidle",
    description:
      "Measures the first click-to-visible-update latency after the interactive route has reached network idle.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureFirstInteractionAfterNetworkIdleMs?.(),
  },
  {
    name: "app second interaction latency",
    description:
      "Measures the second click-to-visible-update latency after the route has already handled one client interaction.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureSecondInteractionLatencyMs?.(),
  },
  {
    name: "app server cold start",
    description:
      "Measures production server cold-start latency when the adapter can isolate startup from build work.",
    metric: "duration",
    unit: "ms",
    invoke: (adapter) => adapter.measureServerColdStartMs?.(),
  },
];

const sizeRouterBenchmarkCases: SizeRouterBenchmarkCase[] = [
  {
    name: "app SSR HTML gzip bytes 1000 nodes",
    description:
      "Measures gzip-compressed HTML payload bytes for the 1,000-node SSR route, complementing client bundle size cases.",
    metric: "size",
    unit: "gzip bytes",
    invoke: (adapter) => adapter.measureSsrHtmlGzipBytes?.(),
  },
  {
    name: "app client bundle gzip bytes (server-only page)",
    description:
      "Measures gzip-compressed client JavaScript shipped for a route with no user-authored interactivity.",
    metric: "size",
    unit: "gzip bytes",
    invoke: (adapter) => adapter.measureServerOnlyClientBundleBytes?.(),
  },
  {
    name: "app client bundle gzip bytes (interactive page)",
    description:
      "Measures gzip-compressed client JavaScript shipped for a minimal button-and-state interactive route.",
    metric: "size",
    unit: "gzip bytes",
    invoke: (adapter) => adapter.measureInteractiveClientBundleBytes?.(),
  },
  {
    name: "app client bundle gzip bytes (interactive page, minimal opt-out)",
    description:
      "Measures the same interactive route while opting out of optional client navigation runtime where the framework supports it.",
    metric: "size",
    unit: "gzip bytes",
    invoke: (adapter) =>
      adapter.measureInteractiveClientBundleMinimalBytes?.() ??
      adapter.measureInteractiveClientBundleBytes?.(),
  },
  {
    name: "app build output gzip bytes",
    description:
      "Measures gzip-compressed production build output size when the adapter exposes build artifacts.",
    metric: "size",
    unit: "gzip bytes",
    invoke: (adapter) => adapter.measureBuildOutputGzipBytes?.(),
  },
];

export const routerBenchmarkCases: RouterBenchmarkCase[] = [
  timedRouterBenchmarkCases[0]!,
  timedRouterBenchmarkCases[1]!,
  ...durationRouterBenchmarkCases.slice(0, 5),
  timedRouterBenchmarkCases[3]!,
  timedRouterBenchmarkCases[4]!,
  timedRouterBenchmarkCases[2]!,
  ...valueRouterBenchmarkCases,
  ...durationRouterBenchmarkCases.slice(5),
  ...sizeRouterBenchmarkCases,
];

export function rankCompletedRows(
  rows: readonly RouterBenchmarkRow[],
  caseName: RouterBenchmarkCaseName,
): RouterBenchmarkRow[] {
  const completedRows = rows.filter(
    (row) => row.caseName === caseName && row.status === "completed",
  );
  const metric = completedRows[0]?.metric;

  return [...completedRows].sort((left, right) => {
    const valueOrder =
      metric === "size" || metric === "duration" || metric === "memory"
        ? left.value - right.value
        : right.value - left.value;

    if (valueOrder !== 0) {
      return valueOrder;
    }

    return metric === "throughput" ? left.meanMs - right.meanMs : 0;
  });
}

export async function runRouterBenchmarks(
  adapters: readonly RouterBenchmarkAdapter[],
  options: { benchTimeMs?: number; warmupTimeMs?: number } = {},
): Promise<RouterBenchmarkRow[]> {
  const rows: RouterBenchmarkRow[] = [];
  const benchTimeMs = options.benchTimeMs ?? 1_500;
  const warmupTimeMs = options.warmupTimeMs ?? 250;
  const activeAdapters: RouterBenchmarkAdapter[] = [];

  for (const adapter of adapters) {
    try {
      await adapter.setup?.();
      await adapter.renderToString?.(nodeCount);
      activeAdapters.push(adapter);
    } catch (error) {
      rows.push(...failedRowsForAdapter(adapter, error));
    }
  }

  try {
    for (const benchmarkCase of timedRouterBenchmarkCases) {
      for (const adapter of activeAdapters) {
        if (!benchmarkCase.isSupported(adapter)) {
          rows.push(unsupportedRow(adapter, benchmarkCase));
          continue;
        }

        const bench = new Bench({
          time: benchTimeMs,
          warmupTime: warmupTimeMs,
          retainSamples: true,
        });
        bench.add(`${adapter.name} / ${benchmarkCase.name}`, async () => {
          await benchmarkCase.invoke(adapter);
        });

        try {
          await bench.run();
          const task = bench.tasks[0];

          if (task === undefined) {
            throw new Error("tinybench did not return a task result");
          }

          rows.push(rowFromTask(adapter, benchmarkCase, task));
        } catch (error) {
          rows.push(failedRow(adapter, benchmarkCase, error));
        }
      }
    }

    for (const benchmarkCase of durationRouterBenchmarkCases) {
      rows.push(...(await collectDurationRowsRoundRobin(activeAdapters, benchmarkCase)));
    }

    for (const benchmarkCase of valueRouterBenchmarkCases) {
      rows.push(...(await collectValueRowsRoundRobin(activeAdapters, benchmarkCase)));
    }

    for (const benchmarkCase of sizeRouterBenchmarkCases) {
      for (const adapter of activeAdapters) {
        try {
          const bytes = await benchmarkCase.invoke(adapter);

          if (bytes === undefined) {
            rows.push(unsupportedRow(adapter, benchmarkCase));
            continue;
          }

          rows.push({
            framework: adapter.name,
            version: adapter.version,
            caseName: benchmarkCase.name,
            status: "completed",
            metric: benchmarkCase.metric,
            unit: benchmarkCase.unit,
            value: bytes,
            hz: 0,
            meanMs: 0,
            p75Ms: 0,
            p99Ms: 0,
            gzipBytes: bytes,
          });
        } catch (error) {
          rows.push(failedRow(adapter, benchmarkCase, error));
        }
      }
    }
  } finally {
    for (const adapter of activeAdapters) {
      try {
        await adapter.teardown?.();
      } catch {
        // Teardown failures should not hide benchmark results.
      }
    }
  }

  return rows;
}

async function collectValueRowsRoundRobin(
  adapters: readonly RouterBenchmarkAdapter[],
  benchmarkCase: ValueRouterBenchmarkCase,
): Promise<RouterBenchmarkRow[]> {
  const states = adapters.map((adapter) => ({
    adapter,
    error: undefined as unknown,
    failed: false,
    samples: [] as number[],
    unsupported: false,
  }));

  for (const state of states) {
    try {
      const value = await benchmarkCase.invoke(state.adapter);

      if (value === undefined) {
        state.unsupported = true;
      }
    } catch (error) {
      state.failed = true;
      state.error = error;
    }
  }

  const measuredSamples = benchmarkCase.measuredSamples ?? valueBenchmarkSampleCount;

  for (let sampleIndex = 0; sampleIndex < measuredSamples; sampleIndex += 1) {
    const offset = states.length === 0 ? 0 : sampleIndex % states.length;

    for (let stateIndex = 0; stateIndex < states.length; stateIndex += 1) {
      const state = states[(stateIndex + offset) % states.length]!;

      if (state.failed || state.unsupported) {
        continue;
      }

      try {
        const value = await benchmarkCase.invoke(state.adapter);

        if (value === undefined) {
          state.unsupported = true;
          continue;
        }

        state.samples.push(value);
      } catch (error) {
        state.failed = true;
        state.error = error;
      }
    }
  }

  return states.map((state) => {
    if (state.failed) {
      return failedRow(state.adapter, benchmarkCase, state.error);
    }

    if (state.unsupported) {
      return unsupportedRow(state.adapter, benchmarkCase);
    }

    return valueRowFromSamples(state.adapter, benchmarkCase, state.samples);
  });
}

function valueRowFromSamples(
  adapter: RouterBenchmarkAdapter,
  benchmarkCase: ValueRouterBenchmarkCase,
  samples: readonly number[],
): RouterBenchmarkRow {
  const digits = benchmarkCase.metric === "memory" ? 0 : 4;
  const roundedValue = round(median(samples), digits);
  const roundedMean = round(mean(samples), digits);

  return {
    framework: adapter.name,
    version: adapter.version,
    caseName: benchmarkCase.name,
    status: "completed",
    metric: benchmarkCase.metric,
    unit: benchmarkCase.unit,
    value: roundedValue,
    hz: benchmarkCase.metric === "throughput" ? roundedValue : 0,
    meanMs: benchmarkCase.metric === "duration" ? roundedMean : 0,
    p75Ms: 0,
    p99Ms: 0,
    samplesMs: samples.map((sample) => round(sample, digits)),
  };
}

async function collectDurationRowsRoundRobin(
  adapters: readonly RouterBenchmarkAdapter[],
  benchmarkCase: DurationRouterBenchmarkCase,
): Promise<RouterBenchmarkRow[]> {
  const states = adapters.map((adapter) => ({
    adapter,
    error: undefined as unknown,
    failed: false,
    samples: [] as number[],
    unsupported: false,
  }));

  for (let index = 0; index < 9; index += 1) {
    for (const state of states) {
      if (state.failed || state.unsupported) {
        continue;
      }

      try {
        const value = await benchmarkCase.invoke(state.adapter);

        if (value === undefined) {
          state.unsupported = true;
          continue;
        }

        if (index >= 2) {
          state.samples.push(value);
        }
      } catch (error) {
        state.failed = true;
        state.error = error;
      }
    }
  }

  return states.map((state) => {
    if (state.failed) {
      return failedRow(state.adapter, benchmarkCase, state.error);
    }

    if (state.unsupported) {
      return unsupportedRow(state.adapter, benchmarkCase);
    }

    return durationRowFromSamples(state.adapter, benchmarkCase, state.samples);
  });
}

function durationRowFromSamples(
  adapter: RouterBenchmarkAdapter,
  benchmarkCase: DurationRouterBenchmarkCase,
  samples: readonly number[],
): RouterBenchmarkRow {
  const value = median(samples);

  return {
    framework: adapter.name,
    version: adapter.version,
    caseName: benchmarkCase.name,
    status: "completed",
    metric: benchmarkCase.metric,
    unit: benchmarkCase.unit,
    value: round(value, 4),
    hz: 0,
    meanMs: round(mean(samples), 4),
    p75Ms: round(percentile(samples, 0.75), 4),
    p99Ms: round(percentile(samples, 0.99), 4),
    samplesMs: samples.map((sample) => round(sample, 4)),
  };
}

function unsupportedRow(
  adapter: RouterBenchmarkAdapter,
  benchmarkCase: RouterBenchmarkCase,
): RouterBenchmarkRow {
  return {
    framework: adapter.name,
    version: adapter.version,
    caseName: benchmarkCase.name,
    status: "unsupported",
    metric: benchmarkCase.metric,
    unit: benchmarkCase.unit,
    value: 0,
    hz: 0,
    meanMs: 0,
    p75Ms: 0,
    p99Ms: 0,
    note: `${adapter.name} does not implement ${benchmarkCase.name}`,
  };
}

function rowFromTask(
  adapter: RouterBenchmarkAdapter,
  benchmarkCase: TimedRouterBenchmarkCase,
  task: {
    result?: {
      latency?: {
        mean: number;
        p75: number;
        p99: number;
        samples?: readonly number[];
      };
      throughput?: { mean: number };
    };
  },
): RouterBenchmarkRow {
  const hz = task.result?.throughput?.mean ?? 0;
  const meanMs = task.result?.latency?.mean ?? 0;
  const p75Ms = task.result?.latency?.p75 ?? 0;
  const p99Ms = task.result?.latency?.p99 ?? 0;

  return {
    framework: adapter.name,
    version: adapter.version,
    caseName: benchmarkCase.name,
    status: "completed",
    metric: benchmarkCase.metric,
    unit: benchmarkCase.unit,
    value: Math.round(hz),
    hz: Math.round(hz),
    meanMs: round(meanMs, 4),
    p75Ms: round(p75Ms, 4),
    p99Ms: round(p99Ms, 4),
    samplesMs: task.result?.latency?.samples?.map((sample) => round(sample, 4)),
  };
}

function failedRowsForAdapter(
  adapter: RouterBenchmarkAdapter,
  error: unknown,
): RouterBenchmarkRow[] {
  return routerBenchmarkCases.map((benchmarkCase) => failedRow(adapter, benchmarkCase, error));
}

function failedRow(
  adapter: RouterBenchmarkAdapter,
  benchmarkCase: RouterBenchmarkCase,
  error: unknown,
): RouterBenchmarkRow {
  return {
    framework: adapter.name,
    version: adapter.version,
    caseName: benchmarkCase.name,
    status: "failed",
    metric: benchmarkCase.metric,
    unit: benchmarkCase.unit,
    value: 0,
    hz: 0,
    meanMs: 0,
    p75Ms: 0,
    p99Ms: 0,
    note: error instanceof Error ? error.message : String(error),
  };
}

function unsupported(adapter: RouterBenchmarkAdapter, method: string): Promise<never> {
  return Promise.reject(new Error(`${adapter.name} does not implement ${method}`));
}

async function renderGenericDynamicRoute(adapter: RouterBenchmarkAdapter): Promise<string> {
  const baseUrl = adapter.getServerUrl?.();

  if (baseUrl === undefined || baseUrl === null) {
    return unsupported(adapter, "renderDynamicRoute");
  }

  const response = await fetch(`${baseUrl}/data-grid?user=199&tab=activity`);
  const html = await response.text();

  if (!html.includes("Item #199 &lt;data")) {
    throw new Error(`${adapter.name} dynamic route probe did not include expected data`);
  }

  return html;
}

async function measureInvocationDurationMs(invoke: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await invoke();
  return performance.now() - start;
}

async function measureStreamingTimings(adapter: RouterBenchmarkAdapter): Promise<{
  firstByteMs: number;
  firstChunkMs: number;
  fullBodyMs: number;
}> {
  const baseUrl = adapter.getServerUrl?.();

  if (baseUrl === undefined || baseUrl === null) {
    throw new Error(`${adapter.name} does not expose a running server URL`);
  }

  const decoder = new TextDecoder();
  const start = performance.now();
  const response = await fetch(`${baseUrl}/real-stream-page`);
  const firstByteMs = performance.now() - start;
  const reader = response.body?.getReader();

  if (reader === undefined) {
    throw new Error(`${adapter.name} streaming response did not expose a body`);
  }

  let firstChunkMs = 0;
  let html = "";

  for (;;) {
    const chunk = await reader.read();

    if (chunk.done) {
      break;
    }

    if (firstChunkMs === 0) {
      firstChunkMs = performance.now() - start;
    }

    html += decoder.decode(chunk.value, { stream: true });
  }

  html += decoder.decode();
  const fullBodyMs = performance.now() - start;

  if (!html.includes(String(nodeCount - 1))) {
    throw new Error(`${adapter.name} streaming timing probe did not include the last node`);
  }

  return { firstByteMs, firstChunkMs, fullBodyMs };
}

function median(values: readonly number[]): number {
  return percentile(values, 0.5);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));

  return sorted[index]!;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
