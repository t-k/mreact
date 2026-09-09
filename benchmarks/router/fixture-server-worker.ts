import { createServer } from "node:http";
import type { FixtureServerConfig } from "./fixture-server.js";

const config = JSON.parse(process.argv[2]!) as FixtureServerConfig;
let close: (() => Promise<void>) | undefined;
let closing = false;
let startupFinished: () => void;
const startup = new Promise<void>((resolve) => {
  startupFinished = resolve;
});
async function shutdown(unexpected = false) {
  if (closing) return;
  closing = true;
  if (unexpected) process.exitCode = 1;
  // The owner may be gone; a child-side deadline is required as well.
  const deadline = setTimeout(() => {
    console.error("fixture shutdown deadline exceeded");
    process.exit(1);
  }, 2_500);
  try {
    await startup;
    await close?.();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
  if (process.connected) process.disconnect?.();
  // Keep the failure deadline armed if framework handles survive close().
  deadline.unref();
}
process.on("disconnect", () => {
  void shutdown(true);
});
process.on("message", (message: { type: string }) => {
  if (message.type === "close") void shutdown();
});
if (!process.connected) void shutdown(true);

try {
  if (config.framework === "mreact") {
    const { startServer, createMemoryRouteCache } =
      await import("../../packages/router/dist/index.js");
    let logEventCount = 0;
    const onEvent = (event: { type: string }) => {
      logEventCount += event.type.length;
    };
    const server = await startServer({
      outDir: config.directory,
      port: 0,
      routeCache: createMemoryRouteCache(),
      sinkStrategy: config.sinkStrategy,
      logger: config.logEnabled ? { info: onEvent, error: onEvent } : undefined,
    });
    close = () => server.close();
    if (!closing && process.connected)
      process.send?.({ type: "ready", pid: process.pid, url: server.url });
  } else if (config.framework === "next") {
    const { default: next } = await import("next");
    const createNext = next as unknown as (options: {
      dev: boolean;
      dir: string;
      quiet: boolean;
    }) => {
      prepare(): Promise<void>;
      getRequestHandler(): (
        req: import("node:http").IncomingMessage,
        res: import("node:http").ServerResponse,
      ) => Promise<void>;
      close(): Promise<void>;
    };
    const app = createNext({ dev: false, dir: config.directory, quiet: true });
    close = () => app.close();
    await app.prepare();
    const handler = app.getRequestHandler();
    const server = createServer((req, res) => {
      void handler(req, res);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    close = async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await app.close();
    };
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing Next listener");
    if (!closing && process.connected)
      process.send?.({ type: "ready", pid: process.pid, url: `http://127.0.0.1:${address.port}` });
  } else throw new Error("unsupported fixture server framework");
} finally {
  startupFinished!();
}
