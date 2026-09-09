import { Agent, request } from "node:http";
import {
  normalizeHttpOptions,
  type HttpTarget,
  type HttpTrialOptions,
} from "./http-trial-types.js";

const config = JSON.parse(process.argv[2]!) as { target: HttpTarget; options: HttpTrialOptions };
const options = normalizeHttpOptions(config.options);
const url = new URL(config.target.url);
if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  throw new Error("HTTP probe requires a loopback HTTP server");
const agent = new Agent({
  keepAlive: true,
  maxSockets: options.concurrency,
  maxFreeSockets: options.concurrency,
  scheduling: "fifo",
});
let connectionsOpened = 0;
let reusedRequests = 0;
let busy = false;
let closing = false;
const sockets = new WeakSet<object>();

async function load(warmup: boolean) {
  const openedBefore = connectionsOpened;
  const reusedBefore = reusedRequests;
  const latenciesMs: number[] = [];
  const start = performance.now();
  let issued = 0;
  let failure: unknown;
  const duration = warmup ? options.warmupMs : options.durationMs;
  const timed = warmup || options.profile === "steady";
  await Promise.all(
    Array.from({ length: options.concurrency }, async () => {
      while (
        !failure &&
        (timed ? performance.now() - start < duration : issued < options.totalRequests)
      ) {
        issued++;
        try {
          const began = performance.now();
          await new Promise<void>((resolve, reject) => {
            const req = request(url, { agent }, (res) => {
              let body = "";
              let bytes = 0;
              res.setEncoding("utf8");
              res.on("data", (chunk: string) => {
                bytes += Buffer.byteLength(chunk);
                if (bytes > 16 * 1024 * 1024)
                  req.destroy(new Error("HTTP body exceeds size limit"));
                else body += chunk;
              });
              res.once("error", reject);
              res.once("end", () => {
                const latency = performance.now() - began;
                if (res.statusCode === undefined || res.statusCode < 200 || res.statusCode >= 300)
                  return reject(new Error(`HTTP ${res.statusCode}`));
                if (!body.includes(config.target.requiredText))
                  return reject(new Error("HTTP body validation failed"));
                latenciesMs.push(latency);
                resolve();
              });
            });
            const timer = setTimeout(
              () => req.destroy(new Error("HTTP request deadline")),
              options.requestTimeoutMs,
            );
            req.once("close", () => clearTimeout(timer));
            req.once("error", reject);
            req.once("socket", (socket) => {
              if (!sockets.has(socket)) {
                sockets.add(socket);
                connectionsOpened++;
              } else reusedRequests++;
            });
            req.end();
          });
        } catch (error) {
          failure ??= error;
          agent.destroy();
        }
      }
    }),
  );
  return {
    ...(failure ? { error: failure instanceof Error ? failure.message : String(failure) } : {}),
    attemptedRequests: issued,
    requestCount: latenciesMs.length,
    latenciesMs,
    elapsedMs: performance.now() - start,
    connectionsOpened: connectionsOpened - openedBefore,
    reusedRequests: reusedRequests - reusedBefore,
    connectionsOpenedTotal: connectionsOpened,
    reusedRequestsTotal: reusedRequests,
  };
}

process.on("disconnect", () => {
  agent.destroy();
  if (!closing) process.exitCode = 1;
  closing = true;
});
process.on("message", async (message: { type: string }) => {
  if (message.type === "close") {
    closing = true;
    agent.destroy();
    process.disconnect?.();
    return;
  }
  if (busy) {
    process.send?.({ type: "error", error: "concurrent HTTP load command" });
    return;
  }
  busy = true;
  try {
    if (message.type !== "warmup" && message.type !== "measure")
      throw new Error("invalid HTTP load command");
    const result = await load(message.type === "warmup");
    if (process.connected) process.send?.({ type: "result", result });
  } catch (error) {
    if (process.connected)
      process.send?.({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      });
  } finally {
    busy = false;
  }
});
process.send?.({ type: "ready", pid: process.pid });
