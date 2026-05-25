import type {
  BuiltAppRuntimePreloadMode,
  BuiltAppRuntimePreloadStrategy,
} from "./serve.js";

export type BuiltAppRuntimePreloadWait =
  | "background"
  | "before-render"
  | "first-request";

export type BuiltAppRuntimeDefaultPreloadMode = "all" | "middleware";

export type BuiltAppRuntimePreloadInput =
  | BuiltAppRuntimePreloadMode
  | (BuiltAppRuntimePreloadStrategy & {
      wait?: BuiltAppRuntimePreloadWait | undefined;
    })
  | undefined;

export type NormalizedBuiltAppRuntimePreloadStrategy = BuiltAppRuntimePreloadStrategy & {
  wait: BuiltAppRuntimePreloadWait;
};

export interface BuiltAppRuntimePreloadArtifactPlan
  extends NormalizedBuiltAppRuntimePreloadStrategy {
  includeRenderModules: boolean;
  loadAllArtifacts: boolean;
  middlewareArtifacts?: { includeRender: boolean } | undefined;
  routeArtifacts?: { includeRender: boolean; includeShells: boolean } | undefined;
  shouldPreload: boolean;
}

export function normalizeBuiltAppRuntimePreloadStrategy(
  strategy: BuiltAppRuntimePreloadInput,
  defaultMode: BuiltAppRuntimeDefaultPreloadMode = "all",
): NormalizedBuiltAppRuntimePreloadStrategy {
  if (strategy === undefined) {
    return { mode: defaultMode, wait: "background" };
  }

  if (typeof strategy === "string") {
    return { mode: strategy, wait: "background" };
  }

  return {
    mode: strategy.mode,
    ...(strategy.routes === undefined ? {} : { routes: strategy.routes }),
    wait: strategy.wait ?? "background",
  };
}

export function builtAppRuntimePreloadPlan(
  strategy: BuiltAppRuntimePreloadInput,
  defaultMode: BuiltAppRuntimeDefaultPreloadMode = "all",
): BuiltAppRuntimePreloadArtifactPlan {
  const normalized = normalizeBuiltAppRuntimePreloadStrategy(strategy, defaultMode);

  if (normalized.mode === "none") {
    return {
      ...normalized,
      includeRenderModules: false,
      loadAllArtifacts: false,
      shouldPreload: false,
    };
  }

  if (normalized.mode === "all") {
    return {
      ...normalized,
      includeRenderModules: true,
      loadAllArtifacts: true,
      shouldPreload: true,
    };
  }

  const requestOnly = normalized.mode === "hot-route-requests";

  return {
    ...normalized,
    includeRenderModules: !requestOnly,
    loadAllArtifacts: false,
    middlewareArtifacts: { includeRender: !requestOnly },
    routeArtifacts: {
      includeRender: !requestOnly,
      includeShells: !requestOnly,
    },
    shouldPreload: true,
  };
}
