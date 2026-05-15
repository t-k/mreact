// Production-style Node serve using @reckona/mreact-router/adapters/node.
//
// Prereq: `pnpm build` (writes .mreact/server/manifest.json + client bundle).
// Run:    `pnpm start:node`           — listens on $PORT (default 3001).
//         `DEVTOOLS=1 pnpm start:node` — also installs devtools and prints
//                                        router request events to stdout.
import { createServer } from "node:http";
import { resolve } from "node:path";
import { createNodeRequestHandler } from "@reckona/mreact-router/adapters/node";
import { installDevtools } from "@reckona/mreact-devtools";

const port = Number(process.env.PORT ?? 3001);
const outDir = resolve("./.mreact");

if (process.env.DEVTOOLS === "1") {
  const devtools = installDevtools();
  devtools.subscribe((event) => {
    console.log(`[devtools] ${event.type}`, event);
  });
  console.log("devtools installed — router events will be logged to stdout");
}

const handler = createNodeRequestHandler({ outDir, port });
const server = createServer(handler);

server.listen(port, () => {
  console.log(`Node adapter serving .mreact/ at http://127.0.0.1:${port}`);
});

const shutdown = (): void => {
  server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
