export interface HttpTarget {
  url: string;
  serverPid: number;
  requiredText: string;
  workload: Record<string, string>;
}

export interface HttpTrialOptions {
  profile: "burst" | "steady";
  concurrency?: number;
  totalRequests?: number;
  warmupMs?: number;
  durationMs?: number;
  windows?: number;
  requestTimeoutMs?: number;
}

export interface HttpLoadResult {
  latenciesMs: number[];
  elapsedMs: number;
  requestCount: number;
  connectionsOpened: number;
  reusedRequests: number;
  connectionsOpenedTotal?: number;
  reusedRequestsTotal?: number;
}

export interface HttpTrial extends Partial<HttpLoadResult> {
  methodologyVersion: 2;
  trialId: string;
  seriesId: string;
  window: number;
  executionOrder?: { round: number; position: number };
  latencySamplesRef?: string;
  status: "completed" | "failed";
  error?: string;
  options: Required<HttpTrialOptions>;
  target: HttpTarget;
  serverPid: number;
  generatorPid?: number;
  orchestratorPid: number;
  nodeVersion: string;
  client: "node:http HTTP/1.1 keep-alive, no pipelining";
  warmupRequests: number;
  warmupElapsedMs: number;
  rssBeforeBytes?: number;
  rssAfterBytes?: number;
  rssDeltaBytes?: number;
  throughputOps?: number;
  p50Ms?: number;
  p95Ms?: number;
  p99Ms?: number;
}

export function normalizeHttpOptions(options: HttpTrialOptions): Required<HttpTrialOptions> {
  const result = {
    profile: options.profile,
    concurrency: options.concurrency ?? 100,
    totalRequests: options.totalRequests ?? 200,
    warmupMs: options.profile === "burst" ? 0 : (options.warmupMs ?? 2_000),
    durationMs: options.durationMs ?? 5_000,
    windows: options.windows ?? 3,
    requestTimeoutMs: options.requestTimeoutMs ?? 10_000,
  };
  if (result.profile !== "burst" && result.profile !== "steady")
    throw new Error("invalid HTTP profile");
  for (const key of [
    "concurrency",
    "totalRequests",
    "durationMs",
    "windows",
    "requestTimeoutMs",
  ] as const) {
    if (!Number.isSafeInteger(result[key]) || result[key] <= 0)
      throw new Error(`invalid HTTP ${key}`);
  }
  if (!Number.isSafeInteger(result.warmupMs) || result.warmupMs < 0)
    throw new Error("invalid HTTP warmupMs");
  if (
    result.concurrency > 1_000 ||
    result.windows > 100 ||
    result.totalRequests > 1_000_000 ||
    result.durationMs > 60_000 ||
    result.warmupMs > 60_000 ||
    result.requestTimeoutMs > 60_000
  )
    throw new Error("HTTP workload exceeds safety limits");
  return result;
}

export function summarizeHttpLoad(result: HttpLoadResult) {
  if (
    result.requestCount !== result.latenciesMs.length ||
    result.requestCount === 0 ||
    !Number.isFinite(result.elapsedMs) ||
    result.elapsedMs <= 0 ||
    result.latenciesMs.some((value) => !Number.isFinite(value) || value < 0)
  )
    throw new Error("invalid HTTP load result");
  const sorted = [...result.latenciesMs].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.ceil(sorted.length * p) - 1]!;
  return {
    throughputOps: (result.requestCount * 1_000) / result.elapsedMs,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
  };
}
