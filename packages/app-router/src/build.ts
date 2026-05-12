import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildClientRouteBundle,
  clientScriptForPath,
  isClientRouteSource,
  routeToClientManifestEntry,
} from "./client.js";
import { scanAppRoutes } from "./routes.js";
import type { AppRoute } from "./routes.js";

export interface BuildAppOptions {
  appDir: string;
  outDir: string;
}

export interface BuildAppResult {
  routes: AppRoute[];
}

export async function buildApp(options: BuildAppOptions): Promise<BuildAppResult> {
  const routes = await scanAppRoutes({ appDir: options.appDir });
  const serverDir = join(options.outDir, "server");
  const clientDir = join(options.outDir, "client");
  const serverAppDir = join(serverDir, "app");

  await rm(options.outDir, { force: true, recursive: true });
  await mkdir(serverDir, { recursive: true });
  await mkdir(clientDir, { recursive: true });
  await mkdir(join(clientDir, "routes"), { recursive: true });
  await cp(options.appDir, serverAppDir, { recursive: true });
  const serverRoutes = await scanAppRoutes({ appDir: serverAppDir });

  await writeFile(join(serverDir, "manifest.json"), JSON.stringify({ routes: serverRoutes }, null, 2));
  await Promise.all(serverRoutes.map((route) => writeClientRouteBundle(route, clientDir)));
  await writeFile(
    join(clientDir, "manifest.json"),
    JSON.stringify(
      { routes: await Promise.all(serverRoutes.map(routeToClientManifestEntry)) },
      null,
      2,
    ),
  );

  return { routes };
}

async function writeClientRouteBundle(route: AppRoute, clientDir: string): Promise<void> {
  if (route.kind !== "page") {
    return;
  }

  const code = await readFile(route.file, "utf8");

  if (!isClientRouteSource(code)) {
    return;
  }

  const bundle = await buildClientRouteBundle({
    code,
    filename: route.file,
    routePath: route.path,
  });

  await writeFile(join(clientDir, clientScriptForPath(route.path)), bundle);
}
