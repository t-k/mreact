import { createServer, type Server } from "node:http";
import type { ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer as createViteServer, type UserConfig, type ViteDevServer } from "vite";
import type { AppRouterServerActionOptions } from "./actions.js";
import { createMemoryRouteCache, type AppRouterCache } from "./cache.js";
import { resolveAppRouterProjectOptions, type AppRouterProjectOptions } from "./config.js";
import type { AppRouterImportPolicy } from "./import-policy.js";
import { createAppRouterVitePlugin } from "./vite.js";
import {
  loadMreactRouterViteConfigDetails,
  type LoadedMreactRouterViteConfig,
} from "./vite-config.js";
import {
  emitRouterLog,
  logDurationMs,
  logNow,
  nodeRequestPath,
  type AppRouterLogger,
} from "./logger.js";
import type { HttpUpgradeHandler } from "./upgrade.js";

/**
 * Configures the Vite-powered app-router development server.
 */
export interface StartDevServerOptions extends AppRouterProjectOptions {
  port?: number | undefined;
  hostname?: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  logger?: AppRouterLogger | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
  verboseErrors?: boolean | undefined;
  viteConfig?: UserConfig | undefined;
  onUpgrade?: HttpUpgradeHandler | undefined;
}

/**
 * Starts the local app-router development server with Vite middleware and route compilation.
 *
 * The server trusts only the configured host settings, merges declared application packages into the development import policy, and returns a `close()` method that should be awaited by tests and scripts.
 */
export async function startDevServer(
  options: StartDevServerOptions,
): Promise<{ close(): Promise<void>; server: Server; url: string }> {
  const hostname = options.hostname ?? "127.0.0.1";
  const resolved = await resolveStartDevServerProject(options);
  const project = resolved.project;
  const userViteConfig = options.viteConfig ?? resolved.viteConfig ?? {};
  const userViteServerConfig =
    typeof userViteConfig.server === "object" ? userViteConfig.server : {};
  const userHmrConfig =
    typeof userViteServerConfig.hmr === "object" ? userViteServerConfig.hmr : {};
  const port = options.port ?? resolved.serverPort ?? 3001;
  const routeCache = options.routeCache ?? createMemoryRouteCache();
  const declaredPackages = await readDeclaredProjectPackages(project.projectRoot);
  const configImportPolicy = resolved.importPolicy;
  const importPolicy: AppRouterImportPolicy = {
    ...configImportPolicy,
    ...options.importPolicy,
    allowedPackages: [
      ...new Set([
        ...declaredPackages,
        ...(configImportPolicy?.allowedPackages ?? []),
        ...(options.importPolicy?.allowedPackages ?? []),
      ]),
    ],
  };
  let vite: ViteDevServer | undefined;
  const server = createServer((incoming, outgoing) => {
    const logger = options.logger;
    const startedAt = logger === undefined ? undefined : logNow();
    const logFields =
      logger === undefined
        ? undefined
        : {
            method: incoming.method ?? "GET",
            path: nodeRequestPath(incoming.url),
            runtime: "node" as const,
          };

    if (logger !== undefined && logFields !== undefined && startedAt !== undefined) {
      emitRouterLog(logger, "info", {
        ...logFields,
        type: "router:request:start",
      });
      outgoing.once("finish", () => {
        emitRouterLog(logger, "info", {
          ...logFields,
          durationMs: logDurationMs(startedAt),
          status: outgoing.statusCode,
          type: "router:request:end",
        });
      });
    }

    if (vite === undefined) {
      sendDevServerError(outgoing, new Error("Vite dev server is not initialized."), options);
      return;
    }

    vite.middlewares(incoming, outgoing, (error?: unknown) => {
      if (error !== undefined) {
        if (error instanceof Error) {
          vite?.ssrFixStacktrace(error);
        }
        sendDevServerError(outgoing, error, options);
        return;
      }

      outgoing.statusCode = 404;
      outgoing.setHeader("content-type", "text/plain; charset=utf-8");
      outgoing.end("Not Found");
    });
  });

  if (options.onUpgrade !== undefined) {
    server.on("upgrade", options.onUpgrade);
  }

  vite = await createViteServer({
    ...userViteConfig,
    appType: "custom",
    configFile: false,
    root: project.projectRoot,
    server: {
      ...userViteServerConfig,
      hmr: { ...userHmrConfig, server },
      middlewareMode: true,
    },
    plugins: [
      ...(userViteConfig.plugins ?? []),
      createAppRouterVitePlugin({
        allowedSourceDirs: project.allowedSourceDirs,
        projectRoot: project.projectRoot,
        publicDir: project.publicDir,
        routesDir: project.routesDir,
        importPolicy,
        logger: options.logger,
        routeCache,
        serverActions: options.serverActions,
      }),
    ],
  });

  try {
    await listenDevHttpServer(server, port, hostname);
  } catch (error) {
    await vite.close();
    throw error;
  }
  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : port;

  return {
    server,
    url: `http://${hostname}:${actualPort}`,
    close: async () => {
      await vite?.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function listenDevHttpServer(server: Server, port: number, hostname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(formatDevListenError(error, hostname, port));
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, hostname);
  });
}

function formatDevListenError(error: Error, hostname: string, port: number): Error {
  if (isNodeErrorCode(error, "EADDRINUSE")) {
    return new Error(
      `mreact dev server could not start because ${hostname}:${port} is already in use. Stop the process using that port or run with PORT=<free-port>.`,
    );
  }

  return error;
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

async function resolveStartDevServerProject(options: StartDevServerOptions): Promise<{
  project: ReturnType<typeof resolveAppRouterProjectOptions>;
  serverPort?: number | undefined;
  importPolicy?: LoadedMreactRouterViteConfig["importPolicy"];
  viteConfig?: LoadedMreactRouterViteConfig["viteConfig"];
}> {
  if (options.appDir !== undefined || options.routesDir !== undefined) {
    return { project: resolveAppRouterProjectOptions(options) };
  }

  const config = await loadOptionalMreactRouterViteConfig(
    resolve(options.projectRoot ?? process.cwd()),
  );

  return {
    ...(config?.importPolicy === undefined ? {} : { importPolicy: config.importPolicy }),
    project: resolveAppRouterProjectOptions({
      ...config?.project,
      ...definedProjectOptions(options),
    }),
    serverPort: config?.serverPort,
    viteConfig: config?.viteConfig,
  };
}

async function loadOptionalMreactRouterViteConfig(cwd: string) {
  try {
    return await loadMreactRouterViteConfigDetails({
      command: "serve",
      cwd,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("vite.config.ts is required")) {
      return undefined;
    }

    throw error;
  }
}

async function readDeclaredProjectPackages(projectRoot: string): Promise<string[]> {
  try {
    const json = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, unknown> | undefined;
      devDependencies?: Record<string, unknown> | undefined;
      optionalDependencies?: Record<string, unknown> | undefined;
      peerDependencies?: Record<string, unknown> | undefined;
    };

    return [
      ...Object.keys(json.dependencies ?? {}),
      ...Object.keys(json.devDependencies ?? {}),
      ...Object.keys(json.optionalDependencies ?? {}),
      ...Object.keys(json.peerDependencies ?? {}),
    ];
  } catch {
    return [];
  }
}

function definedProjectOptions(options: StartDevServerOptions): AppRouterProjectOptions {
  return {
    ...(options.allowedSourceDirs === undefined
      ? {}
      : { allowedSourceDirs: options.allowedSourceDirs }),
    ...(options.appDir === undefined ? {} : { appDir: options.appDir }),
    ...(options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot }),
    ...(options.publicDir === undefined ? {} : { publicDir: options.publicDir }),
    ...(options.routesDir === undefined ? {} : { routesDir: options.routesDir }),
  };
}

function sendDevServerError(
  outgoing: ServerResponse,
  error: unknown,
  options: Pick<StartDevServerOptions, "verboseErrors">,
): void {
  outgoing.statusCode = 500;
  outgoing.setHeader("content-type", "text/plain; charset=utf-8");
  outgoing.end(options.verboseErrors === true
    ? error instanceof Error ? error.stack : String(error)
    : "Internal Server Error");
}
