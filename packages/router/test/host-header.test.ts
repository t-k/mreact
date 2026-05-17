import { describe, expect, test } from "vitest";
import { resolveRequestHost } from "../src/serve.js";
import { routeCacheKey } from "../src/cache.js";

describe("resolveRequestHost (Issue 068)", () => {
  test("returns fallback when Host header is missing", () => {
    expect(
      resolveRequestHost({
        fallbackHost: "localhost:3000",
        rawHost: undefined,
      }),
    ).toBe("localhost:3000");
  });

  test("returns fallback when Host header is empty", () => {
    expect(
      resolveRequestHost({
        fallbackHost: "localhost:3000",
        rawHost: "",
      }),
    ).toBe("localhost:3000");
  });

  test("trusts Host when allowedHosts is undefined (legacy)", () => {
    expect(
      resolveRequestHost({
        fallbackHost: "localhost:3000",
        rawHost: "evil.com",
      }),
    ).toBe("evil.com");
  });

  test("trusts Host explicitly when hostPolicy is trusted-proxy", () => {
    expect(
      resolveRequestHost({
        fallbackHost: "localhost:3000",
        hostPolicy: "trusted-proxy",
        rawHost: "proxy-forwarded.example.com",
      }),
    ).toBe("proxy-forwarded.example.com");
  });

  test("rejects Host by default when hostPolicy is strict and no allow-list is configured", () => {
    expect(
      resolveRequestHost({
        fallbackHost: "localhost:3000",
        hostPolicy: "strict",
        rawHost: "evil.com",
      }),
    ).toBe("localhost:3000");
  });

  test("rejects attacker-supplied Host when allowedHosts is configured", () => {
    expect(
      resolveRequestHost({
        allowedHosts: ["example.com", "www.example.com"],
        fallbackHost: "localhost:3000",
        rawHost: "evil.com",
      }),
    ).toBe("localhost:3000");
  });

  test("accepts an exact allow-listed Host", () => {
    expect(
      resolveRequestHost({
        allowedHosts: ["example.com", "www.example.com"],
        fallbackHost: "localhost:3000",
        rawHost: "www.example.com",
      }),
    ).toBe("www.example.com");
  });

  test("empty allowedHosts list rejects everything", () => {
    expect(
      resolveRequestHost({
        allowedHosts: [],
        fallbackHost: "localhost:3000",
        rawHost: "example.com",
      }),
    ).toBe("localhost:3000");
  });
});

describe("routeCacheKey excludes host (Issue 068)", () => {
  test("same path on different hosts yields same cache key", () => {
    const a = routeCacheKey("/app", "/page", new URL("http://example.com/foo?x=1"));
    const b = routeCacheKey("/app", "/page", new URL("http://evil.com/foo?x=1"));
    expect(a).toBe(b);
  });

  test("different path yields different cache key", () => {
    const a = routeCacheKey("/app", "/page", new URL("http://example.com/foo"));
    const b = routeCacheKey("/app", "/page", new URL("http://example.com/bar"));
    expect(a).not.toBe(b);
  });

  test("different query yields different cache key", () => {
    const a = routeCacheKey("/app", "/page", new URL("http://example.com/foo?x=1"));
    const b = routeCacheKey("/app", "/page", new URL("http://example.com/foo?x=2"));
    expect(a).not.toBe(b);
  });
});
