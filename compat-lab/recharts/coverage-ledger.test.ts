import { describe, expect, test } from "vitest";
import { rechartsCoverageLedger } from "./coverage-ledger.js";
import { rechartsFixtures } from "./fixtures.js";

describe("recharts coverage ledger", () => {
  test("every fixture is represented by at least one coverage obligation", () => {
    const fixtureIds = new Set(rechartsFixtures.map((fixture) => fixture.id));
    const coveredFixtureIds = new Set(rechartsCoverageLedger.map((row) => row.fixtureId));

    for (const fixtureId of fixtureIds) {
      expect(coveredFixtureIds.has(fixtureId)).toBe(true);
    }
  });

  test("ledger has no untracked rows for the current Recharts coverage target", () => {
    expect(rechartsCoverageLedger.filter((row) => row.status === "untracked")).toEqual([]);
  });

  test("ledger reflects resolved Recharts compatibility differences", () => {
    const statusByObligation = new Map(
      rechartsCoverageLedger.map((row) => [row.obligationId, row.status]),
    );

    expect(statusByObligation.get("RC-TIP-001")).toBe("fixed");
    expect(statusByObligation.get("RC-POLAR-001")).toBe("fixed");
    expect(statusByObligation.get("RC-SYNC-001")).toBe("fixed");
    expect(statusByObligation.get("RC-HIERARCHY-001")).toBe("known_tolerance");
  });

  test("obligation ids are unique", () => {
    const ids = rechartsCoverageLedger.map((row) => row.obligationId);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
