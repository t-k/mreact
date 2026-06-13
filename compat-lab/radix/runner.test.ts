import { describe, expect, test } from "vitest";
import {
  createRunId,
  normalizeActiveElementText,
  parseRunnerArgs,
  selectFixturesForRun,
} from "./runner.js";

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

  test("selects a focused fixture by id", () => {
    expect(
      selectFixturesForRun({ fixtureId: "radix-dialog-opens-from-trigger", headed: false }).map(
        (fixture) => fixture.id,
      ),
    ).toEqual(["radix-dialog-opens-from-trigger"]);
  });

  test("throws for an unknown fixture id", () => {
    expect(() => selectFixturesForRun({ fixtureId: "missing-fixture", headed: false })).toThrow(
      "Unknown Radix compat fixture: missing-fixture",
    );
  });

  test("creates a run id with a Radix suffix", () => {
    expect(createRunId(new Date("2026-06-13T03:04:05.000Z"), 1781327045000)).toBe(
      "2026-06-13-1781327045000-radix",
    );
  });

  test("ignores page-level active elements when summarizing focus", () => {
    expect(normalizeActiveElementText("BODY", "reactDialog initial closed stateOpen dialog")).toBe(
      "",
    );
    expect(normalizeActiveElementText("BUTTON", " Open dialog ")).toBe("Open dialog");
  });
});
