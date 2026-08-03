import { describe, expect, test } from "vitest";
import {
  failedFixtureIds,
  fixtureDomSummaryMatches,
  parseRunnerArgs,
} from "./runner.js";

describe("recharts compat runner arguments", () => {
  test("defaults to all fixtures in headless mode", () => {
    expect(parseRunnerArgs([])).toEqual({
      fixtureId: undefined,
      headed: false,
    });
  });

  test("parses fixture and headed flags", () => {
    expect(parseRunnerArgs(["--fixture", "recharts-bar-basic", "--headed"])).toEqual({
      fixtureId: "recharts-bar-basic",
      headed: true,
    });
  });
});

describe("recharts compat runner DOM requirements", () => {
  const summary = {
    svgCount: 1,
    pathCount: 8,
    barPathCount: 6,
    rectCount: 0,
    circleCount: 0,
    text: ["Jan"],
    classes: ["recharts-bar-rectangle"],
  };

  test("accepts the generic SVG requirement", () => {
    expect(fixtureDomSummaryMatches(summary)).toBe(true);
  });

  test("rejects a bar fixture whose visible data paths are missing", () => {
    expect(
      fixtureDomSummaryMatches(
        { ...summary, barPathCount: 0 },
        { barPathCount: 6 },
      ),
    ).toBe(false);
  });

  test("accepts a bar fixture with the required data path count", () => {
    expect(fixtureDomSummaryMatches(summary, { barPathCount: 6 })).toBe(true);
  });
});

describe("recharts compat runner result gate", () => {
  test("returns every failed fixture id", () => {
    expect(
      failedFixtureIds([
        { fixtureId: "passing", ok: true },
        { fixtureId: "missing-bars", ok: false },
        { fixtureId: "render-error", ok: false },
      ]),
    ).toEqual(["missing-bars", "render-error"]);
  });
});
