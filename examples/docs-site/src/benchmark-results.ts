export interface BenchmarkRunMeta {
  readonly arch: string;
  readonly cpuCount: number;
  readonly cpuModel: string;
  readonly date: string;
  readonly gitCommit: string;
  readonly nodeVersion: string;
  readonly path: string;
  readonly pnpmVersion: string;
}

export type BenchmarkUnit = "gzip bytes" | "ms" | "ops/sec";

export interface BenchmarkChartRow {
  readonly framework: string;
  readonly value: number;
}

export interface BenchmarkChartDefinition {
  readonly caseName: string;
  readonly description: string;
  readonly id: string;
  readonly lowerIsBetter: boolean;
  readonly rows: readonly BenchmarkChartRow[];
  readonly title: string;
  readonly unit: BenchmarkUnit;
}

export interface BenchmarkHighlight {
  readonly metric: string;
  readonly unit: BenchmarkUnit;
  readonly value: number;
}

export const latestBenchmarkRun: BenchmarkRunMeta = {
  arch: "linux x64",
  cpuCount: 4,
  cpuModel: "AMD EPYC 7763 64-Core Processor",
  date: "2026-06-07",
  gitCommit: "4dab6e4378238459374b7c5650c176c49c3dd88e",
  nodeVersion: "v24.16.0",
  path: "benchmarks/results/2026-06-07/002",
  pnpmVersion: "10.19.0",
};

export const benchmarkHighlights: readonly BenchmarkHighlight[] = [
  {
    metric: "Browser create 1k rows",
    unit: "ms",
    value: 2.5,
  },
  {
    metric: "Browser update every 10th in 10k rows",
    unit: "ms",
    value: 1.3,
  },
  {
    metric: "Router render 1000 nodes",
    unit: "ops/sec",
    value: 1645,
  },
  {
    metric: "Server-only route client bundle",
    unit: "gzip bytes",
    value: 0,
  },
  {
    metric: "Interactive route client bundle",
    unit: "gzip bytes",
    value: 9984,
  },
  {
    metric: "Streaming first byte 1000 nodes",
    unit: "ms",
    value: 0.9128,
  },
];

export const benchmarkCharts: readonly BenchmarkChartDefinition[] = [
  {
    caseName: "browser create 1k rows",
    description: "Median browser duration for creating 1,000 rows in the primitive DOM fixture.",
    id: "browser-create",
    lowerIsBetter: true,
    title: "Browser create 1k rows",
    unit: "ms",
    rows: [
      { framework: "mreact", value: 2.5 },
      { framework: "mreact react-compat", value: 4.5 },
      { framework: "react", value: 3.1 },
      { framework: "solid", value: 1.5 },
      { framework: "qwik", value: 2.4 },
    ],
  },
  {
    caseName: "browser update every 10th in 10k rows",
    description: "Median browser duration for mutating every tenth row in a 10,000 row fixture.",
    id: "browser-update",
    lowerIsBetter: true,
    title: "Browser update every 10th",
    unit: "ms",
    rows: [
      { framework: "mreact", value: 1.3 },
      { framework: "mreact react-compat", value: 14.9 },
      { framework: "react", value: 2.7 },
      { framework: "solid", value: 7.6 },
      { framework: "qwik", value: 10.2 },
    ],
  },
  {
    caseName: "app render 1000 nodes",
    description: "Server render throughput for the app-router fixture. Higher bars are better here.",
    id: "router-render-throughput",
    lowerIsBetter: false,
    title: "Router render throughput",
    unit: "ops/sec",
    rows: [
      { framework: "mreact-app-router", value: 1645 },
      { framework: "mreact-app-router+mreact react-compat", value: 1044 },
      { framework: "marko-run", value: 778 },
      { framework: "tanstack-start", value: 750 },
      { framework: "qwik-city", value: 483 },
      { framework: "solid-start", value: 400 },
      { framework: "next-app-router", value: 86 },
    ],
  },
  {
    caseName: "app client bundle gzip bytes (server-only page)",
    description: "Client JavaScript shipped for a server-only route after gzip compression.",
    id: "server-only-bundle",
    lowerIsBetter: true,
    title: "Server-only route bundle",
    unit: "gzip bytes",
    rows: [
      { framework: "mreact-app-router", value: 0 },
      { framework: "mreact-app-router+mreact react-compat", value: 0 },
      { framework: "marko-run", value: 1600 },
      { framework: "solid-start", value: 20211 },
      { framework: "qwik-city", value: 25534 },
      { framework: "tanstack-start", value: 104797 },
      { framework: "next-app-router", value: 145611 },
    ],
  },
  {
    caseName: "app streaming first byte 1000 nodes",
    description: "Time to first byte for the streaming app-router fixture.",
    id: "streaming-first-byte",
    lowerIsBetter: true,
    title: "Streaming first byte",
    unit: "ms",
    rows: [
      { framework: "mreact-app-router", value: 0.9128 },
      { framework: "mreact-app-router+mreact react-compat", value: 0.8315 },
      { framework: "marko-run", value: 1.336 },
      { framework: "qwik-city", value: 1.5675 },
      { framework: "solid-start", value: 2.6062 },
      { framework: "next-app-router", value: 3.0197 },
      { framework: "tanstack-start", value: 52.5639 },
    ],
  },
];
