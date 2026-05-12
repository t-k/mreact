import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export interface ScanAppRoutesOptions {
  appDir: string;
}

export type AppRoute = PageRoute | ServerRoute;

export interface PageRoute {
  kind: "page";
  path: string;
  file: string;
  segments: RouteSegment[];
}

export interface ServerRoute {
  kind: "server";
  path: string;
  file: string;
  segments: RouteSegment[];
}

export type RouteSegment =
  | { kind: "static"; value: string }
  | { kind: "dynamic"; name: string }
  | { kind: "catch-all"; name: string };

export interface MatchedRoute {
  route: AppRoute;
  params: Record<string, string>;
}

export async function scanAppRoutes(
  options: ScanAppRoutesOptions,
): Promise<AppRoute[]> {
  const files = await collectRouteFiles(options.appDir);

  return files
    .map((file): AppRoute => {
      const relativeFile = relative(options.appDir, file);
      const kind = relativeFile.endsWith("route.ts") ? "server" : "page";
      const routePath = routePathFromRelativeFile(relativeFile);
      const segments = segmentsFromPath(routePath);

      return { kind, path: routePath, file, segments };
    })
    .sort(compareRouteListEntries);
}

export function matchRoute(
  routes: readonly AppRoute[],
  pathname: string,
): MatchedRoute | undefined {
  const normalized = normalizePath(pathname);
  const pathnameSegments = normalized === "/" ? [] : normalized.slice(1).split("/");

  for (const route of [...routes].sort(compareRoutes)) {
    const catchAllIndex = route.segments.findIndex(
      (segment) => segment.kind === "catch-all",
    );

    if (catchAllIndex === -1 && route.segments.length !== pathnameSegments.length) {
      continue;
    }

    if (catchAllIndex !== -1 && pathnameSegments.length < catchAllIndex + 1) {
      continue;
    }

    const params: Record<string, string> = {};
    let matched = true;

    for (const [index, segment] of route.segments.entries()) {
      const value = pathnameSegments[index];

      if (value === undefined) {
        matched = false;
        break;
      }

      if (segment.kind === "static" && segment.value !== value) {
        matched = false;
        break;
      }

      if (segment.kind === "dynamic") {
        params[segment.name] = decodeURIComponent(value);
      }

      if (segment.kind === "catch-all") {
        params[segment.name] = pathnameSegments
          .slice(index)
          .map((part) => decodeURIComponent(part))
          .join("/");
        break;
      }
    }

    if (matched) {
      return { route, params };
    }
  }

  return undefined;
}

async function collectRouteFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectRouteFiles(path)));
      continue;
    }

    if (
      entry.isFile() &&
      (entry.name === "page.tsx" || entry.name === "page.mreact.tsx" || entry.name === "route.ts")
    ) {
      files.push(path);
    }
  }

  return files;
}

function routePathFromRelativeFile(relativeFile: string): string {
  const parts = relativeFile.split(sep);
  const routeParts = parts
    .slice(0, -1)
    .filter((part) => !isRouteGroup(part))
    .map((part) => (part.startsWith("$") ? `:${part.slice(1)}` : part));

  return normalizePath(`/${routeParts.join("/")}`);
}

function segmentsFromPath(path: string): RouteSegment[] {
  return path === "/"
    ? []
    : path
        .slice(1)
        .split("/")
        .map((part) =>
          part.startsWith(":...")
            ? { kind: "catch-all", name: part.slice(4) }
            : part.startsWith(":")
              ? { kind: "dynamic", name: part.slice(1) }
              : { kind: "static", value: part },
        );
}

function normalizePath(path: string): string {
  const withoutTrailing = path.length > 1 ? path.replace(/\/+$/, "") : path;

  return withoutTrailing === "" ? "/" : withoutTrailing;
}

function isRouteGroup(part: string): boolean {
  return part.startsWith("(") && part.endsWith(")");
}

function compareRoutes(a: AppRoute, b: AppRoute): number {
  const scoreDelta = routeScore(b) - routeScore(a);

  return scoreDelta === 0 ? a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind) : scoreDelta;
}

function compareRouteListEntries(a: AppRoute, b: AppRoute): number {
  return routeListKey(a.path).localeCompare(routeListKey(b.path)) ||
    a.kind.localeCompare(b.kind);
}

function routeListKey(path: string): string {
  return path === "/"
    ? ""
    : path.replaceAll("/:...", "/zzzz-catch-all-").replaceAll("/:", "/zzzz-dynamic-");
}

function routeScore(route: AppRoute): number {
  return route.segments.reduce((score, segment) => {
    if (segment.kind === "static") {
      return score + 100;
    }

    if (segment.kind === "dynamic") {
      return score + 10;
    }

    return score;
  }, route.segments.length);
}
