import { describe, expect, test } from "vitest";
import { resolveRouterCacheLimit } from "../src/cache-config.js";

describe("router cache config", () => {
  test("uses the default limit when no environment override is present", () => {
    expect(resolveRouterCacheLimit("SERVER_TRANSFORM", 512, {})).toBe(512);
  });

  test("uses a cache-specific environment override before the global override", () => {
    expect(
      resolveRouterCacheLimit("SERVER_TRANSFORM", 512, {
        MREACT_ROUTER_CACHE_MAX_ENTRIES: "128",
        MREACT_ROUTER_CACHE_SERVER_TRANSFORM_MAX_ENTRIES: "64",
      }),
    ).toBe(64);
  });

  test("uses the global environment override when the cache-specific override is absent", () => {
    expect(
      resolveRouterCacheLimit("ROUTE_LOADER_MODULE", 512, {
        MREACT_ROUTER_CACHE_MAX_ENTRIES: "96",
      }),
    ).toBe(96);
  });

  test("ignores zero, negative, fractional, and non-numeric overrides", () => {
    expect(
      resolveRouterCacheLimit("SERVER_TRANSFORM", 512, {
        MREACT_ROUTER_CACHE_SERVER_TRANSFORM_MAX_ENTRIES: "0",
      }),
    ).toBe(512);
    expect(
      resolveRouterCacheLimit("SERVER_TRANSFORM", 512, {
        MREACT_ROUTER_CACHE_SERVER_TRANSFORM_MAX_ENTRIES: "-1",
      }),
    ).toBe(512);
    expect(
      resolveRouterCacheLimit("SERVER_TRANSFORM", 512, {
        MREACT_ROUTER_CACHE_SERVER_TRANSFORM_MAX_ENTRIES: "1.5",
      }),
    ).toBe(512);
    expect(
      resolveRouterCacheLimit("SERVER_TRANSFORM", 512, {
        MREACT_ROUTER_CACHE_SERVER_TRANSFORM_MAX_ENTRIES: "many",
      }),
    ).toBe(512);
  });
});
