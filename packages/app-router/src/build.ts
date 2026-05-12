import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  buildClientRouteBundle,
  clientScriptForPath,
  isClientRouteSource,
  routeIdForPath,
  type ClientRouteManifestEntry,
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

export interface BuiltServerManifest {
  version: 1;
  files: Record<string, string>;
  routes: AppRoute[];
}

export async function buildApp(options: BuildAppOptions): Promise<BuildAppResult> {
  const routes = await scanAppRoutes({ appDir: options.appDir });
  const serverDir = join(options.outDir, "server");
  const clientDir = join(options.outDir, "client");

  await rm(options.outDir, { force: true, recursive: true });
  await mkdir(serverDir, { recursive: true });
  await mkdir(clientDir, { recursive: true });
  await mkdir(join(clientDir, "assets", "routes"), { recursive: true });

  const files = await collectBuildFiles(options.appDir);
  const serverRoutes = routes.map((route) => ({
    ...route,
    file: relative(options.appDir, route.file),
  }));
  const clientRoutes = await Promise.all(
    routes.map((route) => writeClientRouteBundle(route, clientDir)),
  );

  await writeFile(
    join(serverDir, "manifest.json"),
    JSON.stringify({ version: 1, routes: serverRoutes, files } satisfies BuiltServerManifest, null, 2),
  );
  await writeFile(
    join(clientDir, "manifest.json"),
    JSON.stringify({ routes: clientRoutes }, null, 2),
  );

  return { routes };
}

async function writeClientRouteBundle(
  route: AppRoute,
  clientDir: string,
): Promise<ClientRouteManifestEntry> {
  if (route.kind === "server") {
    return { path: route.path, kind: route.kind, client: false };
  }

  const code = await readFile(route.file, "utf8");

  if (!isClientRouteSource(code)) {
    return { path: route.path, kind: route.kind, client: false };
  }

  const bundle = await buildClientRouteBundle({
    code,
    filename: route.file,
    routePath: route.path,
  });

  const routeId = routeIdForPath(route.path);
  const hash = createHash("sha256").update(bundle).digest("hex").slice(0, 8);
  const script = `assets/routes/${routeId}.${hash}.js`;

  await mkdir(dirname(join(clientDir, script)), { recursive: true });
  await writeFile(join(clientDir, script), bundle);

  return {
    path: route.path,
    kind: route.kind,
    client: true,
    routeId,
    script,
    devScript: clientScriptForPath(route.path),
  };
}

async function collectBuildFiles(appDir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  for (const file of await collectFiles(appDir)) {
    files[relative(appDir, file)] = await readFile(file, "utf8");
  }

  return files;
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
      continue;
    }

    if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}
