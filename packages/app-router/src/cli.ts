#!/usr/bin/env node

import { resolve } from "node:path";
import { buildApp } from "./build.js";
import { startDevServer } from "./dev-server.js";

const command = process.argv[2] ?? "dev";
const appDir = resolve(process.argv[3] ?? "app");

if (command === "build") {
  const result = await buildApp({ appDir, outDir: resolve(".mreact") });
  console.log(`Built ${result.routes.length} routes.`);
} else if (command === "dev") {
  const server = await startDevServer({
    appDir,
    port: Number(process.env.PORT ?? 3001),
  });
  console.log(`mreact app router ready at ${server.url}`);
} else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}
