import { randomUUID } from "node:crypto";
import { readProcessRssBytes } from "./http-probes.js";
import { startProbeWorker } from "./probe-worker.js";
import {
  normalizeHttpOptions,
  summarizeHttpLoad,
  type HttpLoadResult,
  type HttpTarget,
  type HttpTrial,
  type HttpTrialOptions,
} from "./http-trial-types.js";

export async function measureHttpTrials(
  target: HttpTarget,
  input: HttpTrialOptions,
): Promise<HttpTrial[]> {
  const options = normalizeHttpOptions(input);
  if (
    !Number.isSafeInteger(target.serverPid) ||
    target.serverPid <= 1 ||
    target.serverPid === process.pid
  )
    throw new Error("HTTP server must have a distinct valid PID");
  if (!target.requiredText) throw new Error("HTTP body validation must not be empty");
  const seriesId = randomUUID();
  const trials: HttpTrial[] = [];
  let worker: ReturnType<typeof startProbeWorker> | undefined;
  let warmupRequests = 0;
  let warmupElapsedMs = 0;
  for (let window = 0; window < options.windows; window++) {
    const trial: HttpTrial = {
      methodologyVersion: 2,
      trialId: randomUUID(),
      seriesId,
      window,
      status: "failed",
      options,
      target,
      serverPid: target.serverPid,
      orchestratorPid: process.pid,
      nodeVersion: process.version,
      client: "node:http HTTP/1.1 keep-alive, no pipelining",
      warmupRequests,
      warmupElapsedMs,
    };
    trials.push(trial);
    try {
      if (!worker) {
        worker = startProbeWorker(new URL("./http-load-worker.ts", import.meta.url), {
          target,
          options,
        });
        trial.generatorPid = worker.pid;
        const ready = await worker.receive<{ type: string; pid: number }>();
        if (ready.type !== "ready" || ready.pid !== worker.pid || ready.pid === target.serverPid)
          throw new Error("invalid HTTP worker identity");
        if (options.warmupMs > 0) {
          await worker.send({ type: "warmup" });
          const warmup = await receiveLoad(
            worker,
            options.warmupMs + options.requestTimeoutMs + 5_000,
          );
          warmupRequests = warmup.requestCount;
          warmupElapsedMs = warmup.elapsedMs;
          trial.warmupRequests = warmupRequests;
          trial.warmupElapsedMs = warmupElapsedMs;
          if (warmup.error !== undefined) throw new Error(`warmup: ${warmup.error}`);
        }
      }
      trial.generatorPid = worker.pid;
      trial.warmupRequests = warmupRequests;
      trial.warmupElapsedMs = warmupElapsedMs;
      trial.rssBeforeBytes = await readProcessRssBytes(target.serverPid);
      await worker.send({ type: "measure" });
      const deadline =
        options.profile === "steady"
          ? options.durationMs + options.requestTimeoutMs + 5_000
          : Math.ceil(options.totalRequests / options.concurrency) * options.requestTimeoutMs +
            5_000;
      const result = await receiveLoad(worker, deadline);
      await recordHttpTrialResult(trial, result);
    } catch (error) {
      trial.error = error instanceof Error ? error.message : String(error);
    }
    if (
      worker &&
      (options.profile === "burst" || window === options.windows - 1 || trial.status === "failed")
    ) {
      try {
        await worker.close();
      } catch (error) {
        trial.status = "failed";
        trial.error = `${trial.error ?? ""} cleanup: ${String(error)}`;
      }
      worker = undefined;
    }
    if (trial.status === "failed") break;
  }
  return trials;
}

export async function recordHttpTrialResult(
  trial: HttpTrial,
  result: HttpLoadResult,
): Promise<void> {
  Object.assign(trial, result);
  if (result.error !== undefined) throw new Error(result.error);
  trial.rssAfterBytes = await readProcessRssBytes(trial.serverPid);
  if (trial.rssBeforeBytes === undefined) throw new Error("Missing initial server RSS snapshot");
  Object.assign(trial, summarizeHttpLoad(result), {
    rssDeltaBytes: trial.rssAfterBytes - trial.rssBeforeBytes,
    status: "completed",
  });
}

async function receiveLoad(
  worker: ReturnType<typeof startProbeWorker>,
  timeoutMs: number,
): Promise<HttpLoadResult> {
  const message = await worker.receive<{ type: string; result: HttpLoadResult; error?: string }>(
    timeoutMs,
  );
  if (message.type !== "result") throw new Error(message.error ?? "invalid HTTP load response");
  return message.result;
}
