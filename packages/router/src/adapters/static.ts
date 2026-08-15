import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { BuiltPrerenderedRoute, BuiltServerManifest } from "../build.js";
import {
  isCurrentPrerenderedRoute,
  validatedPrerenderedNavigationHtml,
} from "../prerender-entry.js";

const staticNavigationBase = "/_mreact/navigation";
const staticNavigationMetadata = `<meta name="mreact-static-navigation" content="${staticNavigationBase}">`;

/**
 * Configures static export from a built app-router output directory.
 */
export interface StaticExportOptions {
  exportDir: string;
  outDir: string;
  paths?: readonly string[] | undefined;
}

/**
 * Lists the routes written by a static app-router export.
 */
export interface StaticExportResult {
  routes: string[];
}

/**
 * Exports prerendered app-router routes and client assets to a static filesystem directory.
 *
 * Only routes present in the built prerender manifest can be exported; the export directory is removed and recreated, and route paths are checked to prevent traversal outside it.
 */
export async function exportStaticApp(options: StaticExportOptions): Promise<StaticExportResult> {
  const manifest = JSON.parse(
    await readFile(join(options.outDir, "server", "manifest.json"), "utf8"),
  ) as BuiltServerManifest;
  const clientManifest = JSON.parse(
    await readFile(join(options.outDir, "client", "manifest.json"), "utf8"),
  ) as { publicAssets?: readonly string[] };
  const prerenderedRoutes = manifest.prerenderedRoutes ?? {};
  const routes = [...(options.paths ?? Object.keys(prerenderedRoutes))].sort();
  const entries = routes.map((route): readonly [string, BuiltPrerenderedRoute] => {
    routeToHtmlFile(options.exportDir, route);
    const entry = prerenderedRoutes[route];

    if (entry === undefined) {
      throw new Error(`Cannot export non-prerendered route: ${route}`);
    }

    if (!isCurrentPrerenderedRoute(entry)) {
      throw new Error(`Cannot export invalid prerendered route: ${route}`);
    }

    if (entry.status < 200 || entry.status >= 300) {
      throw new Error(`Cannot export route ${route} with status ${entry.status}.`);
    }

    return [route, entry];
  });

  await rm(options.exportDir, { force: true, recursive: true });
  await mkdir(options.exportDir, { recursive: true });

  for (const [route, entry] of entries) {
    await writePrerenderedRoute(options.exportDir, route, entry);
  }

  await cp(join(options.outDir, "client"), join(options.exportDir, "_mreact", "client"), {
    recursive: true,
  });
  await copyPublicAssetsToExportRoot(
    join(options.outDir, "client"),
    options.exportDir,
    clientManifest.publicAssets ?? [],
  );

  return { routes };
}

async function copyPublicAssetsToExportRoot(
  clientDir: string,
  exportDir: string,
  publicAssets: readonly string[],
): Promise<void> {
  for (const asset of publicAssets) {
    if (
      !asset.startsWith("/") ||
      asset.startsWith("//") ||
      asset.includes("..") ||
      asset === "/_mreact" ||
      asset.startsWith("/_mreact/")
    ) {
      continue;
    }

    const relativeAsset = asset.slice(1);
    const destination = join(exportDir, relativeAsset);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(clientDir, relativeAsset), destination, { recursive: true });
  }
}

async function writePrerenderedRoute(
  exportDir: string,
  route: string,
  entry: BuiltPrerenderedRoute,
): Promise<void> {
  if (entry.status < 200 || entry.status >= 300) {
    throw new Error(`Cannot export route ${route} with status ${entry.status}.`);
  }

  const file = routeToHtmlFile(exportDir, route);
  const navigationHtml = validatedPrerenderedNavigationHtml(entry);
  if (navigationHtml === undefined) {
    throw new Error(`Cannot export route ${route} without a valid navigation variant.`);
  }
  const navigationFile = routeToHtmlFile(join(exportDir, staticNavigationBase), route);
  await mkdir(dirname(file), { recursive: true });
  await mkdir(dirname(navigationFile), { recursive: true });
  await writeFile(file, withStaticNavigationMetadata(entry.html));
  await writeFile(navigationFile, navigationHtml);
}

function withStaticNavigationMetadata(html: string): string {
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  if (head?.index !== undefined) {
    const insertion = head.index + head[0].length;
    return `${html.slice(0, insertion)}${staticNavigationMetadata}${html.slice(insertion)}`;
  }

  const doctype = /^\s*<!doctype\s+html\s*>/i.exec(html);
  if (doctype !== null) {
    const insertion = doctype[0].length;
    return `${html.slice(0, insertion)}${staticNavigationMetadata}${html.slice(insertion)}`;
  }

  return `${staticNavigationMetadata}${html}`;
}

function routeToHtmlFile(exportDir: string, route: string): string {
  const pathname = route.split("?")[0] ?? "/";
  const normalized = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const relativeFile = normalized === "" ? "index.html" : join(normalized, "index.html");
  const root = resolve(exportDir);
  const file = resolve(root, relativeFile);

  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    throw new Error(`unsafe static export route: ${route}`);
  }

  return file;
}
