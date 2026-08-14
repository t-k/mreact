import { describe, expect, test } from "vitest";
import { hasNavigationRouteMarker } from "../src/navigation-marker.js";

describe("navigation route marker validation", () => {
  test.each([
    '<div data-mreact-route-id="index"></div>',
    "<section data-mreact-route-id='nested'></section>",
    "<main data-mreact-route-id=docs></main>",
    '<main class="page"\n DATA-MREACT-ROUTE-ID="docs/getting-started"></main>',
  ])("accepts a value-bearing marker attribute on a start tag: %s", (html) => {
    expect(hasNavigationRouteMarker(html)).toBe(true);
  });

  test.each([
    '<!-- <div data-mreact-route-id="comment"> -->',
    '&lt;div data-mreact-route-id="text">',
    '<main data-note="data-mreact-route-id=other"></main>',
    '<script>const html = `<div data-mreact-route-id="script">`;</script>',
    '<style>data-mreact-route-id="style" { color: red; }</style>',
    '<main data-mreact-route-id-other="similar"></main>',
    "<main data-mreact-route-id></main>",
    '<main data-mreact-route-id=""></main>',
    "<main data-mreact-route-id=''></main>",
    '<main data-mreact-route-id="unterminated></main>',
    "<main data-mreact-route-id=>content</main>",
  ])("rejects text that is not a valid value-bearing marker attribute: %s", (html) => {
    expect(hasNavigationRouteMarker(html)).toBe(false);
  });
});
