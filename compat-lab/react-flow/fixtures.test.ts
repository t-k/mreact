import { describe, expect, test } from "vitest";
import { reactFlowFixtures } from "./fixtures.js";

describe("React Flow compat fixtures", () => {
  test("cover the requested fixture set with deterministic order", () => {
    expect(reactFlowFixtures.map((fixture) => fixture.id)).toEqual([
      "react-flow-basic-canvas",
      "react-flow-custom-node-handles",
      "react-flow-controlled-interaction",
    ]);
  });

  test("declare package, risk tags, viewport, and interaction coverage", () => {
    for (const fixture of reactFlowFixtures) {
      expect(fixture.packageName).toBe("@xyflow/react");
      expect(fixture.riskTags.length).toBeGreaterThan(0);
      expect(fixture.viewport.width).toBeGreaterThanOrEqual(820);
      expect(fixture.viewport.height).toBeGreaterThanOrEqual(520);
    }

    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-controlled-interaction")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickFirstNode", "clickFitView"]);
  });

  test("cover basic canvas, custom handles, and controlled state features", () => {
    const features = new Set(reactFlowFixtures.flatMap((fixture) => fixture.features));

    expect(features.has("ReactFlow nodes and edges")).toBe(true);
    expect(features.has("Background, Controls, MiniMap, and Panel")).toBe(true);
    expect(features.has("Custom node with Handle and Position")).toBe(true);
    expect(features.has("useNodesState and useEdgesState controlled updates")).toBe(true);
  });
});
