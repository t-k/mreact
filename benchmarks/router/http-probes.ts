import { readFile } from "node:fs/promises";

export interface ConcurrentRequestProbeResult {
  p99Ms: number;
  rssDeltaBytes: number;
  throughputOps: number;
}

export async function measureConcurrentRequests(
  url: string,
  options: {
    concurrency?: number;
    path: string;
    totalRequests?: number;
    validate: (body: string) => void;
  },
): Promise<ConcurrentRequestProbeResult> {
  const concurrency = options.concurrency ?? 100;
  const totalRequests = options.totalRequests ?? 200;
  const latencies: number[] = [];
  const beforeRss = process.memoryUsage().rss;
  const startedAt = performance.now();
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;

        if (index >= totalRequests) {
          return;
        }

        const requestStartedAt = performance.now();
        const response = await fetch(`${url}${options.path}`);
        const body = await response.text();
        latencies.push(performance.now() - requestStartedAt);
        options.validate(body);
      }
    }),
  );

  const elapsedMs = performance.now() - startedAt;

  return {
    p99Ms: percentile(latencies, 0.99),
    rssDeltaBytes: process.memoryUsage().rss - beforeRss,
    throughputOps: totalRequests / (elapsedMs / 1000),
  };
}

export async function measureConcurrentRequestsWithServerRss(
  url: string,
  serverPid: number,
  options: {
    concurrency?: number;
    path: string;
    totalRequests?: number;
    validate: (body: string) => void;
  },
): Promise<ConcurrentRequestProbeResult> {
  const beforeRss = await readProcessRssBytes(serverPid);
  const result = await measureConcurrentRequests(url, options);
  const afterRss = await readProcessRssBytes(serverPid);

  return {
    ...result,
    rssDeltaBytes: afterRss - beforeRss,
  };
}

async function readProcessRssBytes(pid: number): Promise<number> {
  const status = await readFile(`/proc/${pid}/status`, "utf8");
  const match = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);

  if (match === null) {
    throw new Error(`process ${pid} RSS is not available`);
  }

  return Number(match[1]) * 1024;
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));

  return sorted[index]!;
}
