import { describe, expect, test } from "vitest";
import { radixCoverageLedger } from "./coverage-ledger.js";
import { radixFixtures } from "./fixtures.js";

describe("Radix coverage ledger", () => {
  test("maps every obligation to an existing fixture", () => {
    const fixtureIds = new Set(radixFixtures.map((fixture) => fixture.id));

    for (const row of radixCoverageLedger) {
      expect(fixtureIds.has(row.fixtureId), row.obligationId).toBe(true);
    }
  });

  test("tracks portal, ARIA, focus, and close interaction risks", () => {
    expect(radixCoverageLedger.map((row) => row.risk)).toEqual(
      expect.arrayContaining([
        "Portal content must mount in document.body after an interaction",
        "Dialog trigger and content ARIA state must match React",
        "Focus must move into the dialog and return to the trigger",
        "Close controls must unmount portaled content",
      ]),
    );
  });
});
