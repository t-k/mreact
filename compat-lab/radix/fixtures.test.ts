import { describe, expect, test } from "vitest";
import { radixFixtures } from "./fixtures.js";

describe("Radix compat fixtures", () => {
  test("start with focused Dialog coverage", () => {
    expect(radixFixtures.map((fixture) => fixture.id)).toEqual([
      "radix-dialog-initial-closed",
      "radix-dialog-opens-from-trigger",
      "radix-dialog-closes-from-open-state",
      "radix-dialog-closes-with-escape",
      "radix-dialog-closes-on-outside-click",
      "radix-popover-opens-from-trigger",
      "radix-popover-closes-on-outside-click",
      "radix-dropdown-menu-opens-from-trigger",
      "radix-dropdown-menu-closes-with-escape",
      "radix-tooltip-shows-on-hover",
      "radix-tooltip-shows-on-focus",
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

    expect(
      radixFixtures
        .find((fixture) => fixture.id === "radix-dialog-closes-with-escape")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickDialogTrigger", "pressEscape"]);
    expect(
      radixFixtures
        .find((fixture) => fixture.id === "radix-popover-closes-on-outside-click")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickPopoverTrigger", "clickOutsideOverlay"]);
    expect(
      radixFixtures
        .find((fixture) => fixture.id === "radix-dropdown-menu-closes-with-escape")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickDropdownTrigger", "pressEscape"]);
    expect(
      radixFixtures
        .find((fixture) => fixture.id === "radix-tooltip-shows-on-hover")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["hoverTooltipTrigger"]);
  });
});
