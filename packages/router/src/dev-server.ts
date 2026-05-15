import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { resolve } from "node:path";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import type { AppRouterServerActionOptions } from "./actions.js";
import { createMemoryRouteCache, type AppRouterCache } from "./cache.js";
import {
  resolveAppRouterProjectOptions,
  type AppRouterProjectOptions,
} from "./config.js";
import type { AppRouterImportPolicy } from "./import-policy.js";
import { createAppRouterVitePlugin } from "./vite.js";
import { loadMreactRouterViteConfig } from "./vite-config.js";

export interface StartDevServerOptions extends AppRouterProjectOptions {
  port: number;
  hostname?: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
}

export async function startDevServer(
  options: StartDevServerOptions,
): Promise<{ close(): Promise<void>; url: string }> {
  const hostname = options.hostname ?? "127.0.0.1";
  const project = await resolveStartDevServerProject(options);
  const routeCache = options.routeCache ?? createMemoryRouteCache();
  let vite: ViteDevServer | undefined;
  const server = createServer((incoming, outgoing) => {
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
        importPolicy: options.importPolicy,
        routeCache,
        serverActions: options.serverActions,
      }),
    ],
  });

  await new Promise<void>((resolve) =>
    server.listen(options.port, hostname, resolve),
  );
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;

  return {
    url: `http://${hostname}:${port}`,
    close: async () => {
      await vite?.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function resolveStartDevServerProject(
  options: StartDevServerOptions,
) {
  if (options.appDir !== undefined || options.routesDir !== undefined) {
    return resolveAppRouterProjectOptions(options);
  }

  const config = await loadOptionalMreactRouterViteConfig(
    resolve(options.projectRoot ?? process.cwd()),
  );

  return resolveAppRouterProjectOptions({
    ...config,
    ...definedProjectOptions(options),
  });
}

async function loadOptionalMreactRouterViteConfig(cwd: string) {
  try {
    return await loadMreactRouterViteConfig({
      command: "serve",
      cwd,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("vite.config.ts is required")
    ) {
      return undefined;
    }

    throw error;
  }
}

function definedProjectOptions(options: StartDevServerOptions): AppRouterProjectOptions {
  return {
    ...(options.allowedSourceDirs === undefined ? {} : { allowedSourceDirs: options.allowedSourceDirs }),
    ...(options.appDir === undefined ? {} : { appDir: options.appDir }),
    ...(options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot }),
    ...(options.publicDir === undefined ? {} : { publicDir: options.publicDir }),
    ...(options.routesDir === undefined ? {} : { routesDir: options.routesDir }),
  };
}

function sendDevServerError(
  outgoing: ServerResponse,
  error: unknown,
): void {
  outgoing.statusCode = 500;
  outgoing.setHeader("content-type", "text/plain; charset=utf-8");
  outgoing.end(error instanceof Error ? error.stack : String(error));
}
