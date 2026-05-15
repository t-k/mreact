export type BenchmarkStatus = "completed" | "failed" | "unsupported";
export type BenchmarkMetric = "duration" | "throughput" | "size" | "memory";
export type BenchmarkUnit = "ms" | "ops/sec" | "bytes";

export interface SampleSummary {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p75: number;
  p95: number;
  standardDeviation: number;
}

export interface BenchmarkEnvironment {
  date: string;
  gitCommit: string;
  nodeVersion: string;
  nodeEnv: string;
  pnpmVersion: string;
  platform: NodeJS.Platform;
  arch: NodeJS.Architecture;
  cpuModel: string;
  cpuCount: number;
  totalMemoryBytes: number;
  packageVersions: Record<string, string>;
}

export interface BenchmarkRow {
  suite: string;
  framework: string;
  version: string;
  caseName: string;
  status: BenchmarkStatus;
  metric: BenchmarkMetric;
  unit: BenchmarkUnit;
  value: number;
  summary?: SampleSummary;
  notes?: string[];
}
