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

export interface RouterBenchmarkCase {
  metric: RouterBenchmarkMetric;
  name: RouterBenchmarkCaseName;
  unit: RouterBenchmarkUnit;
}

interface TimedRouterBenchmarkCase extends RouterBenchmarkCase {
  metric: "throughput";
  unit: "ops/sec";
  invoke(adapter: RouterBenchmarkAdapter): Promise<unknown>;
}

interface SizeRouterBenchmarkCase extends RouterBenchmarkCase {
  metric: "size";
  unit: "gzip bytes";
  invoke(adapter: RouterBenchmarkAdapter): Promise<number> | undefined;
}

const timedRouterBenchmarkCases: TimedRouterBenchmarkCase[] = [
  {
    name: "app render 1000 nodes",
    metric: "throughput",
    unit: "ops/sec",
    invoke: (adapter) => adapter.renderToString?.(nodeCount) ?? unsupported(adapter, "renderToString"),
  },
  {
    name: "app streaming 1000 nodes",
    metric: "throughput",
    unit: "ops/sec",
    invoke: (adapter) => adapter.renderToStream?.(nodeCount) ?? unsupported(adapter, "renderToStream"),
  },
  {
    name: "app real streaming 1000 nodes (async 50ms)",
    metric: "throughput",
    unit: "ops/sec",
    invoke: (adapter) => adapter.renderToRealStream?.(nodeCount) ?? unsupported(adapter, "renderToRealStream"),
  },
  {
    name: "app dynamic-attr grid 200 cells",
    metric: "throughput",
    unit: "ops/sec",
    invoke: (adapter) =>
      adapter.renderDynamicAttrGrid?.(dynamicAttrCellCount) ??
      unsupported(adapter, "renderDynamicAttrGrid"),
  },
];

const sizeRouterBenchmarkCases: SizeRouterBenchmarkCase[] = [
  {
    name: "app client bundle gzip bytes (server-only page)",
    metric: "size",
    unit: "gzip bytes",
    invoke: (adapter) => adapter.measureServerOnlyClientBundleBytes?.(),
  },
  {
    name: "app client bundle gzip bytes (interactive page)",
    metric: "size",
    unit: "gzip bytes",
    invoke: (adapter) => adapter.measureInteractiveClientBundleBytes?.(),
  },
  {
    name: "app client bundle gzip bytes (interactive page, minimal opt-out)",
    metric: "size",
    unit: "gzip bytes",
    invoke: (adapter) =>
      adapter.measureInteractiveClientBundleMinimalBytes?.() ??
      adapter.measureInteractiveClientBundleBytes?.(),
  },
];

export const routerBenchmarkCases: RouterBenchmarkCase[] = [
  ...timedRouterBenchmarkCases,
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

  return [...completedRows].sort((left, right) =>
    metric === "size" ? left.value - right.value : right.value - left.value,
  );
}

export async function runRouterBenchmarks(
  adapters: readonly RouterBenchmarkAdapter[],
  options: { benchTimeMs?: number; warmupTimeMs?: number } = {},
): Promise<RouterBenchmarkRow[]> {
  const rows: RouterBenchmarkRow[] = [];
  const benchTimeMs = options.benchTimeMs ?? 1_500;
  const warmupTimeMs = options.warmupTimeMs ?? 250;

  for (const adapter of adapters) {
    try {
      await adapter.setup?.();
      await adapter.renderToString?.(nodeCount);
    } catch (error) {
      rows.push(...failedRowsForAdapter(adapter, error));
      continue;
    }

    for (const benchmarkCase of timedRouterBenchmarkCases) {
      const bench = new Bench({ time: benchTimeMs, warmupTime: warmupTimeMs });
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

    for (const benchmarkCase of sizeRouterBenchmarkCases) {
      try {
        const bytes = await benchmarkCase.invoke(adapter);

        if (bytes === undefined) {
          throw new Error(`${adapter.name} does not implement ${benchmarkCase.name}`);
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

    try {
      await adapter.teardown?.();
    } catch {
      // Teardown failures should not hide benchmark results.
    }
  }

  return rows;
}

function rowFromTask(
  adapter: RouterBenchmarkAdapter,
  benchmarkCase: TimedRouterBenchmarkCase,
  task: {
    result?: {
      latency?: { mean: number; p75: number; p99: number };
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
  };
}

function failedRowsForAdapter(
  adapter: RouterBenchmarkAdapter,
  error: unknown,
): RouterBenchmarkRow[] {
  return routerBenchmarkCases.map((benchmarkCase) =>
    failedRow(adapter, benchmarkCase, error),
  );
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

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
