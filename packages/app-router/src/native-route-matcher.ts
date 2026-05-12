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

export function createNativeRouteMatcher(
  sortedRoutes: readonly AppRoute[],
): RouteMatcher | undefined {
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

function loadNativeRouteMatcherModule(): NativeRouteMatcherModule | false {
  if (loadedNativeModule !== undefined) {
    return loadedNativeModule;
  }

  if (process.env.MREACT_APP_ROUTER_NATIVE_ROUTE_MATCHER !== "1") {
    loadedNativeModule = false;
    return false;
  }

  const require = createRequire(import.meta.url);

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

function nativeModuleCandidates(): string[] {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const workspaceNativePackage = join(currentDir, "..", "..", "app-router-native");

  return ["@modular-react/app-router-native", workspaceNativePackage];
}
