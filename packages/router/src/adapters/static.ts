import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BuiltPrerenderedRoute, BuiltServerManifest } from "../build.js";

export interface StaticExportOptions {
  exportDir: string;
  outDir: string;
  paths?: readonly string[] | undefined;
}

export interface StaticExportResult {
  routes: string[];
}

export async function exportStaticApp(options: StaticExportOptions): Promise<StaticExportResult> {
  const manifest = JSON.parse(
    await readFile(join(options.outDir, "server", "manifest.json"), "utf8"),
  ) as BuiltServerManifest;
  const prerenderedRoutes = manifest.prerenderedRoutes ?? {};
  const routes = [...(options.paths ?? Object.keys(prerenderedRoutes))].sort();

  await rm(options.exportDir, { force: true, recursive: true });
  await mkdir(options.exportDir, { recursive: true });

  for (const route of routes) {
    const entry = prerenderedRoutes[route];

    if (entry === undefined) {
      throw new Error(`Cannot export non-prerendered route: ${route}`);
    }

    await writePrerenderedRoute(options.exportDir, route, entry);
  }

  await cp(join(options.outDir, "client"), join(options.exportDir, "_mreact", "client"), {
    recursive: true,
  });

  return { routes };
}

async function writePrerenderedRoute(
  exportDir: string,
  route: string,
  entry: BuiltPrerenderedRoute,
): Promise<void> {
  if (entry.status < 200 || entry.status >= 300) {
    throw new Error(`Cannot export route ${route} with status ${entry.status}.`);
  }

  const file = join(exportDir, routeToHtmlFile(route));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, entry.html);
}

function routeToHtmlFile(route: string): string {
  const pathname = route.split("?")[0] ?? "/";
  const normalized = pathname.startsWith("/") ? pathname.slice(1) : pathname;

  return normalized === "" ? "index.html" : join(normalized, "index.html");
}
