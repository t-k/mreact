import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppRoute, MatchedRoute, RouteMatcher } from "./routes.js";

interface NativeRouteMatcherInstance {
  matchRoute(pathname: string): NativeMatchOutput | null | undefined;
}

interface NativeRouteMatcherConstructor {
  new (routesJson: string): NativeRouteMatcherInstance;
}

interface NativeRouteMatcherModule {
  NativeRouteMatcher?: NativeRouteMatcherConstructor | undefined;
}

interface NativeMatchOutput {
  index: number;
  params: Record<string, string>;
}

let loadedNativeModule: NativeRouteMatcherModule | false | undefined;
const nativeRouteMatcherAutoThreshold = 100;

export function createNativeRouteMatcher(
  sortedRoutes: readonly AppRoute[],
): RouteMatcher | undefined {
  if (
    !shouldUseNativeRouteMatcher(
      sortedRoutes.length,
      process.env.MREACT_APP_ROUTER_NATIVE_ROUTE_MATCHER,
    )
  ) {
    return undefined;
  }

  const nativeModule = loadNativeRouteMatcherModule();
  const NativeRouteMatcher = nativeModule === false
    ? undefined
    : nativeModule.NativeRouteMatcher;

  if (NativeRouteMatcher === undefined) {
    return undefined;
  }

  const nativeRoutes = sortedRoutes.map((route, index) => ({
    index,
    segments: route.segments,
  }));
  const matcher = new NativeRouteMatcher(JSON.stringify(nativeRoutes));

  return {
    match(pathname): MatchedRoute | undefined {
      const output = matcher.matchRoute(pathname);

      if (output == null) {
        return undefined;
      }

      const route = sortedRoutes[output.index];

      return route === undefined
        ? undefined
        : {
            route,
            params: output.params,
          };
    },
  };
}

export function shouldUseNativeRouteMatcher(
  routeCount: number,
  mode: string | undefined,
): boolean {
  if (mode === "1" || mode === "true") {
    return true;
  }

  if (mode === "0" || mode === "false") {
    return false;
  }

  return routeCount >= nativeRouteMatcherAutoThreshold;
}

function loadNativeRouteMatcherModule(): NativeRouteMatcherModule | false {
  if (loadedNativeModule !== undefined) {
    return loadedNativeModule;
  }

  const require = nativePackageRequire();

  if (require === undefined) {
    loadedNativeModule = false;
    return loadedNativeModule;
  }

  for (const candidate of nativeModuleCandidates()) {
    try {
      loadedNativeModule = require(candidate) as NativeRouteMatcherModule;
      return loadedNativeModule;
    } catch {
      // Native package is optional. The JS matcher remains the portable fallback.
    }
  }

  loadedNativeModule = false;
  return false;
}

function nativePackageRequire(): ReturnType<typeof createRequire> | undefined {
  try {
    return new URL(import.meta.url).protocol === "file:" ? createRequire(import.meta.url) : undefined;
  } catch {
    return undefined;
  }
}

function nativeModuleCandidates(): string[] {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const workspaceNativePackage = join(currentDir, "..", "..", "router-native");

  return [
    ...nativeModulePackageCandidates(process.platform, process.arch),
    workspaceNativePackage,
  ];
}

export function nativeModulePackageCandidates(platform: NodeJS.Platform, arch: string): string[] {
  const platformPackage = nativePlatformPackageName(platform, arch);

  return [
    ...(platformPackage === undefined ? [] : [platformPackage]),
    "@reckona/mreact-router-native",
  ];
}

function nativePlatformPackageName(platform: NodeJS.Platform, arch: string): string | undefined {
  if (platform === "linux" && arch === "x64") {
    return "@reckona/mreact-router-native-linux-x64-gnu";
  }

  if (platform === "darwin" && arch === "arm64") {
    return "@reckona/mreact-router-native-darwin-arm64";
  }

  if (platform === "win32" && arch === "x64") {
    return "@reckona/mreact-router-native-win32-x64-msvc";
  }

  return undefined;
}
