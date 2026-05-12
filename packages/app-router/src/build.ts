import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

  await mkdir(serverDir, { recursive: true });
  await mkdir(clientDir, { recursive: true });
  await writeFile(join(serverDir, "manifest.json"), JSON.stringify({ routes }, null, 2));
  await writeFile(
    join(clientDir, "manifest.json"),
    JSON.stringify(
      { routes: await Promise.all(routes.map(routeToClientManifestEntry)) },
      null,
      2,
    ),
  );

  return { routes };
}

async function routeToClientManifestEntry(
  route: AppRoute,
): Promise<Record<string, unknown>> {
  if (route.kind === "server") {
    return { path: route.path, kind: route.kind, client: false };
  }

  const code = await readFile(route.file, "utf8");

  return {
    path: route.path,
    kind: route.kind,
    client:
      /\bon[A-Z][A-Za-z0-9_]*=|\bcell\s*\(|\bwindow\b|\bdocument\b|\blocalStorage\b/.test(
        code,
      ),
  };
}
