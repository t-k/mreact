import { describe, expect, test } from "vitest";
import { radixFixtures } from "./fixtures.js";

describe("Radix compat fixtures", () => {
  test("start with focused Dialog coverage", () => {
    expect(radixFixtures.map((fixture) => fixture.id)).toEqual([
      "radix-dialog-initial-closed",
      "radix-dialog-opens-from-trigger",
      "radix-dialog-closes-from-open-state",
    ]);
  });

  test("declare deterministic viewport, risks, and interactions", () => {
    for (const fixture of radixFixtures) {
      expect(fixture.library).toBe("radix-ui");
      expect(fixture.viewport.width).toBeGreaterThanOrEqual(640);
      expect(fixture.viewport.height).toBeGreaterThanOrEqual(420);
      expect(fixture.riskTags.length).toBeGreaterThan(0);
    }

    expect(radixFixtures[1]?.interactions?.map((interaction) => interaction.run)).toEqual([
      "clickDialogTrigger",
    ]);
    expect(radixFixtures[2]?.interactions?.map((interaction) => interaction.run)).toEqual([
      "clickDialogTrigger",
      "clickDialogClose",
    ]);
  });
});
