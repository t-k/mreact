import { describe, expect, test } from "vitest";
import { createRunId, parseRunnerArgs, selectFixturesForRun } from "./runner.js";

describe("UI primitive compat runner", () => {
  test("parses fixture selection and headed mode", () => {
    expect(parseRunnerArgs(["--fixture", "react-aria-listbox-selects-item", "--headed"])).toEqual({
      fixtureId: "react-aria-listbox-selects-item",
      headed: true,
    });
  });

  test("selects a single fixture by ID", () => {
    expect(
      selectFixturesForRun({
        fixtureId: "floating-ui-popover-dismisses",
        headed: false,
      }).map((fixture) => fixture.id),
    ).toEqual(["floating-ui-popover-dismisses"]);
  });

  test("uses a ui-primitives run suffix", () => {
    expect(createRunId(new Date("2026-06-13T00:00:00Z"), 123)).toBe(
      "2026-06-13-123-ui-primitives",
    );
  });
});
