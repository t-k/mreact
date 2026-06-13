import { describe, expect, test } from "vitest";
import { radixFixtures } from "./fixtures.js";

describe("Radix compat fixtures", () => {
  test("start with focused Dialog coverage", () => {
    expect(radixFixtures.map((fixture) => fixture.id)).toEqual([
      "radix-accordion-opens-item",
      "radix-alert-dialog-opens",
      "radix-aspect-ratio-renders",
      "radix-avatar-renders-fallback",
      "radix-checkbox-toggles",
      "radix-collapsible-opens",
      "radix-context-menu-opens",
      "radix-dialog-initial-closed",
      "radix-dialog-opens-from-trigger",
      "radix-dialog-closes-from-open-state",
      "radix-dialog-closes-with-escape",
      "radix-dialog-closes-on-outside-click",
      "radix-form-submits",
      "radix-hover-card-shows-on-hover",
      "radix-label-links-control",
      "radix-menubar-opens-menu",
      "radix-navigation-menu-opens-item",
      "radix-one-time-password-field-accepts-input",
      "radix-password-toggle-field-toggles",
      "radix-popover-opens-from-trigger",
      "radix-popover-closes-on-outside-click",
      "radix-progress-renders-value",
      "radix-radio-group-selects-option",
      "radix-scroll-area-renders-viewport",
      "radix-select-chooses-option",
      "radix-separator-renders",
      "radix-slider-changes-value",
      "radix-switch-toggles",
      "radix-tabs-switches-tab",
      "radix-toast-opens",
      "radix-toggle-toggles",
      "radix-toggle-group-selects-item",
      "radix-toolbar-activates-button",
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

    expect(
      radixFixtures
        .find((fixture) => fixture.id === "radix-dialog-opens-from-trigger")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickDialogTrigger"]);
    expect(
      radixFixtures
        .find((fixture) => fixture.id === "radix-dialog-closes-from-open-state")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickDialogTrigger", "clickDialogClose"]);

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
    expect(
      radixFixtures
        .find((fixture) => fixture.id === "radix-select-chooses-option")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickSelectTrigger", "clickSelectSecondItem"]);
    expect(
      radixFixtures
        .find((fixture) => fixture.id === "radix-context-menu-opens")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["rightClickContextMenuTarget"]);
    expect(
      radixFixtures
        .find((fixture) => fixture.id === "radix-toast-opens")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickToastTrigger"]);
  });
});
