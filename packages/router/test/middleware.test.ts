import { describe, expect, test } from "vitest";
import {
  mergeRouteMiddlewareControls,
  middlewareMatches,
  parseRouteMiddlewareControl,
  parseStaticMiddlewareConfig,
  shouldSkipMiddleware,
  validateRouteMiddlewareControl,
} from "../src/middleware.js";
import { normalizeRoutePath } from "../src/route-path.js";

describe("router middleware contract", () => {
  test("parses static matcher and id config without importing the middleware module", () => {
    expect(
      parseStaticMiddlewareConfig(`
        export const config = {
          id: "auth",
          matcher: ["/dashboard/:path*", "/admin*"],
        };
      `),
    ).toEqual({
      hasMatcher: true,
      id: "auth",
      matcher: ["/dashboard/:path*", "/admin*"],
    });

    expect(
      parseStaticMiddlewareConfig(`
        export const config = {
          id: "profile",
          matcher: "/account",
        };
      `),
    ).toEqual({
      hasMatcher: true,
      id: "profile",
      matcher: "/account",
    });
  });

  test("keeps unknown matcher expressions as a static matcher marker", () => {
    expect(
      parseStaticMiddlewareConfig(`
        const dynamicMatcher = ["/dashboard"];
        export const config = { matcher: dynamicMatcher };
      `),
    ).toEqual({ hasMatcher: true });
  });

  test("matches middleware path patterns consistently", () => {
    expect(middlewareMatches(undefined, "/anything")).toBe(true);
    expect(middlewareMatches({ matcher: "/settings" }, "/settings")).toBe(true);
    expect(middlewareMatches({ matcher: "/settings" }, "/settings/profile")).toBe(false);
    expect(middlewareMatches({ matcher: "/dashboard/:path*" }, "/dashboard")).toBe(true);
    expect(middlewareMatches({ matcher: "/dashboard/:path*" }, "/dashboard/reports")).toBe(true);
    expect(middlewareMatches({ matcher: "/admin*" }, "/administrator")).toBe(true);
    expect(middlewareMatches({ matcher: /^\/api\/v[0-9]+$/ }, "/api/v1")).toBe(true);
    expect(middlewareMatches({ matcher: ["/a", "/b/:path*"] }, "/b/child")).toBe(true);
  });

  test("exact matchers agree with route path normalization for trailing slash variants", () => {
    for (const variant of ["/account", "/account/", "/account//"]) {
      expect(normalizeRoutePath(variant)).toBe("/account");
      expect(middlewareMatches({ matcher: "/account" }, variant)).toBe(true);
    }
  });

  test("parses and merges route-local middleware skip controls", () => {
    expect(parseRouteMiddlewareControl(`export const middleware = { skip: true };`)).toEqual({
      skip: true,
    });
    expect(
      parseRouteMiddlewareControl(`export const middleware = { skip: ["auth", "analytics"] };`),
    ).toEqual({
      skip: ["auth", "analytics"],
    });
    expect(parseRouteMiddlewareControl(`export const value = { skip: true };`)).toBeUndefined();

    expect(
      mergeRouteMiddlewareControls([
        { skip: ["auth", "analytics"] },
        undefined,
        { skip: ["auth", "audit"] },
      ]),
    ).toEqual({ skip: ["auth", "analytics", "audit"] });
    expect(mergeRouteMiddlewareControls([{ skip: ["auth"] }, { skip: true }])).toEqual({
      skip: true,
    });
  });

  test("skips middleware globally or by configured middleware id", () => {
    expect(shouldSkipMiddleware({ id: "auth" }, { skip: true })).toBe(true);
    expect(shouldSkipMiddleware({ id: "auth" }, { skip: ["auth"] })).toBe(true);
    expect(shouldSkipMiddleware({ id: "auth" }, { skip: ["analytics"] })).toBe(false);
    expect(shouldSkipMiddleware(undefined, { skip: ["auth"] })).toBe(false);
  });

  test("rejects route-local middleware skip ids that do not exist", () => {
    expect(() =>
      validateRouteMiddlewareControl({
        availableIds: new Set(["auth", "analytics"]),
        control: { skip: ["auth", "typo"] },
        routePath: "/webhook",
      }),
    ).toThrow(/Unknown middleware skip id "typo"/);
  });
});
