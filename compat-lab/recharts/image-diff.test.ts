import { describe, expect, test } from "vitest";
import { pixelDiffRatioFromCounts } from "./image-diff.js";

describe("image diff helpers", () => {
  test("computes changed pixel ratio", () => {
    expect(pixelDiffRatioFromCounts(25, 100)).toBe(0.25);
  });

  test("treats empty images as fully different", () => {
    expect(pixelDiffRatioFromCounts(0, 0)).toBe(1);
  });
});
