import { describe, expect, test } from "vitest";
import { fixtureIdFromSearch, runtimeFromValue } from "./app-state.js";

describe("recharts compat lab app state", () => {
  test("reads fixture id from URL search", () => {
    expect(fixtureIdFromSearch("?fixture=recharts-bar-basic", "fallback")).toBe(
      "recharts-bar-basic",
    );
  });

  test("falls back when fixture id is missing", () => {
    expect(fixtureIdFromSearch("?unused=true", "recharts-bar-basic")).toBe("recharts-bar-basic");
  });

  test("normalizes runtime values", () => {
    expect(runtimeFromValue("compat")).toBe("compat");
    expect(runtimeFromValue("react")).toBe("react");
    expect(runtimeFromValue(undefined)).toBe("react");
  });
});
