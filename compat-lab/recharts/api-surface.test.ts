import { describe, expect, test } from "vitest";
import { buildRechartsApiCoverage, getRechartsApiSurface } from "./api-surface.js";
import { rechartsFixtures } from "./fixtures.js";
import { rechartsPublicComponentFeatures } from "./public-features.js";

describe("recharts api surface coverage", () => {
  test("extracts props for public Recharts component exports", () => {
    const surface = getRechartsApiSurface();
    const byComponent = new Map(surface.map((component) => [component.component, component]));

    expect(surface.map((component) => component.component)).toEqual([
      ...rechartsPublicComponentFeatures,
    ]);
    expect(byComponent.get("Line")?.props).toEqual(
      expect.arrayContaining(["dataKey", "activeDot", "isAnimationActive"]),
    );
    expect(byComponent.get("LineChart")?.props).toEqual(
      expect.arrayContaining(["syncId", "accessibilityLayer"]),
    );
    expect(byComponent.get("Sankey")?.props).toEqual(
      expect.arrayContaining(["nodePadding", "linkCurvature"]),
    );
    expect(byComponent.get("SunburstChart")?.props).toEqual(
      expect.arrayContaining(["ringPadding", "textOptions"]),
    );
  });

  test("builds a prop-level coverage ledger with explicit debt", () => {
    const rows = buildRechartsApiCoverage(rechartsFixtures);
    const lineDataKey = rows.find((row) => row.component === "Line" && row.prop === "dataKey");
    const syncId = rows.find((row) => row.component === "LineChart" && row.prop === "syncId");
    const lineAnimationId = rows.find(
      (row) => row.component === "Line" && row.prop === "animationId",
    );

    expect(lineDataKey?.status).toBe("interaction_covered");
    expect(syncId?.status).toBe("interaction_covered");
    expect(lineAnimationId?.status).toBe("debt");
    expect(rows.some((row) => row.status === "debt")).toBe(true);
  });
});
