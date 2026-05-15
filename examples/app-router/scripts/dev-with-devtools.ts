// Dev server with @reckona/mreact-devtools installed.
//
// `installDevtools()` sets the global hook (`globalThis.__mreactDevtools`)
// that reactive-core / store / query / and the router edge adapter all
// emit into when present. The runtime packages never import the
// devtools package directly — installing it is opt-in, and the import
// only happens here.
//
// Run:  `pnpm dev:devtools`
//
// Every router request, store update, and query status change is
// printed to stdout. Hit /server-actions and /query in a browser and
// watch the events fly.
import { startDevServer } from "@reckona/mreact-router";
import { installDevtools } from "@reckona/mreact-devtools";

const devtools = installDevtools();
devtools.subscribe((event) => {
  const { type, ...rest } = event;
  console.log(`[devtools] ${type}`, rest);
});

// Project paths are loaded from vite.config.ts. This script only adds
// the devtools hook and a different default port.
const server = await startDevServer({
  port: Number(process.env.PORT ?? 3001),
});

console.log(`devtools-aware dev server at ${server.url}`);
console.log("listening for reactive / store / query / router events");

const shutdown = async (): Promise<void> => {
  await server.close();
  devtools.dispose();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
