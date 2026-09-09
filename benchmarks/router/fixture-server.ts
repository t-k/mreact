import { startProbeWorker } from "./probe-worker.js";

export interface FixtureServerConfig {
  framework: "mreact" | "next";
  directory: string;
  logEnabled?: boolean;
  sinkStrategy?: "string" | "buffer";
}

export async function startFixtureServer(config: FixtureServerConfig) {
  const worker = startProbeWorker(new URL("./fixture-server-worker.ts", import.meta.url), config);
  try {
    const ready = await worker.receive<{ type: string; pid: number; url: string }>(60_000);
    if (
      ready.type !== "ready" ||
      ready.pid !== worker.pid ||
      new URL(ready.url).hostname !== "127.0.0.1"
    )
      throw new Error("invalid fixture server identity");
    return { pid: worker.pid, url: ready.url, close: () => worker.close() };
  } catch (error) {
    try {
      await worker.close();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "fixture server startup and cleanup failed");
    }
    throw error;
  }
}
