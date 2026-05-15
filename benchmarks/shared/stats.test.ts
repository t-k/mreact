import { describe, expect, it } from "vitest";
import { summarizeSamples } from "./stats.js";

describe("summarizeSamples", () => {
  it("computes stable nearest-rank summary values for unsorted samples", () => {
    const summary = summarizeSamples([10, 1, 5, 20, 15]);

    expect(summary).toEqual({
      count: 5,
      min: 1,
      max: 20,
      mean: 10.2,
      median: 10,
      p75: 15,
      p95: 20,
      standardDeviation: 6.7941,
    });
  });

  it("rejects empty sample arrays", () => {
    expect(() => summarizeSamples([])).toThrow("at least one sample");
  });

  it("rejects NaN samples", () => {
    expect(() => summarizeSamples([1, Number.NaN, 2])).toThrow(
      "finite number",
    );
  });

  it("rejects infinite samples", () => {
    expect(() => summarizeSamples([1, Infinity, 2])).toThrow("finite number");
  });
});
