import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { createNativeRouteMatcher } from "./native-route-matcher.js";
import {
  appFileConventionForRootFilename,
  type AppFileConvention,
} from "./file-conventions.js";

/**
 * Configures app route discovery from a routes directory.
 */
export interface ScanAppRoutesOptions {
  appDir: string;
}

/**
 * Represents any route discovered by the app-router file-system scanner.
 */
export type AppRoute = AppAssetRoute | AppMetadataRoute | PageRoute | ServerRoute;

/**
 * Describes a page route that renders a component.
 */
export interface PageRoute {
  kind: "page";
  path: string;
  file: string;
  segments: RouteSegment[];
}

/**
 * Describes a server route that handles HTTP methods directly.
 */
export interface ServerRoute {
  kind: "server";
  path: string;
  file: string;
  segments: RouteSegment[];
}

/**
 * Describes a generated metadata route such as robots or sitemap.
 */
export interface AppMetadataRoute {
  convention: AppFileConvention;
  kind: "metadata";
  path: string;
  file: string;
  segments: RouteSegment[];
}

/**
 * Describes a static asset route produced from an app file convention.
 */
export interface AppAssetRoute {
  convention: AppFileConvention;
  kind: "asset";
  path: string;
  file: string;
  segments: RouteSegment[];
}

/**
 * Represents a static, dynamic, or catch-all segment in an app route path.
 */
export type RouteSegment =
  | { kind: "static"; value: string }
  | { kind: "dynamic"; name: string }
  | { kind: "catch-all"; name: string };

/**
 * Holds the route and params selected for a request pathname.
 */
export interface MatchedRoute {
  route: AppRoute;
  params: Record<string, readonly string[] | string>;
}

export interface RouteMatcher {
  match(pathname: string): MatchedRoute | undefined;
}

export type CompiledRouteMatcherSegment =
  | { kind: "static"; value: string }
  | { kind: "dynamic"; name: string }
  | { kind: "catch-all"; name: string };

export interface CompiledRouteMatcherEntry {
  catchAllIndex: number;
  exactLength?: number;
  minimumLength: number;
  routeIndex: number;
  segments: readonly CompiledRouteMatcherSegment[];
  suffixLength?: number;
}

export interface CompiledRouteMatcherArtifact {
  routes: readonly CompiledRouteMatcherEntry[];
  version: 1;
}

/**
 * Scans an app directory and returns sorted app-router route definitions.
 */
export async function scanAppRoutes(
  options: ScanAppRoutesOptions,
): Promise<AppRoute[]> {
  const files = await collectRouteFiles(options.appDir);

  return files
    .map((file): AppRoute => {
      const relativeFile = relative(options.appDir, file);
      const convention = appFileConventionForRelativeFile(relativeFile);
      if (convention !== undefined) {
        return {
          convention: convention.convention,
          file,
          kind: convention.kind,
          path: convention.path,
          segments: segmentsFromPath(convention.path),
        };
      }

      const kind = relativeFile.endsWith("route.ts") ? "server" : "page";
      const routePath = routePathFromRelativeFile(relativeFile);
      const segments = segmentsFromPath(routePath);

      return { kind, path: routePath, file, segments };
    })
    .sort(compareRouteListEntries);
}

/**
 * Matches a request pathname against a route list.
 */
export function matchRoute(
  routes: readonly AppRoute[],
  pathname: string,
): MatchedRoute | undefined {
  return createRouteMatcher(routes).match(pathname);
}

export function compileRouteMatcherArtifact(
  routes: readonly AppRoute[],
): CompiledRouteMatcherArtifact {
  const sortedRoutes = routes
    .map((route, routeIndex) => ({ route, routeIndex }))
    .sort((left, right) => compareRoutes(left.route, right.route));

  return {
    version: 1,
    routes: sortedRoutes.map(({ route, routeIndex }) =>
      compileRouteMatcherEntry(route, routeIndex),
    ),
  };
}

export function createRouteMatcher(
  routes: readonly AppRoute[],
  artifact?: CompiledRouteMatcherArtifact | undefined,
): RouteMatcher {
  if (artifact?.version === 1) {
    return {
      match(pathname) {
        return matchCompiledRoutes(routes, artifact, pathname);
      },
    };
  }

  const sortedRoutes = [...routes].sort(compareRoutes);
  const nativeMatcher = createNativeRouteMatcher(sortedRoutes);

  if (nativeMatcher !== undefined) {
    return nativeMatcher;
  }

  return {
    match(pathname) {
      return matchSortedRoutes(sortedRoutes, pathname);
    },
  };
}

function compileRouteMatcherEntry(
  route: AppRoute,
  routeIndex: number,
): CompiledRouteMatcherEntry {
  const catchAllIndex = route.segments.findIndex((segment) => segment.kind === "catch-all");
  const shared = {
    catchAllIndex,
    minimumLength: catchAllIndex === -1 ? route.segments.length : catchAllIndex + 1,
    routeIndex,
    segments: route.segments.map((segment) => ({ ...segment })),
  };

  return catchAllIndex === -1
    ? {
        ...shared,
        exactLength: route.segments.length,
      }
    : {
        ...shared,
        suffixLength: route.segments.length - catchAllIndex - 1,
      };
}

function matchCompiledRoutes(
  routes: readonly AppRoute[],
  artifact: CompiledRouteMatcherArtifact,
  pathname: string,
): MatchedRoute | undefined {
  const normalized = normalizePath(pathname);
  const pathnameSegments = normalized === "/" ? [] : normalized.slice(1).split("/");

  for (const compiledRoute of artifact.routes) {
    const route = routes[compiledRoute.routeIndex];
    if (route === undefined) {
      continue;
    }

    if (
      compiledRoute.exactLength !== undefined &&
      compiledRoute.exactLength !== pathnameSegments.length
    ) {
      continue;
    }

    if (pathnameSegments.length < compiledRoute.minimumLength) {
      continue;
    }

    const params: Record<string, readonly string[] | string> = {};
    let matched = true;

    for (const [index, segment] of compiledRoute.segments.entries()) {
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
        const decoded = safeDecodeURIComponent(value);
        if (decoded === undefined) {
          matched = false;
          break;
        }
        params[segment.name] = decoded;
      }

      if (segment.kind === "catch-all") {
        const suffixLength = compiledRoute.suffixLength ?? 0;
        const catchAllEnd = pathnameSegments.length - suffixLength;

        if (catchAllEnd <= index) {
          matched = false;
          break;
        }

        const decodedParts: string[] = [];
        for (let partIndex = index; partIndex < catchAllEnd; partIndex += 1) {
          const decoded = safeDecodeURIComponent(pathnameSegments[partIndex] ?? "");
          if (decoded === undefined) {
            matched = false;
            break;
          }
          decodedParts.push(decoded);
        }
        if (!matched) {
          break;
        }
        params[segment.name] = decodedParts;

        for (let suffixIndex = 0; suffixIndex < suffixLength; suffixIndex += 1) {
          const suffixSegment = compiledRoute.segments[index + 1 + suffixIndex];
          const suffixValue = pathnameSegments[catchAllEnd + suffixIndex];

          if (suffixSegment === undefined || suffixValue === undefined) {
            matched = false;
            break;
          }

          if (suffixSegment.kind === "static" && suffixSegment.value !== suffixValue) {
            matched = false;
            break;
          }

          if (suffixSegment.kind === "dynamic") {
            const decoded = safeDecodeURIComponent(suffixValue);
            if (decoded === undefined) {
              matched = false;
              break;
            }
            params[suffixSegment.name] = decoded;
          }

          if (suffixSegment.kind === "catch-all") {
            matched = false;
            break;
          }
        }

        break;
      }
    }

    if (matched) {
      return { route, params };
    }
  }

  return undefined;
}

function matchSortedRoutes(
  routes: readonly AppRoute[],
  pathname: string,
): MatchedRoute | undefined {
  const normalized = normalizePath(pathname);
  const pathnameSegments = normalized === "/" ? [] : normalized.slice(1).split("/");

  for (const route of routes) {
    const catchAllIndex = route.segments.findIndex(
      (segment) => segment.kind === "catch-all",
    );

    if (catchAllIndex === -1 && route.segments.length !== pathnameSegments.length) {
      continue;
    }

    if (catchAllIndex !== -1 && pathnameSegments.length < catchAllIndex + 1) {
      continue;
    }

    const params: Record<string, readonly string[] | string> = {};
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
        const decoded = safeDecodeURIComponent(value);
        if (decoded === undefined) {
          // Malformed percent-encoding -- treat as non-match rather than
          // letting URIError escape and produce a 500 (Issue 072).
          matched = false;
          break;
        }
        params[segment.name] = decoded;
      }

      if (segment.kind === "catch-all") {
        const suffixSegments = route.segments.slice(index + 1);
        const catchAllEnd = pathnameSegments.length - suffixSegments.length;

        if (catchAllEnd <= index) {
          matched = false;
          break;
        }

        const decodedParts: string[] = [];
        let decodeOk = true;
        for (const part of pathnameSegments.slice(index, catchAllEnd)) {
          const decoded = safeDecodeURIComponent(part);
          if (decoded === undefined) {
            decodeOk = false;
            break;
          }
          decodedParts.push(decoded);
        }
        if (!decodeOk) {
          matched = false;
          break;
        }
        params[segment.name] = decodedParts;

        for (let suffixIndex = 0; suffixIndex < suffixSegments.length; suffixIndex += 1) {
          const suffixSegment = suffixSegments[suffixIndex];
          const suffixValue = pathnameSegments[catchAllEnd + suffixIndex];

          if (suffixSegment === undefined || suffixValue === undefined) {
            matched = false;
            break;
          }

          if (suffixSegment.kind === "static" && suffixSegment.value !== suffixValue) {
            matched = false;
            break;
          }

          if (suffixSegment.kind === "dynamic") {
            const decoded = safeDecodeURIComponent(suffixValue);
            if (decoded === undefined) {
              matched = false;
              break;
            }
            params[suffixSegment.name] = decoded;
          }

          if (suffixSegment.kind === "catch-all") {
            matched = false;
            break;
          }
        }

        break;
      }
    }

    if (matched) {
      return { route, params };
    }
  }

  return undefined;
}

// Issue 072: attacker-supplied path segments / cookie values can include
// malformed percent escapes (e.g. `%ZZ`, `%E0`). Catch the URIError so a
// single bad byte cannot turn every request into a 500 + stack-leaking
// response.
export function safeDecodeURIComponent(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

async function collectRouteFiles(directory: string, rootDirectory = directory): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (shouldSkipRouteScanDirectory(entry.name)) {
        continue;
      }

      files.push(...(await collectRouteFiles(path, rootDirectory)));
      continue;
    }

    if (
      entry.isFile() &&
      (entry.name === "page.tsx" ||
        entry.name === "page.mreact.tsx" ||
        entry.name === "route.ts" ||
        appFileConventionForRelativeFile(relative(rootDirectory, path)) !== undefined)
    ) {
      files.push(path);
    }
  }

  return files;
}

function shouldSkipRouteScanDirectory(name: string): boolean {
  return name === ".vite" || name === "__tests__" || name === "node_modules";
}

function appFileConventionForRelativeFile(
  relativeFile: string,
): ReturnType<typeof appFileConventionForRootFilename> {
  const parts = relativeFile.split(sep);
  const filename = parts.at(-1);

  if (filename === undefined) {
    return undefined;
  }

  const convention = appFileConventionForRootFilename(filename);

  if (convention === undefined) {
    return undefined;
  }

  if (parts.length === 1) {
    return convention;
  }

  if (convention.kind !== "metadata" || convention.convention !== "opengraph-image") {
    return undefined;
  }

  const routeParts = parts
    .slice(0, -1)
    .filter((part) => !isRouteGroup(part))
    .map((part) => (part.startsWith("$") ? `:${part.slice(1)}` : part));
  const conventionPath = convention.path.startsWith("/")
    ? convention.path.slice(1)
    : convention.path;

  return {
    ...convention,
    path: normalizePath(`/${[...routeParts, conventionPath].join("/")}`),
  };
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
