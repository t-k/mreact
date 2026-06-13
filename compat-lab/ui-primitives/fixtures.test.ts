import { describe, expect, test } from "vitest";
import { uiPrimitiveFixtures } from "./fixtures.js";

describe("UI primitive compat fixtures", () => {
  test("cover the requested package matrix with deterministic fixture order", () => {
    expect(uiPrimitiveFixtures.map((fixture) => fixture.id)).toEqual([
      "react-aria-dialog-opens-and-closes",
      "react-aria-listbox-selects-item",
      "floating-ui-popover-dismisses",
      "floating-ui-tooltip-shows-on-hover",
      "tanstack-virtual-scrolls-measured-rows",
      "react-hook-form-submits-uncontrolled-fields",
      "react-hook-form-field-array-validates-items",
      "headless-ui-dialog-closes-with-escape",
      "headless-ui-listbox-selects-option",
      "headless-ui-menu-opens-with-keyboard",
    ]);
  });

  test("declare package, risk tags, viewport, and interaction coverage", () => {
    for (const fixture of uiPrimitiveFixtures) {
      expect(fixture.viewport.width).toBeGreaterThanOrEqual(720);
      expect(fixture.viewport.height).toBeGreaterThanOrEqual(460);
      expect(fixture.riskTags.length).toBeGreaterThan(0);
      expect(fixture.packageName).toMatch(
        /^(react-aria-components|@floating-ui\/react|@tanstack\/react-virtual|react-hook-form|@headlessui\/react)$/,
      );
    }

    expect(
      uiPrimitiveFixtures
        .find((fixture) => fixture.id === "react-aria-dialog-opens-and-closes")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickReactAriaDialogTrigger", "pressEscape"]);
    expect(
      uiPrimitiveFixtures
        .find((fixture) => fixture.id === "react-aria-listbox-selects-item")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickReactAriaListboxSecondItem"]);
    expect(
      uiPrimitiveFixtures
        .find((fixture) => fixture.id === "floating-ui-popover-dismisses")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickFloatingPopoverTrigger", "clickOutsideOverlay"]);
    expect(
      uiPrimitiveFixtures
        .find((fixture) => fixture.id === "tanstack-virtual-scrolls-measured-rows")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["scrollVirtualList"]);
    expect(
      uiPrimitiveFixtures
        .find((fixture) => fixture.id === "react-hook-form-submits-uncontrolled-fields")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["fillHookFormEmail", "blurHookFormEmail", "submitHookForm"]);
    expect(
      uiPrimitiveFixtures
        .find((fixture) => fixture.id === "headless-ui-menu-opens-with-keyboard")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["focusHeadlessMenuButton", "pressEnter"]);
  });
});
