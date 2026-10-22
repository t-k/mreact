import { parseStaticMiddlewareConfig } from "../src/static-middleware-config.js";
import { describe, expect, test } from "vitest";
import {
  mergeRouteMiddlewareControls,
  middlewareMatches,
  parseRouteMiddlewareControl,
  shouldSkipMiddleware,
  validateRouteMiddlewareControl,
} from "../src/middleware.js";
import { normalizeRoutePath } from "../src/route-path.js";

describe("router middleware contract", () => {
  test("does not manufacture static identity or matchers from missing values", () => {
    const dynamicId = parseStaticMiddlewareConfig('export const config = {id: dynamicId, matcher: ["/private"]};');
    expect(Object.hasOwn(dynamicId, "id")).toBe(false);
    expect(parseStaticMiddlewareConfig('export const config = {matcher: [,]};')).toEqual({hasMatcher: true});
  });

  test("recognizes only immutable literal export grammar", () => {
    const unknown = { hasMatcher: true };
    for (const code of [
      'export const config = { matcher: ["/private"] }; const broken = ;',
      'const config = {matcher: ["/private"]}; export {config};',
      'export let config = {matcher: ["/private"]};',
      'export var config = {matcher: ["/private"]};',
      'export const config = {id: "auth", ["matcher"]: ["/private"]};',
      'export const config = {id: "auth", get matcher() {return ["/private"]}};',
      'export const config = {id: "auth", matcher() {return ["/private"]}};',
      'export const config = {42: "ignored", matcher: ["/private"]};',
    ]) expect(parseStaticMiddlewareConfig(code)).toEqual(unknown);
    for (const code of [
      'export const other = {matcher: ["/public"]}, config = {matcher: ["/private"]};',
      'export const config = {matcher: ["/private"]} satisfies {matcher: string[]};',
      'export const config = {matcher: ["/private"]} as const satisfies {matcher: readonly string[]};',
      'export const config = {matcher: ["/private"], unrelated: "/public"};',
      'export const config = {id: dynamicId, matcher: ["/private"]};',
    ]) expect(parseStaticMiddlewareConfig(code)).toEqual({hasMatcher: true, matcher: ["/private"]});
    expect(parseStaticMiddlewareConfig('export const config = {"id": "auth", "matcher": ["/private"]};')).toEqual({hasMatcher: true, id: "auth", matcher: ["/private"]});
    for (const value of ["42", "true", "null", "[42]", "[true]", "[null]"]) {
      expect(parseStaticMiddlewareConfig(`export const config = {matcher: ${value}};`)).toEqual(unknown);
      expect(parseStaticMiddlewareConfig(`export const config = {id: ${value}, matcher: ["/private"]};`)).toEqual({hasMatcher: true, matcher: ["/private"]});
    }
  });

  test("does not assume config remains static after a reference or escape", () => {
    for (const suffix of [
      'config.matcher.push("/admin");',
      'const alias = config; alias.matcher = ["/admin"];',
      'configure(config);',
      `eval('config.matcher.push("/admin")');`,
    ]) expect(parseStaticMiddlewareConfig(`export const config = { matcher: ["/public"] }; ${suffix}`).matcher).toBeUndefined();
  });

  test("does not read config declarations from regular expression literals", () => {
    const source = `const example = /export const config = {matcher: ['public']};/;
      export const config = { matcher: ['/private'] };`;
    expect(parseStaticMiddlewareConfig(source).matcher).toEqual(["/private"]);
  });

  test("conservatively handles complete config syntax and literal quoting", () => {
    for (const code of ["export const config = {};"]) {
      expect(parseStaticMiddlewareConfig(code)).toEqual({ hasMatcher: false });
    }
    for (const body of [
      'matcher: ["/a"]',
      "matcher :  [ '/a' ,  '/b' , ]",
      "matcher:  '/a'",
      "matcher: condition ? ['/a'] : ['/b'], id: 'auth'",
      "matcher: choose({ nested: [1, 2] }, 3), id: 'auth'",
    ]) {
      const result = parseStaticMiddlewareConfig(`export  const  config  =  { ${body} } as  const ;`);
      expect(result.hasMatcher).toBe(true);
      if (body.includes("id:")) expect(result.id).toBe("auth");
      else expect(result.matcher).toEqual(body.includes("'/b'") ? ["/a", "/b"] : body.includes("[") ? ["/a"] : "/a");
    }
    expect(parseStaticMiddlewareConfig('export const config = { matcher: ["/a"] }').matcher).toEqual(["/a"]);
    for (const code of [
      'export const config = { matcher: ["/a"]',
      'export const config = { matcher: ["/a"] } || other;',
      'export const config = { matcher: prefix + ["/a"] };',
      'export const config = { matcher: prefix + "/a" };',
      'export const config = { id: "auth", id: "other" };',
      'export const config = { ...other };',
    ]) expect(parseStaticMiddlewareConfig(code)).toEqual({ hasMatcher: true });
  });

  test.each([
    'matcher: [protectedPath]',
    'matcher: ["/public", protectedPath]',
    'matcher: [...protectedPaths]',
    'matcher: [makePath("/public")]',
    'matcher: [`/admin/${suffix}`]',
    'matcher: [/* "/public" */ protectedPath]',
    'matcher: ["/public"], ...overrides',
    'matcher: ["/public"], matcher: protectedPaths',
    'matcher: "/public" + suffix',
    'matcher: ["/public"].concat(protectedPaths)',
  ])("does not partially evaluate config %s", (body) => {
    expect(parseStaticMiddlewareConfig(`export const config = { ${body} };`).matcher).toBeUndefined();
  });

  test("ignores fake config declarations and preserves safe empty and trailing-comma arrays", () => {
    expect(parseStaticMiddlewareConfig('/* export const config = { matcher: [] }; */').matcher).toBeUndefined();
    expect(parseStaticMiddlewareConfig('const example = "export const config = { matcher: [] };";').matcher).toBeUndefined();
    expect(parseStaticMiddlewareConfig('export const config = { matcher: [] };').matcher).toEqual([]);
    expect(parseStaticMiddlewareConfig('export const config = { matcher: ["/admin]",], };').matcher).toEqual(["/admin]"]);
  });

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

  test("ignores route-local middleware skip controls in strings and comments", () => {
    expect(
      parseRouteMiddlewareControl(`
        const example = "export const middleware = { skip: ['auth'] }";
      `),
    ).toBeUndefined();
    expect(
      parseRouteMiddlewareControl(`
        /*
         export const middleware = { skip: true };
         */
      `),
    ).toBeUndefined();
    expect(
      parseRouteMiddlewareControl(`
        export const middleware = { skip: ["auth"] };
        const unrelated = { skip: true };
      `),
    ).toEqual({ skip: ["auth"] });
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
