#!/usr/bin/env node

import { resolve } from "node:path";
import { buildApp } from "./build.js";
import { startDevServer } from "./dev-server.js";
import { startServer } from "./serve.js";
import { loadMreactRouterViteConfig } from "./vite-config.js";

const command = process.argv[2] ?? "dev";
const routeArg = process.argv[3];

if (command === "build") {
  const project = routeArg === undefined
    ? await loadMreactRouterViteConfig({ command: "build", cwd: process.cwd() })
    : { appDir: resolve(routeArg) };
  const result = await buildApp({ ...project, outDir: resolve(".mreact") });
  console.log(`Built ${result.routes.length} routes.`);
} else if (command === "dev") {
  const project = routeArg === undefined
    ? await loadMreactRouterViteConfig({ command: "serve", cwd: process.cwd() })
    : { appDir: resolve(routeArg) };
  const server = await startDevServer({
    ...project,
    port: Number(process.env.PORT ?? 3001),
  });
  console.log(`mreact app router ready at ${server.url}`);
} else if (command === "start") {
  const server = await startServer({
    outDir: resolve(process.argv[3] ?? ".mreact"),
    port: Number(process.env.PORT ?? 3001),
  });
  console.log(`mreact app router serving built output at ${server.url}`);
} else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}
