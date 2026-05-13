import { describe, expect, test } from "vitest";
import { cookies } from "../src/navigation.js";
import { matchRoute, safeDecodeURIComponent } from "../src/routes.js";
import type { AppRoute } from "../src/routes.js";

const routes: AppRoute[] = [
  {
    kind: "page",
    path: "/users/:id",
    file: "users/[id]/page.tsx",
    segments: [
      { kind: "static", value: "users" },
      { kind: "dynamic", name: "id" },
    ],
  },
  {
    kind: "page",
    path: "/files/*",
    file: "files/[...rest]/page.tsx",
    segments: [
      { kind: "static", value: "files" },
      { kind: "catch-all", name: "rest" },
    ],
  },
];

describe("URI decode safety (Issue 072)", () => {
  test("safeDecodeURIComponent returns undefined on URIError", () => {
    expect(safeDecodeURIComponent("%ZZ")).toBeUndefined();
    expect(safeDecodeURIComponent("%E0")).toBeUndefined();
    expect(safeDecodeURIComponent("%")).toBeUndefined();
  });

  test("safeDecodeURIComponent passes valid input through", () => {
    expect(safeDecodeURIComponent("hello")).toBe("hello");
    expect(safeDecodeURIComponent("%20")).toBe(" ");
  });

  test("matchRoute returns undefined for malformed dynamic segment", () => {
    const matched = matchRoute(routes, "/users/%ZZ");
    expect(matched).toBeUndefined();
  });

  test("matchRoute returns undefined for malformed catch-all segment", () => {
    const matched = matchRoute(routes, "/files/a/%ZZ/c");
    expect(matched).toBeUndefined();
  });

  test("matchRoute returns params for valid dynamic segment", () => {
    const matched = matchRoute(routes, "/users/42");
    expect(matched?.params).toEqual({ id: "42" });
  });

  test("matchRoute decodes a normal percent-encoded segment", () => {
    const matched = matchRoute(routes, "/users/hello%20world");
    expect(matched?.params).toEqual({ id: "hello world" });
  });

  test("cookies() helper skips a cookie with malformed percent escape", () => {
    const request = new Request("http://local.test", {
      headers: { cookie: "good=hi; bad=%ZZ; another=%20there" },
    });
    const c = cookies(request);
    expect(c.get("good")).toBe("hi");
    expect(c.has("bad")).toBe(false);
    expect(c.get("another")).toBe(" there");
  });
});
