import { describe, expect, it } from "vitest";
import { primitiveBrowserCases, primitiveBrowserFrameworks } from "./cases.js";

describe("primitive browser benchmark configuration", () => {
  it("covers mreact browser primitive frameworks", () => {
    expect(primitiveBrowserFrameworks).toEqual([
      "mreact",
      "mreact react-compat",
      "react",
      "solid",
      "marko",
      "qwik",
    ]);
  });

  it("defines browser cases for the krausest-style primitive operations", () => {
    expect(primitiveBrowserCases.map((benchmarkCase) => benchmarkCase.name)).toEqual([
      "browser create 1k rows",
      "browser update every 10th in 10k rows",
      "browser select row in 10k rows",
      "browser clear 10k rows",
    ]);
    expect(primitiveBrowserCases.every((benchmarkCase) => benchmarkCase.description.length > 40)).toBe(
      true,
    );
  });
});
