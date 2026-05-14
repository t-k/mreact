import { describe, expect, test } from "vitest";
import {
  nativeModulePackageCandidates,
  shouldUseNativeRouteMatcher,
} from "../src/native-route-matcher.js";

describe("shouldUseNativeRouteMatcher", () => {
  test("forces native when MREACT_APP_ROUTER_NATIVE_ROUTE_MATCHER=1", () => {
    expect(shouldUseNativeRouteMatcher(0, "1")).toBe(true);
    expect(shouldUseNativeRouteMatcher(0, "true")).toBe(true);
  });

  test("disables native when MREACT_APP_ROUTER_NATIVE_ROUTE_MATCHER=0", () => {
    expect(shouldUseNativeRouteMatcher(1000, "0")).toBe(false);
    expect(shouldUseNativeRouteMatcher(1000, "false")).toBe(false);
  });

  test("auto-enables once the route count crosses the threshold (100 by default)", () => {
    expect(shouldUseNativeRouteMatcher(99, undefined)).toBe(false);
    expect(shouldUseNativeRouteMatcher(100, undefined)).toBe(true);
    expect(shouldUseNativeRouteMatcher(500, undefined)).toBe(true);
  });

  test("ignores unrecognized mode strings (treated as auto)", () => {
    expect(shouldUseNativeRouteMatcher(50, "maybe")).toBe(false);
    expect(shouldUseNativeRouteMatcher(150, "maybe")).toBe(true);
  });
});

describe("nativeModulePackageCandidates", () => {
  test("includes the linux-x64 package when running linux x64", () => {
    expect(nativeModulePackageCandidates("linux", "x64")).toEqual([
      "@modular-react/router-native-linux-x64-gnu",
      "@modular-react/router-native",
    ]);
  });

  test("includes the darwin-arm64 package when running mac silicon", () => {
    expect(nativeModulePackageCandidates("darwin", "arm64")).toEqual([
      "@modular-react/router-native-darwin-arm64",
      "@modular-react/router-native",
    ]);
  });

  test("includes the win32-x64 package when running windows x64", () => {
    expect(nativeModulePackageCandidates("win32", "x64")).toEqual([
      "@modular-react/router-native-win32-x64-msvc",
      "@modular-react/router-native",
    ]);
  });

  test("falls back to just the umbrella package on unsupported platform/arch", () => {
    expect(nativeModulePackageCandidates("freebsd" as never, "x64")).toEqual([
      "@modular-react/router-native",
    ]);
    expect(nativeModulePackageCandidates("linux", "arm" as never)).toEqual([
      "@modular-react/router-native",
    ]);
  });
});
