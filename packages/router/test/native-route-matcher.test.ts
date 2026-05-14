import { describe, expect, test } from "vitest";
import { shouldUseNativeRouteMatcher } from "../src/native-route-matcher.js";

describe("router native route matcher selection", () => {
  test("uses the native matcher automatically only once route tables are large enough", () => {
    expect(shouldUseNativeRouteMatcher(99, undefined)).toBe(false);
    expect(shouldUseNativeRouteMatcher(100, undefined)).toBe(true);
  });

  test("supports explicit opt-in and opt-out", () => {
    expect(shouldUseNativeRouteMatcher(1, "1")).toBe(true);
    expect(shouldUseNativeRouteMatcher(1, "0")).toBe(false);
    expect(shouldUseNativeRouteMatcher(1, "false")).toBe(false);
  });
});
