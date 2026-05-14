import { describe, expect, test } from "vitest";
import {
  clientScriptForPath,
  detectClientNavigationHint,
  hydrationMarkerParts,
  isClientRouteSource,
  routeIdForPath,
  withHydrationMarkers,
  withRouteMarkers,
} from "../src/client.js";

describe("router client helpers", () => {
  test("isClientRouteSource detects event handlers and reactive cells", () => {
    expect(isClientRouteSource(`<button onClick={() => {}}>x</button>`)).toBe(true);
    expect(isClientRouteSource(`const x = cell(0);`)).toBe(true);
    expect(isClientRouteSource(`if (window.scrollY > 0) {}`)).toBe(true);
    expect(isClientRouteSource(`document.title = "t";`)).toBe(true);
    expect(isClientRouteSource(`localStorage.getItem("k");`)).toBe(true);
  });

  test("isClientRouteSource returns false for purely server-rendered sources", () => {
    expect(isClientRouteSource(`export default function Page() { return <p>hi</p>; }`)).toBe(false);
  });

  test("routeIdForPath maps `/` to index and replaces unsafe chars with underscores", () => {
    expect(routeIdForPath("/")).toBe("index");
    expect(routeIdForPath("/users/:id")).toBe("users__id");
    expect(routeIdForPath("/a-b")).toBe("a-b");
  });

  test("clientScriptForPath references the route id", () => {
    expect(clientScriptForPath("/")).toBe("routes/index.js");
    expect(clientScriptForPath("/users/:id")).toBe("routes/users__id.js");
  });

  test("hydrationMarkerParts emits a div wrapper, JSON props, and a script src", () => {
    const { prefix, suffix } = hydrationMarkerParts({
      props: { id: 1, "&quot": "<x>" },
      routePath: "/users/:id",
    });
    expect(prefix).toContain('data-mreact-route-id="users__id"');
    expect(suffix).toContain('<script type="application/json" id="mreact-props-users__id">');
    expect(suffix).toContain("\\u003cx>");
    expect(suffix).toContain("/_mreact/client/routes/users__id.js");
  });

  test("hydrationMarkerParts honors an explicit script option", () => {
    const { suffix } = hydrationMarkerParts({
      props: {},
      routePath: "/",
      script: "custom/path.js",
    });
    expect(suffix).toContain('src="/_mreact/client/custom/path.js"');
  });

  test("withRouteMarkers wraps html with just a data-mreact-route-id div", () => {
    expect(withRouteMarkers({ html: "<p>x</p>", routePath: "/a" })).toBe(
      '<div data-mreact-route-id="a"><p>x</p></div>',
    );
  });

  test("withHydrationMarkers wraps html, props, and the script tag", () => {
    const result = withHydrationMarkers({
      html: "<p>x</p>",
      props: { ok: true },
      routePath: "/test",
    });
    expect(result).toContain('data-mreact-route-id="test"');
    expect(result).toContain("<p>x</p>");
    expect(result).toContain('"ok":true');
  });

  test("detectClientNavigationHint returns true when there is no hint", () => {
    expect(detectClientNavigationHint("export default function Page() {}")).toBe(true);
  });

  test("detectClientNavigationHint reads `export const clientNavigation = false`", () => {
    expect(detectClientNavigationHint("export const clientNavigation = false")).toBe(false);
    expect(detectClientNavigationHint("export const clientNavigation = true")).toBe(true);
  });

  test("detectClientNavigationHint tolerates a type annotation and whitespace variants", () => {
    expect(
      detectClientNavigationHint("export const  clientNavigation : boolean = false ;"),
    ).toBe(false);
  });
});
