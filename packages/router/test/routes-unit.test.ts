import { describe, expect, test } from "vitest";
import {
  createRouteMatcher,
  matchRoute,
  safeDecodeURIComponent,
  type AppRoute,
} from "../src/routes.js";

const segs = (path: string): AppRoute["segments"] => {
  if (path === "/") return [];
  return path
    .slice(1)
    .split("/")
    .map((part) =>
      part.startsWith(":...")
        ? { kind: "catch-all", name: part.slice(4) }
        : part.startsWith(":")
          ? { kind: "dynamic", name: part.slice(1) }
          : { kind: "static", value: part },
    );
};

const pageRoute = (path: string, file = `${path}/page.tsx`): AppRoute => ({
  kind: "page",
  path,
  file,
  segments: segs(path),
});

describe("router routes matcher edge branches", () => {
  test("matchRoute finds an exact static path", () => {
    const routes = [pageRoute("/about")];
    expect(matchRoute(routes, "/about")?.route.path).toBe("/about");
    expect(matchRoute(routes, "/missing")).toBeUndefined();
  });

  test("matchRoute resolves dynamic segments and stores them in params", () => {
    const routes = [pageRoute("/users/:id")];
    const result = matchRoute(routes, "/users/42");
    expect(result?.params).toEqual({ id: "42" });
  });

  test("matchRoute decodes dynamic segments and rejects malformed escapes", () => {
    const routes = [pageRoute("/users/:id")];
    expect(matchRoute(routes, "/users/%E3%81%82")?.params.id).toBe("あ");
    expect(matchRoute(routes, "/users/%ZZ")).toBeUndefined();
  });

  test("matchRoute uses a catch-all to gather remaining segments", () => {
    const routes = [pageRoute("/blog/:...slug")];
    expect(matchRoute(routes, "/blog/2024/05/post")?.params.slug).toEqual([
      "2024",
      "05",
      "post",
    ]);
  });

  test("matchRoute fails the catch-all path when one segment is malformed", () => {
    const routes = [pageRoute("/blog/:...slug")];
    expect(matchRoute(routes, "/blog/ok/%ZZ")).toBeUndefined();
  });

  test("matchRoute prefers static over dynamic when both match", () => {
    const routes = [pageRoute("/users/me"), pageRoute("/users/:id")];
    const matcher = createRouteMatcher(routes);
    expect(matcher.match("/users/me")?.route.path).toBe("/users/me");
    expect(matcher.match("/users/42")?.route.path).toBe("/users/:id");
  });

  test("matchRoute returns undefined when path length doesn't match a non-catch-all route", () => {
    const routes = [pageRoute("/a/b/c")];
    expect(matchRoute(routes, "/a/b")).toBeUndefined();
    expect(matchRoute(routes, "/a/b/c/d")).toBeUndefined();
  });

  test("matchRoute matches the root segment", () => {
    const routes = [pageRoute("/")];
    expect(matchRoute(routes, "/")?.route.path).toBe("/");
  });

  test("safeDecodeURIComponent returns undefined on malformed input rather than throwing", () => {
    expect(safeDecodeURIComponent("%E3%81%82")).toBe("あ");
    expect(safeDecodeURIComponent("%ZZ")).toBeUndefined();
  });
});
