import { describe, expect, test } from "vitest";
import { parseRunnerArgs } from "./runner.js";

describe("Radix compat runner arguments", () => {
  test("parses fixture and headed flags", () => {
    expect(parseRunnerArgs(["--fixture", "radix-dialog-opens-from-trigger", "--headed"])).toEqual({
      fixtureId: "radix-dialog-opens-from-trigger",
      headed: true,
    });
  });

  test("defaults to all fixtures in headless mode", () => {
    expect(parseRunnerArgs([])).toEqual({
      fixtureId: undefined,
      headed: false,
    });
  });
});
