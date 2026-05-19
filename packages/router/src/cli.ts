#!/usr/bin/env node

import { resolve } from "node:path";
import { buildApp } from "./build.js";
import {
  buildTargetsFromCliTarget,
  createCliRequestLogger,
  parseCliArguments,
  resolveCliRequestLogMode,
} from "./cli-options.js";
import { startDevServer } from "./dev-server.js";
import { startServer } from "./serve.js";
import { loadMreactRouterViteConfig, loadMreactRouterViteConfigDetails } from "./vite-config.js";

let parsed;

try {
  parsed = parseCliArguments(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

if (parsed !== undefined) {
  const command = parsed.command;
  const routeArg = parsed.routeArg;

  try {
    const logger =
      resolveCliRequestLogMode(parsed.log, process.env) === "requests"
        ? createCliRequestLogger()
        : undefined;

    if (command === "build") {
      const project =
        routeArg === undefined
          ? await loadMreactRouterViteConfig({ command: "build", cwd: process.cwd() })
          : { appDir: resolve(routeArg) };
      const result = await buildApp({
        ...project,
        ...(parsed.clientSourceMaps === undefined
          ? {}
          : { clientSourceMaps: parsed.clientSourceMaps }),
        outDir: resolve(".mreact"),
        ...(parsed.serverRuntime === undefined ? {} : { serverRuntime: parsed.serverRuntime }),
        targets: buildTargetsFromCliTarget(parsed.target),
      });
      console.log(`Built ${result.routes.length} routes.`);
    } else if (command === "dev") {
      const loaded =
        routeArg === undefined
          ? await loadMreactRouterViteConfigDetails({ command: "serve", cwd: process.cwd() })
          : { project: { appDir: resolve(routeArg) }, serverPort: undefined };
      const server = await startDevServer({
        ...loaded.project,
        logger,
        port: process.env.PORT === undefined ? loaded.serverPort : Number(process.env.PORT),
      });
      console.log(`mreact app router ready at ${server.url}`);
    } else if (command === "start") {
      const server = await startServer({
        logger,
        outDir: resolve(routeArg ?? ".mreact"),
        port: Number(process.env.PORT ?? 3001),
      });
      console.log(`mreact app router serving built output at ${server.url}`);
    } else {
      console.error(`Unknown command: ${command}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
