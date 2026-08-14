import { describe, expect, test } from "vitest";
import { isCurrentPrerenderedRoute } from "../src/prerender-entry.js";

describe("prerender entry validation", () => {
  test("rejects a complete schema-1 entry", () => {
    expect(
      isCurrentPrerenderedRoute({
        headers: { "content-type": "text/html; charset=utf-8" },
        html: "<main>visitor A</main>",
        schemaVersion: 1,
        status: 200,
      }),
    ).toBe(false);
  });

  test("rejects a complete schema-2 entry after the HSTS storage contract changes", () => {
    expect(
      isCurrentPrerenderedRoute({
        headers: { "content-type": "text/html; charset=utf-8" },
        html: "<main>legacy</main>",
        schemaVersion: 2,
        status: 200,
      }),
    ).toBe(false);
  });

  test.each([
    ["Set-Cookie", "session=visitor-a"],
    ["Vary", "Cookie"],
    ["Cache-Control", "private, max-age=60"],
    ["Cache-Control", "no-cache"],
    ["Cache-Control", "no-store"],
    ["X-Mreact-Cache", "DYNAMIC"],
  ])("rejects a current-schema entry with visitor-dependent %s", (name, value) => {
    expect(
      isCurrentPrerenderedRoute({
        headers:
          name.toLowerCase() === "vary"
            ? { [name]: `${value}, x-mreact-navigation` }
            : { [name]: value, vary: "x-mreact-navigation" },
        html: "<main>visitor A</main>",
        schemaVersion: 4,
        status: 200,
      }),
    ).toBe(false);
  });

  test("accepts a current-schema entry with shareable response headers", () => {
    expect(
      isCurrentPrerenderedRoute({
        headers: {
          "cache-control": "public, max-age=60",
          "content-type": "text/html; charset=utf-8",
          vary: "x-mreact-navigation",
        },
        html: "<main>shared</main>",
        schemaVersion: 4,
        status: 200,
      }),
    ).toBe(true);
  });

  test("rejects current entries without the required Vary header", () => {
    expect(
      isCurrentPrerenderedRoute({
        headers: { "content-type": "text/html; charset=utf-8" },
        html: "<main>document</main>",
        schemaVersion: 4,
        status: 200,
      }),
    ).toBe(false);
  });

  test("rejects navigation variants without a route marker", () => {
    expect(
      isCurrentPrerenderedRoute({
        headers: {
          "content-type": "text/html; charset=utf-8",
          vary: "x-mreact-navigation",
        },
        html: "<main>document</main>",
        navigationHtml: "<main>unmarked navigation</main>",
        schemaVersion: 4,
        status: 200,
      }),
    ).toBe(false);
  });

  test.each([
    '<!-- <div data-mreact-route-id="comment"> -->',
    '<script>const marker = "data-mreact-route-id=script";</script>',
    '<main data-note="data-mreact-route-id=other"></main>',
    "<1 data-mreact-route-id=x>",
    "<svg><![CDATA[> <div data-mreact-route-id=x>]]></svg>",
    "<script><!--<script></script><div data-mreact-route-id=x></script>",
    "<script><!--<script>--></script><div data-mreact-route-id=x></script>",
  ])("rejects navigation HTML without a syntactic route marker: %s", (navigationHtml) => {
    expect(
      isCurrentPrerenderedRoute({
        headers: { vary: "x-mreact-navigation" },
        html: "<main>document</main>",
        navigationHtml,
        schemaVersion: 4,
        status: 200,
      }),
    ).toBe(false);
  });

  test("accepts canonical HSTS in its scheme-independent field", () => {
    expect(
      isCurrentPrerenderedRoute({
        headers: {
          "content-type": "text/html; charset=utf-8",
          vary: "x-mreact-navigation",
        },
        html: "<main>shared</main>",
        schemaVersion: 4,
        status: 200,
        strictTransportSecurity: "max-age=31536000; includeSubDomains; preload",
      }),
    ).toBe(true);
  });

  test.each([
    {
      headers: { "Strict-Transport-Security": "max-age=31536000" },
      strictTransportSecurity: undefined,
    },
    { headers: {}, strictTransportSecurity: "max-age=NaN" },
    { headers: {}, strictTransportSecurity: "max-age=10\r\nx-injected: yes" },
  ])("rejects HSTS that cannot be replayed safely: %#", (overrides) => {
    expect(
      isCurrentPrerenderedRoute({
        headers: { vary: "x-mreact-navigation", ...overrides.headers },
        html: "<main>shared</main>",
        schemaVersion: 4,
        status: 200,
        ...(overrides.strictTransportSecurity === undefined
          ? {}
          : { strictTransportSecurity: overrides.strictTransportSecurity }),
      }),
    ).toBe(false);
  });
});
