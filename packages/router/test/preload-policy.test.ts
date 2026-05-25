import { describe, expect, test } from "vitest";
import {
  builtAppRuntimePreloadPlan,
  normalizeBuiltAppRuntimePreloadStrategy,
} from "../src/preload-policy.js";

describe("built runtime preload policy", () => {
  test("normalizes Lambda default preload modes and wait behavior in one place", () => {
    expect(normalizeBuiltAppRuntimePreloadStrategy(undefined, "middleware")).toEqual({
      mode: "middleware",
      wait: "background",
    });
    expect(normalizeBuiltAppRuntimePreloadStrategy("none", "all")).toEqual({
      mode: "none",
      wait: "background",
    });
    expect(
      normalizeBuiltAppRuntimePreloadStrategy(
        { mode: "hot-routes", routes: ["/hot"], wait: "first-request" },
        "all",
      ),
    ).toEqual({
      mode: "hot-routes",
      routes: ["/hot"],
      wait: "first-request",
    });
  });

  test("keeps hot-route request preload on the request artifact plane", () => {
    expect(
      builtAppRuntimePreloadPlan({ mode: "hot-route-requests", routes: ["/hot"] }),
    ).toEqual({
      includeRenderModules: false,
      loadAllArtifacts: false,
      middlewareArtifacts: { includeRender: false },
      mode: "hot-route-requests",
      routeArtifacts: { includeRender: false, includeShells: false },
      routes: ["/hot"],
      shouldPreload: true,
      wait: "background",
    });
  });

  test("keeps render artifact loading explicit for full hot-route preloads", () => {
    expect(builtAppRuntimePreloadPlan({ mode: "hot-routes", routes: ["/hot"] })).toEqual({
      includeRenderModules: true,
      loadAllArtifacts: false,
      middlewareArtifacts: { includeRender: true },
      mode: "hot-routes",
      routeArtifacts: { includeRender: true, includeShells: true },
      routes: ["/hot"],
      shouldPreload: true,
      wait: "background",
    });
  });
});
