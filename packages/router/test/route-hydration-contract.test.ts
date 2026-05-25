import { describe, expect, test } from "vitest";
import {
  routeDataScriptIds,
  routeHydrationContract,
} from "../src/route-hydration-contract.js";

describe("compiled route hydration contract", () => {
  test("names route resume metadata separately from React compat hydration", () => {
    expect(routeHydrationContract.routeMarkerAttribute).toBe("data-mreact-route-id");
    expect(routeHydrationContract.hydratedAttribute).toBe("data-mreact-hydrated");
    expect(routeHydrationContract.routeHydrateExport).toBe("__mreactHydrateRoute");
    expect(routeHydrationContract.hotRouteHydrateExport).toBe("__mreactHotHydrateRoute");
  });

  test("defines the managed data script ids used during route resume", () => {
    expect(routeDataScriptIds("routes/settings")).toEqual([
      "mreact-props-routes/settings",
      "mreact-client-references-routes/settings",
    ]);
  });
});
