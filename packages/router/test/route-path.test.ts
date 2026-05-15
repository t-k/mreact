import { describe, expect, test } from "vitest";
import { normalizeRoutePath } from "../src/route-path.js";

describe("router route path helpers", () => {
  test("normalizes empty and trailing-slash route paths consistently", () => {
    expect(normalizeRoutePath("")).toBe("/");
    expect(normalizeRoutePath("/")).toBe("/");
    expect(normalizeRoutePath("/docs///")).toBe("/docs");
    expect(normalizeRoutePath("/docs/intro")).toBe("/docs/intro");
  });
});
