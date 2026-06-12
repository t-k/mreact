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

  test("ledger keeps untracked rows for full feature expansion", () => {
    expect(rechartsCoverageLedger.some((row) => row.status === "untracked")).toBe(true);
    expect(rechartsCoverageLedger.map((row) => row.obligationId)).toContain("RC-SCATTER-001");
    expect(rechartsCoverageLedger.map((row) => row.obligationId)).toContain("RC-BRUSH-001");
  });

  test("obligation ids are unique", () => {
    const ids = rechartsCoverageLedger.map((row) => row.obligationId);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
