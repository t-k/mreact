import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import type { AppRouterServerActionOptions } from "./actions.js";
import { createMemoryRouteCache, type AppRouterCache } from "./cache.js";
import { resolveAppRouterProjectOptions, type AppRouterProjectOptions } from "./config.js";
import type { AppRouterImportPolicy } from "./import-policy.js";
import { createAppRouterVitePlugin } from "./vite.js";
import { loadMreactRouterViteConfigDetails } from "./vite-config.js";
import {
  emitRouterLog,
  logDurationMs,
  logNow,
  nodeRequestPath,
  type AppRouterLogger,
} from "./logger.js";

export interface StartDevServerOptions extends AppRouterProjectOptions {
  port?: number | undefined;
  hostname?: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  logger?: AppRouterLogger | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
}

export async function startDevServer(
  options: StartDevServerOptions,
): Promise<{ close(): Promise<void>; url: string }> {
  const hostname = options.hostname ?? "127.0.0.1";
  const resolved = await resolveStartDevServerProject(options);
  const project = resolved.project;
  const port = options.port ?? resolved.serverPort ?? 3001;
  const routeCache = options.routeCache ?? createMemoryRouteCache();
  const declaredPackages = await readDeclaredProjectPackages(project.projectRoot);
  const importPolicy: AppRouterImportPolicy = {
    ...options.importPolicy,
    allowedPackages: [
      ...new Set([...declaredPackages, ...(options.importPolicy?.allowedPackages ?? [])]),
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
      sendDevServerError(outgoing, new Error("Vite dev server is not initialized."));
      return;
    }

    vite.middlewares(incoming, outgoing, (error?: unknown) => {
      if (error !== undefined) {
        if (error instanceof Error) {
          vite?.ssrFixStacktrace(error);
        }
        sendDevServerError(outgoing, error);
        return;
      }

      outgoing.statusCode = 404;
      outgoing.setHeader("content-type", "text/plain; charset=utf-8");
      outgoing.end("Not Found");
    });
  });

  vite = await createViteServer({
    appType: "custom",
    configFile: false,
    root: project.projectRoot,
    server: {
      hmr: { server },
      middlewareMode: true,
    },
    plugins: [
      createAppRouterVitePlugin({
        allowedSourceDirs: project.allowedSourceDirs,
        projectRoot: project.projectRoot,
        publicDir: project.publicDir,
        routesDir: project.routesDir,
        importPolicy,
        routeCache,
        serverActions: options.serverActions,
      }),
    ],
  });

  await new Promise<void>((resolve) => server.listen(port, hostname, resolve));
  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : port;

  return {
    url: `http://${hostname}:${actualPort}`,
    close: async () => {
      await vite?.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function resolveStartDevServerProject(options: StartDevServerOptions): Promise<{
  project: ReturnType<typeof resolveAppRouterProjectOptions>;
  serverPort?: number | undefined;
}> {
  if (options.appDir !== undefined || options.routesDir !== undefined) {
    return { project: resolveAppRouterProjectOptions(options) };
  }

  const config = await loadOptionalMreactRouterViteConfig(
    resolve(options.projectRoot ?? process.cwd()),
  );

  return {
    project: resolveAppRouterProjectOptions({
      ...config?.project,
      ...definedProjectOptions(options),
    }),
    serverPort: config?.serverPort,
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

function sendDevServerError(outgoing: ServerResponse, error: unknown): void {
  outgoing.statusCode = 500;
  outgoing.setHeader("content-type", "text/plain; charset=utf-8");
  outgoing.end(error instanceof Error ? error.stack : String(error));
}
