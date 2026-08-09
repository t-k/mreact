import { describe, expect, test } from "vitest";

import { configuredHstsHeader, routeSecurityHeaders } from "../src/security-headers.js";

const VALID_SHAPES = [
  { label: "no security metadata", security: undefined },
  { label: "empty security metadata", security: {} },
  { label: "hsts undefined", security: { hsts: undefined } },
  { label: "hsts false", security: { hsts: false as const } },
  { label: "zero max age", security: { hsts: { maxAge: 0 } } },
  { label: "plain max age", security: { hsts: { maxAge: 63072000 } } },
  { label: "fractional max age", security: { hsts: { maxAge: 100.9 } } },
  {
    label: "subdomains and preload",
    security: { hsts: { includeSubDomains: true, maxAge: 63072000, preload: true } },
  },
  {
    label: "subdomains and preload disabled",
    security: { hsts: { includeSubDomains: false, maxAge: 100, preload: false } },
  },
];

describe("configured HSTS header", () => {
  test.each(VALID_SHAPES)(
    "matches what a secure request would emit for $label",
    ({ security }) => {
      const emitted = routeSecurityHeaders({
        request: new Request("https://app.test/"),
        security,
      })["strict-transport-security"];

      expect(configuredHstsHeader(security)).toBe(emitted);
    },
  );

  test("reports nothing for a plain request regardless of configuration", () => {
    const security = { hsts: { maxAge: 63072000 } };

    expect(
      routeSecurityHeaders({ request: new Request("http://app.test/"), security })[
        "strict-transport-security"
      ],
    ).toBeUndefined();
    expect(configuredHstsHeader(security)).toBe("max-age=63072000");
  });

  // The helper runs on every render that may be cached, including plain ones
  // that would never emit the header, so a bad configuration must not turn
  // those renders into failures. The request that does emit the header still
  // reports the error.
  test.each([
    { label: "hsts true", hsts: true },
    { label: "hsts without maxAge", hsts: {} },
    { label: "negative maxAge", hsts: { maxAge: -1 } },
    { label: "unparsable maxAge", hsts: { maxAge: "not-a-number" } },
  ])("returns undefined instead of throwing for $label", ({ hsts }) => {
    const security = { hsts } as Parameters<typeof configuredHstsHeader>[0];

    expect(configuredHstsHeader(security)).toBeUndefined();
    expect(() =>
      routeSecurityHeaders({ request: new Request("https://app.test/"), security }),
    ).toThrow(TypeError);
  });
});
