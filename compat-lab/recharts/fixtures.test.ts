import { describe, expect, test } from "vitest";
import { rechartsFixtures } from "./fixtures.js";
import { rechartsPublicComponentFeatures } from "./public-features.js";

describe("recharts compat fixture registry", () => {
  test("fixture ids are unique and stable", () => {
    const ids = rechartsFixtures.map((fixture) => fixture.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "recharts-bar-basic",
      "recharts-line-tooltip-hover",
      "recharts-area-legend",
      "recharts-pie-cell-label",
      "recharts-responsive-resize",
      "recharts-composed-reference",
      "recharts-scatter-error-brush",
      "recharts-polar-radar-radial",
      "recharts-hierarchy-flow",
      "recharts-shape-primitives",
      "recharts-axis-customized",
      "recharts-synced-tooltips",
      "recharts-animation-lifecycle",
      "recharts-cartesian-props-matrix",
    ]);
  });

  test("each fixture declares coverage features and risk tags", () => {
    for (const fixture of rechartsFixtures) {
      expect(fixture.library).toBe("recharts");
      expect(fixture.features.length).toBeGreaterThan(0);
      expect(fixture.riskTags.length).toBeGreaterThan(0);
      expect(fixture.viewport.width).toBeGreaterThanOrEqual(800);
      expect(fixture.viewport.height).toBeGreaterThanOrEqual(500);
    }
  });

  test("interactive fixtures declare named interaction steps", () => {
    const tooltip = rechartsFixtures.find((fixture) => fixture.id === "recharts-line-tooltip-hover");

    expect(tooltip?.interactions?.map((interaction) => interaction.name)).toEqual([
      "hover-chart-center",
    ]);
  });

  test("fixtures cover every public Recharts component export", () => {
    const coveredFeatures = new Set(rechartsFixtures.flatMap((fixture) => fixture.features));

    expect(
      rechartsPublicComponentFeatures.filter((feature) => !coveredFeatures.has(feature)),
    ).toEqual([]);
  });
});
