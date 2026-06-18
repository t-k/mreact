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
      "react-flow-selection-box",
      "react-flow-edge-keyboard-delete",
      "react-flow-node-edge-toolbar",
      "react-flow-parent-child-extent",
      "react-flow-viewport-user-gestures",
      "react-flow-drag-constraints",
      "react-flow-store-hooks",
      "react-flow-dynamic-handles",
      "react-flow-connection-validation",
      "react-flow-delete-guard",
      "react-flow-visible-elements",
      "react-flow-selection-drag",
      "react-flow-appearance-a11y",
      "react-flow-large-graph",
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
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-selection-box")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["dragSelectionBox"]);
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-edge-keyboard-delete")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["pressDeleteEdgeKey"]);
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-node-edge-toolbar")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickToolbarButtons"]);
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-viewport-user-gestures")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["wheelZoomPanAndDoubleClick"]);
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-drag-constraints")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["dragConstrainedNode"]);
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-store-hooks")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickStoreApiButton"]);
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-dynamic-handles")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["clickDynamicHandleButton"]);
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-connection-validation")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["attemptInvalidThenValidConnection"]);
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-delete-guard")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["pressDeleteWithGuard"]);
    expect(
      reactFlowFixtures
        .find((fixture) => fixture.id === "react-flow-selection-drag")
        ?.interactions?.map((interaction) => interaction.run),
    ).toEqual(["dragSelectedNodes"]);
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
    expect(features.has("Custom edge with BaseEdge and marker")).toBe(true);
    expect(features.has("useNodesInitialized measurement state")).toBe(true);
    expect(features.has("Selection box and onSelectionChange")).toBe(true);
    expect(features.has("Edge keyboard deletion and onEdgesDelete")).toBe(true);
    expect(features.has("NodeToolbar and EdgeToolbar portal controls")).toBe(true);
    expect(features.has("Parent child nodes with constrained extent")).toBe(true);
    expect(features.has("Viewport pan zoom wheel and double click gestures")).toBe(true);
    expect(features.has("Snap grid node extent and auto pan drag options")).toBe(true);
    expect(features.has("useStore and useStoreApi direct access")).toBe(true);
    expect(features.has("useUpdateNodeInternals with dynamic handles")).toBe(true);
    expect(features.has("Connection validation and loose connection mode")).toBe(true);
    expect(features.has("onBeforeDelete cancel and modify flow")).toBe(true);
    expect(features.has("onlyRenderVisibleElements culling")).toBe(true);
    expect(features.has("Selection drag callback sequence")).toBe(true);
    expect(features.has("Color mode proOptions and ariaLabelConfig")).toBe(true);
    expect(features.has("Large graph render and summary stability")).toBe(true);
  });
});
