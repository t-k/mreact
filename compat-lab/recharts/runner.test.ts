import { describe, expect, test } from "vitest";
import { parseRunnerArgs } from "./runner.js";

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
