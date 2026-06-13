import { describe, expect, test } from "vitest";
import { uiPrimitiveCoverageLedger } from "./coverage-ledger.js";
import { uiPrimitiveFixtures } from "./fixtures.js";

describe("UI primitive coverage ledger", () => {
  test("maps every obligation to an existing fixture", () => {
    const fixtureIds = new Set(uiPrimitiveFixtures.map((fixture) => fixture.id));

    for (const row of uiPrimitiveCoverageLedger) {
      expect(fixtureIds.has(row.fixtureId), row.obligationId).toBe(true);
    }
  });

  test("tracks requested package and risk coverage", () => {
    expect(uiPrimitiveCoverageLedger.map((row) => row.packageName)).toEqual(
      expect.arrayContaining([
        "react-aria-components",
        "@floating-ui/react",
        "@tanstack/react-virtual",
        "react-hook-form",
        "@headlessui/react",
      ]),
    );
    expect(uiPrimitiveCoverageLedger.map((row) => row.risk)).toEqual(
      expect.arrayContaining([
        "React Aria DialogTrigger must mount modal dialog content, move focus, and close from Escape",
        "React Aria ListBox must render collection items and update selection through render-prop item activation",
        "Floating UI dismiss handling must close portaled popover content from an outside pointer interaction",
        "TanStack Virtual must keep measured virtual rows deterministic after scrolling a fixed container",
        "React Hook Form must register uncontrolled fields by ref and submit changed values",
        "Headless UI Menu must open from keyboard activation and expose menu items through portal-like positioning",
      ]),
    );
  });

  test("keeps at least one interaction obligation per requested package", () => {
    const interactivePackages = new Set(
      uiPrimitiveCoverageLedger
        .filter((row) => row.interaction)
        .map((row) => row.packageName),
    );

    expect([...interactivePackages].sort()).toEqual([
      "@floating-ui/react",
      "@headlessui/react",
      "@tanstack/react-virtual",
      "react-aria-components",
      "react-hook-form",
    ]);
  });
});
