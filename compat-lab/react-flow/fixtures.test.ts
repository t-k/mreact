import { describe, expect, test } from "vitest";
import { reactFlowFixtures } from "./fixtures.js";

describe("React Flow compat fixtures", () => {
  test("cover the requested fixture set with deterministic order", () => {
    expect(reactFlowFixtures.map((fixture) => fixture.id)).toEqual([
      "react-flow-basic-canvas",
      "react-flow-custom-node-handles",
      "react-flow-controlled-interaction",
      "react-flow-node-drag-position",
      "react-flow-connect-on-click",
      "react-flow-controlled-reconnect",
      "react-flow-node-resizer",
      "react-flow-keyboard-delete",
      "react-flow-viewport-hooks",
      "react-flow-custom-edge-labels",
      "react-flow-nodes-initialized",
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
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-node-drag-position")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["dragFirstNode"]);
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-connect-on-click")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["connectSourceToTargetByClick"]);
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-controlled-reconnect")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickReconnectEdgeButton"]);
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-node-resizer")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["dragResizeHandle"]);
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-keyboard-delete")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["pressDeleteKey"]);
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-viewport-hooks")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickViewportButton"]);
  });

  test("cover basic canvas, custom handles, controlled state, deep interaction, and hook features", () => {
    const features = new Set(reactFlowFixtures.flatMap((fixture) => fixture.features));

    expect(features.has("ReactFlow nodes and edges")).toBe(true);
    expect(features.has("Background, Controls, MiniMap, and Panel")).toBe(true);
    expect(features.has("Custom node with Handle and Position")).toBe(true);
    expect(features.has("useNodesState and useEdgesState controlled updates")).toBe(true);
    expect(features.has("Node drag position updates")).toBe(true);
    expect(features.has("connectOnClick and addEdge controlled updates")).toBe(true);
    expect(features.has("reconnectEdge controlled target updates")).toBe(true);
    expect(features.has("NodeResizer dimension updates")).toBe(true);
    expect(features.has("Keyboard deletion and onNodesDelete")).toBe(true);
    expect(features.has("useReactFlow and useViewport updates")).toBe(true);
    expect(features.has("Custom edge with EdgeLabelRenderer and marker")).toBe(true);
    expect(features.has("useNodesInitialized measurement state")).toBe(true);
  });
});
