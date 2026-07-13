#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildApp,
  packageAwsLambdaArtifact,
  packageCloudflarePagesArtifact,
  type BuildAppPhase,
  type BuildAppProgressEvent,
} from "./build.js";
import {
  buildTargetsFromCliTarget,
  createCliRequestLogger,
  type CliBuildTarget,
  formatCliHelp,
  parseCliArguments,
  resolveCliAllowedHosts,
  resolveCliDevPort,
  resolveCliHost,
  resolveCliHostPolicy,
  resolveCliRequestLogMode,
} from "./cli-options.js";
import { startDevServer } from "./dev-server.js";
import { startServer } from "./serve.js";
import { loadMreactRouterViteConfigDetails } from "./vite-config.js";

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
    if (parsed.help === true || command === "help") {
      console.log(formatCliHelp(command === "help" ? routeArg : command));
    } else {
      const logger =
        resolveCliRequestLogMode(parsed.log, process.env) === "requests"
          ? createCliRequestLogger()
          : undefined;

      if (command === "build") {
        const startedAt = performance.now();
        let activeBuildPhase: BuildAppPhase | undefined;
        console.log(`mreact-router build v${await readRouterCliVersion()}`);
        console.log(`Target: ${formatCliBuildTarget(parsed.target)}`);
        console.log(`Root: ${process.cwd()}`);
        console.log("Config: loading...");
        const loaded =
          routeArg === undefined
            ? await loadMreactRouterViteConfigDetails({ command: "build", cwd: process.cwd() })
            : { project: { appDir: resolve(routeArg) }, viteConfig: undefined };
        try {
          const result = await buildApp({
            ...loaded.project,
            ...(parsed.awsLambdaPreload === undefined
              ? {}
              : { awsLambdaPreload: parsed.awsLambdaPreload }),
            ...(parsed.awsLambdaPreloadRoutes === undefined
              ? {}
              : { awsLambdaPreloadRoutes: parsed.awsLambdaPreloadRoutes }),
            ...(parsed.clientSourceMaps === undefined
              ? {}
              : { clientSourceMaps: parsed.clientSourceMaps }),
            onBuildProgress(event) {
              activeBuildPhase = updateBuildProgressLog(event, activeBuildPhase);
            },
            outDir: resolve(".mreact"),
            targets: buildTargetsFromCliTarget(parsed.target),
            viteConfig: loaded.viteConfig,
          });
          console.log(
            `Built ${result.routes.length} routes in ${formatDurationSeconds(performance.now() - startedAt)}.`,
          );
        } catch (error) {
          if (activeBuildPhase !== undefined) {
            throw new Error(
              `Build failed during ${formatBuildPhaseFailureLabel(activeBuildPhase)}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
          throw error;
        }
      } else if (command === "package") {
        if (routeArg === "aws-lambda") {
          const manifest = await packageAwsLambdaArtifact({
            ...(parsed.awsLambdaPreload === undefined
              ? {}
              : { awsLambdaPreload: parsed.awsLambdaPreload }),
            ...(parsed.awsLambdaPreloadRoutes === undefined
              ? {}
              : { awsLambdaPreloadRoutes: parsed.awsLambdaPreloadRoutes }),
            fromDir: resolve(parsed.from ?? ".mreact"),
            ...(parsed.handler === undefined ? {} : { handlerEntry: resolve(parsed.handler) }),
            outDir: resolve(parsed.out ?? ".lambda"),
            skipRuntimeDependencyCheck: parsed.skipRuntimeDependencyCheck,
          });
          console.log(
            `Packaged AWS Lambda artifact with ${manifest.files.length} files (${manifest.totalBytes} bytes).`,
          );
        } else if (routeArg === "cloudflare-pages") {
          const manifest = await packageCloudflarePagesArtifact({
            fromDir: resolve(parsed.from ?? ".mreact"),
            outDir: resolve(parsed.out ?? ".mreact/pages"),
            ...(parsed.worker === undefined ? {} : { workerEntry: resolve(parsed.worker) }),
          });
          console.log(
            `Packaged Cloudflare Pages artifact with ${manifest.files.length} files (${manifest.totalBytes} bytes).`,
          );
        } else {
          throw new Error(
            `Unsupported package target ${JSON.stringify(routeArg)}. Expected "aws-lambda" or "cloudflare-pages".`,
          );
        }
      } else if (command === "dev") {
        const loaded =
          routeArg === undefined
            ? await loadMreactRouterViteConfigDetails({ command: "serve", cwd: process.cwd() })
            : {
                project: { appDir: resolve(routeArg) },
                serverPort: undefined,
                viteConfig: undefined,
              };
        const server = await startDevServer({
          ...loaded.project,
          hostname: resolveCliHost(parsed.host, process.env),
          logger,
          port: resolveCliDevPort(parsed.port, process.env, loaded.serverPort),
          viteConfig: loaded.viteConfig,
        });
        console.log(`mreact app router ready at ${server.url}`);
      } else if (command === "start") {
        const server = await startServer({
          allowedHosts: resolveCliAllowedHosts(parsed.allowedHosts, process.env),
          hostPolicy: resolveCliHostPolicy(parsed.hostPolicy, process.env),
          hostname: resolveCliHost(parsed.host, process.env),
          logger,
          outDir: resolve(routeArg ?? ".mreact"),
          port: Number(process.env.PORT ?? 3001),
        });
        console.log(`mreact app router serving built output at ${server.url}`);
      } else {
        console.error(`Unknown command: ${command}`);
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function readRouterCliVersion(): Promise<string> {
  try {
    const source = await readFile(new URL("../package.json", import.meta.url), "utf8");
    const json = JSON.parse(source) as { version?: unknown };

    return typeof json.version === "string" ? json.version : "unknown";
  } catch {
    return "unknown";
  }
}

function formatCliBuildTarget(target: CliBuildTarget | undefined): string {
  return target ?? "default";
}

function updateBuildProgressLog(
  event: BuildAppProgressEvent,
  activePhase: BuildAppPhase | undefined,
): BuildAppPhase | undefined {
  if (event.kind === "routes-discovered") {
    console.log(`Routes: ${event.count} discovered`);
    return activePhase;
  }

  if (event.kind !== "phase-start") {
    return activePhase;
  }

  const message = buildPhaseProgressMessage(event.phase);
  if (message !== undefined) {
    console.log(message);
  }

  return event.phase;
}

function buildPhaseProgressMessage(phase: BuildAppPhase): string | undefined {
  switch (phase) {
    case "scan":
      return "Routes: discovering...";
    case "serverModules":
      return "Server: building...";
    case "clientBundles":
      return "Client: building...";
    case "writeManifests":
      return "Artifacts: writing...";
    default:
      return undefined;
  }
}

function formatBuildPhaseFailureLabel(phase: BuildAppPhase): string {
  switch (phase) {
    case "scan":
      return "route discovery";
    case "collectFiles":
      return "source file collection";
    case "analyzeSources":
      return "source analysis";
    case "validate":
      return "production route validation";
    case "prepareOutput":
      return "output preparation";
    case "publicAssets":
      return "public asset collection";
    case "serverActionManifest":
      return "server action manifest generation";
    case "serverModules":
      return "server output build";
    case "importPolicy":
      return "import policy generation";
    case "serverModuleArtifacts":
      return "server artifact writing";
    case "clientBundles":
      return "client output build";
    case "navigationRuntime":
      return "navigation runtime build";
    case "prerender":
      return "static prerender";
    case "cloudflare":
      return "Cloudflare artifact generation";
    case "writeManifests":
      return "manifest writing";
    case "adapterArtifacts":
      return "adapter artifact writing";
  }
}

function formatDurationSeconds(ms: number): string {
  const seconds = ms / 1000;

  if (seconds < 10) {
    return `${Math.round(seconds * 10) / 10}s`;
  }

  return `${Math.round(seconds)}s`;
}
